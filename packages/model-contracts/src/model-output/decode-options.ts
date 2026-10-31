import type { ContractDiagnostic } from "../../../contract-binding/src/index";

/**
 * 模型输出与系统工具解码的可选观察参数。
 *
 * @remarks
 * `onDiagnostic` 只接收未知字段被剥离后的有界安全诊断，包含契约身份、版本与
 * JSON Pointer 路径，不包含字段值或原始载荷。回调抛错不改变解码结果。
 *
 * @example
 * ```ts
 * const options: ModelContractDecodeOptions = {
 *     onDiagnostic: (diagnostic) => trace(diagnostic.contractId, diagnostic.paths),
 * };
 * ```
 */
export interface ModelContractDecodeOptions {
    /** 接收未知字段剥离诊断的观察回调。 */
    readonly onDiagnostic?: (diagnostic: ContractDiagnostic) => void;
}
