/**
 * 启动 Goal 时冻结到快照中的 Agent 配置。
 *
 * @remarks
 * `systemPrompt` 和 `instructions` 共同约束模型行为；`toolIds` 只保存 Tool
 * 标识，不保存 Tool 实例。当前 LLM Preparation/Step Executor 都要求
 * `toolIds` 为空。
 */
export interface AgentProfile {
    readonly id: string;
    readonly systemPrompt: string;
    readonly instructions: readonly string[];
    readonly toolIds: readonly string[];
}
/**
 * Launcher 查找 Profile 的最小注册表边界。
 *
 * @remarks
 * Registry 可以由内存、配置文件或外部服务实现。Launcher 会复制查找到的
 * Profile，后续 Registry 变化不会修改已经创建的 Goal 快照。
 */
export interface AgentProfileRegistry {
    /**
     * @param profileId - Profile 的稳定标识。
     * @returns 对应 Profile；不存在时返回 `undefined`。
     */
    get(profileId: string): AgentProfile | undefined;
}
