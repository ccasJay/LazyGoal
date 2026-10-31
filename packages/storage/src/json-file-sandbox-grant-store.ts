import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
    matchesSandboxGrant,
    type EffectiveExtraFile,
    type SandboxGrant,
    type SandboxGrantMatcher,
    type SandboxGrantStore,
} from "../../permission/src/index";
import { sandboxGrantLedgerFileBinding } from "./generated/sandbox-grant-ledger-binding";
import { validateSandboxGrantLedger, type SandboxGrantLedgerFile } from "./grant-ledger";
import { atomicWriteJson } from "./json-file-write";
import { KeyedSerialQueue } from "./keyed-serial-queue";

type Ledger = SandboxGrantLedgerFile;


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
    private readonly queue = new KeyedSerialQueue();

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
        const validated = sandboxGrantLedgerFileBinding.read(parsed, "reject");
        if (!validated.ok) throw new Error("Sandbox Grant ledger violates its current schema", { cause: validated.issues });
        const issues = validateSandboxGrantLedger(validated.data);
        if (issues.length > 0) throw new Error("Sandbox Grant ledger violates its current schema", { cause: issues });
        return validated.data;
    }

    private async mutate<T>(update: (ledger: Ledger) => { readonly ledger: Ledger; readonly result: T }): Promise<T> {
        return this.queue.run("sandbox-grants", async () => {
            const updated = update(await this.readLedger());
            if (updated.ledger !== undefined) await this.writeLedger(updated.ledger);
            return updated.result;
        });
    }

    private async writeLedger(ledger: Ledger): Promise<void> {
        await atomicWriteJson({
            path: this.filePath(),
            value: ledger,
            indent: 2,
            trailingNewline: true,
            durable: true,
        });
    }

    private filePath(): string { return join(this.directory, "sandbox-grants.json"); }
}

function sameSource(left: SandboxGrant["source"], right: SandboxGrant["source"]): boolean {
    return left.goalId === right.goalId
        && left.runId === right.runId
        && left.actionId === right.actionId
        && left.approvalInputId === right.approvalInputId;
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
    if (lm.toolId !== rm.toolId || lm.inputDigest !== rm.inputDigest || lm.version !== rm.version) {
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error;
}
