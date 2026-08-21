import { realpath, readFile, writeFile } from "node:fs/promises";
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

/** `EditFileTool` 在 Profile 中使用的稳定标识。 */
export const EDIT_FILE_TOOL_ID = "edit_file";

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
                message: `文件不存在: ${requestedPath}`,
                retryable: false,
            };
        case "EACCES":
        case "EPERM":
            return {
                kind: "failure",
                code: "FILE_ACCESS_DENIED",
                message: `文件不可读写: ${requestedPath}`,
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
export class EditFileTool implements Tool {
    readonly definition: ToolDefinition = {
        id: EDIT_FILE_TOOL_ID,
        description: "对 workspaceRoot 内的 UTF-8 文本文件执行唯一匹配的字符串替换",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string" },
                oldString: { type: "string" },
                newString: { type: "string" },
            },
            required: ["path", "oldString", "newString"],
            additionalProperties: false,
        },
    };

    readonly replayPolicy = "safe" as const;

    private readonly workspaceRoot: string;

    /**
     * @param workspaceRoot - 允许编辑的工作区根目录，可为相对或绝对路径。
     * @throws workspaceRoot 为空字符串时抛出 Error。
     */
    constructor(workspaceRoot: string) {
        if (workspaceRoot.trim() === "") {
            throw new Error("workspaceRoot must be non-empty");
        }

        this.workspaceRoot = resolve(workspaceRoot);
    }

    /**
     * 校验严格的 `{ path, oldString, newString }` 输入和工作区边界规则，不访问文件系统。
     *
     * @param input - Agent 提交的 JSON 输入。
     * @returns 输入合法性；`oldString` 不能为空且不能与 `newString` 相同；
     *   符号链接越界需在执行时解析后拒绝。
     */
    validate(input: JsonValue): ToolValidationResult {
        if (!isJsonObject(input)) {
            return invalidInput("edit_file 输入必须是对象");
        }

        const keys = Object.keys(input);

        if (keys.length !== 3 || !(
            Object.prototype.hasOwnProperty.call(input, "path")
            && Object.prototype.hasOwnProperty.call(input, "oldString")
            && Object.prototype.hasOwnProperty.call(input, "newString")
        )) {
            return invalidInput(
                "edit_file 输入只能包含 path、oldString 与 newString 字段",
            );
        }

        const requestedPath = input.path;

        if (typeof requestedPath !== "string") {
            return invalidInput("edit_file.path 必须是字符串");
        }

        if (typeof input.oldString !== "string") {
            return invalidInput("edit_file.oldString 必须是字符串");
        }

        if (typeof input.newString !== "string") {
            return invalidInput("edit_file.newString 必须是字符串");
        }

        if (requestedPath.trim() === "") {
            return invalidInput("edit_file.path 不能为空");
        }

        if (requestedPath.includes("\0")) {
            return invalidInput("edit_file.path 不能包含 NUL 字符");
        }

        if (isAbsolutePath(requestedPath)) {
            return invalidInput("edit_file.path 必须是工作区内的相对路径");
        }

        if (hasParentPathSegment(requestedPath)) {
            return invalidInput("edit_file.path 不能包含 .. 路径段");
        }

        if (firstPathSegment(requestedPath) === ".lazygoal") {
            return invalidInput("edit_file.path 不能编辑 .lazygoal 持久化目录");
        }

        if (input.oldString === "") {
            return invalidInput("edit_file.oldString 不能为空");
        }

        if (input.oldString === input.newString) {
            return invalidInput("edit_file.oldString 与 newString 不能相同");
        }

        return { ok: true };
    }

    /**
     * 执行一次已通过校验的精确替换。
     *
     * @param request - Action ID 与 `{ path, oldString, newString }` 输入。
     * @param control - 当前 Run 推进调用共享的中止控制。
     * @returns 替换成功（含幂等重放）或可恢复的领域失败 Observation。
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
            || typeof input.oldString !== "string"
            || typeof input.newString !== "string"
        ) {
            throw new Error(
                "INVALID_TOOL_INPUT: edit_file requires string path, oldString and newString",
            );
        }

        const requestedPath = input.path;
        const oldString = input.oldString;
        const newString = input.newString;

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
                const failure = domainFailure(requestedPath, error);

                if (failure !== undefined) {
                    return failure;
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

        let content: string;

        try {
            content = control?.signal === undefined
                ? await readFile(targetPath, "utf8")
                : await readFile(targetPath, {
                    encoding: "utf8",
                    signal: control.signal,
                });
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
            if (control?.signal === undefined) {
                await writeFile(targetPath, updatedContent, "utf8");
            } else {
                await writeFile(targetPath, updatedContent, {
                    encoding: "utf8",
                    signal: control.signal,
                });
            }

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
