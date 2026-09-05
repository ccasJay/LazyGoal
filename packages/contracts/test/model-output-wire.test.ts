import assert from "node:assert/strict";
import { test } from "node:test";

import {
    contract,
    ContractValidationError,
    createModelOutputContractBundle,
    decodeWireResult,
    deriveWireContract,
    deriveWireEnvelopeContract,
    GatheringPreparationResultContract,
    GoalTaskContract,
    ModelContextCheckpointResultContract,
    ModelOutputContractDefinitionError,
    OrdinaryExecutingDecisionContract,
    PlanningPreparationResultContract,
    PreparationResultContract,
    QuestionPreparationResultContract,
    safeParse,
} from "../src/index";

test("deriveWireEnvelopeContract 严格要求顶层仅含必填 result envelope（Req 2.1）", () => {
    const envelopeContract = deriveWireEnvelopeContract(GoalTaskContract);

    // 合法 envelope
    const valid = {
        result: {
            objective: "完成目标",
            completionCriteria: ["标准 1"],
        },
    };
    const validParsed = safeParse(envelopeContract, valid);
    assert.equal(validParsed.success, true);

    // 缺少 result 字段（旧响应直接作为 payload）
    const noEnvelope = {
        objective: "完成目标",
        completionCriteria: ["标准 1"],
    };
    const noEnvelopeParsed = safeParse(envelopeContract, noEnvelope);
    assert.equal(noEnvelopeParsed.success, false);
    if (!noEnvelopeParsed.success) {
        assert.equal(noEnvelopeParsed.issues[0]?.code, "missing_field");
        assert.deepEqual(noEnvelopeParsed.issues[0]?.path, ["result"]);
    }

    // 顶层包含额外字段
    const extraFields = {
        result: {
            objective: "完成目标",
            completionCriteria: ["标准 1"],
        },
        extraMetadata: "malicious",
    };
    const extraParsed = safeParse(envelopeContract, extraFields);
    assert.equal(extraParsed.success, false);
    if (!extraParsed.success) {
        assert.equal(extraParsed.issues[0]?.code, "extra_field");
        assert.deepEqual(extraParsed.issues[0]?.path, ["extraMetadata"]);
    }
});

test("Wire 契约拒绝缺少必填字段、错误 null 以及额外字段（Req 2.2, Req 2.3）", () => {
    const envelopeContract = deriveWireEnvelopeContract(QuestionPreparationResultContract);

    // 必填字段传 null（错误 null）
    const nullQuestion = {
        result: {
            kind: "question",
            question: null,
        },
    };
    assert.equal(safeParse(envelopeContract, nullQuestion).success, false);

    // 缺少必填字段
    const missingQuestion = {
        result: {
            kind: "question",
        },
    };
    assert.equal(safeParse(envelopeContract, missingQuestion).success, false);

    // 额外字段
    const extraField = {
        result: {
            kind: "question",
            question: "请问需要什么？",
            unexpectedField: "hack",
        },
    };
    assert.equal(safeParse(envelopeContract, extraField).success, false);
});

