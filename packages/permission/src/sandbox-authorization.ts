import type {
    EffectiveSandboxReview,
    SandboxAuthorizationContext,
    SandboxAuthorizationDecision,
} from "./types";

/** 网络能力真实范围明示文案。 */
export const NETWORK_ALL_OUTBOUND_NOTICE = "任意出站目标，含本机回环 (Any outbound network access, including loopback)" as const;

/**
 * 统一评估 Action 的沙箱能力是否需要人工审批。
 *
 * @remarks
 * - 在非 macOS (Seatbelt 不支持) 平台上，内核沙箱能力不生效，放行交由 Tool 策略处理；
 * - 在 macOS 上，若处于默认沙箱范围（无额外文件、无网络访问），自动放行；
 * - 一旦请求外部文件、受保护路径或出站网络，一律判定为 approval_required，并附带包含真实网络范围的审阅视图。
 *
 * @param context - 包含沙箱支持状态与规范化能力范围的上下文。
 * @returns 授权决定。
 *
 * @example
 * ```ts
 * const decision = evaluateSandboxAuthorization({
 *     isSeatbeltSupported: true,
 *     effectiveScope: { extraFiles: [], network: "all_outbound" },
 * });
 * // decision.decision === "approval_required"
 * ```
 */
export function evaluateSandboxAuthorization(
    context: SandboxAuthorizationContext,
): SandboxAuthorizationDecision {
    if (!context.isSeatbeltSupported) {
        return { decision: "allow" };
    }

    const { extraFiles, network } = context.effectiveScope;
    if (extraFiles.length === 0 && network === "none") {
        return { decision: "allow" };
    }

    const review: EffectiveSandboxReview = {
        extraFiles,
        network,
        ...(network === "all_outbound"
            ? { networkNotice: NETWORK_ALL_OUTBOUND_NOTICE }
            : {}),
    };

    return {
        decision: "approval_required",
        review,
    };
}
