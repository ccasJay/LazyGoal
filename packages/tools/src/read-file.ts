import { readFile, realpath } from "node:fs/promises";
import {
    isAbsolute,
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

/** `ReadFileTool` 在 Profile 中使用的稳定标识。 */
export const READ_FILE_TOOL_ID = "read_file";

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
                message: `文件不存在: ${requestedPath}`,
                retryable: false,
            };
        case "EACCES":
        case "EPERM":
            return {
                kind: "failure",
                code: "FILE_ACCESS_DENIED",
                message: `文件不可读取: ${requestedPath}`,
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
 * 在指定 workspaceRoot 内读取 UTF-8 文本文件的只读 Tool。
 *
 * @remarks
 * 该 Tool 只允许相对路径，并拒绝绝对路径、`..` 路径段与解析后位于工作区
 * 外部的符号链接。合法读取返回文件内容；文件不存在、权限不足或目标为目录
 * 等领域问题返回 `failure` Observation。它声明为 `safe`，恢复时可以沿用原
 * `actionId` 重放同一读取。
 *
 * @example
 * ```ts
 * const tool = new ReadFileTool("/workspace/project");
 * const result = await tool.execute({
 *   actionId: "action-1",
 *   input: { path: "README.md" },
 * });
 * ```
 */
export class ReadFileTool implements Tool {
    readonly definition: ToolDefinition = {
        id: READ_FILE_TOOL_ID,
        description: "读取 workspaceRoot 内的 UTF-8 文本文件",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string" },
            },
            required: ["path"],
            additionalProperties: false,
        },
    };

    readonly replayPolicy = "safe" as const;

    private readonly workspaceRoot: string;

    /**
     * @param workspaceRoot - 允许读取的工作区根目录，可为相对或绝对路径。
     * @throws workspaceRoot 为空字符串时抛出 Error。
     */
    constructor(workspaceRoot: string) {
        if (workspaceRoot.trim() === "") {
            throw new Error("workspaceRoot must be non-empty");
        }

        this.workspaceRoot = resolve(workspaceRoot);
    }

    /**
     * 校验严格的 `{ path: string }` 输入和工作区边界规则，不访问文件系统。
     *
     * @param input - Agent 提交的 JSON 输入。
     * @returns 输入合法性；符号链接越界需在执行时解析后拒绝。
     */
    validate(input: JsonValue): ToolValidationResult {
        if (!isJsonObject(input)) {
            return invalidInput("read_file 输入必须是对象");
        }

        const keys = Object.keys(input);

        if (
            keys.length !== 1
            || !Object.prototype.hasOwnProperty.call(input, "path")
        ) {
            return invalidInput("read_file 输入只能包含 path 字段");
        }

        const requestedPath = input.path;

        if (typeof requestedPath !== "string") {
            return invalidInput("read_file.path 必须是字符串");
        }

        if (requestedPath.trim() === "") {
            return invalidInput("read_file.path 不能为空");
        }

        if (requestedPath.includes("\0")) {
            return invalidInput("read_file.path 不能包含 NUL 字符");
        }

        if (isAbsolutePath(requestedPath)) {
            return invalidInput("read_file.path 必须是工作区内的相对路径");
        }

        if (hasParentPathSegment(requestedPath)) {
            return invalidInput("read_file.path 不能包含 .. 路径段");
        }

        return { ok: true };
    }

    /**
     * 读取一次已通过校验的路径。
     *
     * @param request - Action ID 与 `{ path: string }` 输入。
     * @param control - 当前 Run 推进调用共享的中止控制。
     * @returns 文件内容或可恢复的文件领域失败 Observation。
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

        if (!isJsonObject(input) || typeof input.path !== "string") {
            throw new Error("INVALID_TOOL_INPUT: read_file.path must be a string");
        }

        const requestedPath = input.path;

        const resolvedRoot = await realpath(this.workspaceRoot);
        throwIfAborted(control);
        const candidatePath = resolve(resolvedRoot, requestedPath);
        let resolvedTarget: string;

        try {
            resolvedTarget = await realpath(candidatePath);
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

        if (!isWithinRoot(resolvedRoot, resolvedTarget)) {
            return {
                kind: "failure",
                code: "PATH_OUTSIDE_WORKSPACE",
                message: `目标不在工作区内: ${requestedPath}`,
                retryable: false,
            };
        }

        try {
            const content = control?.signal === undefined
                ? await readFile(resolvedTarget, "utf8")
                : await readFile(resolvedTarget, {
                    encoding: "utf8",
                    signal: control.signal,
                });
            throwIfAborted(control);

            return {
                kind: "success",
                output: content,
                summary: `已读取 ${requestedPath}`,
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
