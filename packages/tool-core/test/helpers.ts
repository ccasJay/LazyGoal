import { createToolRegistration, type ToolRegistration } from "../src/index";
import { createTransitionalToolInputBinding } from "./transitional-binding";

/**
 * 为测试夹具补齐过渡期输入绑定后创建注册项。
 *
 * @remarks
 * 只用于测试中的模型输入替身；生产工具必须显式提供生成绑定。夹具已有绑定时
 * 原样保留，不覆盖生产或集成测试提供的真实绑定。
 */
export function createTestToolRegistration(tool: any): ToolRegistration {
    if (tool.definition.inputBinding !== undefined) {
        return createToolRegistration(tool);
    }
    return createToolRegistration({
        ...tool,
        definition: {
            ...tool.definition,
            inputBinding: createTransitionalToolInputBinding({
                contractId: `test.${tool.definition.id}`,
                version: 1,
                contract: tool.definition.inputContract,
            }),
        },
    });
}
