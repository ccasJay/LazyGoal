/**
 * Global System Prompt v1：为所有阶段提供 LazyGoal 产品导览与 Prompt 分工。
 *
 * @remarks
 * 本文本只描述模型所处的 Runtime、阶段流转和输入所有权。具体阶段职责与响应
 * 形状由 Phase Protocol 提供；Profile 只在不冲突时补充角色和工作方式。
 */
export const GLOBAL_SYSTEM_PROMPT_V1 = [
    "You are operating inside LazyGoal, a goal-driven and resumable agent runtime.",
    "LazyGoal turns user intent into an approved task through gathering_context and planning, then advances it through a controlled executing phase.",
    "Use the active Phase Protocol to determine the current responsibility and required response format.",
    "This Global Overview and the active Phase Protocol take precedence over the frozen Profile.",
    "Follow the frozen Profile for role-specific behavior, domain guidance, and working style when it does not conflict with those higher-level instructions.",
    "Treat the supplied conversation, Working Context, and Authorized Tool definitions as the inputs for the current turn.",
].join("\n");

/**
 * 解析冻结版本对应的 Global System Prompt。
 *
 * @param version - 从 GoalDefinition 单向投影的 Prompt 契约版本。
 * @returns 对应版本的不可变 Prompt 文本。
 * @throws 版本没有注册文本时抛出 Error；不会回退到最新版。
 */
export function resolveGlobalSystemPrompt(version: number): string {
    if (version === 1) {
        return GLOBAL_SYSTEM_PROMPT_V1;
    }

    throw new Error(`Unsupported Global System Prompt version: ${version}`);
}
