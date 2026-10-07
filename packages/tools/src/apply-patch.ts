import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as diff from "diff";

import type {
    Tool,
    ToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../tool-core/src/index";
import {
    contract,
    type InferContract,
} from "../../contracts/src/index";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";
import { invalidInput } from "./internal/invalid-input";
import {
    createWorkspaceSandbox,
    type WorkspaceSandbox,
} from "../../sandbox/src/index";

/** `ApplyPatchTool` 在 Profile 中使用的稳定标识。 */
export const APPLY_PATCH_TOOL_ID = "apply_patch";

/** 补丁文本最大允许字节数 (1 MiB)。 */
export const APPLY_PATCH_MAX_PATCH_BYTES = 1024 * 1024;

/** 单次补丁最多允许操作的文件数。 */
export const APPLY_PATCH_MAX_FILES = 100;

/** 补丁修改的总数据量硬上限 (32 MiB)。 */
export const APPLY_PATCH_MAX_TOTAL_BYTES = 32 * 1024 * 1024;

/** 单个文件最大允许字节数 (8 MiB)。 */
export const APPLY_PATCH_MAX_SINGLE_FILE_BYTES = 8 * 1024 * 1024;

/** Apply Patch Tool 的输入契约。 */
export const APPLY_PATCH_INPUT_CONTRACT = contract.object({
    patch: contract.string(),
});

/** Apply Patch 输入类型。 */
export type ApplyPatchInput = InferContract<typeof APPLY_PATCH_INPUT_CONTRACT>;

/** 成功应用的单个文件结果。 */
export interface AppliedFileResult {
    readonly path: string;
    readonly type: "create" | "modify" | "delete";
    readonly hunksApplied: number;
}

/** Apply Patch 成功输出结构。 */
export interface ApplyPatchOutput {
    readonly applied: readonly AppliedFileResult[];
    readonly summary: string;
}

/** Apply Patch 晚期写入失败详情。 */
export interface ApplyPatchFailureDetails {
    readonly applied: readonly string[];
    readonly failed: {
        readonly path: string;
        readonly reason: string;
    };
    readonly pending: readonly string[];
}

interface PlannedOperation {
    readonly type: "create" | "modify" | "delete";
    readonly path: string;
    readonly absPath: string;
    readonly content?: string;
    readonly mode?: number;
    readonly expectedDigest?: string;
    readonly hunkCount: number;
}

interface TargetPathInfo {
    readonly isCreate: boolean;
    readonly isDelete: boolean;
    readonly targetPath: string;
    readonly newMode?: number;
}

type ParsedFilePatch = ReturnType<typeof diff.parsePatch>[number];
type PatchHunk = ParsedFilePatch["hunks"][number];

function sha256(data: string | Buffer): string {
    return createHash("sha256").update(data).digest("hex");
}

function stripGitPrefix(filePath?: string): string | undefined {
    if (filePath === undefined) return undefined;
    if (filePath === "/dev/null") return "/dev/null";
    if (filePath.startsWith("a/") || filePath.startsWith("b/")) {
        return filePath.slice(2);
    }
    return filePath;
}

function normalizeRelativePath(p: string): string {
    return p.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "").replace(/\/+$/, "");
}

/**
 * 在指定工作区应用严格校验的多文件 unified / Git 补丁的工具。
 *
 * @remarks
 * 支持创建文件、修改文件、删除文件、空文件及保留/修改执行模式。
 * 实行严格的两阶段执行：先在内存完整预检所有目标文件及 hunks 的唯一匹配（允许偏移行号，禁止模糊匹配或自动转换），
 * 任何校验失败均在首个文件写入前完全拒绝，确保零写入。
 * 若在写入阶段发生并发变化或晚期写入故障，停止后续写入并通过 `failure.details` 返回已应用、失败与待处理文件。
 * 不确定状态抛出异常以触发 Runtime `manual` 恢复。
 * 声明为 `manual` 重放策略，`isReadOnly: false`。
 *
 * @example
 * ```ts
 * const tool = new ApplyPatchTool("/workspace");
 * const result = await tool.execute({
 *   actionId: "act-1",
 *   input: { patch: "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n" },
 * });
 * ```
 */
