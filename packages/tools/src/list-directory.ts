import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

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

/** `ListDirectoryTool` 在 Profile 中使用的稳定标识。 */
export const LIST_DIRECTORY_TOOL_ID = "list_directory";

/** 单次列举默认最大条目数。 */
export const LIST_DIRECTORY_DEFAULT_MAX_ENTRIES = 200;

/** 单次列举允许设置的最大条目数上限。 */
export const LIST_DIRECTORY_MAX_ENTRIES_LIMIT = 1000;

const LIST_DIRECTORY_DOMAIN_FAILURES: DomainFailureMessages = {
    ENOENT: {
        code: "DIRECTORY_NOT_FOUND",
        render: (path) => `Directory not found: ${path}`,
    },
    EACCES: {
        code: "DIRECTORY_ACCESS_DENIED",
        render: (path) => `Directory access denied: ${path}`,
    },
    EPERM: {
        code: "DIRECTORY_ACCESS_DENIED",
        render: (path) => `Directory access denied: ${path}`,
    },
    ENOTDIR: {
        code: "NOT_A_DIRECTORY",
        render: (path) => `Path is not a directory: ${path}`,
    },
};

/** ListDirectory Tool 的输入契约。 */
export const LIST_DIRECTORY_INPUT_CONTRACT = contract.object({
    path: contract.optional(contract.string()),
    maxEntries: contract.optional(contract.integer({
        minimum: 1,
        maximum: LIST_DIRECTORY_MAX_ENTRIES_LIMIT,
    })),
    cursor: contract.optional(contract.string()),
});

/** ListDirectory 输入结构。 */
export type ListDirectoryInput = InferContract<typeof LIST_DIRECTORY_INPUT_CONTRACT>;

/** 目录直接子项类型。 */
export type DirectoryEntryType = "file" | "directory" | "symlink";

/** 单个目录项描述。 */
export interface DirectoryEntry {
    /** 文件或目录名称。 */
    readonly name: string;
    /** 相对工作区的规范化 POSIX 路径。 */
    readonly path: string;
    /** 条目类型：file、directory 或 symlink。 */
    readonly type: DirectoryEntryType;
}

/** 目录列举成功输出结构。 */
export interface ListDirectoryOutput {
    /** 当前批次列举到的目录子项列表（按 path 字符序升序排序）。 */
    readonly entries: readonly DirectoryEntry[];
    /** 是否因达到条目额度而发生截断。 */
    readonly truncated: boolean;
    /** 用于获取下一页的游标字符串；未截断时不存在。 */
    readonly nextCursor?: string;
}

interface ListDirectoryCursorPayload {
    readonly toolId: typeof LIST_DIRECTORY_TOOL_ID;
    readonly queryDigest: string;
    readonly nextIndex: number;
}

/**
 * 列举工作区内指定目录直接子项的只读 Tool。
 *
 * @remarks
 * 只返回直接子项，不递归展开。目录符号链接只列举本身（type: "symlink"），不递归跟随。
 * 项按相对路径字符序升序排序，支持基于游标分页。
 *
 * @example
 * ```ts
 * const tool = new ListDirectoryTool("/workspace/project");
 * const result = await tool.execute({
 *   actionId: "act-1",
 *   input: { path: "src", maxEntries: 50 },
 * });
 * ```
 */
