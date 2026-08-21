import { basename, dirname, join } from "node:path";

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
import { isJsonObject, invalidInput } from "./internal/json-input";
import {
    createWorkspaceSandbox,
    type DomainFailureMessages,
    type WorkspaceSandbox,
} from "./internal/workspace-sandbox";

/** `WriteFileTool` 在 Profile 中使用的稳定标识。 */
export const WRITE_FILE_TOOL_ID = "write_file";

const WRITE_FILE_DOMAIN_FAILURES: DomainFailureMessages = {
    ENOENT: {
        code: "FILE_NOT_FOUND",
        render: (path) => `父目录不存在: ${path}`,
    },
    EACCES: {
        code: "FILE_ACCESS_DENIED",
        render: (path) => `文件不可写入: ${path}`,
    },
    EPERM: {
        code: "FILE_ACCESS_DENIED",
        render: (path) => `文件不可写入: ${path}`,
    },
    EISDIR: {
        code: "TARGET_IS_DIRECTORY",
        render: (path) => `目标不是文件: ${path}`,
    },
    ENOTDIR: {
        code: "INVALID_FILE_PATH",
        render: (path) => `文件路径无效: ${path}`,
    },
};

interface WriteFileInput {
    readonly path: string;
    readonly content: string;
}

function parseInput(input: JsonValue): WriteFileInput | undefined {
    if (!isJsonObject(input)) {
        return undefined;
    }

    const keys = Object.keys(input);

    if (
        keys.length !== 2
        || !Object.prototype.hasOwnProperty.call(input, "path")
        || !Object.prototype.hasOwnProperty.call(input, "content")
    ) {
        return undefined;
    }

    if (typeof input.path !== "string" || typeof input.content !== "string") {
        return undefined;
    }

    return { path: input.path, content: input.content };
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

    private readonly sandbox: WorkspaceSandbox;

    /**
     * @param workspaceRoot - 允许写入的工作区根目录，可为相对或绝对路径。
     * @throws workspaceRoot 为空字符串时抛出 Error。
     */
    constructor(workspaceRoot: string) {
        // TODO(sandbox-extraction): 迁移独立包后替换为 @lazygoal/sandbox
        this.sandbox = createWorkspaceSandbox(workspaceRoot);
    }

    /**
     * 校验严格的 `{ path, content }` 输入和工作区边界规则，不访问文件系统。
     *
     * @param input - Agent 提交的 JSON 输入。
     * @returns 输入合法性；`content` 允许为空字符串；符号链接越界需在执行时解析后拒绝。
     */
    validate(input: JsonValue): ToolValidationResult {
        const parsed = parseInput(input);

        if (parsed === undefined) {
            return invalidInput("write_file 输入只能包含 path 与 content 字段");
        }

        return this.checkSemantics(parsed);
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

        const parsed = parseInput(request.input);

        if (parsed === undefined) {
            throw new Error(
                "INVALID_TOOL_INPUT: write_file.path and write_file.content must be strings",
            );
        }

        const semantic = this.checkSemantics(parsed);

        if (!semantic.ok) {
            throw new Error(`${semantic.error.code}: ${semantic.error.message}`);
        }

        const requestedPath = parsed.path;
        const content = parsed.content;

        let targetPath: string;

        try {
            const resolved = await this.sandbox.resolveExistingPath(
                requestedPath,
                requestedPath,
                control,
            );

            if (!resolved.ok) {
                return resolved.failure;
            }

            targetPath = resolved.path;
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }

            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }

            if (isNodeError(error) && error.code === "ENOENT") {
                return this.resolveParentTarget(
                    requestedPath,
                    content,
                    control,
                );
            }

            const failure = this.sandbox.toDomainFailure(
                error as NodeJS.ErrnoException,
                WRITE_FILE_DOMAIN_FAILURES,
                requestedPath,
            );

            if (failure !== undefined) {
                return failure;
            }

            throw error;
        }

        return this.writeTarget(targetPath, requestedPath, content, control);
    }

    /**
     * 目标不存在时解析已存在的父目录并确定最终写入路径。
     *
     * @param requestedPath - 原始相对路径，用于错误消息。
     * @param content - 要写入的完整文本内容。
     * @param control - 共享中止控制。
     * @returns 父目录越界或写入产生的领域失败；成功时为写入成功 Observation。
     * @throws 父目录解析发生未分类异常或中止时抛出。
     */
    private async resolveParentTarget(
        requestedPath: string,
        content: string,
        control: ExecutionControl | undefined,
    ): Promise<ToolObservation> {
        const parentRequestedPath = dirname(requestedPath);

        let resolvedParent: string;

        try {
            const resolved = await this.sandbox.resolveExistingPath(
                parentRequestedPath,
                requestedPath,
                control,
            );

            if (!resolved.ok) {
                return resolved.failure;
            }

            resolvedParent = resolved.path;
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }

            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }

            const failure = this.sandbox.toDomainFailure(
                error as NodeJS.ErrnoException,
                WRITE_FILE_DOMAIN_FAILURES,
                requestedPath,
            );

            if (failure !== undefined) {
                return failure;
            }

            throw error;
        }

        const targetPath = join(resolvedParent, basename(requestedPath));

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
            await this.sandbox.writeTextFile(targetPath, content, control);
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

            const failure = this.sandbox.toDomainFailure(
                error as NodeJS.ErrnoException,
                WRITE_FILE_DOMAIN_FAILURES,
                requestedPath,
            );

            if (failure !== undefined) {
                return failure;
            }

            throw error;
        }
    }

    private checkSemantics(parsed: WriteFileInput): ToolValidationResult {
        const violation = this.sandbox.validateRelativePath(parsed.path, {
            rejectSegments: [".lazygoal"],
        });

        switch (violation) {
            case "empty":
                return invalidInput("write_file.path 不能为空");
            case "nul":
                return invalidInput("write_file.path 不能包含 NUL 字符");
            case "absolute":
                return invalidInput("write_file.path 必须是工作区内的相对路径");
            case "parent":
                return invalidInput("write_file.path 不能包含 .. 路径段");
            case "rejected-segment":
                return invalidInput("write_file.path 不能写入 .lazygoal 持久化目录");
            default:
                return { ok: true };
        }
    }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error;
}
