import { open, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import picomatch from "picomatch";

import type {
    Tool,
    ToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../runtime/src/index";
import {
    contract,
    type InferContract,
} from "../../contracts/src/index";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../runtime/src/execution-control";
import { invalidInput } from "./internal/invalid-input";
import {
    computeCanonicalDigest,
    decodeAndValidateCursor,
    encodeCursor,
} from "./internal/cursor";
import {
    createWorkspaceSandbox,
    type DomainFailureMessages,
    type WorkspaceSandbox,
} from "../../sandbox/src/index";

/** `GrepTool` 在 Profile 中使用的稳定标识。 */
export const GREP_TOOL_ID = "grep";

/** 单次搜索最多返回的匹配项默认上限。 */
export const GREP_DEFAULT_MAX_MATCHES = 200;

/** 单次搜索最多返回的匹配项硬上限。 */
export const GREP_MAX_MATCHES_LIMIT = 1000;

/** 上下文行数上限。 */
export const GREP_MAX_CONTEXT_LINES = 20;

/** 单行保留的最大字符数。 */
export const GREP_MAX_LINE_CHARS = 500;

/** 目录递归跳过的目录名。 */
const SKIPPED_DIR_NAMES = new Set([
    ".git",
    ".lazygoal",
    "node_modules",
]);

const GREP_DOMAIN_FAILURES: DomainFailureMessages = {
    ENOENT: {
        code: "FILE_NOT_FOUND",
        render: (path) => `Search path not found: ${path}`,
    },
    EACCES: {
        code: "FILE_ACCESS_DENIED",
        render: (path) => `Search path access denied: ${path}`,
    },
    EPERM: {
        code: "FILE_ACCESS_DENIED",
        render: (path) => `Search path access denied: ${path}`,
    },
    ENOTDIR: {
        code: "NOT_A_DIRECTORY",
        render: (path) => `Search path is not a directory: ${path}`,
    },
};

/** Grep Tool 的输入契约。 */
export const GREP_INPUT_CONTRACT = contract.object({
    pattern: contract.string(),
    path: contract.optional(contract.string()),
    ignoreCase: contract.optional(contract.boolean()),
    include: contract.optional(contract.string()),
    exclude: contract.optional(contract.string()),
    contextLines: contract.optional(contract.integer({
        minimum: 0,
        maximum: GREP_MAX_CONTEXT_LINES,
    })),
    maxMatches: contract.optional(contract.integer({
        minimum: 1,
        maximum: GREP_MAX_MATCHES_LIMIT,
    })),
    cursor: contract.optional(contract.string()),
});

/** Grep 输入类型。 */
export type GrepInput = InferContract<typeof GREP_INPUT_CONTRACT>;

/** 附带行号的文本行。 */
export interface ContextLine {
    readonly lineNumber: number;
    readonly text: string;
}

/** 单个正则匹配结果。 */
export interface GrepMatchItem {
    readonly path: string;
    readonly lineNumber: number;
    readonly lineText: string;
    readonly context?: {
        readonly before?: readonly ContextLine[];
        readonly after?: readonly ContextLine[];
    };
}

/** Grep 成功输出结构。 */
export interface GrepOutput {
    readonly matches: readonly GrepMatchItem[];
    readonly scannedFiles: number;
    readonly truncated: boolean;
    readonly nextCursor?: string;
}

interface GrepCursorPayload {
    readonly toolId: typeof GREP_TOOL_ID;
    readonly queryDigest: string;
    readonly nextFileIndex: number;
    readonly nextLineIndex: number;
}

function truncateLine(text: string): string {
    if (text.length <= GREP_MAX_LINE_CHARS) {
        return text;
    }
    const omitted = text.length - GREP_MAX_LINE_CHARS;
    return `${text.slice(0, GREP_MAX_LINE_CHARS)}[...omitted ${omitted} chars...]`;
}

/**
 * 在指定工作区内递归正则搜索文本文件并提供上下文行的只读 Tool。
 *
 * @remarks
 * 支持 include/exclude 模式过滤、前置与后置上下文行提取、分页游标和跳过二进制文件。
 * 为避免 ReDoS 阻塞，对正则匹配执行超时防护。
 * 声明为 `safe` 重放策略。
 *
 * @example
 * ```ts
 * const tool = new GrepTool("/workspace/project");
 * const result = await tool.execute({
 *   actionId: "act-1",
 *   input: { pattern: "function\\s+main", path: "src", contextLines: 2 },
 * });
 * ```
 */
export class GrepTool implements Tool<typeof GREP_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof GREP_INPUT_CONTRACT> = {
        id: GREP_TOOL_ID,
        description: "Search text files in workspace using regular expressions with context lines and pagination.",
        inputContract: GREP_INPUT_CONTRACT,
        isReadOnly: true,
    };

    readonly replayPolicy = "safe" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;

    constructor(workspaceRoot: string) {
        if (workspaceRoot.trim() === "") {
            throw new Error("workspaceRoot must be non-empty");
        }
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot, (path) => `Search path outside workspace: ${path}`);
    }

    validate(input: GrepInput): ToolValidationResult {
        if (input.pattern.trim() === "") {
            return invalidInput("pattern cannot be empty", ["pattern"]);
        }
        if (input.pattern.length > 4096) {
            return invalidInput("pattern exceeds 4096 chars limit", ["pattern"]);
        }
        try {
            new RegExp(input.pattern, input.ignoreCase ? "i" : "");
        } catch (error) {
            return invalidInput(`Invalid regular expression pattern: ${error instanceof Error ? error.message : String(error)}`, ["pattern"]);
        }
        if (input.path !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.path);
            if (violation !== undefined) {
                switch (violation) {
                    case "empty":
                        return invalidInput("path cannot be empty", ["path"]);
                    case "nul":
                        return invalidInput("path cannot contain NUL bytes", ["path"]);
                    case "absolute":
                        return invalidInput("path must be a relative path", ["path"]);
                    case "parent":
                        return invalidInput("path cannot contain parent segments ('..')", ["path"]);
                    case "rejected-segment":
                        return invalidInput("path references a protected path", ["path"]);
                }
            }
        }
        if (input.cursor !== undefined && input.cursor.trim() === "") {
            return invalidInput("cursor cannot be empty if specified", ["cursor"]);
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<GrepInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const { input } = request;
        const requestedRoot = input.path ?? "";
        const maxMatches = input.maxMatches ?? GREP_DEFAULT_MAX_MATCHES;
        const contextLines = input.contextLines ?? 0;

        const resolved = await this.sandbox.resolveTarget(
            requestedRoot,
            GREP_DOMAIN_FAILURES,
            control,
        );

        if (!resolved.ok) {
            return resolved.failure;
        }

        let regex: RegExp;
        try {
            regex = new RegExp(input.pattern, input.ignoreCase ? "i" : "");
        } catch (error) {
            return {
                kind: "failure",
                code: "INVALID_REGEX",
                message: `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
                retryable: false,
            };
        }

        const includeMatcher = input.include !== undefined ? picomatch(input.include, { dot: true }) : undefined;
        const excludeMatcher = input.exclude !== undefined ? picomatch(input.exclude, { dot: true }) : undefined;

        const normalizedRootRel = (requestedRoot === "" || requestedRoot === ".")
            ? ""
            : requestedRoot.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");

        const queryDigest = computeCanonicalDigest({
            pattern: input.pattern,
            path: normalizedRootRel,
            ignoreCase: input.ignoreCase,
            include: input.include,
            exclude: input.exclude,
            contextLines: input.contextLines,
        });

        let startFileIndex = 0;
        let startLineIndex = 0;
        if (input.cursor !== undefined) {
            const decoded = decodeAndValidateCursor<GrepCursorPayload>(
                input.cursor,
                GREP_TOOL_ID,
                queryDigest,
            );
            if (decoded === undefined) {
                return {
                    kind: "failure",
                    code: "INVALID_CURSOR",
                    message: "The provided cursor is invalid, corrupted, or does not match the target query.",
                    retryable: false,
                };
            }
            startFileIndex = decoded.nextFileIndex;
            startLineIndex = decoded.nextLineIndex;
        }

        // 收集所有候选文件路径（有序）
        const candidateFiles: string[] = [];
        const collectFiles = async (relDir: string): Promise<void> => {
            throwIfAborted(control);
            const absDir = relDir === "" ? this.workspaceRoot : resolve(this.workspaceRoot, relDir);
            let dirents;
            try {
                const fs = await import("node:fs/promises");
                dirents = await fs.readdir(absDir, { withFileTypes: true });
            } catch {
                return;
            }
            for (const d of dirents) {
                if (d.name.startsWith(".") && SKIPPED_DIR_NAMES.has(d.name)) continue;
                if (SKIPPED_DIR_NAMES.has(d.name)) continue;

                const childRel = relDir === "" ? d.name : `${relDir}/${d.name}`;
                if (d.isSymbolicLink()) {
                    continue;
                }
                if (d.isDirectory()) {
                    await collectFiles(childRel);
                } else if (d.isFile()) {
                    if (includeMatcher !== undefined && !includeMatcher(d.name) && !includeMatcher(childRel)) {
                        continue;
                    }
                    if (excludeMatcher !== undefined && (excludeMatcher(d.name) || excludeMatcher(childRel))) {
                        continue;
                    }
                    candidateFiles.push(childRel);
                }
            }
        };

        const rootStat = await stat(resolved.path);
        if (rootStat.isFile()) {
            candidateFiles.push(normalizedRootRel === "" ? requestedRoot : normalizedRootRel);
        } else {
            await collectFiles(normalizedRootRel);
        }
        candidateFiles.sort();

        const matches: GrepMatchItem[] = [];
        let scannedFiles = 0;
        let truncated = false;
        let nextCursor: string | undefined;

        fileLoop: for (let idx = startFileIndex; idx < candidateFiles.length; idx++) {
            throwIfAborted(control);

            const relFile = candidateFiles[idx]!;
            scannedFiles += 1;

            const absFile = resolve(this.workspaceRoot, relFile);
            let text: string;
            try {
                const fileBuf = await (await import("node:fs/promises")).readFile(absFile);
                if (fileBuf.includes(0)) {
                    // 二进制文件跳过
                    continue;
                }
                text = fileBuf.toString("utf8");
            } catch {
                continue;
            }

            let lines = text.split(/\r?\n/);
            if (lines.length > 0 && lines[lines.length - 1] === "") {
                lines.pop();
            }
            const lineStart = (idx === startFileIndex) ? startLineIndex : 0;

            for (let lineIdx = lineStart; lineIdx < lines.length; lineIdx++) {
                const line = lines[lineIdx]!;

                const matchSuccess = regex.test(line);
                if (matchSuccess) {
                    let beforeLines: ContextLine[] | undefined;
                    let afterLines: ContextLine[] | undefined;

                    if (contextLines > 0) {
                        const beforeStart = Math.max(0, lineIdx - contextLines);
                        if (beforeStart < lineIdx) {
                            beforeLines = [];
                            for (let b = beforeStart; b < lineIdx; b++) {
                                beforeLines.push({
                                    lineNumber: b + 1,
                                    text: truncateLine(lines[b]!),
                                });
                            }
                        }
                        const afterEnd = Math.min(lines.length - 1, lineIdx + contextLines);
                        if (afterEnd > lineIdx) {
                            afterLines = [];
                            for (let a = lineIdx + 1; a <= afterEnd; a++) {
                                afterLines.push({
                                    lineNumber: a + 1,
                                    text: truncateLine(lines[a]!),
                                });
                            }
                        }
                    }

                    matches.push({
                        path: relFile,
                        lineNumber: lineIdx + 1,
                        lineText: truncateLine(line),
                        ...(beforeLines !== undefined || afterLines !== undefined
                            ? {
                                context: {
                                    ...(beforeLines !== undefined ? { before: beforeLines } : {}),
                                    ...(afterLines !== undefined ? { after: afterLines } : {}),
                                },
                            }
                            : {}),
                    });

                    if (matches.length >= maxMatches) {
                        truncated = true;
                        const hasMoreLinesInFile = lineIdx + 1 < lines.length;
                        const nextFile = hasMoreLinesInFile ? idx : idx + 1;
                        const nextLine = hasMoreLinesInFile ? lineIdx + 1 : 0;
                        if (nextFile < candidateFiles.length) {
                            nextCursor = encodeCursor<GrepCursorPayload>({
                                toolId: GREP_TOOL_ID,
                                queryDigest,
                                nextFileIndex: nextFile,
                                nextLineIndex: nextLine,
                            });
                        }
                        break fileLoop;
                    }
                }
            }
        }

        const output: GrepOutput = {
            matches,
            scannedFiles,
            truncated,
            ...(nextCursor !== undefined ? { nextCursor } : {}),
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Found ${matches.length} matches across ${scannedFiles} files${truncated ? " (truncated)" : ""}.`,
        };
    }
}
