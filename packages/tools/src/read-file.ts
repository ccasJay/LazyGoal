import { open, readdir, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import {
    type BoundTool,
    type Tool,
    type BoundToolDefinition,
    type ToolExecutionRequest,
    type ToolObservation,
    type ToolValidationResult,
} from "../../tool-core/src/index";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";
import { invalidInput } from "./internal/invalid-input";
import { getWorkspaceVersion } from "./internal/workspace-version";
import {
    computeCanonicalDigest,
    decodeAndValidateCursor,
    encodeCursor,
} from "./internal/cursor";
import {
    createWorkspaceSandbox,
    normalizeToWorkspaceRelative,
    type DomainFailureMessages,
    type WorkspaceSandbox,
} from "../../sandbox/src/index";
import { readFileInputBinding } from "./generated/read-file/binding";

/** `ReadFileTool` 在 Profile 中使用的稳定标识。 */
export const READ_FILE_TOOL_ID = "read_file";

/** 单次读取默认最大字符数。 */
export const READ_FILE_DEFAULT_MAX_CHARS = 16_000;

/** 单次读取允许设置的最大字符数上限。 */
export const READ_FILE_MAX_CHARS_LIMIT = 50_000;

const READ_FILE_DOMAIN_FAILURES: DomainFailureMessages = {
    ENOENT: {
        code: "FILE_NOT_FOUND",
        render: (path) => `File not found: ${path}`,
    },
    EACCES: {
        code: "FILE_ACCESS_DENIED",
        render: (path) => `File access denied: ${path}`,
    },
    EPERM: {
        code: "FILE_ACCESS_DENIED",
        render: (path) => `File access denied: ${path}`,
    },
    EISDIR: {
        code: "TARGET_IS_DIRECTORY",
        render: (path) => `Target is a directory: ${path}`,
    },
    ENOTDIR: {
        code: "INVALID_FILE_PATH",
        render: (path) => `Invalid file path: ${path}`,
    },
};

/** Read File Tool 的输入 Contract。 */

/**
 * `read_file` 的结构化输入。
 *
 * @remarks
 * `startLine` 与 `endLine` 为 1 起始的闭区间；`maxChars` 限制单次返回字符数，`cursor` 用于续读。
 */
export interface ReadFileInput {
    /** 工作区相对文件路径。 */
    readonly path: string;
    /**
     * 起始行号（1 起始）。
     * @asType integer
     * @minimum 1
     * @maximum 9007199254740991
     */
    readonly startLine?: number;
    /**
     * 结束行号（1 起始，包含）。
     * @asType integer
     * @minimum 1
     * @maximum 9007199254740991
     */
    readonly endLine?: number;
    /**
     * 单次最多返回的字符数。
     * @asType integer
     * @minimum 1
     * @maximum 50000
     */
    readonly maxChars?: number;
    /** 上一页返回的续读游标。 */
    readonly cursor?: string;
}

/** `read_file` 的生成输入绑定。 */
export { readFileInputBinding };

/** ReadFile 成功输出结构。 */
export interface ReadFileOutput {
    /** 文件的相对路径。 */
    readonly path: string;
    /** 读取到的 UTF-8 文本内容。 */
    readonly text: string;
    /** 实际返回文本的起始行号（1-based）。 */
    readonly startLine: number;
    /** 实际返回文本的结束行号（1-based）。 */
    readonly endLine: number;
    /** 是否已读取至文件末尾（EOF）。 */
    readonly eof: boolean;
    /** 是否因达到字符额度或范围约束截断。 */
    readonly truncated: boolean;
    /** 用于获取下一页文本的游标字符串；若已达 EOF 且未截断则不存在。 */
    readonly nextCursor?: string;
}

interface ReadFileCursorPayload {
    readonly toolId: typeof READ_FILE_TOOL_ID;
    readonly queryDigest: string;
    readonly nextLine: number;
    readonly charOffsetInLine: number;
}

/**
 * 在指定 workspaceRoot 内增量读取 UTF-8 文本文件的只读 Tool。
 *
 * @remarks
 * 支持按 1 起始的闭区间 `[startLine, endLine]` 进行行范围读取，未指定 endLine 时继续至 EOF。
 * 当单行超出字符预算或多行达到 maxChars 时支持基于游标的分页续读，包含超长行内续读。
 * 包含 NUL 字节或非合法 UTF-8 序列的文件将作为二进制文件返回领域 failure。
 * 声明为 `safe` 重放策略。
 *
 * @example
 * ```ts
 * const tool = new ReadFileTool("/workspace/project");
 * const result = await tool.execute({
 *   actionId: "act-1",
 *   input: { path: "README.md", startLine: 1, endLine: 50 },
 * });
 * ```
 */
export class ReadFileTool implements BoundTool<ReadFileInput> {
    readonly definition: BoundToolDefinition<ReadFileInput> = {
        id: READ_FILE_TOOL_ID,
        description: "Read UTF-8 text from a file in workspaceRoot with line range and pagination support.",
        inputBinding: readFileInputBinding,
        isReadOnly: true,
    };

    readonly replayPolicy = "safe" as const;

    private readonly sandbox: WorkspaceSandbox;
    private readonly missingPaths = new Map<string, number>();

    constructor(workspaceRoot: string) {
        if (workspaceRoot.trim() === "") {
            throw new Error("workspaceRoot must be non-empty");
        }
        this.sandbox = createWorkspaceSandbox(resolve(workspaceRoot));
    }

    validate(input: ReadFileInput): ToolValidationResult {
        const normalizedPath = normalizeToWorkspaceRelative(input.path, this.sandbox.root);
        const violation = this.sandbox.validateRelativePath(normalizedPath);
        if (violation !== undefined) {
            switch (violation) {
                case "empty":
                    return invalidInput("read_file.path cannot be empty", ["path"]);
                case "nul":
                    return invalidInput("read_file.path cannot contain NUL bytes", ["path"]);
                case "absolute":
                    return invalidInput("read_file.path must be a relative path", ["path"]);
                case "parent":
                    return invalidInput("read_file.path cannot contain parent segments ('..')", ["path"]);
                case "rejected-segment":
                    return invalidInput("read_file.path references a protected path", ["path"]);
            }
        }
        if (input.cursor !== undefined && input.cursor.trim() === "") {
            return invalidInput("cursor cannot be empty if specified", ["cursor"]);
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<ReadFileInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const { input } = request;
        const requestedPath = normalizeToWorkspaceRelative(input.path, this.sandbox.root);

        const currentVersion = getWorkspaceVersion(this.sandbox.root);
        const priorMissingVersion = this.missingPaths.get(requestedPath);
        if (priorMissingVersion !== undefined && priorMissingVersion === currentVersion) {
            return {
                kind: "failure",
                code: "REPEATED_FILE_NOT_FOUND",
                message: `严禁重复读取已确认不存在的文件路径: ${requestedPath}！该文件已被确认为不存在。请立即使用 bash 调用 rg（必要时使用 shell fallback）搜索关键符号或类名，禁止盲猜文件路径。`,
                retryable: false,
            };
        }

        const resolved = await this.sandbox.resolveTarget(
            requestedPath,
            READ_FILE_DOMAIN_FAILURES,
            control,
        );

        if (!resolved.ok) {
            if (resolved.failure.code === "FILE_NOT_FOUND") {
                this.missingPaths.set(requestedPath, currentVersion);
                let suggestions: string[] = [];
                try {
                    const candidatePath = resolve(this.sandbox.root, requestedPath);
                    const parentDir = dirname(candidatePath);
                    const entries = await readdir(parentDir);
                    const base = basename(candidatePath);
                    const baseStem = base.replace(/\.[^.]+$/, "");
                    const matched = entries.filter((e) =>
                        e.toLowerCase().includes(baseStem.toLowerCase()) ||
                        baseStem.toLowerCase().includes(e.toLowerCase())
                    );
                    suggestions = (matched.length > 0 ? matched : entries).slice(0, 10);
                } catch {}

                let alternativePathHint = "";
                // 探测同名 Python 包目录的 __init__.py（例如请求 quantity_helper.py，但实际为 quantity_helper/__init__.py）
                if (requestedPath.endsWith(".py")) {
                    const pkgDir = requestedPath.slice(0, -3);
                    const initPath = `${pkgDir}/__init__.py`;
                    try {
                        const st = await stat(resolve(this.sandbox.root, initPath));
                        if (st.isFile()) {
                            alternativePathHint = `. 提示: 文件 ${requestedPath} 不存在，但存在同名 Python 模块包: ${initPath}，请直接读取该包的 __init__.py。`;
                        }
                    } catch {}
                }

                const parts = requestedPath.split("/").filter(Boolean);
                if (!alternativePathHint && parts.length > 1) {
                    const stripped = parts.slice(1).join("/");
                    try {
                        const st = await stat(resolve(this.sandbox.root, stripped));
                        if (st.isFile()) {
                            alternativePathHint = `. 提示: 检测到可能包含冗余目录前缀，工作区内存在真实文件: ${stripped}。`;
                        }
                    } catch {}
                    if (!alternativePathHint && parts.length > 2 && parts[0] === parts[1]) {
                        const deduped = [parts[0], ...parts.slice(2)].join("/");
                        try {
                            const st = await stat(resolve(this.sandbox.root, deduped));
                            if (st.isFile()) {
                                alternativePathHint = `. 提示: 检测到重复根目录前缀，工作区内存在真实文件: ${deduped}。`;
                            }
                        } catch {}
                    }
                }

                const hint = alternativePathHint || (suggestions.length > 0
                    ? `. Candidates in parent directory: [${suggestions.join(", ")}]. Use bash with rg (or its shell fallback) to locate the correct file; do not re-request this exact path.`
                    : "");
                return {
                    ...resolved.failure,
                    message: `${resolved.failure.message}${hint}`,
                };
            }
            return resolved.failure;
        }

        const maxChars = input.maxChars ?? READ_FILE_DEFAULT_MAX_CHARS;
        const rawStart = input.startLine;
        const rawEnd = input.endLine;
        let startLine = rawStart ?? 1;
        let targetEndLine = rawEnd;

        if (rawStart !== undefined && rawEnd !== undefined) {
            startLine = Math.min(rawStart, rawEnd);
            targetEndLine = Math.max(rawStart, rawEnd);
        }
        let charOffsetInLine = 0;

        const queryDigest = computeCanonicalDigest({
            path: requestedPath,
            startLine,
            endLine: targetEndLine,
        });

        let cursorDegraded = false;
        if (input.cursor !== undefined) {
            const decoded = decodeAndValidateCursor<ReadFileCursorPayload>(
                input.cursor,
                READ_FILE_TOOL_ID,
                queryDigest,
            );
            if (decoded === undefined) {
                cursorDegraded = true;
            } else {
                startLine = decoded.nextLine;
                charOffsetInLine = decoded.charOffsetInLine;
            }
        }

        let fileHandle;
        try {
            const fileStat = await stat(resolved.path);
            if (fileStat.isDirectory()) {
                let entries: string[] = [];
                try {
                    entries = (await readdir(resolved.path)).slice(0, 50);
                } catch {}
                return {
                    kind: "failure",
                    code: "TARGET_IS_DIRECTORY",
                    message: `Target is a directory: ${requestedPath}. Use bash with rg or list files to choose a specific text file. Entries: [${entries.join(", ")}]`,
                    retryable: true,
                };
            }
            fileHandle = await open(resolved.path, "r");
            this.missingPaths.delete(requestedPath);
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                this.missingPaths.set(requestedPath, currentVersion);
                let suggestions: string[] = [];
                try {
                    const parentDir = dirname(resolved.path);
                    const entries = await readdir(parentDir);
                    const base = basename(resolved.path);
                    const baseStem = base.replace(/\.[^.]+$/, "");
                    const matched = entries.filter((e) =>
                        e.toLowerCase().includes(baseStem.toLowerCase()) ||
                        baseStem.toLowerCase().includes(e.toLowerCase())
                    );
                    suggestions = (matched.length > 0 ? matched : entries).slice(0, 10);
                } catch {}
                const hint = suggestions.length > 0
                    ? `. Candidates in parent directory: [${suggestions.join(", ")}]. Use bash with rg (or its shell fallback) to locate the correct file; do not re-request this exact path.`
                    : "";
                return {
                    kind: "failure",
                    code: "FILE_NOT_FOUND",
                    message: `File not found: ${requestedPath}${hint}`,
                    retryable: false,
                };
            }
            const mapped = this.sandbox.toDomainFailure(
                error as NodeJS.ErrnoException,
                READ_FILE_DOMAIN_FAILURES,
                requestedPath,
            );
            if (mapped !== undefined) return mapped;
            return {
                kind: "failure",
                code: "FILE_READ_FAILED",
                message: `Failed to open ${requestedPath}: ${error instanceof Error ? error.message : String(error)}`,
                retryable: false,
            };
        }

        try {
            // 使用增量 UTF-8 解码逐块读取
            const decoder = new TextDecoder("utf-8", { fatal: true });
            const CHUNK_SIZE = 64 * 1024;
            const buffer = Buffer.alloc(CHUNK_SIZE);

            let currentLineNumber = 1;
            let currentLineBuffer = "";
            let collectedText = "";
            let actualStartLine = startLine;
            let actualEndLine = startLine;
            let hasEmittedContent = false;
            let truncated = false;
            let nextCursor: string | undefined;
            let reachedFileEnd = false;

            readLoop: while (true) {
                throwIfAborted(control);
                const { bytesRead } = await fileHandle.read(buffer, 0, CHUNK_SIZE, null);
                if (bytesRead === 0) {
                    reachedFileEnd = true;
                    // 处理流末尾剩余的 lineBuffer
                    if (currentLineBuffer.length > 0 || currentLineNumber === 1) {
                        const lineText = currentLineBuffer;
                        if (currentLineNumber >= startLine && (targetEndLine === undefined || currentLineNumber <= targetEndLine)) {
                            let textToTake = lineText.slice(charOffsetInLine);
                            if (collectedText.length + textToTake.length > maxChars) {
                                const allowedChars = maxChars - collectedText.length;
                                collectedText += textToTake.slice(0, allowedChars);
                                actualEndLine = currentLineNumber;
                                truncated = true;
                                nextCursor = encodeCursor<ReadFileCursorPayload>({
                                    toolId: READ_FILE_TOOL_ID,
                                    queryDigest,
                                    nextLine: currentLineNumber,
                                    charOffsetInLine: charOffsetInLine + allowedChars,
                                });
                                break readLoop;
                            } else {
                                collectedText += textToTake;
                                actualEndLine = currentLineNumber;
                                hasEmittedContent = true;
                            }
                        }
                    }
                    break readLoop;
                }

                // 检查 NUL 字节
                for (let i = 0; i < bytesRead; i++) {
                    if (buffer[i] === 0) {
                        return {
                            kind: "failure",
                            code: "BINARY_FILE_DETECTED",
                            message: `Binary content detected in ${requestedPath}: files containing NUL bytes cannot be read as text.`,
                            retryable: false,
                        };
                    }
                }

                let chunkText: string;
                try {
                    chunkText = decoder.decode(buffer.subarray(0, bytesRead), { stream: true });
                } catch {
                    return {
                        kind: "failure",
                        code: "BINARY_FILE_DETECTED",
                        message: `Invalid UTF-8 encoding detected in ${requestedPath}.`,
                        retryable: false,
                    };
                }

                for (let i = 0; i < chunkText.length; i++) {
                    const char = chunkText[i]!;
                    if (char === "\n") {
                        const lineText = currentLineBuffer;
                        currentLineBuffer = "";

                        if (currentLineNumber >= startLine && (targetEndLine === undefined || currentLineNumber <= targetEndLine)) {
                            if (!hasEmittedContent) {
                                actualStartLine = currentLineNumber;
                            }
                            const lineWithNewline = lineText.slice(charOffsetInLine) + "\n";
                            charOffsetInLine = 0; // 仅对首个行内偏移生效

                            if (collectedText.length + lineWithNewline.length > maxChars) {
                                const allowed = maxChars - collectedText.length;
                                if (allowed > 0) {
                                    collectedText += lineWithNewline.slice(0, allowed);
                                    actualEndLine = currentLineNumber;
                                    truncated = true;
                                    nextCursor = encodeCursor<ReadFileCursorPayload>({
                                        toolId: READ_FILE_TOOL_ID,
                                        queryDigest,
                                        nextLine: currentLineNumber,
                                        charOffsetInLine: allowed,
                                    });
                                } else {
                                    actualEndLine = hasEmittedContent ? currentLineNumber - 1 : currentLineNumber;
                                    truncated = true;
                                    nextCursor = encodeCursor<ReadFileCursorPayload>({
                                        toolId: READ_FILE_TOOL_ID,
                                        queryDigest,
                                        nextLine: currentLineNumber,
                                        charOffsetInLine: 0,
                                    });
                                }
                                break readLoop;
                            }

                            collectedText += lineWithNewline;
                            actualEndLine = currentLineNumber;
                            hasEmittedContent = true;

                            if (targetEndLine !== undefined && currentLineNumber === targetEndLine) {
                                break readLoop;
                            }
                        }

                        currentLineNumber += 1;
                    } else if (char !== "\r") {
                        currentLineBuffer += char;
                    }
                }
            }

            // 如果收集为空且 startLine 超过了总行数，做友好返回并提示实际总行数
            if (!hasEmittedContent && collectedText === "" && currentLineNumber < startLine) {
                const totalLines = Math.max(1, currentLineNumber);
                const degradationNote = cursorDegraded ? " (cursor degraded to line range)" : "";
                return {
                    kind: "success",
                    output: {
                        path: requestedPath,
                        text: "",
                        startLine: totalLines,
                        endLine: totalLines,
                        eof: true,
                        truncated: false,
                    } as any,
                    summary: `Requested startLine (${startLine}) is beyond the total lines of ${requestedPath} (total: ${totalLines} lines). Returned empty range at EOF.${degradationNote}`,
                };
            }

            const eof = reachedFileEnd && !truncated;
            const output: ReadFileOutput = {
                path: requestedPath,
                text: collectedText,
                startLine: actualStartLine,
                endLine: actualEndLine,
                eof,
                truncated,
                ...(nextCursor !== undefined ? { nextCursor } : {}),
            };

            const degradationNote = cursorDegraded ? " (cursor degraded to line range)" : "";
            return {
                kind: "success",
                output: output as any,
                summary: `Read lines ${actualStartLine}-${actualEndLine} of ${requestedPath}${eof ? " (EOF)" : ""}${truncated ? " (truncated)" : ""}${degradationNote}.`,
            };
        } finally {
            await fileHandle.close().catch(() => {});
        }
    }
}
