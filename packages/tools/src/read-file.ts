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

/** `ReadFileTool` 在 Profile 中使用的稳定标识。 */
export const READ_FILE_TOOL_ID = "read_file";

const READ_FILE_DOMAIN_FAILURES: DomainFailureMessages = {
    ENOENT: {
        code: "FILE_NOT_FOUND",
        render: (path) => `文件不存在: ${path}`,
    },
    EACCES: {
        code: "FILE_ACCESS_DENIED",
        render: (path) => `文件不可读取: ${path}`,
    },
    EPERM: {
        code: "FILE_ACCESS_DENIED",
        render: (path) => `文件不可读取: ${path}`,
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

interface ReadFileInput {
    readonly path: string;
}

function parseInput(input: JsonValue): ReadFileInput | undefined {
    if (!isJsonObject(input)) {
        return undefined;
    }

    const keys = Object.keys(input);

    if (
        keys.length !== 1
        || !Object.prototype.hasOwnProperty.call(input, "path")
    ) {
        return undefined;
    }

    if (typeof input.path !== "string") {
        return undefined;
    }

    return { path: input.path };
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

    private readonly sandbox: WorkspaceSandbox;

    /**
     * @param workspaceRoot - 允许读取的工作区根目录，可为相对或绝对路径。
     * @throws workspaceRoot 为空字符串时抛出 Error。
     */
    constructor(workspaceRoot: string) {
        // TODO(sandbox-extraction): 迁移独立包后替换为 @lazygoal/sandbox
        this.sandbox = createWorkspaceSandbox(workspaceRoot);
    }

    /**
     * 校验严格的 `{ path: string }` 输入和工作区边界规则，不访问文件系统。
     *
     * @param input - Agent 提交的 JSON 输入。
     * @returns 输入合法性；符号链接越界需在执行时解析后拒绝。
     */
    validate(input: JsonValue): ToolValidationResult {
        const parsed = parseInput(input);

        if (parsed === undefined) {
            return invalidInput("read_file 输入只能包含 path 字段");
        }

        return this.checkSemantics(parsed);
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

        const parsed = parseInput(request.input);

        if (parsed === undefined) {
            throw new Error("INVALID_TOOL_INPUT: read_file.path must be a string");
        }

        const semantic = this.checkSemantics(parsed);

        if (!semantic.ok) {
            throw new Error(`${semantic.error.code}: ${semantic.error.message}`);
        }

        const requestedPath = parsed.path;

        const resolved = await this.sandbox.resolveTarget(
            requestedPath,
            READ_FILE_DOMAIN_FAILURES,
            control,
        );

        if (!resolved.ok) {
            return resolved.failure;
        }

        try {
            const content = await this.sandbox.readTextFile(
                resolved.path,
                control,
            );
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

            const failure = this.sandbox.toDomainFailure(
                error as NodeJS.ErrnoException,
                READ_FILE_DOMAIN_FAILURES,
                requestedPath,
            );

            if (failure !== undefined) {
                return failure;
            }

            throw error;
        }
    }

    private checkSemantics(parsed: ReadFileInput): ToolValidationResult {
        const violation = this.sandbox.validateRelativePath(parsed.path);

        switch (violation) {
            case "empty":
                return invalidInput("read_file.path 不能为空");
            case "nul":
                return invalidInput("read_file.path 不能包含 NUL 字符");
            case "absolute":
                return invalidInput("read_file.path 必须是工作区内的相对路径");
            case "parent":
                return invalidInput("read_file.path 不能包含 .. 路径段");
            default:
                return { ok: true };
        }
    }
}
