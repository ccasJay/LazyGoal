import type { ProviderId, ProtocolId } from "./ids";

/** 模型可用性验证来源。 */
export type ModelAvailabilitySource = "live" | "catalog" | "configured";

/** 模型元数据字段来源。 */
export type ModelMetadataSource = "live" | "catalog" | "execution" | "configured" | "mixed";

/**
 * 供应商模型的可选择描述符。
 *
 * @remarks
 * `provider` 与 `id` 共同构成模型身份，模型标识只在供应商内唯一。
 * `protocol` 是执行该模型所需的线格式协议，由适配器或配置声明；缺失协议的模型不可选。
 * 容量、推理与视觉位为可选能力元数据；`availabilitySource` 与 `metadataSource` 说明数据来源，
 * 不表示调用方可以据此绕过 `selectable` 判定。
 *
 * @example
 * ```ts
 * const model: LlmModelDescriptor = {
 *     provider: "openai", id: "gpt-5", displayName: "GPT-5", protocol: "chat-completions",
 *     contextWindowTokens: 400_000, maxOutputTokens: 128_000,
 *     availabilitySource: "catalog", metadataSource: "catalog", selectable: true,
 * };
 * ```
 */
export interface LlmModelDescriptor {
    /** 归属的供应商标识。 */
    readonly provider: ProviderId;
    /** 供应商内唯一的模型标识。 */
    readonly id: string;
    /** 面向用户的模型名称。 */
    readonly displayName: string;
    /** 执行该模型所需的线格式协议。 */
    readonly protocol: ProtocolId;
    /** 上下文窗口 Token 容量；未知时省略。 */
    readonly contextWindowTokens?: number | undefined;
    /** 单次补全最大输出 Token；未知时省略。 */
    readonly maxOutputTokens?: number | undefined;
    /** 是否具备原生推理思维链能力。 */
    readonly reasoning?: boolean | undefined;
    /** 是否支持图像等视觉输入。 */
    readonly vision?: boolean | undefined;
    /** 是否支持供应商原生强制工具选择；未知时省略。 */
    readonly supportsRequiredToolChoice?: boolean | undefined;
    /** 可用性验证来源。 */
    readonly availabilitySource: ModelAvailabilitySource;
    /** 元数据来源。 */
    readonly metadataSource: ModelMetadataSource;
    /** 当前协议实现与容量条件下是否允许被选择。 */
    readonly selectable: boolean;
    /** 不可选择的具体原因。 */
    readonly unavailableReason?: string | undefined;
}
