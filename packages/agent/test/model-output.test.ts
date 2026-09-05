import assert from "node:assert/strict";
import { test } from "node:test";

import {
    contract,
    createModelOutputContractBundle,
} from "../../contracts/src/index";
import {
    LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    LLMResponseProtocolError,
    extractJsonPayload,
    parseAgentDecision,
    parseJson,
    parseModelOutput,
    parsePreparationResult,
} from "../src/index";

const TEST_TOOL_INPUT_CONTRACT = contract.object({
    query: contract.string(),
    limit: contract.optional(contract.number()),
});

const executingWithToolBundle = createModelOutputContractBundle({
    kind: "executing",
    authorizedTools: [{
        id: "search_docs",
        inputContract: TEST_TOOL_INPUT_CONTRACT,
    }],
});

const executingNoToolBundle = createModelOutputContractBundle({
    kind: "executing",
});

const gatheringBundle = createModelOutputContractBundle({
    kind: "gathering",
});

const planningBundle = createModelOutputContractBundle({
    kind: "planning",
});

const checkpointBundle = createModelOutputContractBundle({
    kind: "checkpoint",
});

test("extractJsonPayload 接受裸 JSON 与完整 fenced code block，严格拒绝正文夹带与空白", () => {
    assert.equal(extractJsonPayload("{\"result\": 1}"), "{\"result\": 1}");
    assert.equal(extractJsonPayload("```json\n{\"result\": 1}\n```"), "{\"result\": 1}");
    assert.equal(extractJsonPayload("  ```\n{\"result\": 1}\n```  "), "{\"result\": 1}");

    // 空白文本
    assert.throws(
        () => extractJsonPayload(""),
        (err: unknown) => err instanceof LLMResponseProtocolError && err.code === LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    );
    assert.throws(
        () => extractJsonPayload("   \n\t  "),
        (err: unknown) => err instanceof LLMResponseProtocolError && err.code === LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    );
    assert.throws(
        () => extractJsonPayload("```json\n\n```"),
        (err: unknown) => err instanceof LLMResponseProtocolError && err.code === LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    );

    // 正文夹带与前后修饰
    assert.throws(
        () => parseJson("这是分析：\n{\"result\": 1}"),
        (err: unknown) => err instanceof LLMResponseProtocolError && err.code === LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    );
    assert.throws(
        () => parseJson("{\"result\": 1}\n这是结尾"),
        (err: unknown) => err instanceof LLMResponseProtocolError && err.code === LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    );
    assert.throws(
        () => extractJsonPayload("前缀文本\n```json\n{\"result\": 1}\n```"),
        (err: unknown) => err instanceof LLMResponseProtocolError && err.code === LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    );
    assert.throws(
        () => extractJsonPayload("```json\n{\"result\": 1}\n```\n后缀说明"),
        (err: unknown) => err instanceof LLMResponseProtocolError && err.code === LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    );
});

test("parseModelOutput 成功解析四类请求的合法结果并还原 optional 字段", () => {
    // 1. gathering - question
    const gatheringQuestionRaw = JSON.stringify({
        result: {
            kind: "question",
            question: "使用哪个测试框架？",
            memoryPatch: null,
        },
    });
    const gatheringResult = parseModelOutput(gatheringQuestionRaw, gatheringBundle);
    assert.deepEqual(gatheringResult, {
        kind: "question",
        question: "使用哪个测试框架？",
    });

    // 2. planning - task_proposal (完整 fenced code block)
    const planningRaw = `\`\`\`json\n${JSON.stringify({
        result: {
            kind: "task_proposal",
            task: {
                objective: "完成模块实现",
                completionCriteria: ["所有测试通过"],
            },
            approvalRequest: "是否批准？",
            memoryPatch: null,
        },
    })}\n\`\`\``;
    const planningResult = parseModelOutput(planningRaw, planningBundle);
    assert.deepEqual(planningResult, {
        kind: "task_proposal",
        task: {
            objective: "完成模块实现",
            completionCriteria: ["所有测试通过"],
        },
        approvalRequest: "是否批准？",
    });

    // 3. executing - tool_call (含工具 input optional 占位消除与业务 null 保留)
    const executingRaw = JSON.stringify({
        result: {
            kind: "tool_call",
            action: {
                actionId: "act-1",
                toolId: "search_docs",
                input: {
                    query: "typescript",
                    limit: null,
                },
            },
            memoryPatch: {
                protocolVersion: 1,
                operations: [{
                    type: "upsert_fact",
                    fact: {
                        subject: "search",
                        predicate: "status",
                        value: null, // 合法业务 null
                        stability: "stable",
                        evidenceSequences: [1],
                        scope: null,
                    },
                }],
            },
        },
    });
    const executingResult = parseModelOutput(executingRaw, executingWithToolBundle);
    assert.deepEqual(executingResult, {
        kind: "tool_call",
        action: {
            actionId: "act-1",
            toolId: "search_docs",
            input: {
                query: "typescript",
            },
        },
        memoryPatch: {
            protocolVersion: 1,
            operations: [{
                type: "upsert_fact",
                fact: {
                    subject: "search",
                    predicate: "status",
                    value: null,
                    stability: "stable",
                    evidenceSequences: [1],
                },
            }],
        },
    });

    // 4. checkpoint - context_checkpoint
    const checkpointRaw = JSON.stringify({
        result: {
            kind: "context_checkpoint",
            memoryPatch: null,
        },
    });
    const checkpointResult = parseModelOutput(checkpointRaw, checkpointBundle);
    assert.deepEqual(checkpointResult, {
        kind: "context_checkpoint",
    });
});

