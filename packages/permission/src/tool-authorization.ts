import { createToolGrantMatcher } from "./tool-grant-matcher";
import type {
    PermissionMode,
    ToolGrant,
    ToolGrantLookup,
    ToolGrantMatcher,
} from "./types";

/**
 * Tool 授权判断的上下文输入。
 *
 * @example
 * ```ts
 * const ctx: ToolAuthorizationContext = {
 *   mode: "default",
 *   toolId: "bash",
 *   isReadOnly: false,
 *   input: { command: "git status" },
 *   workspaceRoot: "/path/to/project",
 *   workspaceId: "ws-1",
 *   goalId: "goal-1",
 * };
 * ```
 */
export interface ToolAuthorizationContext {
    /** 当前项目的权限执行模式。 */
    readonly mode: PermissionMode;
    /** 待执行工具唯一标识。 */
    readonly toolId: string;
    /** 工具是否声明为只读。只读工具在任何模式下均自动放行。 */
    readonly isReadOnly: boolean;
    /** 已经由 Tool Registration / Contract 解析后的规范化输入。 */
    readonly input: unknown;
    /** 当前工作区根目录绝对路径。 */
    readonly workspaceRoot: string;
    /** 当前工作区唯一标识。 */
    readonly workspaceId: string;
    /** 当前 Goal 唯一标识。 */
    readonly goalId: string;
    /** 可选的持续授权查询端口。 */
    readonly toolGrantLookup?: ToolGrantLookup;
}

/**
 * Tool 授权决策结果。
 *
 * @remarks
 * - `allow`：允许执行。来源可能为只读自动放行 (`readonly`)、YOLO 模式放行 (`yolo`) 或持续授权匹配 (`grant`)。
 * - `approval_required`：需要用户审批方可执行，携带生成的精准匹配器和原因。
 * - `deny`：拒绝执行，如输入无法派生有效匹配器或被显式策略阻断。
 *
 * @example
 * ```ts
 * const decision = await evaluateToolAuthorization(ctx);
 * if (decision.kind === "allow") {
 *   console.log(`Allowed via ${decision.source}`);
 * }
 * ```
 */
export type ToolAuthorizationDecision =
    | {
        readonly kind: "allow";
        readonly source: "readonly" | "yolo" | "grant";
        readonly grant?: ToolGrant;
    }
    | {
        readonly kind: "approval_required";
        readonly matcher: ToolGrantMatcher;
        readonly reason: string;
    }
    | {
        readonly kind: "deny";
        readonly code: string;
        readonly reason: string;
    };

/**
 * 统一评估一次工具调用的授权决策。
 *
 * @remarks
 * 判定顺序与安全不变式：
 * 1. 声明为 `isReadOnly` 的工具直接放行（`source: "readonly"`）。
 * 2. 对写工具或非只读命令，使用规范化输入生成精准的 `ToolGrantMatcher`。
 * 3. 若提供 `toolGrantLookup`，查询是否存在状态为 `active` 且匹配当前 Workspace／Goal 的持续授权。
 *    底层存储抛出异常（如账本损坏）时直接向外冒泡，调用方必须失败关闭，绝不降级放行。
 * 4. 若无匹配持续授权且项目处于 `yolo` 模式，直接放行（`source: "yolo"`），不生成持续授权。
 * 5. 若处于 `default` 模式，返回 `approval_required`，阻断直接执行并要求用户审批。
 *
 * @param context - 授权判定所需的上下文要素。
 * @returns 授权决策结果。
 * @throws 底层授权账本读取或解析失败时抛出异常。
 * @example
 * ```ts
 * const decision = await evaluateToolAuthorization({
 *   mode: "default",
 *   toolId: "write_file",
 *   isReadOnly: false,
 *   input: { path: "src/main.ts", content: "..." },
 *   workspaceRoot: "/workspace",
 *   workspaceId: "ws-1",
 *   goalId: "goal-1",
 * });
 * ```
 */
export async function evaluateToolAuthorization(
    context: ToolAuthorizationContext,
): Promise<ToolAuthorizationDecision> {
    if (context.isReadOnly) {
        return { kind: "allow", source: "readonly" };
    }

    let matcher: ToolGrantMatcher;
    try {
        matcher = await createToolGrantMatcher(
            context.toolId,
            context.input,
            context.workspaceRoot,
        );
    } catch (error) {
        return {
            kind: "deny",
            code: "INVALID_MATCHER_INPUT",
            reason: `无法为工具 ${context.toolId} 生成有效授权匹配器: ${(error as Error).message}`,
        };
    }

    if (context.toolGrantLookup !== undefined) {
        const grant = await context.toolGrantLookup.findActiveMatching({
            workspaceId: context.workspaceId,
            goalId: context.goalId,
            matcher,
        });

        if (grant !== undefined && grant.status === "active") {
            return {
                kind: "allow",
                source: "grant",
                grant,
            };
        }
    }

    if (context.mode === "yolo") {
        return {
            kind: "allow",
            source: "yolo",
        };
    }

    return {
        kind: "approval_required",
        matcher,
        reason: `工具 ${context.toolId} 需要用户授权方可执行`,
    };
}
