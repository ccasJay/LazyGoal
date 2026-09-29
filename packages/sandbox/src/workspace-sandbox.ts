import { readFile, realpath, writeFile } from "node:fs/promises";
import {
    isAbsolute,
    relative,
    resolve,
    win32,
} from "node:path";

/**
 * 文件级 Tool 共享的 errno 消息表：把 Node 错误码映射为面向 Agent 的中文文案。
 *
 * @remarks
 * 各工具维护自己的私有消息表实例，以保留其不同的领域文案（"文件不存在"、
 * "父目录不存在"、"搜索范围不存在"等）；共享沙箱只负责 `switch` 骨架与错误码映射。
 */
export type DomainFailureMessages = Partial<
    Record<string, { readonly code: string; readonly render: (requestedPath: string) => string }>
>;

/**
 * 相对路径校验的可选规则。
 */
export interface ValidateRelativePathOptions {
    /** 拒绝位于首段的前缀（如 `.lazygoal` 持久化目录）。 */
    readonly rejectSegments?: readonly string[];
}

/**
 * 相对路径校验命中的规则类别。
 *
 * @remarks
 * 沙箱只负责判断规则，不生成面向 Agent 的文案；各工具按命中类别用自身精确
 * 文案构造 `INVALID_TOOL_INPUT`，从而保证文案逐字不变。
 */
export type RelativePathViolation =
    | "empty"
    | "nul"
    | "absolute"
    | "parent"
    | "rejected-segment";

/**
 * 沙箱操作失败的领域描述。
 *
 * @remarks
 * 结构与 ToolObservation 失败形态兼容，同时避免 sandbox 包反向依赖 runtime。
 *
 * @example
 * ```ts
 * const failure: SandboxFailure = {
 *     kind: "failure",
 *     code: "PATH_OUTSIDE_WORKSPACE",
 *     message: "目标不在工作区内: ../out.txt",
 *     retryable: false,
 * };
 * ```
 */
export interface SandboxFailure {
    readonly kind: "failure";
    readonly code: string;
    readonly message: string;
    readonly retryable: false;
}

/**
 * 一次已通过沙箱校验的目标路径解析结果。
 *
 * @remarks
 * `ok` 表示已解析且位于工作区内的绝对路径；`ok: false` 时 `failure` 携带
 * 稳定的 `PATH_OUTSIDE_WORKSPACE` 领域失败结构。
 */
export type SandboxResolveResult =
    | { readonly ok: true; readonly path: string }
    | { readonly ok: false; readonly failure: SandboxFailure };

/**
 * 沙箱调用的中止控制信号。
 *
 * @remarks
 * 接受标准的 AbortSignal 或包含 signal 的控制对象，与 Runtime 的 ExecutionControl 结构兼容。
 *
 * @example
 * ```ts
 * const control: SandboxAbortControl = { signal: new AbortController().signal };
 * ```
 */
export interface SandboxAbortControl {
    readonly signal?: AbortSignal;
}

/** 中止控制流使用的稳定错误代码。 */
export const EXECUTION_ABORTED_ERROR_CODE = "EXECUTION_ABORTED" as const;

/**
 * 沙箱操作被中止时抛出的错误。
 *
 * @remarks
 * 其 name 为 `ExecutionAbortedError` 且 code 为 `EXECUTION_ABORTED`，
 * 可被上层 Runtime 的 `isExecutionAbortedError` 识别。
 */
export class SandboxAbortedError extends Error {
    readonly code = EXECUTION_ABORTED_ERROR_CODE;

    constructor(message = "Execution aborted") {
        super(message);
        this.name = "ExecutionAbortedError";
    }
}

/**
 * 在指定 workspaceRoot 内执行路径校验与文件读写的自包含沙箱。
 *
 * @remarks
 * 实例持有构造期解析的 workspaceRoot 真实路径，四个文件级 Tool 复用同一
 * 沙箱边界：拒绝绝对路径、`..` 路径段、指定前缀段，以及解析后越出工作区的
 * 符号链接。本接口不导入任何 Tool 实现，对 Runtime 保持零依赖。
 *
 * @example
 * ```ts
 * const sandbox = createWorkspaceSandbox("/workspace/project");
 * const resolved = await sandbox.resolveTarget("src/a.ts", {});
 * ```
 */
