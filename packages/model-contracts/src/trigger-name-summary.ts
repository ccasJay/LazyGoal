/**
 * 工作 Trigger 简短名称的模型输出。
 *
 * @remarks
 * `name` 只供 Trigger 列表识别语义工作；消费方会拒绝空白结果并保留原始 work material 作为唯一工作内容。
 *
 * @example
 * ```ts
 * const summary: TriggerNameSummary = { name: "Review dependency updates" };
 * ```
 */
export interface TriggerNameSummary {
    readonly name: string;
}