test("parseModelOutput 拒绝旧无 envelope 格式，绝不隐式降级回退（Req 7.2）", () => {
    const legacyResponses = [
        JSON.stringify({ kind: "wait", reason: "等待中" }),
        JSON.stringify({ kind: "question", question: "配置是什么？" }),
        JSON.stringify({
            kind: "complete",
            summary: "任务完成",
            completionEvidence: [],
        }),
    ];

    for (const legacy of legacyResponses) {
        assert.throws(
            () => parseModelOutput(legacy, executingNoToolBundle),
            (err: unknown) => {
                assert.ok(err instanceof LLMResponseProtocolError);
                assert.equal(err.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
                assert.ok(Array.isArray(err.issues));
                // 必须明确指出缺少 result 属性
                const hasResultIssue = err.issues.some((issue) => issue.path.includes("result"));
                assert.ok(hasResultIssue, "必须包含关于缺少 result envelope 的校验问题");
                return true;
            },
        );
    }
});

test("parseModelOutput 拦截语法错误 JSON，保留底层原因", () => {
    for (const invalid of ["not json", "{ invalid: json }", "{\"result\": "]) {
        assert.throws(
            () => parseModelOutput(invalid, executingNoToolBundle),
            (err: unknown) => {
                assert.ok(err instanceof LLMResponseProtocolError);
                assert.equal(err.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
                assert.ok(err.cause instanceof SyntaxError);
                return true;
            },
        );
    }
});

test("parseModelOutput 拦截结构缺失、类型错误和多余字段，并保留稳定 code/path/message", () => {
    // 缺失顶层必填 result 字段
    const missingResult = JSON.stringify({
        kind: "complete",
        summary: "全部完成",
    });
    assert.throws(
        () => parseModelOutput(missingResult, executingNoToolBundle),
        (err: unknown) => {
            assert.ok(err instanceof LLMResponseProtocolError);
            assert.equal(err.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
            const issue = err.issues?.find((i) => i.path.includes("result"));
            assert.ok(issue, "应有针对 result 的 issue");
            assert.equal(issue.code, "missing_field");
            assert.ok(typeof issue.message === "string");
            return true;
        },
    );

    // 联合分支均不匹配时报告 union_no_match
    const noBranchMatch = JSON.stringify({
        result: {
            kind: "unknown_kind",
        },
    });
    assert.throws(
        () => parseModelOutput(noBranchMatch, executingNoToolBundle),
        (err: unknown) => {
            assert.ok(err instanceof LLMResponseProtocolError);
            assert.equal(err.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
            const issue = err.issues?.find((i) => i.code === "union_no_match");
            assert.ok(issue, "应有针对 result 的 union_no_match issue");
            assert.deepEqual(issue.path, ["result"]);
            return true;
        },
    );

    // 单一对象结构中包含多余字段（在 checkpointBundle 中验证）
    const extraField = JSON.stringify({
        result: {
            kind: "context_checkpoint",
            memoryPatch: null,
            unauthorizedKey: "malicious",
        },
    });
    assert.throws(
        () => parseModelOutput(extraField, checkpointBundle),
        (err: unknown) => {
            assert.ok(err instanceof LLMResponseProtocolError);
            assert.equal(err.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
            const issue = err.issues?.find((i) => i.path.join(".") === "result.unauthorizedKey");
            assert.ok(issue, "应有针对 result.unauthorizedKey 的 extra_field issue");
            assert.equal(issue.code, "extra_field");
            return true;
        },
    );

    // 单一对象结构中字段类型错误（在 checkpointBundle 中验证）
    const wrongType = JSON.stringify({
        result: {
            kind: "context_checkpoint",
            memoryPatch: "invalid_string_type",
        },
    });
    assert.throws(
        () => parseModelOutput(wrongType, checkpointBundle),
        (err: unknown) => {
            assert.ok(err instanceof LLMResponseProtocolError);
            assert.equal(err.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
            const issue = err.issues?.find((i) => i.path.join(".") === "result.memoryPatch");
            assert.ok(issue, "应有针对 result.memoryPatch 的 invalid_type issue");
            assert.equal(issue.code, "invalid_type");
            return true;
        },
    );
});

test("parseModelOutput 拦截基础语义违规（空白字符串、反转范围、无变更 update）", () => {
    // 空白文本
    const blankReason = JSON.stringify({
        result: {
            kind: "wait",
            reason: "   \t\n  ",
            memoryPatch: null,
        },
    });
    assert.throws(
        () => parseModelOutput(blankReason, executingNoToolBundle),
        (err: unknown) => {
            assert.ok(err instanceof LLMResponseProtocolError);
            assert.equal(err.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
            const issue = err.issues?.find((i) => i.code === "blank_string");
            assert.ok(issue, "应报告 blank_string 语义问题");
            assert.deepEqual(issue.path, ["reason"]);
            return true;
        },
    );

    // 反转 sequenceRange
    const invertedRange = JSON.stringify({
        result: {
            kind: "context_lookup",
            need: "historical_execution",
            question: "查找执行历史",
            filters: {
                eventTypes: null,
                toolIds: null,
                actionIds: null,
                stepIndexes: null,
                paths: null,
                errorCodes: null,
                objectIds: null,
                sequenceRange: {
                    from: 20,
                    to: 10,
                },
            },
        },
    });
    assert.throws(
        () => parseModelOutput(invertedRange, executingNoToolBundle),
        (err: unknown) => {
            assert.ok(err instanceof LLMResponseProtocolError);
            assert.equal(err.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
            const issue = err.issues?.find((i) => i.code === "invalid_sequence_range");
            assert.ok(issue, "应报告 invalid_sequence_range 语义问题");
            return true;
        },
    );

    // update 无变更
    const emptyUpdate = JSON.stringify({
        result: {
            kind: "wait",
            reason: "等待中",
            memoryPatch: {
                protocolVersion: 1,
                operations: [{
                    type: "update_hypothesis",
                    hypothesis: {
                        id: "hyp-1",
                        statement: null,
                        status: null,
                    },
                }],
            },
        },
    });
    assert.throws(
        () => parseModelOutput(emptyUpdate, executingNoToolBundle),
        (err: unknown) => {
            assert.ok(err instanceof LLMResponseProtocolError);
            assert.equal(err.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
            const issue = err.issues?.find((i) => i.code === "empty_update");
            assert.ok(issue, "应报告 empty_update 语义问题");
            return true;
        },
    );
});

test("parseAgentDecision 与 parsePreparationResult 兼容包装函数行为一致", () => {
    const validDecisionRaw = JSON.stringify({
        result: {
            kind: "wait",
            reason: "等待用户回复",
            memoryPatch: null,
        },
    });
    const decision = parseAgentDecision(validDecisionRaw);
    assert.deepEqual(decision, {
        kind: "wait",
        reason: "等待用户回复",
    });

    const validPrepRaw = JSON.stringify({
        result: {
            kind: "question",
            question: "输入是什么？",
            memoryPatch: null,
        },
    });
    const prep = parsePreparationResult(validPrepRaw, "gathering_context");
    assert.deepEqual(prep, {
        kind: "question",
        question: "输入是什么？",
    });
});