export interface WorkspaceSandbox {
    /**
     * 校验工作区内相对路径的静态规则，不访问文件系统。
     *
     * @param path - Agent 提交的相对路径。
     * @param options - 可选的前缀段拒绝规则。
     * @returns 通过时为 `undefined`，否则为命中的规则类别。
     */
    validateRelativePath(
        path: string,
        options?: ValidateRelativePathOptions,
    ): RelativePathViolation | undefined;

    /**
     * 解析目标路径并保证其位于工作区内。
     *
     * @param requestedPath - Agent 提交的相对路径。
     * @param messages - 本工具的领域失败文案表，用于映射解析阶段的 Node 错误。
     * @param control - 可选的中止控制。
     * @returns 解析后的绝对路径，或越界/领域失败结构。
     * @throws 中止时抛出中止错误；未分类文件系统异常原样抛出。
     */
    resolveTarget(
        requestedPath: string,
        messages: DomainFailureMessages,
        control?: SandboxAbortControl,
    ): Promise<SandboxResolveResult>;

    /**
     * 解析已存在的目标路径并保证其位于工作区内，不映射领域错误。
     *
     * @remarks
     * 供 write-file 等需要自行处理 `ENOENT`（解析父目录）的 Tool 使用。
     *
     * @param requestedPath - Agent 提交的相对路径。
     * @param displayPath - 越界失败消息中展示的路径，默认等于 `requestedPath`。
     * @param control - 可选的中止控制。
     * @returns 解析后的绝对路径，或越界失败结构。
     * @throws Node 错误原样抛出（含 `ENOENT`）；中止时抛出中止错误。
     */
    resolveExistingPath(
        requestedPath: string,
        displayPath?: string,
        control?: SandboxAbortControl,
    ): Promise<SandboxResolveResult>;

    /**
     * 读取 UTF-8 文本文件。
     *
     * @param path - 已解析的绝对路径。
     * @param control - 可选的中止控制。
     * @returns 文件内容。
     * @throws 中止时抛出中止错误；未分类文件系统异常原样抛出。
     */
    readTextFile(path: string, control?: SandboxAbortControl): Promise<string>;

    /**
     * 写入 UTF-8 文本文件（覆盖）。
     *
     * @param path - 已解析的绝对路径。
     * @param content - 要写入的完整文本。
     * @param control - 可选的中止控制。
     * @throws 中止时抛出中止错误；未分类文件系统异常原样抛出。
     */
    writeTextFile(
        path: string,
        content: string,
        control?: SandboxAbortControl,
    ): Promise<void>;

