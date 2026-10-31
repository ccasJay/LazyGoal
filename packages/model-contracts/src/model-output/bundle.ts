import type { JsonSchema202012 } from "../../../contracts/src/index";
import type { ModelContractDecodeOptions } from "./decode-options";

/**
 * 请求级模型输出契约包的消费面。
 *
 * @remarks
 * 只包含请求渲染和响应解码共同依赖的能力；Schema、Shape Guide 与解码器由
 * 同源生成绑定组合。`decode` 失败不返回部分数据，未知字段诊断只通过可选回调观察。
 *
 * @example
 * ```ts
 * const bundle: ModelOutputBundle<AgentDecision> = createBoundModelOutputContractBundle({ kind: "executing" }, modelOutputBindings);
 * const result = bundle.decode(rawWireJson);
 * ```
 */
export interface ModelOutputBundle<Result> {
    /** 契约包唯一名称。 */
    readonly name: string;
    /** 供 strict 模式使用的共用 JSON Schema（不含根 $schema）。 */
    readonly jsonSchema: JsonSchema202012;
    /** 注入 Prompt 消息的紧凑响应结构指引。 */
    readonly shapeGuide: string;
    /**
     * 将模型原始输出解码为通过校验的领域对象。
     *
     * @param value - 模型的原始 JSON 输出。
     * @param options - 可选的未知字段剥离诊断观察参数；不改变解码结果。
     * @returns 解码并通过校验的领域只读对象。
     * @throws 校验不通过时抛出 `ContractValidationError`。
     */
    decode(value: unknown, options?: ModelContractDecodeOptions): Result;
}
