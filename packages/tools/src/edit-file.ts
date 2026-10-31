import type {
    BoundTool,
    Tool,
    BoundToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../tool-core/src/index";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";
import { editFileInputBinding } from "./generated/edit-file/binding";
export { editFileInputBinding };
import { invalidInput } from "./internal/invalid-input";
import { getWorkspaceVersion, markWorkspaceModified } from "./internal/workspace-version";
import {
    createWorkspaceSandbox,
    normalizeToWorkspaceRelative,
    type DomainFailureMessages,
    type WorkspaceSandbox,
} from "../../sandbox/src/index";

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

/**
 * `edit_file` 的结构化输入。
 *
 * @remarks
 * `oldString` 必须在目标文件中恰好出现一次；`newString` 可以为空字符串。
 */
export interface EditFileInput {
    /** 工作区相对文件路径。 */
    readonly path: string;
    /** 要求唯一匹配的原始文本。 */
    readonly oldString: string;
    /** 替换后的文本。 */
    readonly newString: string;
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
export class EditFileTool implements BoundTool<EditFileInput> {
    readonly definition: BoundToolDefinition<EditFileInput> = {
        id: EDIT_FILE_TOOL_ID,
        description: "对 workspaceRoot 内的 UTF-8 文本文件执行唯一匹配的字符串替换",
        inputBinding: editFileInputBinding,
        isReadOnly: false,
    };

    readonly replayPolicy = "safe" as const;

    private readonly sandbox: WorkspaceSandbox;
    private readonly failedOldStrings = new Map<string, number>();

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
        const normalizedPath = normalizeToWorkspaceRelative(input.path, this.sandbox.root);
        return this.checkSemantics({ ...input, path: normalizedPath });
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
        const requestedPath = normalizeToWorkspaceRelative(request.input.path, this.sandbox.root);
        const oldString = request.input.oldString;
        const newString = request.input.newString;

        const cacheKey = `${requestedPath}\0${oldString}`;
        const currentVersion = getWorkspaceVersion(this.sandbox.root);
        const recordedVersion = this.failedOldStrings.get(cacheKey);
        if (recordedVersion !== undefined && recordedVersion === currentVersion) {
            return {
                kind: "failure",
                code: "REPEATED_STRING_NOT_FOUND",
                message: `oldString 在文件中之前已确认不存在: ${requestedPath}。请勿重复发送相同的 oldString；请重新读取目标行号范围确认最新内容，或直接使用 write_file 重写文件。`,
                retryable: false,
            };
        }

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
            const fuzzyResult = tryFuzzyMatchAndReplace(content, oldString, newString);
            if (fuzzyResult.kind === "matched" && fuzzyResult.updatedContent !== undefined) {
                try {
                    await this.sandbox.writeTextFile(
                        resolved.path,
                        fuzzyResult.updatedContent,
                        control,
                    );
                    throwIfAborted(control);
                    markWorkspaceModified(this.sandbox.root);
                    this.failedOldStrings.clear();
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
                    summary: `已通过空白/换行符自适应容错编辑 ${requestedPath}`,
                };
            }

            if (fuzzyResult.kind === "ambiguous") {
                return {
                    kind: "failure",
                    code: "STRING_NOT_UNIQUE",
                    message: `oldString 在文件中出现 ${fuzzyResult.occurrences} 次，需提供更长的上下文: ${requestedPath}`,
                    retryable: false,
                };
            }

            const isAlreadyApplied = content.includes(newString)
                || (normalizeString(newString) !== "" && normalizeString(content).includes(normalizeString(newString)));

            if (isAlreadyApplied) {
                this.failedOldStrings.delete(cacheKey);
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

            this.failedOldStrings.set(cacheKey, currentVersion);
            const hint = findNearestLineHint(content, oldString);

            return {
                kind: "failure",
                code: "STRING_NOT_FOUND",
                message: `oldString 在文件中不存在: ${requestedPath}${hint}`,
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
            markWorkspaceModified(this.sandbox.root);
            this.failedOldStrings.clear();
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

interface FuzzyMatchResult {
    readonly kind: "matched" | "not_found" | "ambiguous";
    readonly occurrences?: number;
    readonly updatedContent?: string;
}

function normalizeString(text: string): string {
    return text
        .replace(/\r\n|\r/g, "\n")
        .split("\n")
        .map((line) => line.replace(/[ \t]+$/, ""))
        .join("\n");
}

function normalizeContentWithMapping(text: string): {
    readonly normalized: string;
    readonly origIndex: readonly number[];
    readonly origLength: readonly number[];
} {
    const normalizedChars: string[] = [];
    const origIndex: number[] = [];
    const origLength: number[] = [];

    const len = text.length;
    let i = 0;

    while (i < len) {
        const ch = text[i]!;

        if (ch === "\r" || ch === "\n") {
            let nlLen = 1;
            if (ch === "\r" && i + 1 < len && text[i + 1] === "\n") {
                nlLen = 2;
            }
            normalizedChars.push("\n");
            origIndex.push(i);
            origLength.push(nlLen);
            i += nlLen;
            continue;
        }

        if (ch === " " || ch === "\t") {
            let j = i;
            while (j < len && (text[j] === " " || text[j] === "\t")) {
                j++;
            }
            if (j === len || text[j] === "\r" || text[j] === "\n") {
                i = j;
                continue;
            }
        }

        normalizedChars.push(ch);
        origIndex.push(i);
        origLength.push(1);
        i++;
    }

    return {
        normalized: normalizedChars.join(""),
        origIndex,
        origLength,
    };
}

function tryFuzzyMatchAndReplace(
    content: string,
    oldString: string,
    newString: string,
): FuzzyMatchResult {
    let normOldString = normalizeString(oldString);
    if (normOldString === "") {
        return { kind: "not_found" };
    }

    const { normalized: normContent, origIndex, origLength } = normalizeContentWithMapping(content);
    let normOccurrences = countOccurrences(normContent, normOldString);
    let effectiveNew = newString;

    // 若未直接命中，尝试解除由于模型 JSON 双重转义引入的多余引号反斜杠（\" ↔ ", \' ↔ '）
    if (normOccurrences === 0 && (/\\['"`]/.test(oldString))) {
        const unescapedOldString = oldString.replace(/\\(['"`])/g, "$1");
        const unescapedNormOld = normalizeString(unescapedOldString);
        const unescapedOccurrences = countOccurrences(normContent, unescapedNormOld);
        if (unescapedOccurrences === 1) {
            normOldString = unescapedNormOld;
            normOccurrences = 1;
            if (/\\['"`]/.test(newString)) {
                effectiveNew = newString.replace(/\\(['"`])/g, "$1");
            }
        }
    }

    if (normOccurrences === 0) {
        return { kind: "not_found" };
    }

    if (normOccurrences > 1) {
        return { kind: "ambiguous", occurrences: normOccurrences };
    }

    const matchStart = normContent.indexOf(normOldString);
    const matchEnd = matchStart + normOldString.length;
    const origStart = origIndex[matchStart]!;
    const lastCharIdx = matchEnd - 1;
    let origEnd = origIndex[lastCharIdx]! + origLength[lastCharIdx]!;

    if (normContent[lastCharIdx] !== "\n" && (matchEnd === normContent.length || normContent[matchEnd] === "\n")) {
        while (origEnd < content.length && (content[origEnd] === " " || content[origEnd] === "\t")) {
            origEnd++;
        }
    }

    const matchedSlice = content.slice(origStart, origEnd);
    const effectiveNewString = matchedSlice.includes("\r\n") && !effectiveNew.includes("\r\n")
        ? effectiveNew.replace(/\n/g, "\r\n")
        : effectiveNew;

    const updatedContent = content.slice(0, origStart) + effectiveNewString + content.slice(origEnd);
    return {
        kind: "matched",
        updatedContent,
    };
}

/**
 * 在目标文本中尝试定位与未匹配 oldString 最接近的行号与代码摘要。
 *
 * @param content - 文件完整文本。
 * @param oldString - 未匹配成功的旧字符串。
 * @returns 提示字符串；若无实质匹配则返回空字符串。
 */
function findNearestLineHint(content: string, oldString: string): string {
    const rawLines = oldString.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 3);
    if (rawLines.length === 0) {
        return "";
    }
    const targetLine = rawLines[0]!;
    const contentLines = content.split(/\r?\n/);
    for (let i = 0; i < contentLines.length; i++) {
        const line = contentLines[i]!;
        if (line.includes(targetLine) || (line.trim().length > 5 && targetLine.includes(line.trim()))) {
            const lineNo = i + 1;
            const snippet = line.trim().slice(0, 80);
            const contextEnd = Math.min(contentLines.length, i + 6);
            const contextLines = contentLines.slice(i, contextEnd).join("\n");
            return `. 提示: 在第 ${lineNo} 行发现可能相关的代码: "${snippet}"。目标行附近的真实上下文代码为:\n\`\`\`\n${contextLines}\n\`\`\`\n请复制上述真实代码作为 oldString，或直接使用 write_file 重写文件。`;
        }
    }
    return "";
}

