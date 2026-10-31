import type { ContractValidationError } from "../../contracts/src/index";
import type {
    AgentDecision,
    ModelContractDecodeOptions,
    ModelOutputBundle,
} from "../../model-contracts/src/index";
import {
    createBoundModelOutputContractBundle,
    modelOutputBindings,
    validateModelOutputSemantics,
} from "../../model-contracts/src/index";
import {
    LLMResponseProtocolError,
    type LLMResponseProtocolIssue,
} from "./errors";

/**
 * 从模型输出文本中提取纯 JSON 字符串。
 *
 * @remarks
 * 仅允许纯裸 JSON 文本或首尾仅由单个完整 ``` 或 ```json 代码块包裹的文本。
 * 绝不从混杂自然语言的前后正文夹带中提取 JSON。
 * 空白文本或非代码块/非法格式直接拒绝。
 *
 * @param content - 原始模型输出文本。
 * @returns 提取出的纯 JSON 字符串。
 * @throws {@link LLMResponseProtocolError} 文本为空、包含正文夹带或残缺代码块时抛出。
 *
 * @example
 * ```ts
 * const jsonStr = extractJsonPayload("```json\n{\"result\": {}}\n```");
 * ```
 */
export function extractJsonPayload(content: string): string {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
        throw new LLMResponseProtocolError("响应文本为空");
    }

    const match = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/iu.exec(trimmed);
    if (match !== null) {
        const inside = match[1]?.trim() ?? "";
        if (inside.length === 0) {
            throw new LLMResponseProtocolError("代码块内容为空");
        }
        return inside;
    }

    if (trimmed.includes("```")) {
        throw new LLMResponseProtocolError("响应包含正文夹带或未完全包裹的代码块");
    }

    return trimmed;
}

/**
 * 解析原始模型输出文本为 JSON 对象。
 *
 * @param content - 原始模型输出文本。
 * @returns 解析出的未类型化 JSON 数据。
 * @throws {@link LLMResponseProtocolError} 格式非法或非合法 JSON 时抛出。
 *
 * @example
 * ```ts
 * const parsed = parseJson("{\"result\": 123}");
 * ```
 */
export function parseJson(content: string): unknown {
    const payload = extractJsonPayload(content);
    try {
        return JSON.parse(payload);
    } catch (error) {
        throw new LLMResponseProtocolError("响应不是合法 JSON", {
            cause: error,
            issues: [{
                code: "invalid_json_syntax",
                path: [],
                message: "Return valid JSON matching the active response contract.",
            }],
        });
    }
}

/**
 * 依据请求级契约包解析并校验模型输出。
 *
 * @remarks
 * 1. 严格提取裸 JSON 或完整 fenced 代码块，拒绝正文夹带与空白文本；
 * 2. 由 Bundle 执行同源生成 Schema 的 Wire 解码与未知字段剥离诊断；
 * 3. 对解码后的规范对象进行基础语义校验（非空白字符串、非反转 range、非空变更）；
 * 4. 任何阶段失败均抛出带稳定分类码与定位路径的 {@link LLMResponseProtocolError}，绝不静默修复或降级。
 *
 * @param content - Adapter 返回的原始模型文本。
 * @param bundle - 当前请求绑定的模型输出契约包。
 * @param options - 可选的未知字段剥离诊断观察参数；不改变接受范围。
 * @returns 通过校验并解码后的规范领域结果。
 * @throws {@link LLMResponseProtocolError} 格式、结构或基础语义不符时抛出。
 *
 * @example
 * ```ts
 * const bundle = createBoundModelOutputContractBundle({ kind: "executing", taskPresent: false }, modelOutputBindings);
 * const result = parseModelOutput(readAssistantText(response), bundle);
 * ```
 */
export function parseModelOutput<Result>(
    content: string,
    bundle: ModelOutputBundle<Result>,
    options?: ModelContractDecodeOptions,
): Result {
    const rawJson = parseJson(content);

    let decoded: Result;
    try {
        decoded = bundle.decode(rawJson, options);
    } catch (error) {
        const validationError = error as ContractValidationError;
        if (Array.isArray(validationError?.issues)) {
            const issues: LLMResponseProtocolIssue[] = validationError.issues.map((issue) => ({
                code: issue.code,
                path: issue.path,
                message: issue.message,
            }));
            throw new LLMResponseProtocolError(
                `响应不符合 ${bundle.name} 契约`,
                {
                    cause: error,
                    issues,
                },
            );
        }
        throw new LLMResponseProtocolError(
            `响应无法通过 ${bundle.name} 解码: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
        );
    }

    const semanticIssues = validateModelOutputSemantics(decoded);
    if (semanticIssues.length > 0) {
        const issues: LLMResponseProtocolIssue[] = semanticIssues.map((issue) => ({
            code: issue.code,
            path: issue.path,
            message: issue.message,
        }));
        throw new LLMResponseProtocolError(
            `响应未通过 ${bundle.name} 基础语义校验`,
            { issues },
        );
    }

    return decoded;
}

/**
 * 解析 AgentDecision。
 *
 * @remarks
 * 若未显式传入请求级契约包，则默认构造基础 executing 契约包进行解析。
 *
 * @param content - Adapter 返回的原始模型文本。
 * @param bundle - 可选的请求级契约包。
 * @returns 规范化的 AgentDecision。
 * @throws {@link LLMResponseProtocolError} 不符合协议时抛出。
 *
 * @example
 * ```ts
 * const decision = parseAgentDecision(content, bundle);
 * ```
 */
export function parseAgentDecision(
    content: string,
    bundle?: ModelOutputBundle<AgentDecision>,
): AgentDecision {
    const effectiveBundle = bundle ?? createBoundModelOutputContractBundle<AgentDecision>({
        kind: "executing",
    }, modelOutputBindings);

    return parseModelOutput(content, effectiveBundle);
}
