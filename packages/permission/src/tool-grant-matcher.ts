import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type { ToolGrantMatcher } from "./types";

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
                .map(([key, child]) => [key, canonicalize(child)]),
        );
    }
    return value;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return typeof error === "object"
        && error !== null
        && "code" in error
        && typeof error.code === "string";
}

async function resolveGrantTargetPath(workspaceRoot: string, requestedPath: string): Promise<string> {
    const root = await realpath(workspaceRoot);
    const candidate = resolve(root, requestedPath);
    let target: string;

    try {
        target = await realpath(candidate);
    } catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") throw error;

        try {
            target = resolve(await realpath(dirname(candidate)), basename(candidate));
        } catch (parentError) {
            if (!isNodeError(parentError) || parentError.code !== "ENOENT") throw parentError;
            target = candidate;
        }
    }

    const pathFromRoot = relative(root, target);
    if (
        pathFromRoot === ".."
        || pathFromRoot.startsWith(`..${sep}`)
        || isAbsolute(pathFromRoot)
    ) {
        return target;
    }

    return resolve(root, pathFromRoot);
}

/**
 * 从经过 Tool Contract 与语义校验的 Action 输入生成稳定授权匹配器。
 *
 * @param toolId - 已解析的 Tool 标识。
 * @param input - Tool Registration 返回的 canonical JSON 输入。
 * @param workspaceRoot - 文件 Tool 的 Workspace 根目录；其他 Tool 不使用。
 * @returns `bash` 与其他 Tool 的完整输入摘要，或写入类 Tool 的规范化目标路径。
 * @throws 文件目标路径字段无效或文件系统无法解析必要 Workspace 边界时抛出异常。
 * @example
 * ```ts
 * const matcher = await createToolGrantMatcher("bash", { command: "git status" });
 * ```
 */
export async function createToolGrantMatcher(
    toolId: string,
    input: unknown,
    workspaceRoot?: string,
): Promise<ToolGrantMatcher> {
    if (toolId === "write_file" || toolId === "edit_file") {
        if (workspaceRoot === undefined || !isRecord(input) || typeof input.path !== "string") {
            throw new Error(`${toolId} 授权匹配需要有效的工作区路径输入`);
        }

        return {
            kind: "target_path",
            toolId,
            version: 1,
            path: await resolveGrantTargetPath(workspaceRoot, input.path),
        };
    }

    return {
        kind: "exact_input",
        toolId,
        version: 1,
        digest: `sha256:${createHash("sha256")
            .update(JSON.stringify(canonicalize(input)), "utf8")
            .digest("hex")}`,
    };
}

/**
 * 比较两条授权匹配器是否绑定同一 Tool 操作。
 *
 * @param left - 已保存的授权身份。
 * @param right - 当前已验证 Action 的授权身份。
 * @returns Tool、规则版本及匹配字段全部相等时返回 `true`。
 * @example
 * ```ts
 * if (toolGrantMatchersEqual(saved.matcher, current)) allowAction();
 * ```
 */
export function toolGrantMatchersEqual(
    left: ToolGrantMatcher,
    right: ToolGrantMatcher,
): boolean {
    if (
        left.kind !== right.kind
        || left.toolId !== right.toolId
        || left.version !== right.version
    ) {
        return false;
    }

    return left.kind === "exact_input" && right.kind === "exact_input"
        ? left.digest === right.digest
        : left.kind === "target_path" && right.kind === "target_path"
            ? left.path === right.path
            : false;
}
