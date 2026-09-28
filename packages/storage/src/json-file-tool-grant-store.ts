import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import type { ToolGrant, ToolGrantStore } from "../../runtime/src/index";

const MatcherSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("exact_input"),
        toolId: z.string().min(1),
        version: z.literal(1),
        digest: z.string().regex(/^sha256:[0-9a-f]{64}$/)
            .transform((value) => value as `sha256:${string}`),
    }).strict(),
    z.object({
        kind: z.literal("target_path"),
        toolId: z.enum(["write_file", "edit_file"]),
        version: z.literal(1),
        path: z.string().min(1),
    }).strict(),
]);

const GrantSchema = z.object({
    id: z.string().min(1),
    scope: z.enum(["goal", "workspace"]),
    workspaceId: z.string().min(1),
    goalId: z.string().min(1).optional(),
    source: z.object({
        goalId: z.string().min(1),
        runId: z.string().min(1),
        actionId: z.string().min(1),
    }).strict(),
    matcher: MatcherSchema,
    status: z.enum(["pending", "active", "revoked"]),
}).strict().superRefine((grant, context) => {
    if (grant.scope === "goal" && grant.goalId === undefined) {
        context.addIssue({ code: "custom", path: ["goalId"], message: "goal Grant requires goalId" });
    }
    if (grant.scope === "workspace" && grant.goalId !== undefined) {
        context.addIssue({ code: "custom", path: ["goalId"], message: "workspace Grant cannot bind goalId" });
    }
    if (grant.source.goalId !== grant.goalId && grant.scope === "goal") {
        context.addIssue({ code: "custom", path: ["source", "goalId"], message: "goal Grant source must match goalId" });
    }
});

const LedgerSchema = z.object({
    version: z.literal(1),
    grants: z.array(GrantSchema),
}).strict().superRefine((ledger, context) => {
    const ids = new Set<string>();
    const sources = new Set<string>();
    for (const [index, grant] of ledger.grants.entries()) {
        if (ids.has(grant.id)) {
            context.addIssue({ code: "custom", path: ["grants", index, "id"], message: "duplicate Grant ID" });
        }
        ids.add(grant.id);
        const source = `${grant.source.goalId}\0${grant.source.runId}\0${grant.source.actionId}`;
        if (sources.has(source)) {
            context.addIssue({ code: "custom", path: ["grants", index, "source"], message: "duplicate Grant source" });
        }
        sources.add(source);
    }
});

type Ledger = { readonly version: 1; readonly grants: readonly ToolGrant[] };

/**
 * 将当前 Workspace 的用户授权保存为私有 JSON 账本。
 *
 * @remarks
 * 每次修改都严格读取当前协议并原子替换文件；损坏账本会失败关闭，不会重置或
 * 覆盖。Store 实例内串行化写入，不提供跨进程并发事务。
 *
 * @example
 * ```ts
 * const grants = new JsonFileToolGrantStore("/home/user/.lazygoal/workspaces/id");
 * const active = await grants.findActiveMatching({ workspaceId: "id", goalId: "g", matcher });
 * ```
 */
export class JsonFileToolGrantStore implements ToolGrantStore {
    private tail: Promise<void> = Promise.resolve();

    /** @param directory - 当前 Workspace 的 LazyGoal Home 私有数据目录。 */
    constructor(private readonly directory: string) {}

    async findActiveMatching(query: {
        readonly workspaceId: string;
        readonly goalId: string;
        readonly matcher: ToolGrant["matcher"];
    }): Promise<ToolGrant | undefined> {
        const ledger = await this.readLedger();
        return ledger.grants.find((grant) =>
            grant.status === "active"
            && grant.workspaceId === query.workspaceId
            && (grant.scope === "workspace" || grant.goalId === query.goalId)
            && matches(grant.matcher, query.matcher)
        );
    }

    async stage(grant: Omit<ToolGrant, "id" | "status">): Promise<ToolGrant> {
        return this.mutate((ledger) => {
            const sourceMatch = ledger.grants.find((item) => sameSource(item.source, grant.source));
            const candidate = { ...grant, id: sourceMatch?.id ?? randomUUID(), status: "pending" as const };
            if (sourceMatch !== undefined) {
                if (!sameGrantRequest(sourceMatch, candidate)) {
                    throw new Error("Tool Grant source conflicts with an existing authorization");
                }
                if (sourceMatch.status === "revoked") {
                    throw new Error("A revoked Tool Grant cannot be recreated for the same Action");
                }
                return { ledger, result: sourceMatch };
            }
            const next = { ...ledger, grants: [...ledger.grants, candidate] };
            return { ledger: next, result: candidate };
        });
    }

