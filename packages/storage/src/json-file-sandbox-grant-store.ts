import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import {
    matchesSandboxGrant,
    type EffectiveExtraFile,
    type SandboxGrant,
    type SandboxGrantMatcher,
    type SandboxGrantStore,
} from "../../permission/src/index";

const ExtraFileSchema = z.object({
    canonicalPath: z.string().min(1),
    access: z.enum(["read", "write"]),
    kind: z.enum(["file", "directory_tree"]),
}).strict();

const MatcherSchema = z.object({
    toolId: z.literal("bash"),
    command: z.string().min(1),
    scope: z.object({
        extraFiles: z.array(ExtraFileSchema),
        network: z.enum(["none", "all_outbound"]),
    }).strict(),
    version: z.literal(1),
}).strict();

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

type Ledger = { readonly version: 1; readonly grants: readonly SandboxGrant[] };

/**
 * 将当前 Workspace 的用户沙箱授权保存为私有 JSON 账本。
 *
 * @remarks
 * 存储于项目的私有状态目录下（`sandbox-grants.json`）。
 * 每次修改都严格读取当前协议并原子替换文件；损坏账本会失败关闭，不会重置或覆盖。
 * Store 实例内串行化写入。
 *
 * @example
 * ```ts
 * const store = new JsonFileSandboxGrantStore("/home/user/.lazygoal/workspaces/ws-1");
 * const active = await store.findActiveMatching({ workspaceId: "ws-1", goalId: "g-1", matcher });
 * ```
 */
export class JsonFileSandboxGrantStore implements SandboxGrantStore {
    private tail: Promise<void> = Promise.resolve();

    /** @param directory - 当前 Workspace 的 LazyGoal Home 私有数据目录。 */
    constructor(private readonly directory: string) {}

    async findActiveMatching(query: {
        readonly workspaceId: string;
        readonly goalId: string;
        readonly matcher: SandboxGrantMatcher;
    }): Promise<SandboxGrant | undefined> {
        const ledger = await this.readLedger();
        return ledger.grants.find((grant) => matchesSandboxGrant(query, grant));
    }

    async stage(grant: Omit<SandboxGrant, "id" | "status">): Promise<SandboxGrant> {
        return this.mutate((ledger) => {
            const sourceMatch = ledger.grants.find((item) => sameSource(item.source, grant.source));
            const candidate: SandboxGrant = {
                ...grant,
                id: sourceMatch?.id ?? randomUUID(),
                status: "pending",
            };
            if (sourceMatch !== undefined) {
                if (!sameGrantRequest(sourceMatch, candidate)) {
                    throw new Error("Sandbox Grant source conflicts with an existing authorization");
                }
                if (sourceMatch.status === "revoked") {
                    throw new Error("A revoked Sandbox Grant cannot be recreated for the same Action");
                }
                return { ledger, result: sourceMatch };
            }
            const next = { ...ledger, grants: [...ledger.grants, candidate] };
            return { ledger: next, result: candidate };
        });
    }

    async activate(grantId: string, source: SandboxGrant["source"]): Promise<SandboxGrant> {
        return this.mutate((ledger) => {
            const index = ledger.grants.findIndex((item) => item.id === grantId);
            const grant = ledger.grants[index];
            if (grant === undefined || !sameSource(grant.source, source)) {
                throw new Error("Sandbox Grant identity does not match its approval source");
            }
            if (grant.status === "revoked") throw new Error("Revoked Sandbox Grant cannot be activated");
            if (grant.status === "active") return { ledger, result: grant };
            const active: SandboxGrant = { ...grant, status: "active" };
            const grants = [...ledger.grants];
            grants[index] = active;
            return { ledger: { ...ledger, grants }, result: active };
        });
    }

    async list(query: { readonly workspaceId: string; readonly goalId?: string }): Promise<readonly SandboxGrant[]> {
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
    }): Promise<SandboxGrant> {
        return this.mutate((ledger) => {
            const index = ledger.grants.findIndex((item) => item.id === query.grantId);
            const grant = ledger.grants[index];
            if (
                grant === undefined
                || grant.workspaceId !== query.workspaceId
                || (grant.scope === "goal" && grant.goalId !== query.goalId)
            ) throw new Error("Sandbox Grant does not exist in the requested scope");
            if (grant.status === "pending") throw new Error("Pending Sandbox Grant cannot be revoked");
            if (grant.status === "revoked") return { ledger, result: grant };
            const revoked: SandboxGrant = { ...grant, status: "revoked" };
            const grants = [...ledger.grants];
            grants[index] = revoked;
            return { ledger: { ...ledger, grants }, result: revoked };
        });
    }

    /**
     * 删除指定 Goal 的沙箱授权记录，保留项目级授权。
     *
     * @param workspaceId - 当前项目身份。
     * @param goalId - 已删除的 Goal 身份。
     * @example
     * ```ts
     * await store.deleteGoalGrants("workspace-1", "goal-1");
     * ```
     */
    async deleteGoalGrants(workspaceId: string, goalId: string): Promise<void> {
        await this.mutate((ledger) => ({
            ledger: { ...ledger, grants: ledger.grants.filter((grant) =>
                !(grant.workspaceId === workspaceId && grant.scope === "goal" && grant.goalId === goalId)) },
            result: undefined,
        }));
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
        catch (error) { throw new Error("Sandbox Grant ledger is invalid JSON", { cause: error }); }
        const validated = LedgerSchema.safeParse(parsed);
        if (!validated.success) throw new Error("Sandbox Grant ledger violates its current schema", { cause: validated.error });
        return {
            version: validated.data.version,
            grants: validated.data.grants.map(toSandboxGrant),
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

    private filePath(): string { return join(this.directory, "sandbox-grants.json"); }
}

function sameSource(left: SandboxGrant["source"], right: SandboxGrant["source"]): boolean {
    return left.goalId === right.goalId && left.runId === right.runId && left.actionId === right.actionId;
}

function sameGrantRequest(left: SandboxGrant, right: Omit<SandboxGrant, "id">): boolean {
    if (left.scope !== right.scope || left.workspaceId !== right.workspaceId || left.goalId !== right.goalId) {
        return false;
    }
    if (!sameSource(left.source, right.source)) {
        return false;
    }
    const lm = left.matcher;
    const rm = right.matcher;
    if (lm.toolId !== rm.toolId || lm.command !== rm.command || lm.version !== rm.version) {
        return false;
    }
    if (lm.scope.network !== rm.scope.network || lm.scope.extraFiles.length !== rm.scope.extraFiles.length) {
        return false;
    }
    return lm.scope.extraFiles.every((lf: EffectiveExtraFile, i: number) => {
        const rf = rm.scope.extraFiles[i];
        return rf !== undefined && lf.canonicalPath === rf.canonicalPath && lf.access === rf.access && lf.kind === rf.kind;
    });
}

function toSandboxGrant(grant: z.infer<typeof GrantSchema>): SandboxGrant {
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