export class ApplyPatchTool implements Tool<typeof APPLY_PATCH_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof APPLY_PATCH_INPUT_CONTRACT> = {
        id: APPLY_PATCH_TOOL_ID,
        description: "Apply unified or Git text patches across files in workspace with strict unique matching.",
        inputContract: APPLY_PATCH_INPUT_CONTRACT,
        isReadOnly: false,
    };

    readonly replayPolicy = "manual" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;

    constructor(workspaceRoot: string) {
        if (workspaceRoot.trim() === "") {
            throw new Error("workspaceRoot must be non-empty");
        }
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot, (path) => `Target path outside workspace: ${path}`);
    }

    validate(input: ApplyPatchInput): ToolValidationResult {
        if (input.patch.trim() === "") {
            return invalidInput("patch cannot be empty", ["patch"]);
        }
        if (Buffer.byteLength(input.patch, "utf8") > APPLY_PATCH_MAX_PATCH_BYTES) {
            return invalidInput("patch exceeds 1 MiB limit", ["patch"]);
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<ApplyPatchInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const { input } = request;

        let parsedPatches: ParsedFilePatch[];
        try {
            parsedPatches = diff.parsePatch(input.patch);
        } catch (error) {
            return {
                kind: "failure",
                code: "PATCH_PARSE_FAILED",
                message: `Failed to parse patch: ${error instanceof Error ? error.message : String(error)}`,
                retryable: false,
            };
        }

        if (parsedPatches.length === 0) {
            return {
                kind: "failure",
                code: "PATCH_PARSE_FAILED",
                message: "No valid file diffs found in patch.",
                retryable: false,
            };
        }

        if (parsedPatches.length > APPLY_PATCH_MAX_FILES) {
            return {
                kind: "failure",
                code: "PATCH_LIMIT_EXCEEDED",
                message: `Patch affects ${parsedPatches.length} files, exceeding limit of ${APPLY_PATCH_MAX_FILES}.`,
                retryable: false,
            };
        }

        // 阶段一：解析与路径合法性校验
        const parsedTargets: Array<{ filePatch: ParsedFilePatch; targetInfo: TargetPathInfo }> = [];
        const targetPathsSeen = new Set<string>();

        for (const filePatch of parsedPatches) {
            throwIfAborted(control);

            if ((filePatch as any).isBinary) {
                return {
                    kind: "failure",
                    code: "BINARY_PATCH_REJECTED",
                    message: "Binary patches are not supported by apply_patch.",
                    retryable: false,
                };
            }

            if ((filePatch as any).isRename || (filePatch as any).isCopy) {
                return {
                    kind: "failure",
                    code: "UNSUPPORTED_PATCH_OPERATION",
                    message: "File rename and copy operations are not supported by apply_patch.",
                    retryable: false,
                };
            }

            const rawOld = stripGitPrefix(filePatch.oldFileName);
            const rawNew = stripGitPrefix(filePatch.newFileName);

            if (rawOld === undefined && rawNew === undefined) {
                return {
                    kind: "failure",
                    code: "PATCH_PARSE_FAILED",
                    message: "Diff header missing file names.",
                    retryable: false,
                };
            }

            const isCreate = (filePatch as any).isCreate === true || rawOld === "/dev/null";
            const isDelete = (filePatch as any).isDelete === true || rawNew === "/dev/null";

            let targetRaw: string;
            if (isCreate) {
                if (rawNew === undefined || rawNew === "/dev/null") {
                    return {
                        kind: "failure",
                        code: "INVALID_PATCH_HEADER",
                        message: "Creation patch missing valid new file path.",
                        retryable: false,
                    };
                }
                targetRaw = rawNew;
            } else if (isDelete) {
                if (rawOld === undefined || rawOld === "/dev/null") {
                    return {
                        kind: "failure",
                        code: "INVALID_PATCH_HEADER",
                        message: "Deletion patch missing valid old file path.",
                        retryable: false,
                    };
                }
                targetRaw = rawOld;
            } else {
                if (rawOld === undefined || rawNew === undefined) {
                    return {
                        kind: "failure",
                        code: "INVALID_PATCH_HEADER",
                        message: "Modification patch requires both old and new file names.",
                        retryable: false,
                    };
                }
                const normOld = normalizeRelativePath(rawOld);
                const normNew = normalizeRelativePath(rawNew);
                if (normOld !== normNew) {
                    return {
                        kind: "failure",
                        code: "UNSUPPORTED_PATCH_OPERATION",
                        message: `Patch modifies different source and destination paths ('${normOld}' -> '${normNew}'): renames are not supported.`,
                        retryable: false,
                    };
                }
                targetRaw = normNew;
            }

            const targetPath = normalizeRelativePath(targetRaw);

            const pathViolation = this.sandbox.validateRelativePath(targetPath);
            if (pathViolation !== undefined) {
                return {
                    kind: "failure",
                    code: "INVALID_TARGET_PATH",
                    message: `Invalid patch target path '${targetPath}': ${pathViolation}`,
                    retryable: false,
                };
            }

            if (targetPathsSeen.has(targetPath)) {
                return {
                    kind: "failure",
                    code: "DUPLICATE_PATCH_TARGET",
                    message: `Duplicate patch target detected: ${targetPath}`,
                    retryable: false,
                };
            }
            targetPathsSeen.add(targetPath);

            let newMode: number | undefined;
            if ((filePatch as any).newMode !== undefined) {
                newMode = parseInt(String((filePatch as any).newMode), 8) & 0o777;
            }

            parsedTargets.push({
                filePatch,
                targetInfo: {
                    isCreate,
                    isDelete,
                    targetPath,
                    ...(newMode !== undefined ? { newMode } : {}),
                },
            });
        }

        // 阶段二：内存全量预检（严格唯一匹配与内容构造，不执行任何磁盘写入）
        const plannedOperations: PlannedOperation[] = [];
        let totalOutputBytes = 0;

        for (const { filePatch, targetInfo } of parsedTargets) {
            throwIfAborted(control);
            const { isCreate, isDelete, targetPath, newMode } = targetInfo;
            const absPath = resolve(this.workspaceRoot, targetPath);

            let existingStat;
            try {
                existingStat = await lstat(absPath);
            } catch {
                existingStat = undefined;
            }

            if (existingStat !== undefined && existingStat.isSymbolicLink()) {
                return {
                    kind: "failure",
                    code: "SYMBOLIC_LINK_REJECTED",
                    message: `Target ${targetPath} is a symbolic link, which is not supported by apply_patch.`,
                    retryable: false,
                };
            }

            if (existingStat !== undefined && existingStat.isDirectory()) {
                return {
                    kind: "failure",
                    code: "TARGET_IS_DIRECTORY",
                    message: `Target ${targetPath} is a directory, not a file.`,
                    retryable: false,
                };
            }

            if (isCreate) {
                if (existingStat !== undefined) {
                    return {
                        kind: "failure",
                        code: "FILE_ALREADY_EXISTS",
                        message: `Cannot create file ${targetPath}: file already exists.`,
                        retryable: false,
                    };
                }

                let newContent = "";
                if (filePatch.hunks.length > 0) {
                    const lines: string[] = [];
                    let hasNoNewline = false;
                    for (const hunk of filePatch.hunks) {
                        for (let i = 0; i < hunk.lines.length; i++) {
                            const l = hunk.lines[i]!;
                            if (l.startsWith("+")) {
                                lines.push(l.slice(1));
                                if (hunk.lines[i + 1]?.startsWith("\\ No newline")) {
                                    hasNoNewline = true;
                                }
                            } else if (l.startsWith("-")) {
                                return {
                                    kind: "failure",
                                    code: "INVALID_CREATION_PATCH",
                                    message: `Creation patch for ${targetPath} contains deletion lines (-).`,
                                    retryable: false,
                                };
                            }
                        }
                    }
                    newContent = lines.length === 0 ? "" : hasNoNewline ? lines.join("\n") : lines.join("\n") + "\n";
                }

                if (Buffer.byteLength(newContent, "utf8") > APPLY_PATCH_MAX_SINGLE_FILE_BYTES) {
                    return {
                        kind: "failure",
                        code: "FILE_SIZE_LIMIT_EXCEEDED",
                        message: `Result for ${targetPath} exceeds single file limit of 8 MiB.`,
                        retryable: false,
                    };
                }
                totalOutputBytes += Buffer.byteLength(newContent, "utf8");

                plannedOperations.push({
                    type: "create",
                    path: targetPath,
                    absPath,
                    content: newContent,
                    mode: newMode ?? 0o644,
                    hunkCount: filePatch.hunks.length,
                });
            } else if (isDelete) {
                if (existingStat === undefined || !existingStat.isFile()) {
                    return {
                        kind: "failure",
                        code: "FILE_NOT_FOUND",
                        message: `Cannot delete file ${targetPath}: file does not exist.`,
                        retryable: false,
                    };
                }

                const existingBuffer = await readFile(absPath);
                if (existingBuffer.includes(0)) {
                    return {
                        kind: "failure",
                        code: "BINARY_FILE_DETECTED",
                        message: `File ${targetPath} contains binary content (NUL bytes).`,
                        retryable: false,
                    };
                }
                const existingText = existingBuffer.toString("utf8");

                if (filePatch.hunks.length === 0) {
                    if (existingText.length > 0) {
                        return {
                            kind: "failure",
                            code: "DELETE_CONTENT_MISMATCH",
                            message: `Cannot delete non-empty file ${targetPath} with empty diff.`,
                            retryable: false,
                        };
                    }
                } else {
                    // 校验删除补丁是否完全匹配原文件
                    const matchResult = this.applyHunksToText(existingText, filePatch.hunks, targetPath);
                    if (!matchResult.ok) {
                        return matchResult.failure;
                    }
                    if (matchResult.resultText !== "") {
                        return {
                            kind: "failure",
                            code: "DELETE_CONTENT_MISMATCH",
                            message: `Deletion patch for ${targetPath} does not remove all content.`,
                            retryable: false,
                        };
                    }
                }

                plannedOperations.push({
                    type: "delete",
                    path: targetPath,
                    absPath,
                    expectedDigest: sha256(existingText),
                    hunkCount: filePatch.hunks.length,
                });
            } else {
                // 修改已有文件
                if (existingStat === undefined || !existingStat.isFile()) {
                    return {
                        kind: "failure",
                        code: "FILE_NOT_FOUND",
                        message: `Cannot modify file ${targetPath}: file does not exist.`,
                        retryable: false,
                    };
                }

                if (filePatch.hunks.length === 0) {
                    return {
                        kind: "failure",
                        code: "EMPTY_PATCH_HUNKS",
                        message: `Modification patch for ${targetPath} contains no hunks (mode-only or empty changes not supported).`,
                        retryable: false,
                    };
                }

                const existingBuffer = await readFile(absPath);
                if (existingBuffer.includes(0)) {
                    return {
                        kind: "failure",
                        code: "BINARY_FILE_DETECTED",
                        message: `File ${targetPath} contains binary content (NUL bytes).`,
                        retryable: false,
                    };
                }

                if (existingBuffer.byteLength > APPLY_PATCH_MAX_SINGLE_FILE_BYTES) {
                    return {
                        kind: "failure",
                        code: "FILE_SIZE_LIMIT_EXCEEDED",
                        message: `File ${targetPath} exceeds single file limit of 8 MiB.`,
                        retryable: false,
                    };
                }

                const existingText = existingBuffer.toString("utf8");
                const matchResult = this.applyHunksToText(existingText, filePatch.hunks, targetPath);
                if (!matchResult.ok) {
                    return matchResult.failure;
                }

                if (Buffer.byteLength(matchResult.resultText, "utf8") > APPLY_PATCH_MAX_SINGLE_FILE_BYTES) {
                    return {
                        kind: "failure",
                        code: "FILE_SIZE_LIMIT_EXCEEDED",
                        message: `Result for ${targetPath} exceeds single file limit of 8 MiB.`,
                        retryable: false,
                    };
                }
                totalOutputBytes += Buffer.byteLength(matchResult.resultText, "utf8");

                plannedOperations.push({
                    type: "modify",
                    path: targetPath,
                    absPath,
                    content: matchResult.resultText,
                    mode: newMode ?? existingStat.mode,
                    expectedDigest: sha256(existingText),
                    hunkCount: filePatch.hunks.length,
                });
            }
        }

        if (totalOutputBytes > APPLY_PATCH_MAX_TOTAL_BYTES) {
            return {
                kind: "failure",
                code: "TOTAL_SIZE_LIMIT_EXCEEDED",
                message: `Total modified size (${totalOutputBytes} bytes) exceeds limit of 32 MiB.`,
                retryable: false,
            };
        }

        // 阶段三：逐文件真实写入与故障隔离
        const applied: string[] = [];
        const pending: string[] = plannedOperations.map((op) => op.path);

        for (const op of plannedOperations) {
            throwIfAborted(control);
            pending.shift();

            try {
                if (op.type === "create") {
                    await mkdir(dirname(op.absPath), { recursive: true });
                    await writeFile(op.absPath, op.content!, {
                        flag: "wx",
                        mode: op.mode,
                    });
                } else if (op.type === "modify") {
                    // 写前复核原文件是否发生并发变化
                    const currentBuffer = await readFile(op.absPath);
                    const currentDigest = sha256(currentBuffer.toString("utf8"));
                    if (currentDigest !== op.expectedDigest) {
                        return {
                            kind: "failure",
                            code: "CONCURRENT_MODIFICATION_DETECTED",
                            message: `File ${op.path} was modified concurrently before writing.`,
                            retryable: false,
                            details: {
                                applied,
                                failed: {
                                    path: op.path,
                                    reason: "File was modified concurrently before write",
                                },
                                pending,
                            },
                        };
                    }

                    const tmpPath = resolve(
                        dirname(op.absPath),
                        `.tmp_patch_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    );
                    await writeFile(tmpPath, op.content!, { mode: op.mode });
                    await rename(tmpPath, op.absPath);
                } else if (op.type === "delete") {
                    // 写前复核原文件
                    const currentBuffer = await readFile(op.absPath);
                    const currentDigest = sha256(currentBuffer.toString("utf8"));
                    if (currentDigest !== op.expectedDigest) {
                        return {
                            kind: "failure",
                            code: "CONCURRENT_MODIFICATION_DETECTED",
                            message: `File ${op.path} was modified concurrently before deletion.`,
                            retryable: false,
                            details: {
                                applied,
                                failed: {
                                    path: op.path,
                                    reason: "File was modified concurrently before deletion",
                                },
                                pending,
                            },
                        };
                    }
                    await unlink(op.absPath);
                }

                applied.push(op.path);
            } catch (error) {
                if (isExecutionAbortedError(error)) throw error;
                const reason = error instanceof Error ? error.message : String(error);
                return {
                    kind: "failure",
                    code: "WRITE_FAILED",
                    message: `Failed to write ${op.path}: ${reason}`,
                    retryable: false,
                    details: {
                        applied,
                        failed: { path: op.path, reason },
                        pending,
                    },
                };
            }
        }

        const output: ApplyPatchOutput = {
            applied: plannedOperations.map((op) => ({
                path: op.path,
                type: op.type,
                hunksApplied: op.hunkCount,
            })),
            summary: `Successfully applied patch across ${applied.length} file(s).`,
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Applied patch to ${applied.length} file(s).`,
        };
    }

    /**
     * 在内存中对单一文件文本应用 hunks 并严格执行唯一匹配检查。
     */
    private applyHunksToText(
        text: string,
        hunks: readonly PatchHunk[],
        targetPath: string,
    ): { ok: true; resultText: string } | { ok: false; failure: ToolObservation } {
        const hasTrailingNewline = text.endsWith("\n");
        let rawLines = text.split("\n");
        if (hasTrailingNewline && rawLines.length > 0 && rawLines[rawLines.length - 1] === "") {
            rawLines.pop();
        }

        // 解析并解析每个 hunk 的 oldLines 与 newLines
        interface HunkMeta {
            readonly oldLines: string[];
            readonly newLines: string[];
            readonly oldHasNoNewline: boolean;
            readonly newHasNoNewline: boolean;
        }

        const parsedHunks: HunkMeta[] = [];
        for (const hunk of hunks) {
            const oldLines: string[] = [];
            const newLines: string[] = [];
            let oldHasNoNewline = false;
            let newHasNoNewline = false;

            for (let i = 0; i < hunk.lines.length; i++) {
                const line = hunk.lines[i]!;
                if (line.startsWith("-")) {
                    oldLines.push(line.slice(1));
                    if (hunk.lines[i + 1]?.startsWith("\\ No newline")) {
                        oldHasNoNewline = true;
                    }
                } else if (line.startsWith("+")) {
                    newLines.push(line.slice(1));
                    if (hunk.lines[i + 1]?.startsWith("\\ No newline")) {
                        newHasNoNewline = true;
                    }
                } else if (line.startsWith(" ")) {
                    oldLines.push(line.slice(1));
                    newLines.push(line.slice(1));
                }
            }

            parsedHunks.push({
                oldLines,
                newLines,
                oldHasNoNewline,
                newHasNoNewline,
            });
        }

        // 定位并验证每个 hunk 的唯一位置
        const matchedPositions: number[] = [];

        for (let hIdx = 0; hIdx < parsedHunks.length; hIdx++) {
            const { oldLines } = parsedHunks[hIdx]!;

            if (oldLines.length === 0) {
                if (rawLines.length > 0) {
                    return {
                        ok: false,
                        failure: {
                            kind: "failure",
                            code: "AMBIGUOUS_HUNK_MATCH",
                            message: `Hunk #${hIdx + 1} for ${targetPath} has no context or deletion lines for a non-empty file.`,
                            retryable: false,
                        },
                    };
                }
                matchedPositions.push(0);
                continue;
            }

            // 搜索所有出现位置
            const candidates: number[] = [];
            for (let i = 0; i <= rawLines.length - oldLines.length; i++) {
                let match = true;
                for (let k = 0; k < oldLines.length; k++) {
                    if (rawLines[i + k] !== oldLines[k]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    candidates.push(i);
                }
            }

            if (candidates.length === 0) {
                return {
                    ok: false,
                    failure: {
                        kind: "failure",
                        code: "HUNK_MATCH_FAILED",
                        message: `Hunk #${hIdx + 1} failed to match in ${targetPath}: target context not found.`,
                        retryable: false,
                    },
                };
            }

            if (candidates.length > 1) {
                return {
                    ok: false,
                    failure: {
                        kind: "failure",
                        code: "AMBIGUOUS_HUNK_MATCH",
                        message: `Hunk #${hIdx + 1} matches ambiguously in ${targetPath} (${candidates.length} candidate locations found).`,
                        retryable: false,
                    },
                };
            }

            const pos = candidates[0]!;
            if (matchedPositions.length > 0) {
                const prevHunkIdx = matchedPositions.length - 1;
                const prevPos = matchedPositions[prevHunkIdx]!;
                const prevLen = parsedHunks[prevHunkIdx]!.oldLines.length;
                if (pos < prevPos + prevLen) {
                    return {
                        ok: false,
                        failure: {
                            kind: "failure",
                            code: "OVERLAPPING_HUNKS",
                            message: `Hunks #${prevHunkIdx + 1} and #${hIdx + 1} overlap or are out of order in ${targetPath}.`,
                            retryable: false,
                        },
                    };
                }
            }
            matchedPositions.push(pos);
        }

        // 倒序应用 hunk 替换
        const workingLines = [...rawLines];
        let finalHasTrailingNewline = hasTrailingNewline;

        for (let hIdx = parsedHunks.length - 1; hIdx >= 0; hIdx--) {
            const { oldLines, newLines, newHasNoNewline } = parsedHunks[hIdx]!;
            const pos = matchedPositions[hIdx]!;

            if (pos + oldLines.length === rawLines.length) {
                finalHasTrailingNewline = !newHasNoNewline;
            }

            workingLines.splice(pos, oldLines.length, ...newLines);
        }

        let resultText = "";
        if (workingLines.length > 0) {
            resultText = finalHasTrailingNewline ? `${workingLines.join("\n")}\n` : workingLines.join("\n");
        }

        return { ok: true, resultText };
    }
}
