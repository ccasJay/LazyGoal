import {
    evaluatePermissionBoundary,
    isDestructiveCommand,
    type PermissionProfile,
    type ProjectPermissionProfile,
} from "../../../../packages/permission/src/index";
import type { SupervisorPermissionDecision } from "../../../../packages/model-contracts/src/trigger-permission-decision";
import type { Goal } from "../../../../packages/runtime/src/domain";
import { projectInteractionView, readInteractionDetail } from "../../../../packages/runtime/src/interaction-view";
import { BASH_TOOL_ID } from "../../../../packages/tools/src/index";

/**
 * Supervisor 对一条 Worker Action 权限等待的裁决结果。
 *
 * @remarks
 * `decided` 表示当前 Action 的一次性结论：`approve` 只放行这一个 Action，`reject`
 * 附带交回 Worker 的原因。`pending` 表示命中人工裁决规则，保留 Trigger 请求等待外部答复，
 * 不代表拒绝该 Action，也不清除等待记录。
 *
 * @example
 * ```ts
 * const advice: WorkerPermissionAdvice = { kind: "pending" };
 * ```
 */
export type WorkerPermissionAdvice =
    | { readonly kind: "decided"; readonly decision: SupervisorPermissionDecision }
    | { readonly kind: "pending" };

/**
 * 依据当前工作区权限档位裁决一条待审 Action。
 *
 * @remarks
 * 无人工审阅者的宿主（Worker／Benchmark）不发起等待：`reviewer` 一律按 `auto_review`
 * 语义处理，即越界命中规则表时保持 `pending` 交人工，其余越界自动放行。判定输入是暂存
 * 时的真实沙箱范围，不改写 Action 输入、路径或网络范围。
 *
 * 档位读取失败按失败关闭处理：直接拒绝该 Action，不退回任何默认档，也不据旧缓存放行。
 *
 * @param input - 最新已提交 Goal 快照、执行工作区根目录与档位读取端口。
 * @returns 一次性批准／拒绝决定，或需保留并转人工处理的 `pending`。
 * @throws Worker 报告的等待与已提交快照不一致时抛出；调用方不得据此自动放行。
 * @example
 * ```ts
 * const advice = await decideWorkerActionPermission({
 *     goal,
 *     workspaceRoot,
 *     readProfile: () => permissionProfileStore.get(workspaceId),
 * });
 * ```
 */
export async function decideWorkerActionPermission(input: {
    readonly goal: Goal;
    readonly workspaceRoot: string;
    readonly readProfile: () => Promise<ProjectPermissionProfile>;
}): Promise<WorkerPermissionAdvice> {
    const { goal } = input;
    const view = projectInteractionView(goal);
    const pendingAction = goal.state.run.pendingAction;
    if (view?.kind !== "action_approval" || pendingAction === undefined
        || pendingAction.status !== "awaiting_approval" || pendingAction.action.actionId !== view.actionId) {
        throw new Error("Worker Action permission wait does not match the committed Goal snapshot");
    }
    const detail = readInteractionDetail(goal, { runId: view.runId, interactionId: view.interactionId });
    if (!detail.ok || detail.detail.kind !== "action_approval") {
        throw new Error("Worker Action permission wait has no readable review detail");
    }

    let profile: ProjectPermissionProfile;
    try {
        profile = await input.readProfile();
    } catch {
        return {
            kind: "decided",
            decision: { kind: "reject", reason: "Permission profile is unavailable; refusing this action." },
        };
    }

    const destructiveCommand = isDestructiveCommandInput(pendingAction.action.toolId, pendingAction.action.input);
    const decision = evaluatePermissionBoundary({
        profile: autoReviewProfile(profile.profile),
        request: {
            toolId: pendingAction.action.toolId,
            effectiveScope: pendingAction.effectiveSandboxScope ?? { extraFiles: [], network: "none" },
            workspaceRoot: input.workspaceRoot,
            ...(destructiveCommand === undefined ? {} : { destructiveCommand }),
        },
    });

    switch (decision.kind) {
        case "allow":
            return { kind: "decided", decision: { kind: "approve" } };
        case "approval":
            return { kind: "pending" };
        case "deny":
            return { kind: "decided", decision: { kind: "reject", reason: decision.reason } };
    }
}

/** 无人审阅宿主固定按确定性规则表裁决，`user` 档位退化为 `auto_review`。 */
function autoReviewProfile(profile: PermissionProfile): PermissionProfile {
    return { ...profile, reviewer: "auto_review" };
}

/**
 * 判断命令类 Action 是否命中破坏性命令规则表。
 *
 * @returns 非命令类 Action 返回 `undefined`，避免把无关输入误判为破坏性命令。
 */
function isDestructiveCommandInput(toolId: string, input: unknown): boolean | undefined {
    if (toolId !== BASH_TOOL_ID || typeof input !== "object" || input === null) return undefined;
    const command = (input as { readonly command?: unknown }).command;
    return typeof command === "string" ? isDestructiveCommand(command) : undefined;
}
