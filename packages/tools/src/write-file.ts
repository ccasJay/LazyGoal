import { realpath, writeFile } from "node:fs/promises";
import {
    basename,
    dirname,
    isAbsolute,
    join,
    relative,
    resolve,
    win32,
} from "node:path";

import type {
    JsonValue,
    Tool,
    ToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../runtime/src/index";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../runtime/src/execution-control";

/** `WriteFileTool` 在 Profile 中使用的稳定标识。 */
export const WRITE_FILE_TOOL_ID = "write_file";

function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidInput(message: string): ToolValidationResult {
    return {
        ok: false,
        error: {
            code: "INVALID_TOOL_INPUT",
            message,
        },
    };
}

function isAbsolutePath(value: string): boolean {
    return isAbsolute(value) || win32.isAbsolute(value);
}

function hasParentPathSegment(value: string): boolean {
    return value.split(/[\\/]+/).some((segment) => segment === "..");
}

function firstPathSegment(value: string): string {
    return value.split(/[\\/]+/)[0] ?? "";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error;
}

function domainFailure(
    requestedPath: string,
    error: NodeJS.ErrnoException,
): ToolObservation | undefined {
    switch (error.code) {
        case "ENOENT":
            return {
                kind: "failure",
                code: "FILE_NOT_FOUND",
                message: `父目录不存在: ${requestedPath}`,
                retryable: false,
            };
        case "EACCES":
        case "EPERM":
            return {
                kind: "failure",
                code: "FILE_ACCESS_DENIED",
                message: `文件不可写入: ${requestedPath}`,
                retryable: false,
            };
        case "EISDIR":
            return {
                kind: "failure",
                code: "TARGET_IS_DIRECTORY",
                message: `目标不是文件: ${requestedPath}`,
                retryable: false,
            };
        case "ENOTDIR":
            return {
                kind: "failure",
                code: "INVALID_FILE_PATH",
                message: `文件路径无效: ${requestedPath}`,
                retryable: false,
            };
        default:
            return undefined;
    }
}

function isWithinRoot(root: string, target: string): boolean {
    const targetRelativePath = relative(root, target);

    return (
        targetRelativePath === ""
        || (
            targetRelativePath !== ".."
            && !targetRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
            && !isAbsolute(targetRelativePath)
        )
    );
}

/**
 * 在指定 workspaceRoot 内写入 UTF-8 文本文件的 Tool。
 *
 * @remarks
 * 该 Tool 只允许相对路径，并拒绝绝对路径、`..` 路径段、`.lazygoal` 前缀
 * （保护自身持久化数据）以及解析后位于工作区外部的符号链接目标或父目录。
 * 父目录必须已存在，不会自动创建目录。写入是幂等操作：同一输入重放会
 * 重写相同内容，因此声明为 `safe`，进程中断后可沿用原 `actionId` 重放
 * 以自愈半写状态。文件不存在、权限不足或目标为目录等领域问题返回
 * `failure` Observation。
 *
 * @example
 * ```ts
 * const tool = new WriteFileTool("/workspace/project");
 * const result = await tool.execute({
 *   actionId: "action-1",
 *   input: { path: "notes.md", content: "hello" },
 * });
 * ```
 */
export class WriteFileTool implements Tool {
    readonly definition: ToolDefinition = {
        id: WRITE_FILE_TOOL_ID,
        description: "写入 workspaceRoot 内的 UTF-8 文本文件（覆盖已有内容）",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string" },
                content: { type: "string" },
            },
            required: ["path", "content"],
            additionalProperties: false,
        },
    };

    readonly replayPolicy = "safe" as const;

    private readonly workspaceRoot: string;

    /**
     * @param workspaceRoot - 允许写入的工作区根目录，可为相对或绝对路径。
     * @throws workspaceRoot 为空字符串时抛出 Error。
     */
    constructor(workspaceRoot: string) {
        if (workspaceRoot.trim() === "") {
            throw new Error("workspaceRoot must be non-empty");
        }

        this.workspaceRoot = resolve(workspaceRoot);
    }

    /**
     * 校验严格的 `{ path, content }` 输入和工作区边界规则，不访问文件系统。
     *
     * @param input - Agent 提交的 JSON 输入。
     * @returns 输入合法性；`content` 允许为空字符串；符号链接越界需在执行时解析后拒绝。
     */
    validate(input: JsonValue): ToolValidationResult {
        if (!isJsonObject(input)) {
            return invalidInput("write_file 输入必须是对象");
        }

        const keys = Object.keys(input);

        if (keys.length !== 2 || !(
            Object.prototype.hasOwnProperty.call(input, "path")
            && Object.prototype.hasOwnProperty.call(input, "content")
        )) {
            return invalidInput("write_file 输入只能包含 path 与 content 字段");
        }

        const requestedPath = input.path;

        if (typeof requestedPath !== "string") {
            return invalidInput("write_file.path 必须是字符串");
        }

        if (typeof input.content !== "string") {
            return invalidInput("write_file.content 必须是字符串");
        }

        if (requestedPath.trim() === "") {
            return invalidInput("write_file.path 不能为空");
        }

        if (requestedPath.includes("\0")) {
            return invalidInput("write_file.path 不能包含 NUL 字符");
        }

        if (isAbsolutePath(requestedPath)) {
            return invalidInput("write_file.path 必须是工作区内的相对路径");
        }

        if (hasParentPathSegment(requestedPath)) {
            return invalidInput("write_file.path 不能包含 .. 路径段");
        }

        if (firstPathSegment(requestedPath) === ".lazygoal") {
            return invalidInput("write_file.path 不能写入 .lazygoal 持久化目录");
        }

        return { ok: true };
    }

    /**
     * 执行一次已通过校验的写入。
     *
     * @param request - Action ID 与 `{ path, content }` 输入。
     * @param control - 当前 Run 推进调用共享的中止控制。
     * @returns 写入字节数或可恢复的文件领域失败 Observation。
     * @throws 输入未通过校验、workspaceRoot 无法解析或发生未分类文件系统异常；
     *   中止时抛出 `ExecutionAbortedError`。
     */
    async execute(
        request: ToolExecutionRequest,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const input = request.input;
        const validation = this.validate(input);

        if (!validation.ok) {
            throw new Error(
                `${validation.error.code}: ${validation.error.message}`,
            );
        }

        if (
            !isJsonObject(input)
            || typeof input.path !== "string"
            || typeof input.content !== "string"
        ) {
            throw new Error(
                "INVALID_TOOL_INPUT: write_file.path and write_file.content must be strings",
            );
        }

        const requestedPath = input.path;
        const content = input.content;

        const resolvedRoot = await realpath(this.workspaceRoot);
        throwIfAborted(control);
        const candidatePath = resolve(resolvedRoot, requestedPath);
        let targetPath: string;

        try {
            targetPath = await realpath(candidatePath);
            throwIfAborted(control);
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }

            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }

            if (isNodeError(error)) {
                if (error.code === "ENOENT") {
                    return await this.resolveParentTarget(
                        resolvedRoot,
                        candidatePath,
                        requestedPath,
                        content,
                        control,
                    );
                } else {
                    const failure = domainFailure(requestedPath, error);

                    if (failure !== undefined) {
                        return failure;
                    }
                }
            }

            throw error;
        }

        if (!isWithinRoot(resolvedRoot, targetPath)) {
            return {
                kind: "failure",
                code: "PATH_OUTSIDE_WORKSPACE",
                message: `目标不在工作区内: ${requestedPath}`,
                retryable: false,
            };
        }

        return this.writeTarget(targetPath, requestedPath, content, control);
    }

    /**
     * 目标不存在时解析已存在的父目录并确定最终写入路径。
     *
     * @param resolvedRoot - 已解析的工作区根。
     * @param candidatePath - 根 + 请求路径拼接出的候选绝对路径。
     * @param requestedPath - 原始相对路径，用于错误消息。
     * @param content - 要写入的完整文本内容。
     * @param control - 共享中止控制。
     * @returns 父目录越界或写入产生的领域失败；成功时为写入成功 Observation。
     * @throws 父目录解析发生未分类异常或中止时抛出。
     */
    private async resolveParentTarget(
        resolvedRoot: string,
        candidatePath: string,
        requestedPath: string,
        content: string,
        control: ExecutionControl | undefined,
    ): Promise<ToolObservation> {
        let resolvedParent: string;

        try {
            resolvedParent = await realpath(dirname(candidatePath));
            throwIfAborted(control);
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }

            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }

            if (isNodeError(error)) {
                const failure = domainFailure(requestedPath, error);

                if (failure !== undefined) {
                    return failure;
                }
            }

            throw error;
        }

        if (!isWithinRoot(resolvedRoot, resolvedParent)) {
            return {
                kind: "failure",
                code: "PATH_OUTSIDE_WORKSPACE",
                message: `目标不在工作区内: ${requestedPath}`,
                retryable: false,
            };
        }

        const targetPath = join(resolvedParent, basename(candidatePath));

        return this.writeTarget(targetPath, requestedPath, content, control);
    }

    /**
     * 写入最终目标路径并返回成功 Observation。
     *
     * @param targetPath - 已通过沙箱校验的绝对写入路径。
     * @param requestedPath - 原始相对路径，用于输出与错误消息。
     * @param content - 要写入的完整文本内容。
     * @param control - 共享中止控制。
     * @returns 写入成功或文件领域失败 Observation。
     * @throws 未分类文件系统异常；中止时抛出 `ExecutionAbortedError`。
     */
    private async writeTarget(
        targetPath: string,
        requestedPath: string,
        content: string,
        control: ExecutionControl | undefined,
    ): Promise<ToolObservation> {
        try {
            if (control?.signal === undefined) {
                await writeFile(targetPath, content, "utf8");
            } else {
                await writeFile(targetPath, content, {
                    encoding: "utf8",
                    signal: control.signal,
                });
            }

            throwIfAborted(control);

            return {
                kind: "success",
                output: {
                    path: requestedPath,
                    bytes: Buffer.byteLength(content, "utf8"),
                },
                summary: `已写入 ${requestedPath}`,
            };
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }

            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }

            if (isNodeError(error)) {
                const failure = domainFailure(requestedPath, error);

                if (failure !== undefined) {
                    return failure;
                }
            }

            throw error;
        }
    }
}
