import {
    normalizeContextLookupRequest,
    type ContextLookupFilters,
    type ContextLookupNeed,
    type ContextLookupRequest,
} from "./context-retrieval";

/** Context Source Router 支持的完整信息需求集合。 */
export type ContextSourceNeed =
    | "conversation_history"
    | ContextLookupNeed
    | "current_workspace_state"
    | "current_environment_state"
    | "verification_status"
    | "task_contract"
    | "user_constraints";

/** 必须由授权 Tool 重新观察的当前状态需求。 */
export type CurrentContextSourceNeed =
    | "current_workspace_state"
    | "current_environment_state"
    | "verification_status";

/** 必须由 Goal/Conversation 权威投影提供的稳定需求。 */
export type GoalContextSourceNeed = "task_contract" | "user_constraints";

/** Context Source Router 的最小输入；历史需求可额外携带查询条件。 */
export interface ContextSourceRouteInput {
    /** 需要获取的信息类别。 */
    readonly need: ContextSourceNeed;
    /** 历史查询的自然语言问题；当前/任务需求不会把它转成检索请求。 */
    readonly question?: string;
    /** 历史查询的结构化过滤条件。 */
    readonly filters?: ContextLookupFilters;
}

/** 历史需求经 Router 规范化后的 Trajectory 路由。 */
export interface TrajectoryContextSourceRoute {
    readonly source: "trajectory" | "conversation" | "union";
    readonly need: ContextLookupNeed;
    readonly request: ContextLookupRequest;
    /** Trajectory 是历史事实，不代表当前 Workspace 或 Environment。 */
    readonly historical: true;
}

/** 当前状态需求的授权 Tool 路由。 */
export interface AuthorizedToolContextSourceRoute {
    readonly source: "authorized_tool";
    readonly need: CurrentContextSourceNeed;
    /** 提示调用方必须通过正常授权 Tool 获得当前 Observation。 */
    readonly instruction: string;
}

/** Goal Task 或用户约束的权威投影路由。 */
export interface GoalContextSourceRoute {
    readonly source: "goal_task" | "conversation";
    readonly need: GoalContextSourceNeed;
    /** 权威来源说明；不会从 Trajectory 摘要重建。 */
    readonly instruction: string;
}

/** 对一个信息需求做出的封闭来源路由结果。 */
export type ContextSourceRoute =
    | TrajectoryContextSourceRoute
    | AuthorizedToolContextSourceRoute
    | GoalContextSourceRoute;

/** Context Source Router 的非法输入错误码。 */
export const CONTEXT_SOURCE_ROUTE_INVALID_CODE =
    "INVALID_CONTEXT_SOURCE_ROUTE" as const;

/** 尝试使用历史查询替代当前权威来源时的稳定错误码。 */
export const CONTEXT_SOURCE_ROUTE_REJECTED_CODE =
    "CONTEXT_SOURCE_ROUTE_REJECTED" as const;

/** Context Source Router 的封闭路由错误。 */
export class ContextSourceRouterError extends Error {
    /** 供 Runtime 将路由失败转换为稳定业务错误。 */
    readonly code:
        | typeof CONTEXT_SOURCE_ROUTE_INVALID_CODE
        | typeof CONTEXT_SOURCE_ROUTE_REJECTED_CODE;
    /** 触发错误的需求类别；输入非法时可能不存在。 */
    readonly need: string | undefined;

    /**
     * @param code - 错误类别。
     * @param message - 不包含模型原文的稳定诊断信息。
     * @param need - 可选的信息需求类别。
     */
    constructor(
        code:
            | typeof CONTEXT_SOURCE_ROUTE_INVALID_CODE
            | typeof CONTEXT_SOURCE_ROUTE_REJECTED_CODE,
        message: string,
        need?: string,
    ) {
        super(`${code}: ${message}`);
        this.name = "ContextSourceRouterError";
        this.code = code;
        this.need = need;
    }
}

const AUTHORIZED_TOOL_INSTRUCTIONS: Readonly<Record<CurrentContextSourceNeed, string>> = {
    current_workspace_state:
        "当前 Workspace 状态必须通过已授权 Tool 重新观察；不得用历史 Trajectory 预览替代。",
    current_environment_state:
        "当前 Environment 状态必须通过已授权 Tool 重新观察；不得用历史 Trajectory 预览替代。",
    verification_status:
        "当前验证状态必须通过已授权 Tool 重新验证；不得把历史结果当作当前通过。",
};

/**
 * 按信息类型把模型需求路由到历史 Trajectory、授权 Tool 或权威投影。
 *
 * @remarks
 * Router 是 Runtime 内无 I/O 的纯边界：只规范化历史查询，不读取 Workspace、
 * Environment，不执行 Tool，也不依赖 Tool Registry。当前状态需求会明确返回
 * `authorized_tool` 路由，Goal Task/用户约束则返回稳定权威来源；只有两类历史
 * 需求能生成 `ContextLookupRequest`。`routeContextLookup` 额外保证一个 lookup
 * 请求不能替代当前状态或任务契约来源。
 *
 * @example
 * ```ts
 * const router = new ContextSourceRouter();
 * const route = router.route({
 *     need: "decision_rationale",
 *     question: "之前为什么选择这个 Action？",
 * });
 * if (route.source === "trajectory") console.log(route.request.question);
 * ```
 */
