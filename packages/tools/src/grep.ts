import {
    lstat,
    readdir,
    realpath,
} from "node:fs/promises";
import {
    relative,
    resolve,
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
import { isJsonObject, invalidInput } from "./internal/json-input";
import {
    createWorkspaceSandbox,
    type DomainFailureMessages,
    type WorkspaceSandbox,
} from "./internal/workspace-sandbox";

/** `GrepTool` 在 Profile 中使用的稳定标识。 */
export const GREP_TOOL_ID = "grep";

/** 单次搜索最多扫描的文件数，超过即截断结果。 */
const GREP_MAX_FILES = 2000;

/** 单次搜索最多返回的匹配行数，超过即截断结果。 */
const GREP_MAX_MATCHES = 200;

/** 目录递归的最大深度。 */
const GREP_MAX_DEPTH = 16;

/** 单行匹配文本保留的最大字符数。 */
const GREP_MAX_LINE_CHARS = 500;

/** 递归时默认跳过的目录名（隐藏控制目录与依赖目录）。 */
const SKIPPED_DIRECTORY_NAMES = new Set([
    ".git",
    ".lazygoal",
    "node_modules",
]);

const GREP_DOMAIN_FAILURES: DomainFailureMessages = {
    ENOENT: {
        code: "FILE_NOT_FOUND",
        render: (path) => `搜索范围不存在: ${path}`,
    },
    EACCES: {
        code: "FILE_ACCESS_DENIED",
        render: (path) => `搜索范围不可访问: ${path}`,
    },
    EPERM: {
        code: "FILE_ACCESS_DENIED",
        render: (path) => `搜索范围不可访问: ${path}`,
    },
    ENOTDIR: {
        code: "INVALID_FILE_PATH",
        render: (path) => `搜索范围路径无效: ${path}`,
    },
};

interface GrepInput {
    readonly pattern: string;
    readonly path?: string;
    readonly ignoreCase?: boolean;
}

type GrepMatch = {
    readonly path: string;
    readonly line: number;
    readonly text: string;
};

function parseInput(input: JsonValue): GrepInput | undefined {
    if (!isJsonObject(input)) {
        return undefined;
    }

    const keys = Object.keys(input);

    if (
        !keys.every(
            (key) => key === "pattern" || key === "path" || key === "ignoreCase",
        )
    ) {
        return undefined;
    }

    if (
        !Object.prototype.hasOwnProperty.call(input, "pattern")
        || typeof input.pattern !== "string"
    ) {
        return undefined;
    }

    if (
        Object.prototype.hasOwnProperty.call(input, "path")
        && typeof input.path !== "string"
    ) {
        return undefined;
    }

    if (
        Object.prototype.hasOwnProperty.call(input, "ignoreCase")
        && typeof input.ignoreCase !== "boolean"
    ) {
        return undefined;
    }

    return {
        pattern: input.pattern,
        ...(typeof input.path === "string" ? { path: input.path } : {}),
        ...(typeof input.ignoreCase === "boolean"
            ? { ignoreCase: input.ignoreCase }
            : {}),
    };
}

/**
 * 截断超长匹配行，保留行首内容并标注省略。
 *
 * @param text - 匹配到的原始行文本。
 * @returns 不超过 `GREP_MAX_LINE_CHARS`（含标记）的截断文本。
 */
function truncateLine(text: string): string {
    if (text.length <= GREP_MAX_LINE_CHARS) {
        return text;
    }

    const omitted = text.length - GREP_MAX_LINE_CHARS;

    return `${text.slice(0, GREP_MAX_LINE_CHARS)}[...已省略 ${omitted} 字符...]`;
}

/**
 * 在指定 workspaceRoot 内按正则搜索文本文件并返回匹配行的只读 Tool。
 *
 * @remarks
 * `pattern` 是 JavaScript 正则源文本，输入时可带 `ignoreCase` 标志与可选
 * `path`（默认搜索整个 workspaceRoot）。搜索自 `path`（或根）起递归进行：
 * 跳过符号链接、`.git`、`.lazygoal` 与 `node_modules` 目录，不跟随越界
 * 目标；显式把 `path` 指向跳过目录内部时仍会搜索该范围。单次搜索最多扫描
 * `GREP_MAX_FILES` 个文件、返回 `GREP_MAX_MATCHES` 行匹配，超出时置
 * `truncated: true`；单行文本截断保留前 `GREP_MAX_LINE_CHARS` 字符。包含
 * NUL 字节的文件视为二进制并跳过。搜索是只读操作，同一输入重放结果一致，
 * 因此声明为 `safe`。
 *
 * @example
 * ```ts
 * const tool = new GrepTool("/workspace/project");
 * const result = await tool.execute({
 *   actionId: "action-1",
 *   input: { pattern: "TODO\\(.*\\)", path: "src", ignoreCase: true },
 * });
 * ```
 */
export class GrepTool implements Tool {
    readonly definition: ToolDefinition = {
        id: GREP_TOOL_ID,
        description: "在 workspaceRoot 内按正则搜索文本文件并返回带行号的匹配行",
        inputSchema: {
            type: "object",
            properties: {
                pattern: { type: "string" },
                path: { type: "string" },
                ignoreCase: { type: "boolean" },
            },
            required: ["pattern"],
            additionalProperties: false,
        },
    };

    readonly replayPolicy = "safe" as const;

    private readonly sandbox: WorkspaceSandbox;

    /**
     * @param workspaceRoot - 允许搜索的工作区根目录，可为相对或绝对路径。
     * @throws workspaceRoot 为空字符串时抛出 Error。
     */
    constructor(workspaceRoot: string) {
        // TODO(sandbox-extraction): 迁移独立包后替换为 @lazygoal/sandbox
        this.sandbox = createWorkspaceSandbox(
            workspaceRoot,
            (path) => `搜索范围不在工作区内: ${path}`,
        );
    }

    /**
     * 校验严格的 `{ pattern, path?, ignoreCase? }` 输入、正则可编译性与
     * 工作区边界规则，不访问文件系统。
     *
     * @param input - Agent 提交的 JSON 输入。
     * @returns 输入合法性；`pattern` 必须是非空可编译正则。
     */
    validate(input: JsonValue): ToolValidationResult {
        const parsed = parseInput(input);

        if (parsed === undefined) {
            return invalidInput(
                "grep 输入必须是只含 pattern（必填字符串）、path（可选字符串）"
                + "与 ignoreCase（可选布尔）的对象",
            );
        }

        return this.checkSemantics(parsed);
    }

    /**
     * 执行一次已通过校验的搜索。
     *
     * @param request - Action ID 与 `{ pattern, path?, ignoreCase? }` 输入。
     * @param control - 当前 Run 推进调用共享的中止控制。
     * @returns 匹配列表（可能截断）或可恢复的领域失败 Observation。
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
                "INVALID_TOOL_INPUT: grep requires { pattern: string, path?: string, ignoreCase?: boolean }",
            );
        }

        const semantic = this.checkSemantics(parsed);

        if (!semantic.ok) {
            throw new Error(`${semantic.error.code}: ${semantic.error.message}`);
        }

        const regex = new RegExp(
            parsed.pattern,
            parsed.ignoreCase === true ? "i" : undefined,
        );

        const scopePath = parsed.path ?? "";

        const resolved = await this.sandbox.resolveTarget(
            scopePath === "" ? "." : scopePath,
            GREP_DOMAIN_FAILURES,
            control,
        );

        if (!resolved.ok) {
            return resolved.failure;
        }

        const state = {
            matches: [] as GrepMatch[],
            filesScanned: 0,
            truncated: false,
        };

        await this.searchPath(
            resolved.path,
            scopePath === "" ? "." : scopePath,
            0,
            regex,
            state,
            control,
        );
        throwIfAborted(control);

        const matchCount = state.matches.length;

        return {
            kind: "success",
            output: {
                matches: state.matches,
                matchCount,
                filesScanned: state.filesScanned,
                truncated: state.truncated,
            },
            summary: state.truncated
                ? `找到 ${matchCount}+ 处匹配（已截断），扫描 ${state.filesScanned} 个文件`
                : `找到 ${matchCount} 处匹配，扫描 ${state.filesScanned} 个文件`,
        };
    }

    /**
     * 递归搜索目录或单个文件。
     *
     * @param absolutePath - 当前搜索的绝对路径（已通过 realpath 解析）。
     * @param displayPath - 相对工作区的展示路径。
     * @param depth - 当前递归深度。
     * @param regex - 已编译的匹配正则。
     * @param state - 跨递归共享的搜索累计状态。
     * @param control - 共享中止控制。
     * @throws 未分类异常；中止时抛出 `ExecutionAbortedError`。
     */
    private async searchPath(
        absolutePath: string,
        displayPath: string,
        depth: number,
        regex: RegExp,
        state: {
            matches: GrepMatch[];
            filesScanned: number;
            truncated: boolean;
        },
        control: ExecutionControl | undefined,
    ): Promise<void> {
        if (state.truncated) {
            return;
        }

        if (depth > GREP_MAX_DEPTH) {
            state.truncated = true;
            return;
        }

        throwIfAborted(control);

        const stats = await stat(absolutePath);

        if (stats === undefined) {
            return;
        }

        if (stats.isDirectory) {
            let entries;

            try {
                entries = await readdir(absolutePath, {
                    withFileTypes: true,
                });
            } catch {
                return;
            }

            throwIfAborted(control);

            for (const entry of entries) {
                if (state.truncated) {
                    return;
                }

                if (entry.isSymbolicLink()) {
                    continue;
                }

                if (
                    entry.isDirectory()
                    && SKIPPED_DIRECTORY_NAMES.has(entry.name)
                ) {
                    continue;
                }

                if (!entry.isFile() && !entry.isDirectory()) {
                    continue;
                }

                throwIfAborted(control);
                await this.searchPath(
                    resolve(absolutePath, entry.name),
                    `${displayPath}/${entry.name}`,
                    depth + 1,
                    regex,
                    state,
                    control,
                );
            }

            return;
        }

        if (state.filesScanned >= GREP_MAX_FILES) {
            state.truncated = true;
            return;
        }

        state.filesScanned += 1;

        let content: string;

        try {
            content = await this.sandbox.readTextFile(absolutePath, control);
        } catch {
            return;
        }

        throwIfAborted(control);

        if (content.includes("\0")) {
            return;
        }

        const lines = content.split("\n");

        for (let index = 0; index < lines.length; index += 1) {
            const text = lines[index] ?? "";

            if (!regex.test(text)) {
                continue;
            }

            state.matches.push({
                path: displayPath,
                line: index + 1,
                text: truncateLine(text),
            });

            if (state.matches.length >= GREP_MAX_MATCHES) {
                state.truncated = true;
                return;
            }
        }
    }

    private checkSemantics(parsed: GrepInput): ToolValidationResult {
        if (parsed.pattern.trim() === "") {
            return invalidInput("grep.pattern 不能为空");
        }

        try {
            new RegExp(parsed.pattern, parsed.ignoreCase === true ? "i" : undefined);
        } catch {
            return invalidInput("grep.pattern 不是合法的正则表达式");
        }

        if (parsed.path !== undefined) {
            const violation = this.sandbox.validateRelativePath(parsed.path);

            switch (violation) {
                case "empty":
                    return invalidInput("grep.path 不能为空");
                case "nul":
                    return invalidInput("grep.path 不能包含 NUL 字符");
                case "absolute":
                    return invalidInput("grep.path 必须是工作区内的相对路径");
                case "parent":
                    return invalidInput("grep.path 不能包含 .. 路径段");
                default:
                    break;
            }
        }

        return { ok: true };
    }
}

async function stat(
    path: string,
): Promise<{ isDirectory: boolean; isFile: boolean } | undefined> {
    try {
        const stats = await lstat(path);

        return {
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
        };
    } catch {
        return undefined;
    }
}
