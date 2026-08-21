import { readFile, realpath, writeFile } from "node:fs/promises";
import {
    isAbsolute,
    relative,
    resolve,
    win32,
} from "node:path";

import type {
    ToolObservation,
} from "../../../runtime/src/index";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../../runtime/src/execution-control";

// TODO(sandbox-extraction): 迁移为独立包 @lazygoal/sandbox —— 物理移动本文件 → 经入口导出 → check-dependencies.mjs 加白名单 → 替换消费方 import 路径

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
 * 一次已通过沙箱校验的目标路径解析结果。
 *
 * @remarks
 * `ok` 表示已解析且位于工作区内的绝对路径；`ok: false` 时 `failure` 携带
 * 稳定的 `PATH_OUTSIDE_WORKSPACE` 领域失败 Observation。
 */
export type SandboxResolveResult =
    | { readonly ok: true; readonly path: string }
    | { readonly ok: false; readonly failure: ToolObservation };

/**
 * 在指定 workspaceRoot 内执行路径校验与文件读写的自包含沙箱。
 *
 * @remarks
 * 实例持有构造期解析的 workspaceRoot 真实路径，四个文件级 Tool 复用同一
 * 沙箱边界：拒绝绝对路径、`..` 路径段、指定前缀段，以及解析后越出工作区的
 * 符号链接。本接口按"后续可整体迁移为独立包"设计——只依赖 `node:*` 与
 * runtime 类型，不导入任何 Tool 实现，无反向依赖。
 *
 * @example
 * ```ts
 * const sandbox = createWorkspaceSandbox("/workspace/project");
 * const resolved = await sandbox.resolveTarget("src/a.ts");
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
     * @returns 解析后的绝对路径，或越界/领域失败 Observation。
     * @throws 中止时抛出 {@link ExecutionAbortedError}；未分类文件系统异常原样抛出。
     */
    resolveTarget(
        requestedPath: string,
        messages: DomainFailureMessages,
        control?: ExecutionControl,
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
     * @returns 解析后的绝对路径，或越界失败 Observation。
     * @throws Node 错误原样抛出（含 `ENOENT`）；中止时抛出 {@link ExecutionAbortedError}。
     */
    resolveExistingPath(
        requestedPath: string,
        displayPath?: string,
        control?: ExecutionControl,
    ): Promise<SandboxResolveResult>;

    /**
     * 读取 UTF-8 文本文件。
     *
     * @param path - 已解析的绝对路径。
     * @param control - 可选的中止控制。
     * @returns 文件内容。
     * @throws 中止时抛出 {@link ExecutionAbortedError}；未分类文件系统异常原样抛出。
     */
    readTextFile(path: string, control?: ExecutionControl): Promise<string>;

    /**
     * 写入 UTF-8 文本文件（覆盖）。
     *
     * @param path - 已解析的绝对路径。
     * @param content - 要写入的完整文本。
     * @param control - 可选的中止控制。
     * @throws 中止时抛出 {@link ExecutionAbortedError}；未分类文件系统异常原样抛出。
     */
    writeTextFile(
        path: string,
        content: string,
        control?: ExecutionControl,
    ): Promise<void>;

    /**
     * 把 Node 错误映射为领域失败 Observation。
     *
     * @param error - 待分类的 Node 错误。
     * @param messages - 本工具的错误文案表。
     * @param requestedPath - 用于文案的原始相对路径。
     * @returns 领域失败 Observation；未命中消息表时返回 `undefined`。
     */
    toDomainFailure(
        error: NodeJS.ErrnoException,
        messages: DomainFailureMessages,
        requestedPath: string,
    ): ToolObservation | undefined;
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

function mapDomainFailure(
    error: NodeJS.ErrnoException,
    messages: DomainFailureMessages,
    requestedPath: string,
): ToolObservation | undefined {
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
type OutsideMessageRenderer = (requestedPath: string) => string;

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

    const outsideWorkspace = (requestedPath: string): ToolObservation => ({
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
            throwIfAborted(control);

            const resolvedRoot = await realpath(resolvedWorkspaceRoot);
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
            throwIfAborted(control);

            const resolvedRoot = await realpath(resolvedWorkspaceRoot);
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
