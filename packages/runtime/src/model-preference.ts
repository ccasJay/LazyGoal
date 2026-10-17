/**
 * 当前工作区最近一次由用户明确选择的模型来源。
 *
 * @remarks
 * 仅记录身份；模型能力及可选状态须在使用时重新查询对应 Provider 目录。
 * `profileId` 指向受管 Provider 档案；未使用受管档案（例如仅 `config.toml` 回退）时省略。
 *
 * @example
 * ```ts
 * const preference: ModelPreference = { profileId: "6f1c...", modelId: "gpt-4o" };
 * ```
 */
export interface ModelPreference {
    /** 受管 Provider 档案标识；未使用受管档案时省略。 */
    readonly profileId?: string;
    readonly modelId: string;
}

/**
 * 工作区 Web 模型偏好的持久化边界。
 *
 * @remarks
 * 读取失败必须向调用方传播；缺失记录才返回 undefined。成功写入后，后续读取返回
 * 最近一次成功提交的偏好。运行中的 Goal 仍由自己的 Snapshot 持有模型选择。
 *
 * @example
 * ```ts
 * const preference = await store.get();
 * await store.set({ profileId: "6f1c...", modelId: "gpt-4o" });
 * ```
 */
export interface ModelPreferenceStore {
    /** @returns 已保存的身份；首次使用时返回 undefined。文件损坏或读取失败时拒绝。 */
    get(): Promise<ModelPreference | undefined>;
    /** @param preference - 当前 Provider 来源下已验证可选的模型身份；写入失败时拒绝。 */
    set(preference: ModelPreference): Promise<void>;
}