test("decodeWireResult 递归消除 optional 占位 null，保留业务合法 null（Req 2.2, Req 2.4）", () => {
    // 1. 单层 optional 字段传 null：在解码后被省略
    const wireComplete = {
        result: {
            kind: "complete",
            summary: "任务已完成",
            completionEvidence: [
                {
                    criterionIndex: 0,
                    evidenceSequences: [1, 2],
                },
            ],
            memoryPatch: null, // optional 字段占位 null
        },
    };
    const decodedComplete = decodeWireResult(wireComplete, OrdinaryExecutingDecisionContract);
    assert.equal(decodedComplete.kind, "complete");
    if (decodedComplete.kind === "complete") {
        assert.equal(decodedComplete.summary, "任务已完成");
        assert.equal(decodedComplete.memoryPatch, undefined);
        assert.equal("memoryPatch" in decodedComplete, false);
    }

    // 2. 单层 optional 字段传有效值：在解码后被保留
    const wireCompleteWithPatch = {
        result: {
            kind: "complete",
            summary: "任务已完成",
            completionEvidence: [],
            memoryPatch: {
                protocolVersion: 1,
                operations: [],
            },
        },
    };
    const decodedWithPatch = decodeWireResult(wireCompleteWithPatch, OrdinaryExecutingDecisionContract);
    if (decodedWithPatch.kind === "complete") {
        assert.notEqual(decodedWithPatch.memoryPatch, undefined);
        assert.equal(decodedWithPatch.memoryPatch?.protocolVersion, 1);
    }

    // 3. 嵌套 optional 字段：filters 内部的 null 字段被省略，有效字段保留
    const wireLookup = {
        result: {
            kind: "context_lookup",
            need: "historical_execution",
            question: "查找错误日志",
            filters: {
                eventTypes: null,
                sequenceRange: null,
                toolIds: ["read_file"],
                actionIds: null,
                stepIndexes: null,
                paths: null,
                errorCodes: null,
                objectIds: null,
            },
        },
    };
    const decodedLookup = decodeWireResult(wireLookup, OrdinaryExecutingDecisionContract);
    assert.equal(decodedLookup.kind, "context_lookup");
    if (decodedLookup.kind === "context_lookup") {
        assert.deepEqual(decodedLookup.filters, { toolIds: ["read_file"] });
        assert.equal("eventTypes" in (decodedLookup.filters ?? {}), false);
    }

    // 4. filters 本身为 null：整个 filters 属性被省略
    const wireLookupNullFilters = {
        result: {
            kind: "context_lookup",
            need: "historical_execution",
            question: "查找错误日志",
            filters: null,
        },
    };
    const decodedLookupNullFilters = decodeWireResult(wireLookupNullFilters, OrdinaryExecutingDecisionContract);
    if (decodedLookupNullFilters.kind === "context_lookup") {
        assert.equal(decodedLookupNullFilters.filters, undefined);
        assert.equal("filters" in decodedLookupNullFilters, false);
    }

    // 5. 业务合法 null（Fact value 为 null）：必须原样保留，不得被消除！
    const wireFactWithNull = {
        result: {
            kind: "context_ready",
            memoryPatch: {
                protocolVersion: 1,
                operations: [
                    {
                        type: "upsert_fact",
                        fact: {
                            subject: "database.config",
                            predicate: "password",
                            value: null, // 业务合法 null
                            stability: "stable",
                            evidenceSequences: [5],
                        },
                    },
                ],
            },
        },
    };
    const decodedContextReady = decodeWireResult(wireFactWithNull, GatheringPreparationResultContract);
    assert.equal(decodedContextReady.kind, "context_ready");
    if (decodedContextReady.kind === "context_ready") {
        const op = decodedContextReady.memoryPatch?.operations[0];
        assert.equal(op?.type, "upsert_fact");
        if (op?.type === "upsert_fact") {
            assert.strictEqual(op.fact.value, null);
        }
    }
});

test("派生器拒绝 optional(nullable(...)) 等不可逆或不可移植定义", () => {
    // 1. optional(nullable(...))
    const ambiguousContract = contract.object({
        ambiguous: contract.optional(contract.nullable(contract.string())),
    });
    assert.throws(
        () => deriveWireContract(ambiguousContract),
        (error: unknown) => {
            assert(error instanceof ModelOutputContractDefinitionError);
            assert.equal(error.code, "INVALID_MODEL_OUTPUT_CONTRACT");
            assert.deepEqual(error.path, ["ambiguous"]);
            return true;
        },
    );

    // 2. 动态 record
    const recordContract = contract.object({
        map: contract.record(contract.string()),
    });
    assert.throws(
        () => deriveWireContract(recordContract),
        (error: unknown) => {
            assert(error instanceof ModelOutputContractDefinitionError);
            assert.deepEqual(error.path, ["map"]);
            return true;
        },
    );

    // 3. 不可移植字符串 pattern
    const patternContract = contract.object({
        email: contract.string({ pattern: "^[a-z]+$" }),
    });
    assert.throws(
        () => deriveWireContract(patternContract),
        (error: unknown) => {
            assert(error instanceof ModelOutputContractDefinitionError);
            assert.deepEqual(error.path, ["email"]);
            return true;
        },
    );
});