    async activate(grantId: string, source: ToolGrant["source"]): Promise<ToolGrant> {
        return this.mutate((ledger) => {
            const index = ledger.grants.findIndex((item) => item.id === grantId);
            const grant = ledger.grants[index];
            if (grant === undefined || !sameSource(grant.source, source)) {
                throw new Error("Tool Grant identity does not match its approval source");
            }
            if (grant.status === "revoked") throw new Error("Revoked Tool Grant cannot be activated");
            if (grant.status === "active") return { ledger, result: grant };
            const active = { ...grant, status: "active" as const };
            const grants = [...ledger.grants];
            grants[index] = active;
            return { ledger: { ...ledger, grants }, result: active };
        });
    }

    async list(query: { readonly workspaceId: string; readonly goalId?: string }): Promise<readonly ToolGrant[]> {
        const ledger = await this.readLedger();
        return ledger.grants.filter((grant) =>
            grant.workspaceId === query.workspaceId
            && (grant.scope === "workspace" || grant.goalId === query.goalId)
        ).sort((left, right) => left.id.localeCompare(right.id));
    }

    async revoke(query: {
        readonly grantId: string;
        readonly workspaceId: string;
        readonly goalId?: string;
    }): Promise<ToolGrant> {
        return this.mutate((ledger) => {
            const index = ledger.grants.findIndex((item) => item.id === query.grantId);
            const grant = ledger.grants[index];
            if (
                grant === undefined
                || grant.workspaceId !== query.workspaceId
                || (grant.scope === "goal" && grant.goalId !== query.goalId)
            ) throw new Error("Tool Grant does not exist in the requested scope");
            if (grant.status === "pending") throw new Error("Pending Tool Grant cannot be revoked");
            if (grant.status === "revoked") return { ledger, result: grant };
            const revoked = { ...grant, status: "revoked" as const };
            const grants = [...ledger.grants];
            grants[index] = revoked;
            return { ledger: { ...ledger, grants }, result: revoked };
        });
    }

    private async readLedger(): Promise<Ledger> {
        let content: string;
        try {
            content = await readFile(this.filePath(), "utf8");
        } catch (error) {
            if (isNodeError(error) && error.code === "ENOENT") return { version: 1, grants: [] };
            throw error;
        }
        let parsed: unknown;
        try { parsed = JSON.parse(content) as unknown; }
        catch (error) { throw new Error("Tool Grant ledger is invalid JSON", { cause: error }); }
        const validated = LedgerSchema.safeParse(parsed);
        if (!validated.success) throw new Error("Tool Grant ledger violates its current schema", { cause: validated.error });
        return {
            version: validated.data.version,
            grants: validated.data.grants.map(toToolGrant),
        };
    }

    private async mutate<T>(update: (ledger: Ledger) => { readonly ledger: Ledger; readonly result: T }): Promise<T> {
        let resolveResult!: (value: T) => void;
        let rejectResult!: (reason: unknown) => void;
        const result = new Promise<T>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
        const operation = this.tail.then(async () => {
            try {
                const updated = update(await this.readLedger());
                if (updated.ledger !== undefined) await this.writeLedger(updated.ledger);
                resolveResult(updated.result);
            } catch (error) { rejectResult(error); }
        });
        this.tail = operation.then(() => undefined, () => undefined);
        return result;
    }

    private async writeLedger(ledger: Ledger): Promise<void> {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const filePath = this.filePath();
        const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
        try {
            const handle = await open(temporaryPath, "wx", 0o600);
            try { await handle.writeFile(`${JSON.stringify(ledger, null, 2)}\n`, "utf8"); await handle.sync(); }
            finally { await handle.close(); }
            await rename(temporaryPath, filePath);
        } catch (error) { await unlink(temporaryPath).catch(() => undefined); throw error; }
    }

    private filePath(): string { return join(this.directory, "tool-grants.json"); }
}

function sameSource(left: ToolGrant["source"], right: ToolGrant["source"]): boolean {
    return left.goalId === right.goalId && left.runId === right.runId && left.actionId === right.actionId;
}

function matches(left: ToolGrant["matcher"], right: ToolGrant["matcher"]): boolean {
    if (left.kind !== right.kind || left.toolId !== right.toolId || left.version !== right.version) return false;
    return left.kind === "exact_input" && right.kind === "exact_input"
        ? left.digest === right.digest
        : left.kind === "target_path" && right.kind === "target_path" && left.path === right.path;
}

function sameGrantRequest(left: ToolGrant, right: Omit<ToolGrant, "id">): boolean {
    return left.scope === right.scope
        && left.workspaceId === right.workspaceId
        && left.goalId === right.goalId
        && sameSource(left.source, right.source)
        && matches(left.matcher, right.matcher);
}

function toToolGrant(grant: z.infer<typeof GrantSchema>): ToolGrant {
    return {
        id: grant.id,
        scope: grant.scope,
        workspaceId: grant.workspaceId,
        ...(grant.goalId === undefined ? {} : { goalId: grant.goalId }),
        source: grant.source,
        matcher: grant.matcher,
        status: grant.status,
    };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error;
}
