import { lstat, readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import picomatch from "picomatch";

import type {
    Tool,
    ToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../tool-core/src/index";
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

/** `FindFilesTool` 在 Profile 中使用的稳定标识。 */
export const FIND_FILES_TOOL_ID = "find_files";

/** 单次搜索默认返回的最大匹配文件数。 */
export const FIND_FILES_DEFAULT_MAX_RESULTS = 200;

/** 单次搜索允许设置的最大匹配结果数上限。 */
export const FIND_FILES_MAX_RESULTS_LIMIT = 1000;

/** 单次调用允许扫描的最大文件系统条目额度。 */
export const FIND_FILES_SCAN_BUDGET = 2000;

/** 模式字符串最大长度（4 KiB）。 */
export const FIND_FILES_MAX_PATTERN_LENGTH = 4096;

/** 目录递归的最大深度。 */
const FIND_FILES_MAX_DEPTH = 32;

/** 默认递归跳过的目录名。 */
const SKIPPED_DIR_NAMES = new Set([
    ".git",
    ".lazygoal",
    "node_modules",
]);

const FIND_FILES_DOMAIN_FAILURES: DomainFailureMessages = {
    ENOENT: {
        code: "SEARCH_PATH_NOT_FOUND",
        render: (path) => `Search root not found: ${path}`,
    },
    EACCES: {
        code: "SEARCH_PATH_ACCESS_DENIED",
        render: (path) => `Search root access denied: ${path}`,
    },
    EPERM: {
        code: "SEARCH_PATH_ACCESS_DENIED",
        render: (path) => `Search root access denied: ${path}`,
    },
    ENOTDIR: {
        code: "NOT_A_DIRECTORY",
        render: (path) => `Search root is not a directory: ${path}`,
    },
};

/** FindFiles Tool 的输入契约。 */
export const FIND_FILES_INPUT_CONTRACT = contract.object({
    pattern: contract.string(),
    path: contract.optional(contract.string()),
    maxResults: contract.optional(contract.integer({
        minimum: 1,
        maximum: FIND_FILES_MAX_RESULTS_LIMIT,
    })),
    cursor: contract.optional(contract.string()),
});

/** FindFiles 输入结构。 */
export type FindFilesInput = InferContract<typeof FIND_FILES_INPUT_CONTRACT>;

/** FindFiles 成功输出结构。 */
export interface FindFilesOutput {
    /** 匹配 glob 模式的文件相对路径列表（按字符序升序排序）。 */
    readonly paths: readonly string[];
    /** 本次调用累计扫描的目录项数。 */
    readonly scannedEntries: number;
    /** 是否因达到结果上限或扫描额度而发生截断。 */
    readonly truncated: boolean;
    /** 用于推进下一页的游标字符串；若扫描完成且未截断则不存在。 */
    readonly nextCursor?: string;
}

interface TraversalFrame {
    readonly dirRelPath: string;
    readonly nextIndex: number;
}

interface FindFilesCursorPayload {
    readonly toolId: typeof FIND_FILES_TOOL_ID;
    readonly queryDigest: string;
    readonly stack: readonly TraversalFrame[];
}

/**
 * 在工作区内按 Glob 模式递归定位文件的只读 Tool。
 *
 * @remarks
 * 支持常见的 glob 语法（使用 picomatch），递归跳过 `.git`、`.lazygoal` 与 `node_modules`。
 * 不跟随越出工作区的符号链接或目录符号链接。支持基于遍历栈的持久化游标，单次执行受 2000 项扫描额度保护。
 *
 * @example
 * ```ts
 * const tool = new FindFilesTool("/workspace/project");
 * const result = await tool.execute({
 *   actionId: "act-1",
 *   input: { pattern: "**\/*.ts", path: "src" },
 * });
 * ```
 */
export class FindFilesTool implements Tool<typeof FIND_FILES_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof FIND_FILES_INPUT_CONTRACT> = {
        id: FIND_FILES_TOOL_ID,
        description: "Find files in workspace matching a glob pattern with pagination support.",
        inputContract: FIND_FILES_INPUT_CONTRACT,
        isReadOnly: true,
    };

    readonly replayPolicy = "safe" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;

    constructor(workspaceRoot: string) {
        if (workspaceRoot.trim() === "") {
            throw new Error("workspaceRoot must be non-empty");
        }
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot, (path) => `Search root outside workspace: ${path}`);
    }

    validate(input: FindFilesInput): ToolValidationResult {
        if (input.pattern.trim() === "") {
            return invalidInput("Pattern cannot be empty", ["pattern"]);
        }
        if (Buffer.byteLength(input.pattern, "utf8") > FIND_FILES_MAX_PATTERN_LENGTH) {
            return invalidInput(`Pattern length exceeds limit of ${FIND_FILES_MAX_PATTERN_LENGTH} bytes`, ["pattern"]);
        }
        if (input.pattern.includes("\0")) {
            return invalidInput("Pattern cannot contain NUL bytes", ["pattern"]);
        }
        if (input.path !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.path);
            if (violation !== undefined) {
                switch (violation) {
                    case "empty":
                        return invalidInput("Search root path cannot be empty", ["path"]);
                    case "nul":
                        return invalidInput("Search root path cannot contain NUL bytes", ["path"]);
                    case "absolute":
                        return invalidInput("Search root path must be a relative path", ["path"]);
                    case "parent":
                        return invalidInput("Search root path cannot contain parent segments ('..')", ["path"]);
                    case "rejected-segment":
                        return invalidInput("Search root path references a protected path", ["path"]);
                }
            }
        }
        if (input.cursor !== undefined && input.cursor.trim() === "") {
            return invalidInput("Cursor cannot be empty if specified", ["cursor"]);
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<FindFilesInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const { input } = request;
        const requestedRoot = input.path ?? "";
        const maxResults = input.maxResults ?? FIND_FILES_DEFAULT_MAX_RESULTS;

        const resolved = await this.sandbox.resolveTarget(
            requestedRoot,
            FIND_FILES_DOMAIN_FAILURES,
            control,
        );

        if (!resolved.ok) {
            return resolved.failure;
        }

        const absoluteSearchRoot = resolved.path;

        let matcher: (str: string) => boolean;
        try {
            matcher = picomatch(input.pattern, { dot: true });
        } catch (error) {
            return {
                kind: "failure",
                code: "INVALID_GLOB_PATTERN",
                message: `Invalid glob pattern: ${error instanceof Error ? error.message : String(error)}`,
                retryable: false,
            };
        }

        const normalizedRootRel = requestedRoot === "" ? "" : requestedRoot.replace(/\\/g, "/").replace(/\/+$/, "");
        const queryDigest = computeCanonicalDigest({
            pattern: input.pattern,
            path: normalizedRootRel,
        });

        // 维护遍历栈：每个 frame 保存一个正在访问的目录相对路径和其 dirents 中待处理的偏移
        // 栈底为 searchRoot
        interface StackFrame {
            dirRelPath: string; // 相对工作区，例如 "" 或 "src/sub"
            children: readonly string[]; // 排序后的子条目名字列表
            nextIndex: number;
        }

        const stack: StackFrame[] = [];

        // 缓存目录子项已读取的结果，避免游标恢复时重复 read
        const readDirChildren = async (relDir: string): Promise<string[] | undefined> => {
            const absDir = relDir === "" ? this.workspaceRoot : resolve(this.workspaceRoot, relDir);
            try {
                const entries = await readdir(absDir, { withFileTypes: true });
                const names: string[] = [];
                for (const e of entries) {
                    names.push(e.name);
                }
                names.sort();
                return names;
            } catch {
                return undefined;
            }
        };

        if (input.cursor !== undefined) {
            const decoded = decodeAndValidateCursor<FindFilesCursorPayload>(
                input.cursor,
                FIND_FILES_TOOL_ID,
                queryDigest,
            );
            if (decoded === undefined || !Array.isArray(decoded.stack)) {
                return {
                    kind: "failure",
                    code: "INVALID_CURSOR",
                    message: "The provided cursor is invalid, corrupted, or does not match the target query.",
                    retryable: false,
                };
            }
            for (const f of decoded.stack) {
                const names = await readDirChildren(f.dirRelPath);
                if (names === undefined) {
                    return {
                        kind: "failure",
                        code: "INVALID_CURSOR",
                        message: "Directory in cursor stack no longer accessible.",
                        retryable: false,
                    };
                }
                stack.push({
                    dirRelPath: f.dirRelPath,
                    children: names,
                    nextIndex: f.nextIndex,
                });
            }
        } else {
            const rootNames = await readDirChildren(normalizedRootRel);
            if (rootNames === undefined) {
                return {
                    kind: "failure",
                    code: "SEARCH_PATH_NOT_FOUND",
                    message: `Search root directory not accessible: ${requestedRoot}`,
                    retryable: false,
                };
            }
            stack.push({
                dirRelPath: normalizedRootRel,
                children: rootNames,
                nextIndex: 0,
            });
        }

        const matchedPaths: string[] = [];
        let scannedEntries = 0;
        let truncated = false;

        while (stack.length > 0) {
            throwIfAborted(control);

            if (scannedEntries >= FIND_FILES_SCAN_BUDGET || matchedPaths.length >= maxResults) {
                truncated = true;
                break;
            }

            const currentFrame = stack[stack.length - 1]!;
            if (currentFrame.nextIndex >= currentFrame.children.length) {
                stack.pop();
                continue;
            }

            const childName = currentFrame.children[currentFrame.nextIndex]!;
            currentFrame.nextIndex += 1;
            scannedEntries += 1;

            const childRelPath = currentFrame.dirRelPath === ""
                ? childName
                : `${currentFrame.dirRelPath}/${childName}`;
            const childAbsPath = resolve(this.workspaceRoot, childRelPath);

            let entryStat;
            try {
                entryStat = await lstat(childAbsPath);
            } catch {
                // 不可访问条目跳过
                continue;
            }

            if (entryStat.isSymbolicLink()) {
                // 检查符号链接是否越界
                try {
                    const resolvedTarget = await stat(childAbsPath);
                    const real = await resolve(childAbsPath);
                    const relToRoot = relative(this.workspaceRoot, real);
                    if (relToRoot.startsWith("..") || resolve(this.workspaceRoot, relToRoot) !== real) {
                        continue;
                    }
                    if (resolvedTarget.isFile()) {
                        // 相对 searchRoot 的匹配路径，用 POSIX 分隔符
                        const matchTarget = normalizedRootRel === ""
                            ? childRelPath
                            : relative(resolve(this.workspaceRoot, normalizedRootRel), childAbsPath).replace(/\\/g, "/");
                        if (matcher(matchTarget) || matcher(childRelPath)) {
                            matchedPaths.push(childRelPath);
                        }
                    }
                } catch {
                    // 无法解析的链接忽略
                }
                continue;
            }

            if (entryStat.isDirectory()) {
                if (SKIPPED_DIR_NAMES.has(childName)) {
                    continue;
                }
                if (stack.length >= FIND_FILES_MAX_DEPTH) {
                    continue;
                }
                const subNames = await readDirChildren(childRelPath);
                if (subNames !== undefined) {
                    stack.push({
                        dirRelPath: childRelPath,
                        children: subNames,
                        nextIndex: 0,
                    });
                }
                continue;
            }

            if (entryStat.isFile()) {
                const matchTarget = normalizedRootRel === ""
                    ? childRelPath
                    : relative(resolve(this.workspaceRoot, normalizedRootRel), childAbsPath).replace(/\\/g, "/");
                if (matcher(matchTarget) || matcher(childRelPath)) {
                    matchedPaths.push(childRelPath);
                }
            }
        }

        matchedPaths.sort();

        let nextCursor: string | undefined;
        if (truncated && stack.length > 0) {
            nextCursor = encodeCursor<FindFilesCursorPayload>({
                toolId: FIND_FILES_TOOL_ID,
                queryDigest,
                stack: stack.map((f) => ({
                    dirRelPath: f.dirRelPath,
                    nextIndex: f.nextIndex,
                })),
            });
        }

        const output: FindFilesOutput = {
            paths: matchedPaths,
            scannedEntries,
            truncated,
            ...(nextCursor !== undefined ? { nextCursor } : {}),
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Found ${matchedPaths.length} files matching "${input.pattern}" (scanned ${scannedEntries} entries)${truncated ? " (truncated)" : ""}.`,
        };
    }
}