test("decodeWireResult 生成稳定深复制并隔离输入引用", () => {
    const originalInput = {
        result: {
            kind: "question",
            question: "请确认方案",
        },
    };

    const decoded = decodeWireResult(originalInput, PreparationResultContract);
    assert.deepEqual(decoded, { kind: "question", question: "请确认方案" });
    assert.notStrictEqual(decoded, originalInput.result);

    // 修改输入对象，解码出的对象不受影响
    (originalInput.result as Record<string, unknown>).question = "被修改的题目";
    if (decoded.kind === "question") {
        assert.equal(decoded.question, "请确认方案");
    }
});

test("createModelOutputContractBundle 支持四类请求并正确派生与解码（Req 1.1）", () => {
    // 1. gathering
    const gatheringBundle = createModelOutputContractBundle({ kind: "gathering" });
    assert.equal(gatheringBundle.name, "gathering_preparation_result");
    assert.equal("$schema" in gatheringBundle.jsonSchema, false);
    assert(gatheringBundle.shapeGuide.includes("Respond with a JSON object conforming to the following schema:"));

    const gatheringDecoded = gatheringBundle.decode({
        result: {
            kind: "question",
            question: "需要分析哪个目录？",
            memoryPatch: null,
        },
    });
    assert.equal(gatheringDecoded.kind, "question");
    if (gatheringDecoded.kind === "question") {
        assert.equal(gatheringDecoded.memoryPatch, undefined);
    }

    // 2. planning
    const planningBundle = createModelOutputContractBundle({ kind: "planning" });
    assert.equal(planningBundle.name, "planning_preparation_result");
    const planningDecoded = planningBundle.decode({
        result: {
            kind: "task_proposal",
            task: {
                objective: "编写任务列表",
                completionCriteria: ["任务分解完成"],
            },
            approvalRequest: "请审批任务草案",
            memoryPatch: null,
        },
    });
    assert.equal(planningDecoded.kind, "task_proposal");
    if (planningDecoded.kind === "task_proposal") {
        assert.equal(planningDecoded.memoryPatch, undefined);
    }

    // 3. executing
    const executingBundle = createModelOutputContractBundle({ kind: "executing" });
    assert.equal(executingBundle.name, "executing_agent_decision");
    const executingDecoded = executingBundle.decode({
        result: {
            kind: "wait",
            reason: "等待后台任务完成",
            memoryPatch: null,
        },
    });
    assert.equal(executingDecoded.kind, "wait");

    // 4. checkpoint
    const checkpointBundle = createModelOutputContractBundle({ kind: "checkpoint" });
    assert.equal(checkpointBundle.name, "context_checkpoint_result");
    const checkpointDecoded = checkpointBundle.decode({
        result: {
            kind: "context_checkpoint",
            memoryPatch: null,
        },
    });
    assert.equal(checkpointDecoded.kind, "context_checkpoint");
    if (checkpointDecoded.kind === "context_checkpoint") {
        assert.equal(checkpointDecoded.memoryPatch, undefined);
    }
});

test("decodeWireResult 在解码后以 canonical Contract 复验并拦截非法数据", () => {
    // 构造具有 result envelope 但内部缺失必填字段的对象
    const invalidPayload = {
        result: {
            kind: "question",
        },
    };
    assert.throws(
        () => decodeWireResult(invalidPayload, PreparationResultContract),
        (error: unknown) => {
            assert(error instanceof ContractValidationError);
            assert.equal(error.code, "CONTRACT_VALIDATION_FAILED");
            return true;
        },
    );
});

test("无授权 Tool 时 executing 拒绝 tool_call 分支（Req 3.5）", () => {
    const executingBundle = createModelOutputContractBundle({ kind: "executing" });
    const invalidToolCall = {
        result: {
            kind: "tool_call",
            action: {
                actionId: "action-1",
                toolId: "unauthorized_tool",
                input: {},
            },
            memoryPatch: null,
        },
    };
    assert.throws(
        () => executingBundle.decode(invalidToolCall),
        (error: unknown) => {
            assert(error instanceof ContractValidationError);
            return true;
        },
    );
});

