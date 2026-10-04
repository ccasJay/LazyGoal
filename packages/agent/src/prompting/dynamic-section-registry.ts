import type { ModelInferenceView } from "../model-inference-view";

/** 动态 Prompt section 当前允许使用的消息角色。 */
export type DynamicSectionRole = "user";

/**
 * 显式注册的动态 Prompt section。
 *
 * @remarks
 * 每项定义必须具有稳定身份、来源、唯一顺序和版本化模板。投影函数只读取一个
 * 已完成 Runtime 投影的 `ModelInferenceView`，返回 JSON 可序列化的模型状态；
 * 返回 `undefined` 表示该 section 当前不存在。注册表不会根据 ID 分支。
 *
 * @example
 * ```ts
 * const definition: DynamicSectionDefinition = {
 *     id: "run_mode",
 *     order: 10,
 *     source: "RunState.mode",
 *     role: "user",
 *     templateId: "run-mode@1",
 *     project: (view) => ({ mode: view.dynamicContext.runMode }),
 * };
 * ```
 */
export interface DynamicSectionDefinition {
    /** 稳定 section ID；已发布的 ID 不得复用于不同语义。 */
    readonly id: string;
    /** 全局唯一的确定顺序。 */
    readonly order: number;
    /** 面向审计的稳定来源描述。 */
    readonly source: string;
    /** 当前供应商无关消息协议允许的角色。 */
    readonly role: DynamicSectionRole;
    /** 与该 section 内容绑定的版本化 Nunjucks 模板 ID。 */
    readonly templateId: string;
    /** 从不可变模型 View 生成该 section 的模型可见投影。 */
    project(view: ModelInferenceView): unknown | undefined;
}

/**
 * 已完成当前状态投影、等待模板渲染的动态 section。
 *
 * @example
 * ```ts
 * const projection: DynamicSectionProjection = {
 *     sectionId: "run_mode",
 *     order: 10,
 *     source: "RunState.mode",
 *     role: "user",
 *     templateId: "run-mode@1",
 *     projection: { mode: "normal" },
 * };
 * ```
 */
export interface DynamicSectionProjection {
    /** 与定义一致的稳定 section 身份。 */
    readonly sectionId: string;
    /** Registry 分配的确定顺序。 */
    readonly order: number;
    /** 声明当前状态的权威来源。 */
    readonly source: string;
    /** 该动态状态使用的模型消息角色。 */
    readonly role: DynamicSectionRole;
    /** 当前 section 绑定的版本化渲染模板。 */
    readonly templateId: string;
    /** 纯模型状态投影；内容必须可确定地序列化。 */
    readonly projection: unknown;
}

/**
 * 已渲染的动态 section；正文将作为模型 `user` 消息发送。
 *
 * @example
 * ```ts
 * const message: DynamicSectionMessage = {
 *     sectionId: "run_mode",
 *     order: 10,
 *     source: "RunState.mode",
 *     role: "user",
 *     templateId: "run-mode@1",
 *     projection: { mode: "normal" },
 *     content: "[Dynamic section: run_mode; source: RunState.mode]\\nNormal Run",
 * };
 * ```
 */
export interface DynamicSectionMessage extends DynamicSectionProjection {
    /** 含稳定身份、来源标记和模板内容的单条模型可见文本。 */
    readonly content: string;
}

/** 动态 Section 的稳定身份元数据，不包含当前投影。 */
export type DynamicSectionIdentity = Omit<DynamicSectionProjection, "projection">;

/**
 * 按显式定义顺序投影动态 section 的注册表。
 *
 * @remarks
 * 构造时拒绝重复 ID、重复顺序、空身份/来源/模板和不支持的消息角色。每次投影
 * 都遍历全部注册项，因此新增 section 无需修改通用投影入口或 diff 逻辑。
 *
 * @example
 * ```ts
 * const registry = new DynamicSectionRegistry([definition]);
 * const sections = registry.project(view);
 * ```
 */
export class DynamicSectionRegistry {
    private readonly definitions: readonly DynamicSectionDefinition[];

    /**
     * @param definitions - 需要按稳定顺序投影的 section 定义。
     * @throws 当任一 ID、顺序、来源、角色或模板定义冲突或无效时抛出 `Error`。
     */
    constructor(definitions: readonly DynamicSectionDefinition[]) {
        const ids = new Set<string>();
        const orders = new Set<number>();

        for (const definition of definitions) {
            if (!/^[a-z][a-z0-9_]*$/.test(definition.id)) {
                throw new Error(`Invalid dynamic section ID: ${definition.id}`);
            }
            if (ids.has(definition.id)) {
                throw new Error(`Duplicate dynamic section ID: ${definition.id}`);
            }
            if (!Number.isSafeInteger(definition.order) || definition.order < 0) {
                throw new Error(`Invalid order for dynamic section: ${definition.id}`);
            }
            if (orders.has(definition.order)) {
                throw new Error(`Duplicate dynamic section order: ${definition.order}`);
            }
            if (definition.source.trim().length === 0) {
                throw new Error(`Missing source for dynamic section: ${definition.id}`);
            }
            if (definition.role !== "user") {
                throw new Error(`Unsupported role for dynamic section: ${definition.id}`);
            }
            if (definition.templateId.trim().length === 0) {
                throw new Error(`Missing template for dynamic section: ${definition.id}`);
            }
            ids.add(definition.id);
            orders.add(definition.order);
        }

        this.definitions = [...definitions]
            .sort((left, right) => left.order - right.order)
            .map((definition) => ({ ...definition }));
    }

    /**
     * @param view - 已从 Runtime 单向投影且不可变的完整模型 View。
     * @returns 按注册顺序生成的当前 section；不存在的投影被省略。
     */
    project(view: ModelInferenceView): readonly DynamicSectionProjection[] {
        const sections: DynamicSectionProjection[] = [];

        for (const definition of this.definitions) {
            const projection = definition.project(view);
            if (projection === undefined) continue;

            sections.push({
                sectionId: definition.id,
                order: definition.order,
                source: definition.source,
                role: definition.role,
                templateId: definition.templateId,
                projection: structuredClone(projection),
            });
        }

        return sections;
    }

    /** @returns 注册表中所有版本化模板 ID，按 section 顺序排列。 */
    templateIds(): readonly string[] {
        return this.definitions.map((definition) => definition.templateId);
    }

    /**
     * 返回全部已注册 Section 的稳定身份，包含当前未投影的可选 Section。
     *
     * @returns 按注册顺序排列的新身份数组；数组和条目均不暴露 Registry 内部引用。
     * @example
     * ```ts
     * const identities = registry.identities();
     * ```
     */
    identities(): readonly DynamicSectionIdentity[] {
        return this.definitions.map(({ id, order, source, role, templateId }) => ({
            sectionId: id,
            order,
            source,
            role,
            templateId,
        }));
    }
}

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
                goalPlanWritable: view.dynamicContext.goalPlanWritable,
                checkpointRequired: view.contextEpoch.control.status === "checkpoint_required",
                allowedSystemTools: getAllowedSystemToolIds(view),
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
        ...(goalPlanWritable ? ["system_update_goal_plan"] : []),
    ];
}