    /**
     * 把 Node 错误映射为领域失败结构。
     *
     * @param error - 待分类的 Node 错误。
     * @param messages - 本工具的错误文案表。
     * @param requestedPath - 用于文案的原始相对路径。
     * @returns 领域失败结构；未命中消息表时返回 `undefined`。
     */
    toDomainFailure(
        error: NodeJS.ErrnoException,
        messages: DomainFailureMessages,
        requestedPath: string,
    ): SandboxFailure | undefined;
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

function isWithinRoot(root: string, target: string): boolean {
    const targetRelativePath = relative(root, target);

    return (
        targetRelativePath === ""
        || (
            targetRelativePath !== ".."
            && !targetRelativePath.startsWith(
                `..${process.platform === "win32" ? "\\" : "/"}`,
            )
            && !isAbsolute(targetRelativePath)
        )
    );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error;
}

function isAborted(error: unknown): boolean {
    return (
        error instanceof Error
        && (
            error.name === "ExecutionAbortedError"
            || error.name === "AbortError"
            || ("code" in error && error.code === EXECUTION_ABORTED_ERROR_CODE)
        )
    );
}

function throwIfAbortedCheck(control?: SandboxAbortControl): void {
    if (control?.signal?.aborted) {
        throw new SandboxAbortedError();
    }
}

function mapDomainFailure(
    error: NodeJS.ErrnoException,
    messages: DomainFailureMessages,
    requestedPath: string,
): SandboxFailure | undefined {
    if (error.code === undefined) {
        return undefined;
    }

    const entry = messages[error.code];

    if (entry === undefined) {
        return undefined;
    }

    return {
        kind: "failure",
        code: entry.code,
        message: entry.render(requestedPath),
        retryable: false,
    };
}

/**
 * 越界失败消息的渲染器：不同 Tool 使用不同名词（"目标"/"搜索范围"）。
 */
export type OutsideMessageRenderer = (requestedPath: string) => string;

/**
 * 创建绑定到指定工作区的沙箱实例。
 *
 * @param workspaceRoot - 允许操作的工作区根目录，可为相对或绝对路径。
 * @param outsideMessage - 可选的越界失败消息渲染器，默认使用"目标"。
 * @returns 自包含沙箱实例。
 * @throws workspaceRoot 为空字符串时抛出 Error。
 *
 * @example
 * ```ts
 * const sandbox = createWorkspaceSandbox("/workspace/project");
 * ```
 */
export function createWorkspaceSandbox(
    workspaceRoot: string,
    outsideMessage: OutsideMessageRenderer = (path) => `目标不在工作区内: ${path}`,
): WorkspaceSandbox {
    if (workspaceRoot.trim() === "") {
        throw new Error("workspaceRoot must be non-empty");
    }

    const resolvedWorkspaceRoot = resolve(workspaceRoot);

    const outsideWorkspace = (requestedPath: string): SandboxFailure => ({
        kind: "failure",
        code: "PATH_OUTSIDE_WORKSPACE",
        message: outsideMessage(requestedPath),
        retryable: false,
    });

    return {
        validateRelativePath(path, options) {
            if (path.trim() === "") {
                return "empty";
            }

            if (path.includes("\0")) {
                return "nul";
            }

            if (isAbsolutePath(path)) {
                return "absolute";
            }

            if (hasParentPathSegment(path)) {
                return "parent";
            }

            const rejectSegments = options?.rejectSegments;

            if (
                rejectSegments !== undefined
                && rejectSegments.includes(firstPathSegment(path))
            ) {
                return "rejected-segment";
            }

            return undefined;
        },

        async resolveTarget(requestedPath, messages, control) {
            throwIfAbortedCheck(control);

            const resolvedRoot = await realpath(resolvedWorkspaceRoot);
            throwIfAbortedCheck(control);

            const candidatePath = resolve(resolvedRoot, requestedPath);
            let resolvedTarget: string;

            try {
                resolvedTarget = await realpath(candidatePath);
                throwIfAbortedCheck(control);
            } catch (error) {
                if (isAborted(error)) {
                    throw error;
                }

                if (control?.signal?.aborted) {
                    throw new SandboxAbortedError();
                }

                if (isNodeError(error)) {
                    const failure = mapDomainFailure(
                        error,
                        messages,
                        requestedPath,
                    );

                    if (failure !== undefined) {
                        return { ok: false, failure };
                    }
                }

                throw error;
            }

            if (!isWithinRoot(resolvedRoot, resolvedTarget)) {
                return { ok: false, failure: outsideWorkspace(requestedPath) };
            }

            return { ok: true, path: resolvedTarget };
        },

        async resolveExistingPath(requestedPath, displayPath, control) {
            throwIfAbortedCheck(control);

            const resolvedRoot = await realpath(resolvedWorkspaceRoot);
            throwIfAbortedCheck(control);

            const candidatePath = resolve(resolvedRoot, requestedPath);
            let resolvedTarget: string;

            try {
                resolvedTarget = await realpath(candidatePath);
                throwIfAbortedCheck(control);
            } catch (error) {
                if (isAborted(error)) {
                    throw error;
                }

                if (control?.signal?.aborted) {
                    throw new SandboxAbortedError();
                }

                throw error;
            }

            if (!isWithinRoot(resolvedRoot, resolvedTarget)) {
                return {
                    ok: false,
                    failure: outsideWorkspace(displayPath ?? requestedPath),
                };
            }

            return { ok: true, path: resolvedTarget };
        },

        async readTextFile(path, control) {
            return readFile(path, {
                encoding: "utf8",
                signal: control?.signal,
            });
        },

        async writeTextFile(path, content, control) {
            await writeFile(path, content, {
                encoding: "utf8",
                signal: control?.signal,
            });
        },

        toDomainFailure(error, messages, requestedPath) {
            return mapDomainFailure(error, messages, requestedPath);
        },
    };
}