export class ContextSourceRouter {
    /**
     * 将需求路由到唯一允许的信息来源。
     *
     * @param input - 需求类别、可选历史问题和过滤器。
     * @returns 封闭的来源路由结果；历史路由携带规范化 lookup 请求。
     * @throws ContextSourceRouterError 输入不是支持的需求类别或历史请求缺少
     *   合法问题时抛出。
     */
    route(input: unknown): ContextSourceRoute {
        const normalized = normalizeRouteInput(input);
        // Domain 信息需求与模型的 context_lookup 请求共用同一条规范化路由；
        // decision_rationale 会在统一索引中查询 Conversation 与 Trajectory。
        const lookupRequest = isRecord(input) && input.kind === "context_lookup";

        if (
            normalized.need === "conversation_history"
            || normalized.need === "historical_execution"
            || normalized.need === "decision_rationale"
        ) {
            try {
                const request = normalizeContextLookupRequest({
                    kind: "context_lookup",
                    need: normalized.need,
                    ...(normalized.question === undefined
                        ? {}
                        : { question: normalized.question }),
                    ...(normalized.filters === undefined
                        ? {}
                        : { filters: normalized.filters }),
                });
                return {
                    source: normalized.need === "conversation_history"
                        ? "conversation"
                        : normalized.need === "decision_rationale"
                            ? (lookupRequest ? "union" : "trajectory")
                            : "trajectory",
                    need: normalized.need,
                    request,
                    historical: true,
                };
            } catch (error) {
                throw new ContextSourceRouterError(
                    CONTEXT_SOURCE_ROUTE_INVALID_CODE,
                    error instanceof Error ? error.message : "历史查询请求无效",
                    normalized.need,
                );
            }
        }

        if (
            normalized.need === "current_workspace_state"
            || normalized.need === "current_environment_state"
            || normalized.need === "verification_status"
        ) {
            return {
                source: "authorized_tool",
                need: normalized.need,
                instruction: AUTHORIZED_TOOL_INSTRUCTIONS[normalized.need],
            };
        }

        if (normalized.need === "task_contract") {
            return {
                source: "goal_task",
                need: normalized.need,
                instruction: "任务契约必须来自 Goal Task/Working Context，不得根据 Trajectory 摘要反向推断。",
            };
        }

        return {
            source: "conversation",
            need: normalized.need,
            instruction: "用户约束必须来自 Conversation 投影，不得根据 Trajectory 摘要反向推断。",
        };
    }

    /**
     * 校验一个模型 Context Lookup 请求只能查询历史来源。
     *
     * @param request - Agent 或外部边界返回的未知 lookup 值。
     * @returns 与 `route` 相同的历史路由及规范化请求。
     * @throws ContextSourceRouterError 非法请求或尝试用 lookup 替代当前/任务
     *   权威来源时抛出；不会执行 I/O 或 Tool。
     * @example
     * ```ts
     * const routed = router.routeContextLookup(modelResult);
     * await lookupPort.lookup({ goal, request: routed.request, lookupId, committedThroughSequence });
     * ```
     */
    routeContextLookup(request: unknown): TrajectoryContextSourceRoute {
        const route = this.route(request);

        if (!("request" in route)) {
            throw new ContextSourceRouterError(
                CONTEXT_SOURCE_ROUTE_REJECTED_CODE,
                `${route.need} 必须使用 ${route.source} 权威来源，不能替代为 Context Lookup`,
                route.need,
            );
        }

        return route;
    }
}

/** 使用默认无状态 Router 执行一次封闭来源路由。 */
export function routeContextSource(input: unknown): ContextSourceRoute {
    return new ContextSourceRouter().route(input);
}

function normalizeRouteInput(value: unknown): ContextSourceRouteInput {
    if (!isRecord(value)) {
        throw new ContextSourceRouterError(
            CONTEXT_SOURCE_ROUTE_INVALID_CODE,
            "route input must be an object",
        );
    }

    if (value.kind !== undefined && value.kind !== "context_lookup") {
        throw new ContextSourceRouterError(
            CONTEXT_SOURCE_ROUTE_INVALID_CODE,
            "kind must be context_lookup when provided",
        );
    }

    const need = value.need;
    if (!isContextSourceNeed(need)) {
        throw new ContextSourceRouterError(
            CONTEXT_SOURCE_ROUTE_INVALID_CODE,
            "need is not supported",
            typeof need === "string" ? need : undefined,
        );
    }

    if (value.question !== undefined && typeof value.question !== "string") {
        throw new ContextSourceRouterError(
            CONTEXT_SOURCE_ROUTE_INVALID_CODE,
            "question must be a string",
            need,
        );
    }

    return {
        need,
        ...(value.question === undefined ? {} : { question: value.question }),
        ...(value.filters === undefined
            ? {}
            : { filters: value.filters as ContextLookupFilters }),
    };
}

function isContextSourceNeed(value: unknown): value is ContextSourceNeed {
    return value === "conversation_history"
        || value === "historical_execution"
        || value === "decision_rationale"
        || value === "current_workspace_state"
        || value === "current_environment_state"
        || value === "verification_status"
        || value === "task_contract"
        || value === "user_constraints";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
