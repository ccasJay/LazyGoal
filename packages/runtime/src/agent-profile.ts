/**
 * 启动 Goal 时冻结到快照中的 Agent 配置。
 *
 * @remarks
 * `systemPrompt` 和 `instructions` 共同约束模型行为；`toolIds` 只保存 Tool
 * 标识，不保存 Tool 实例。`name` 和 `description` 是可选的运行时元数据，
 * 允许旧 Goal 快照在新增文件字段后继续恢复；由持久化 Adapter 加载的新
 * Profile 会始终包含它们。当前 LLM Preparation/Step Executor 会消费冻结
 * Profile，但不负责读取文件或解析 Registry。
 *
 * @example
 * ```ts
 * const profile: AgentProfile = {
 *     id: "default",
 *     name: "Default",
 *     description: "通用 Agent",
 *     systemPrompt: "You are LazyGoal.",
 *     instructions: ["Use only authorized tools."],
 *     toolIds: ["read_file"],
 * };
 * ```
 */
export interface AgentProfile {
    readonly id: string;
    /** 面向用户或 Profile 列表的稳定显示名称；旧快照中可以缺失。 */
    readonly name?: string;
    /** Profile 的人工维护说明；旧快照中可以缺失。 */
    readonly description?: string;
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

/**
 * 按稳定 ID 异步读取已持久化 Agent Profile 的 Port。
 *
 * @remarks
 * 该契约只描述 Runtime 需要的加载语义：文件缺失以 `undefined` 表示，读取
 * 或协议失败由具体 Adapter 的稳定错误表达。Runtime 不感知文件路径、文件
 * 格式或解码器状态；内存与 JSON 文件实现由 `@lazygoal/storage` 提供。
 *
 * @example
 * ```ts
 * const store: AgentProfileStore = new JsonFileAgentProfileStore(
 *     ".lazygoal/profiles",
 * );
 * const profile = await store.load("default");
 * ```
 */
export interface AgentProfileStore {
    /**
     * @param profileId - Profile 的稳定标识。
     * @returns 加载后的 Runtime Profile；对应持久化条目不存在时返回
     *   `undefined`。
     * @throws 读取失败、持久化结构损坏或 ID 不一致时由实现抛出稳定的
     *   配置错误。
     */
    load(profileId: string): Promise<AgentProfile | undefined>;
}
