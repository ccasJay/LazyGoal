import { compileJsonSchema, type Contract } from "../../../contracts/src/index";
import { activityWebContracts } from "./activity";
import { sharedWebContracts } from "./common";
import { eventsWebContracts } from "./events";
import { inputWebContracts } from "./input";
import { interactionWebContracts } from "./interaction";
import { metricsWebContracts } from "./metrics";
import { modelInputWebContracts } from "./model-input";
import { sessionWebContracts } from "./session";
import { trajectoryWebContracts } from "./trajectory";

/** 本包当前登记的全部 Web wire 合同。 */
const webContracts: readonly Contract<unknown>[] = [
    ...sharedWebContracts,
    ...sessionWebContracts,
    ...interactionWebContracts,
    ...inputWebContracts,
    ...activityWebContracts,
    ...eventsWebContracts,
    ...trajectoryWebContracts,
    ...modelInputWebContracts,
    ...metricsWebContracts,
];

/**
 * 通过 JSON Schema 编译强制检查全部已登记 Web wire 合同的完整定义图。
 *
 * @remarks
 * 该入口只供测试在导入合同后调用，确保非法 shape、非法 optional 位置或悬空递归
 * 引用在测试阶段立即失败，而不是延迟到请求或 SSE 事件到达时才发现。它不参与浏览器
 * 运行时路径，也不会在请求或事件上编译 Schema。
 *
 * @throws `ContractDefinitionError` 表示某个合同节点的定义图非法。
 *
 * @example
 * ```ts
 * assertWebContractsValid();
 * ```
 */
export function assertWebContractsValid(): void {
    for (const definition of webContracts) {
        compileJsonSchema(definition);
    }
}