export class ListDirectoryTool implements Tool<typeof LIST_DIRECTORY_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof LIST_DIRECTORY_INPUT_CONTRACT> = {
        id: LIST_DIRECTORY_TOOL_ID,
        description: "List immediate entries in a workspace directory with pagination support.",
        inputContract: LIST_DIRECTORY_INPUT_CONTRACT,
        isReadOnly: true,
    };

    readonly replayPolicy = "safe" as const;

    private readonly workspaceRoot: string;
    private readonly sandbox: WorkspaceSandbox;

    /**
     * @param workspaceRoot - 允许操作的工作区根目录。
     * @throws workspaceRoot 为空字符串时抛出 Error。
     */
    constructor(workspaceRoot: string) {
        if (workspaceRoot.trim() === "") {
            throw new Error("workspaceRoot must be non-empty");
        }
        this.workspaceRoot = resolve(workspaceRoot);
        this.sandbox = createWorkspaceSandbox(this.workspaceRoot, (path) => `Target directory outside workspace: ${path}`);
    }

    validate(input: ListDirectoryInput): ToolValidationResult {
        if (input.path !== undefined) {
            const violation = this.sandbox.validateRelativePath(input.path);
            if (violation !== undefined) {
                switch (violation) {
                    case "empty":
                        return invalidInput("Directory path cannot be empty", ["path"]);
                    case "nul":
                        return invalidInput("Directory path cannot contain NUL bytes", ["path"]);
                    case "absolute":
                        return invalidInput("Directory path must be a relative path", ["path"]);
                    case "parent":
                        return invalidInput("Directory path cannot contain parent segments ('..')", ["path"]);
                    case "rejected-segment":
                        return invalidInput("Directory path references a protected path", ["path"]);
                }
            }
        }
        if (input.cursor !== undefined && input.cursor.trim() === "") {
            return invalidInput("Cursor cannot be empty if specified", ["cursor"]);
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<ListDirectoryInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const { input } = request;
        const requestedPath = input.path ?? "";
        const maxEntries = input.maxEntries ?? LIST_DIRECTORY_DEFAULT_MAX_ENTRIES;

        const resolved = await this.sandbox.resolveTarget(
            requestedPath,
            LIST_DIRECTORY_DOMAIN_FAILURES,
            control,
        );

        if (!resolved.ok) {
            return resolved.failure;
        }

        const absoluteTargetDir = resolved.path;

        let dirents;
        try {
            dirents = await readdir(absoluteTargetDir, { withFileTypes: true });
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            const mapped = (error as NodeJS.ErrnoException).code !== undefined
                ? LIST_DIRECTORY_DOMAIN_FAILURES[(error as NodeJS.ErrnoException).code!]
                : undefined;
            if (mapped !== undefined) {
                return {
                    kind: "failure",
                    code: mapped.code,
                    message: mapped.render(requestedPath),
                    retryable: false,
                };
            }
            return {
                kind: "failure",
                code: "DIRECTORY_READ_FAILED",
                message: `Failed to read directory ${requestedPath}: ${error instanceof Error ? error.message : String(error)}`,
                retryable: false,
            };
        }

        throwIfAborted(control);

        const normalizedRelativePrefix = requestedPath === "" ? "" : requestedPath.replace(/\\/g, "/").replace(/\/+$/, "");

        const allEntries: DirectoryEntry[] = dirents.map((dirent) => {
            let type: DirectoryEntryType = "file";
            if (dirent.isDirectory()) {
                type = "directory";
            } else if (dirent.isSymbolicLink()) {
                type = "symlink";
            }
            const entryPath = normalizedRelativePrefix === ""
                ? dirent.name
                : `${normalizedRelativePrefix}/${dirent.name}`;
            return {
                name: dirent.name,
                path: entryPath,
                type,
            };
        });

        // 字符序升序排序
        allEntries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

        const queryDigest = computeCanonicalDigest({ path: normalizedRelativePrefix });
        let startIndex = 0;

        if (input.cursor !== undefined) {
            const decoded = decodeAndValidateCursor<ListDirectoryCursorPayload>(
                input.cursor,
                LIST_DIRECTORY_TOOL_ID,
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
            startIndex = decoded.nextIndex;
            if (startIndex < 0 || (allEntries.length > 0 && startIndex > allEntries.length)) {
                return {
                    kind: "failure",
                    code: "INVALID_CURSOR",
                    message: "Cursor index out of bounds.",
                    retryable: false,
                };
            }
        }

        const slice = allEntries.slice(startIndex, startIndex + maxEntries);
        const nextIndex = startIndex + slice.length;
        const truncated = nextIndex < allEntries.length;

        let nextCursor: string | undefined;
        if (truncated) {
            nextCursor = encodeCursor<ListDirectoryCursorPayload>({
                toolId: LIST_DIRECTORY_TOOL_ID,
                queryDigest,
                nextIndex,
            });
        }

        const output: ListDirectoryOutput = {
            entries: slice,
            truncated,
            ...(nextCursor !== undefined ? { nextCursor } : {}),
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Listed ${slice.length} entries in ${requestedPath === "" ? "workspace root" : requestedPath}${truncated ? " (truncated)" : ""}.`,
        };
    }
}
