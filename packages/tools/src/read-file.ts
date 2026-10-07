import { open } from "node:fs/promises";
import { resolve } from "node:path";

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
} from "../../execution-control/src/index";
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
export const READ_FILE_INPUT_CONTRACT = contract.object({
    path: contract.string(),
    startLine: contract.optional(contract.integer({ minimum: 1 })),
    endLine: contract.optional(contract.integer({ minimum: 1 })),
    maxChars: contract.optional(contract.integer({
        minimum: 1,
        maximum: READ_FILE_MAX_CHARS_LIMIT,
    })),
    cursor: contract.optional(contract.string()),
});

/** ReadFile 输入类型。 */
export type ReadFileInput = InferContract<typeof READ_FILE_INPUT_CONTRACT>;

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
export class ReadFileTool implements Tool<typeof READ_FILE_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof READ_FILE_INPUT_CONTRACT> = {
        id: READ_FILE_TOOL_ID,
        description: "Read UTF-8 text from a file in workspaceRoot with line range and pagination support.",
        inputContract: READ_FILE_INPUT_CONTRACT,
        isReadOnly: true,
    };

    readonly replayPolicy = "safe" as const;

    private readonly sandbox: WorkspaceSandbox;

    constructor(workspaceRoot: string) {
        if (workspaceRoot.trim() === "") {
            throw new Error("workspaceRoot must be non-empty");
        }
        this.sandbox = createWorkspaceSandbox(resolve(workspaceRoot));
    }

    validate(input: ReadFileInput): ToolValidationResult {
        const violation = this.sandbox.validateRelativePath(input.path);
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
        if (input.startLine !== undefined && input.endLine !== undefined && input.startLine > input.endLine) {
            return invalidInput("startLine cannot be greater than endLine", ["startLine"]);
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
        const requestedPath = input.path;

        const resolved = await this.sandbox.resolveTarget(
            requestedPath,
            READ_FILE_DOMAIN_FAILURES,
            control,
        );

        if (!resolved.ok) {
            return resolved.failure;
        }

        const maxChars = input.maxChars ?? READ_FILE_DEFAULT_MAX_CHARS;
        let startLine = input.startLine ?? 1;
        const targetEndLine = input.endLine;
        let charOffsetInLine = 0;

        const queryDigest = computeCanonicalDigest({
            path: requestedPath,
            startLine: input.startLine,
            endLine: input.endLine,
        });

        if (input.cursor !== undefined) {
            const decoded = decodeAndValidateCursor<ReadFileCursorPayload>(
                input.cursor,
                READ_FILE_TOOL_ID,
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
            startLine = decoded.nextLine;
            charOffsetInLine = decoded.charOffsetInLine;
        }

        let fileHandle;
        try {
            fileHandle = await open(resolved.path, "r");
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
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

            // 如果收集为空且文件不是空文件且 startLine 超过了总行数
            if (!hasEmittedContent && collectedText === "" && currentLineNumber < startLine) {
                return {
                    kind: "failure",
                    code: "INVALID_LINE_RANGE",
                    message: `startLine ${startLine} is beyond the total lines of ${requestedPath} (${currentLineNumber}).`,
                    retryable: false,
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

            return {
                kind: "success",
                output: output as any,
                summary: `Read lines ${actualStartLine}-${actualEndLine} of ${requestedPath}${eof ? " (EOF)" : ""}${truncated ? " (truncated)" : ""}.`,
            };
        } finally {
            await fileHandle.close().catch(() => {});
        }
    }
}
