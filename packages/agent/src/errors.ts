export const LLM_RESPONSE_PROTOCOL_ERROR_CODE = "INVALID_LLM_RESPONSE" as const;

/**
 * 模型输出响应协议校验或基础语义问题的统一描述。
 *
 * @remarks
 * 统一承载 Contract 校验问题与业务语义检查问题，脱离第三方验证库耦合，保留稳定的访问路径与错误码。
 *
 * @example
 * ```ts
 * const issue: LLMResponseProtocolIssue = {
 *     code: "blank_string",
 *     path: ["result", "reason"],
 *     message: "String must not be blank",
 * };
 * ```
 */
export interface LLMResponseProtocolIssue {
    /** 问题的稳定分类码。 */
    readonly code: string;
    /** 问题所在的属性或元素访问路径。 */
    readonly path: readonly (string | number)[];
    /** 面向诊断的英文错误描述。 */
    readonly message: string;
}

/**
 * 模型响应解析失败时的上下文信息。
 *
 * @example
 * ```ts
 * const details: LLMResponseProtocolErrorDetails = {
 *     cause: new Error("JSON parse failure"),
 *     issues: [{ code: "invalid_json", path: [], message: "Unexpected token" }],
 * };
 * ```
 */
export interface LLMResponseProtocolErrorDetails {
    /** 底层抛出的原始异常（如有）。 */
    readonly cause?: unknown;
    /** 结构校验或语义校验发现的问题列表。 */
    readonly issues?: readonly LLMResponseProtocolIssue[];
}

/**
 * 模型响应协议异常。
 *
 * @remarks
 * 当模型原始文本不是合法 JSON、正文夹带、缺少 envelope、字段不匹配契约或违反基础语义时抛出。
 * 错误码固定为 `INVALID_LLM_RESPONSE`，并通过 `issues` 保留可定位的错误路径。
 *
 * @example
 * ```ts
 * throw new LLMResponseProtocolError("响应不符合 executing_agent_decision 契约", {
 *     issues: [{ code: "missing_required_property", path: ["result"], message: "Property 'result' is required" }],
 * });
 * ```
 */
export class LLMResponseProtocolError extends Error {
    /** 稳定的协议错误分类码。 */
    readonly code = LLM_RESPONSE_PROTOCOL_ERROR_CODE;
    /** 底层原始异常。 */
    readonly cause?: unknown;
    /** 校验定位问题列表。 */
    readonly issues?: readonly LLMResponseProtocolIssue[];

    constructor(
        message: string,
        details: LLMResponseProtocolErrorDetails = {},
    ) {
        super(`${LLM_RESPONSE_PROTOCOL_ERROR_CODE}: ${message}`);
        this.name = "LLMResponseProtocolError";

        if (details.cause !== undefined) {
            this.cause = details.cause;
        }

        if (details.issues !== undefined) {
            this.issues = details.issues;
        }
    }
}
