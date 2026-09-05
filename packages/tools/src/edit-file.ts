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
    createWorkspaceSandbox,
    type DomainFailureMessages,
    type WorkspaceSandbox,
} from "./internal/workspace-sandbox";

/** `EditFileTool` 在 Profile 中使用的稳定标识。 */
export const EDIT_FILE_TOOL_ID = "edit_file";

const EDIT_FILE_DOMAIN_FAILURES: DomainFailureMessages = {
    ENOENT: {
        code: "FILE_NOT_FOUND",
        render: (path) => `文件不存在: ${path}`,
    },
    EACCES: {
        code: "FILE_ACCESS_DENIED",
        render: (path) => `文件不可读写: ${path}`,
    },
    EPERM: {
        code: "FILE_ACCESS_DENIED",
        render: (path) => `文件不可读写: ${path}`,
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

/** Edit File Tool 的唯一输入 Contract。 */
export const EDIT_FILE_INPUT_CONTRACT = contract.object({
    path: contract.string(),
    oldString: contract.string(),
    newString: contract.string(),
});

type EditFileInput = InferContract<typeof EDIT_FILE_INPUT_CONTRACT>;

/**
 * 在指定 workspaceRoot 内对 UTF-8 文本文件执行精确字符串替换的 Tool。
 *
 * @remarks
 * 该 Tool 只允许相对路径，并拒绝绝对路径、`..` 路径段、`.lazygoal` 前缀
 * （保护自身持久化数据）以及解析后位于工作区外部的符号链接目标。要求
 * `old_string` 在文件中恰好出现一次：零次匹配且 `new_string` 也不存在时返回
 * `STRING_NOT_FOUND`，零次匹配但 `new_string` 已存在视为重放已应用并返回
 * 幂等成功，多次匹配返回 `STRING_NOT_UNIQUE`。替换后整文件重写。同一输入
 * 重放要么幂等成功要么自然失败，因此声明为 `safe`，进程中断后可沿用原
 * `actionId` 重放以自愈半写状态。文件不存在、权限不足或目标为目录等领域
 * 问题返回 `failure` Observation。
 *
 * @example
 * ```ts
 * const tool = new EditFileTool("/workspace/project");
 * const result = await tool.execute({
 *   actionId: "action-1",
 *   input: { path: "src/a.ts", oldString: "foo()", newString: "bar()" },
 * });
 * ```
 */
export class EditFileTool implements Tool<typeof EDIT_FILE_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof EDIT_FILE_INPUT_CONTRACT> = {
        id: EDIT_FILE_TOOL_ID,
        description: "对 workspaceRoot 内的 UTF-8 文本文件执行唯一匹配的字符串替换",
        inputContract: EDIT_FILE_INPUT_CONTRACT,
    };

    readonly replayPolicy = "safe" as const;

    private readonly sandbox: WorkspaceSandbox;

    /**
     * @param workspaceRoot - 允许编辑的工作区根目录，可为相对或绝对路径。
     * @throws workspaceRoot 为空字符串时抛出 Error。
     */
    constructor(workspaceRoot: string) {
        // TODO(sandbox-extraction): 迁移独立包后替换为 @lazygoal/sandbox
        this.sandbox = createWorkspaceSandbox(workspaceRoot);
    }

    /**
     * 校验严格的 `{ path, oldString, newString }` 输入和工作区边界规则，不访问文件系统。
     *
     * @param input - 已由 Input Contract 解析的结构化输入。
     * @returns 领域语义合法性；`oldString` 不能为空且不能与 `newString` 相同；
     *   符号链接越界需在执行时解析后拒绝。
     */
    validate(input: EditFileInput): ToolValidationResult {
        return this.checkSemantics(input);
    }

    /**
     * 执行一次已通过校验的精确替换。
     *
     * @param request - Action ID 与 `{ path, oldString, newString }` 输入。
     * @param control - 当前 Run 推进调用共享的中止控制。
     * @returns 替换成功（含幂等重放）或可恢复的领域失败 Observation。
     * @throws workspaceRoot 无法解析或发生未分类文件系统异常；中止时抛出
     *   `ExecutionAbortedError`。
     */
    async execute(
        request: ToolExecutionRequest<EditFileInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const requestedPath = request.input.path;
        const oldString = request.input.oldString;
        const newString = request.input.newString;

        const resolved = await this.sandbox.resolveTarget(
            requestedPath,
            EDIT_FILE_DOMAIN_FAILURES,
            control,
        );

        if (!resolved.ok) {
            return resolved.failure;
        }

        let content: string;

        try {
            content = await this.sandbox.readTextFile(resolved.path, control);
            throwIfAborted(control);
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }

            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }

            const failure = this.sandbox.toDomainFailure(
                error as NodeJS.ErrnoException,
                EDIT_FILE_DOMAIN_FAILURES,
                requestedPath,
            );

            if (failure !== undefined) {
                return failure;
            }

            throw error;
        }

        const occurrences = countOccurrences(content, oldString);

        if (occurrences === 0) {
            if (content.includes(newString)) {
                return {
                    kind: "success",
                    output: {
                        path: requestedPath,
                        replacements: 0,
                        alreadyApplied: true,
                    },
                    summary: `编辑已应用（重放确认）: ${requestedPath}`,
                };
            }

            return {
                kind: "failure",
                code: "STRING_NOT_FOUND",
                message: `oldString 在文件中不存在: ${requestedPath}`,
                retryable: false,
            };
        }

        if (occurrences > 1) {
            return {
                kind: "failure",
                code: "STRING_NOT_UNIQUE",
                message: `oldString 在文件中出现 ${occurrences} 次，需提供更长的上下文: ${requestedPath}`,
                retryable: false,
            };
        }

        const updatedContent = content.replace(oldString, newString);

        try {
            await this.sandbox.writeTextFile(
                resolved.path,
                updatedContent,
                control,
            );
            throwIfAborted(control);
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }

            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }

            const failure = this.sandbox.toDomainFailure(
                error as NodeJS.ErrnoException,
                EDIT_FILE_DOMAIN_FAILURES,
                requestedPath,
            );

            if (failure !== undefined) {
                return failure;
            }

            throw error;
        }

        return {
            kind: "success",
            output: {
                path: requestedPath,
                replacements: 1,
                alreadyApplied: false,
            },
            summary: `已编辑 ${requestedPath}`,
        };
    }

    private checkSemantics(parsed: EditFileInput): ToolValidationResult {
        const violation = this.sandbox.validateRelativePath(parsed.path, {
            rejectSegments: [".lazygoal"],
        });

        switch (violation) {
            case "empty":
                return invalidInput("edit_file.path 不能为空");
            case "nul":
                return invalidInput("edit_file.path 不能包含 NUL 字符");
            case "absolute":
                return invalidInput("edit_file.path 必须是工作区内的相对路径");
            case "parent":
                return invalidInput("edit_file.path 不能包含 .. 路径段");
            case "rejected-segment":
                return invalidInput("edit_file.path 不能编辑 .lazygoal 持久化目录");
            default:
                break;
        }

        if (parsed.oldString === "") {
            return invalidInput("edit_file.oldString 不能为空");
        }

        if (parsed.oldString === parsed.newString) {
            return invalidInput("edit_file.oldString 与 newString 不能相同");
        }

        return { ok: true };
    }
}

/**
 * 统计子字符串在文本中出现的次数（不重叠）。
 *
 * @param content - 被搜索的完整文本。
 * @param needle - 要统计的子字符串。
 * @returns 出现次数。
 */
function countOccurrences(content: string, needle: string): number {
    if (needle === "") {
        return 0;
    }

    let count = 0;
    let index = content.indexOf(needle);

    while (index !== -1) {
        count += 1;
        index = content.indexOf(needle, index + needle.length);
    }

    return count;
}
