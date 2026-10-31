/** Tool Grant 账本中的操作匹配器文件表示。 */
export type ToolGrantFileMatcher =
    | {
        readonly kind: "exact_input";
        readonly toolId: string;
        readonly version: 1;
        readonly digest: `sha256:${string}`;
    }
    | {
        readonly kind: "target_path";
        readonly toolId: "write_file" | "edit_file";
        readonly version: 1;
        readonly path: string;
    };

/** Tool Grant 账本中的批准来源文件表示。 */
export interface ToolGrantFileSource {
    readonly goalId: string;
    readonly runId: string;
    readonly actionId: string;
    readonly approvalInputId: string;
}

/** Tool Grant 账本中的单条授权文件表示。 */
export interface ToolGrantFile {
    readonly id: string;
    readonly scope: "goal" | "workspace";
    readonly workspaceId: string;
    readonly goalId?: string;
    readonly source: ToolGrantFileSource;
    readonly matcher: ToolGrantFileMatcher;
    readonly status: "pending" | "active" | "revoked";
}

/** Tool Grant 账本文件的持久化 DTO。 */
export interface ToolGrantLedgerFile {
    readonly version: 1;
    readonly grants: readonly ToolGrantFile[];
}

/** Sandbox Grant 账本中的额外文件范围。 */
export interface SandboxGrantFileExtraFile {
    readonly canonicalPath: string;
    readonly access: "read" | "write";
    readonly kind: "file" | "directory_tree";
}

/** Sandbox Grant 账本中的受限范围。 */
export interface SandboxGrantFileScope {
    readonly extraFiles: readonly SandboxGrantFileExtraFile[];
    readonly network: "none" | "all_outbound";
}

/** Sandbox Grant 账本中的操作匹配器文件表示。 */
export interface SandboxGrantFileMatcher {
    readonly toolId: string;
    readonly inputDigest: string;
    readonly scope: SandboxGrantFileScope;
    readonly version: 1;
}

/** Sandbox Grant 账本中的单条授权文件表示。 */
export interface SandboxGrantFile {
    readonly id: string;
    readonly scope: "goal" | "workspace";
    readonly workspaceId: string;
    readonly goalId?: string;
    readonly source: ToolGrantFileSource;
    readonly matcher: SandboxGrantFileMatcher;
    readonly status: "pending" | "active" | "revoked";
}

/** Sandbox Grant 账本文件的持久化 DTO。 */
export interface SandboxGrantLedgerFile {
    readonly version: 1;
    readonly grants: readonly SandboxGrantFile[];
}

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;

/** @returns Tool Grant 账本的字段级或跨字段问题；空数组表示通过。 */
export function validateToolGrantLedger(ledger: ToolGrantLedgerFile): readonly string[] {
    const issues: string[] = [];
    const ids = new Set<string>();
    const sources = new Set<string>();

    for (const [index, grant] of ledger.grants.entries()) {
        const label = `grants[${index}]`;
        for (const [field, value] of [
            ["id", grant.id],
            ["workspaceId", grant.workspaceId],
            ["source.goalId", grant.source.goalId],
            ["source.runId", grant.source.runId],
            ["source.actionId", grant.source.actionId],
            ["source.approvalInputId", grant.source.approvalInputId],
            ["matcher.toolId", grant.matcher.toolId],
        ] as const) {
            if (value.length === 0) issues.push(`${label}.${field} must be a non-empty string`);
        }
        if (grant.matcher.kind === "exact_input") {
            if (!SHA256_DIGEST.test(grant.matcher.digest)) {
                issues.push(`${label}.matcher.digest must be a sha256 digest`);
            }
        } else if (grant.matcher.path.length === 0) {
            issues.push(`${label}.matcher.path must be a non-empty string`);
        }
        if (grant.scope === "goal" && grant.goalId === undefined) {
            issues.push(`${label}.goalId is required for a goal Grant`);
        }
        if (grant.scope === "workspace" && grant.goalId !== undefined) {
            issues.push(`${label}.goalId cannot be set on a workspace Grant`);
        }
        if (grant.scope === "goal" && grant.source.goalId !== grant.goalId) {
            issues.push(`${label}.source.goalId must match goalId`);
        }

        if (ids.has(grant.id)) issues.push(`${label}.id must be unique`);
        ids.add(grant.id);
        const source = `${grant.source.goalId}\0${grant.source.runId}\0${grant.source.actionId}\0${grant.source.approvalInputId}`;
        if (sources.has(source)) issues.push(`${label}.source must be unique`);
        sources.add(source);
    }

    return issues;
}

/** @returns Sandbox Grant 账本的字段级或跨字段问题；空数组表示通过。 */
export function validateSandboxGrantLedger(ledger: SandboxGrantLedgerFile): readonly string[] {
    const issues: string[] = [];
    const ids = new Set<string>();
    const sources = new Set<string>();

    for (const [index, grant] of ledger.grants.entries()) {
        const label = `grants[${index}]`;
        for (const [field, value] of [
            ["id", grant.id],
            ["workspaceId", grant.workspaceId],
            ["source.goalId", grant.source.goalId],
            ["source.runId", grant.source.runId],
            ["source.actionId", grant.source.actionId],
            ["source.approvalInputId", grant.source.approvalInputId],
            ["matcher.toolId", grant.matcher.toolId],
            ["matcher.inputDigest", grant.matcher.inputDigest],
        ] as const) {
            if (value.length === 0) issues.push(`${label}.${field} must be a non-empty string`);
        }
        for (const [fileIndex, file] of grant.matcher.scope.extraFiles.entries()) {
            if (file.canonicalPath.length === 0) {
                issues.push(`${label}.matcher.scope.extraFiles[${fileIndex}].canonicalPath must be a non-empty string`);
            }
        }
        if (grant.scope === "goal" && grant.goalId === undefined) {
            issues.push(`${label}.goalId is required for a goal Grant`);
        }
        if (grant.scope === "workspace" && grant.goalId !== undefined) {
            issues.push(`${label}.goalId cannot be set on a workspace Grant`);
        }
        if (grant.scope === "goal" && grant.source.goalId !== grant.goalId) {
            issues.push(`${label}.source.goalId must match goalId`);
        }

        if (ids.has(grant.id)) issues.push(`${label}.id must be unique`);
        ids.add(grant.id);
        const source = `${grant.source.goalId}\0${grant.source.runId}\0${grant.source.actionId}\0${grant.source.approvalInputId}`;
        if (sources.has(source)) issues.push(`${label}.source must be unique`);
        sources.add(source);
    }

    return issues;
}
