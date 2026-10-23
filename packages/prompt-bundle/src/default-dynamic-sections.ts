import type { ModelInferenceView } from "../../model-view/src/index";
import { DynamicSectionRegistry } from "../../prompt-renderer/src/index";

/**
 * 默认 Bundle v1 使用的五个动态 section。
 *
 * @remarks
 * 具体状态只出现在注册定义中；注册表与渲染入口按定义遍历，不依赖这五个 ID。
 *
 * @example
 * ```ts
 * const registry = createDefaultDynamicSectionRegistry();
 * ```
 */
export function createDefaultDynamicSectionRegistry(): DynamicSectionRegistry {
    return new DynamicSectionRegistry([
        {
            id: "run_mode",
            order: 10,
            source: "Goal.intent + RunState.mode",
            role: "user",
            templateId: "run-mode@1",
            project: (view) => ({
                intent: view.workingContext.intent,
                mode: view.dynamicContext.runMode,
                taskApproved: view.dynamicContext.task !== undefined,
                ...(view.dynamicContext.planRoute === undefined ? {} : { planRoute: view.dynamicContext.planRoute }),
                goalPlanWritable: view.dynamicContext.goalPlanWritable,
                checkpointRequired: view.contextEpoch.control.status === "checkpoint_required",
                allowedSystemTools: getAllowedSystemToolIds(view),
                stageStatus: view.workingContext.execution.currentStage?.status ?? "none",
            }),
        },
        {
            id: "approved_task",
            order: 20,
            source: "RunState.approvedTask",
            role: "user",
            templateId: "approved-task@1",
            project: (view) => view.dynamicContext.task,
        },
        {
            id: "goal_plan",
            order: 30,
            source: "GoalState.goalPlan",
            role: "user",
            templateId: "goal-plan@1",
            project: (view) => {
                const { goalPlan, goalPlanWritable } = view.dynamicContext;
                if (goalPlan === undefined && !goalPlanWritable) return undefined;
                return {
                    goalPlanWritable,
                    ...(goalPlan === undefined ? {} : { goalPlan }),
                };
            },
        },
        {
            id: "authorized_tools",
            order: 40,
            source: "Runtime.authorizedTools",
            role: "user",
            templateId: "authorized-tools@1",
            project: (view) => view.contextEpoch.control.status === "checkpoint_required"
                ? []
                : view.dynamicContext.authorizedTools,
        },
        {
            id: "working_memory",
            order: 50,
            source: "WorkingMemory",
            role: "user",
            templateId: "working-memory@1",
            project: (view) => view.workingMemory,
        },
        {
            id: "goal_context_navigation",
            order: 60,
            source: "GoalContextNavigation",
            role: "user",
            templateId: "goal-context-navigation@1",
            project: (view) => view.dynamicContext.goalContextNavigation,
        },
    ]);
}

function getAllowedSystemToolIds(view: ModelInferenceView): readonly string[] {
    if (view.contextEpoch.control.status === "checkpoint_required") {
        return ["system_context_checkpoint"];
    }

    const { runMode, task, goalPlanWritable } = view.dynamicContext;
    if (runMode === "plan" && task === undefined) {
        return [
            "ask_user",
            "system_find_tools",
            "system_context_lookup",
            "system_propose_task_plan",
            ...(goalPlanWritable ? ["system_update_goal_plan"] : []),
        ];
    }

    return [
        "system_complete_task",
        "system_wait_for_input",
        "system_fail_goal",
        "system_context_lookup",
        "ask_user",
        "system_find_tools",
        ...(view.workingContext.execution.currentStage?.status === "executing"
            ? ["system_revise_run_stage", "system_complete_run_stage"]
            : view.dynamicContext.planRoute !== undefined
                && view.dynamicContext.planRoute.nextStageIndex >= view.dynamicContext.planRoute.stages.length
                ? []
                : ["system_start_run_stage"]),
        ...(runMode === "plan" && task !== undefined ? ["system_update_plan_route"] : []),
        ...(goalPlanWritable ? ["system_update_goal_plan"] : []),
    ];
}
