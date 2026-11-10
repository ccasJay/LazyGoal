import assert from "node:assert/strict";
import { test } from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import { ContractValidationError } from "../../contracts/src/index";
import {
    createBoundCompletionReviewDeclaration,
    createBoundModelOutputContractBundle,
    createBoundUnifiedToolDeclarations,
    decodePhaseToolCall,
    modelOutputBindings,
    normalizeProjectionSchema,
    triggerNameSummaryBinding,
    ModelOutputContractDefinitionError,
    SHAPE_GUIDE_PREFIX,
} from "../src/index";
import type { AuthorizedToolBinding } from "../src/index";

function anyOfBranches(bundle: ReturnType<typeof createBoundModelOutputContractBundle>): readonly Record<string, unknown>[] {
    const result = (bundle.jsonSchema.properties as Record<string, unknown>).result as Record<string, unknown>;
    return Array.isArray(result.anyOf) ? result.anyOf as readonly Record<string, unknown>[] : [result];
}

function branchKinds(branches: readonly Record<string, unknown>[]): readonly string[] {
    return branches.map((branch) => {
        const kind = (branch.properties as Record<string, unknown>).kind as Record<string, unknown>;
        return (kind.enum as readonly string[])[0]!;
    });
}

function evidenceTool(): AuthorizedToolBinding {
    return {
        id: "evidence_tool",
        description: "Record evidence sequences",
        inputBinding: modelOutputBindings.systemTools.completeRun,
    };
}

test("真实生成绑定装配全部模型组合入口", () => {
    const { executing, checkpoint, completionReview, systemTools } = modelOutputBindings;
    assert.equal(executing.toolCall.contractId, "model.output.tool-call-envelope");
    assert.equal(checkpoint.contractId, "model.output.context-checkpoint");
    assert.equal(completionReview.accept.contractId, "model.output.review.accept");
    assert.equal(completionReview.reject.contractId, "model.output.review.reject");
    for (const binding of [
        executing.normalComplete,
        executing.executingComplete,
        executing.wait,
        executing.fail,
        executing.contextLookup,
        executing.toolDiscovery,
        executing.askUser,
        executing.taskProposal,
        executing.goalPlanUpdate,
        executing.runStageUpdate,
        executing.runStageComplete,
        executing.runPlanRouteUpdate,
        executing.requestThink,
        ...Object.values(systemTools),
    ]) {
        assert.match(binding.contractId, /^model\./);
        assert.equal(binding.version, 1);
    }
});

test("Trigger 名称摘要绑定拒绝额外字段并投影可移植 Provider Schema", () => {
    assert.equal(triggerNameSummaryBinding.contractId, "model.supervisor-trigger-name-summary");
    assert.equal(triggerNameSummaryBinding.version, 1);

    const valid = triggerNameSummaryBinding.read({ name: "Review dependency updates" }, "reject");
    assert.equal(valid.ok, true);
    if (valid.ok) assert.deepEqual(valid.data, { name: "Review dependency updates" });

    assert.equal(triggerNameSummaryBinding.read({ name: "Review dependency updates", extra: true }, "reject").ok, false);
    assert.equal(triggerNameSummaryBinding.read({ name: 42 }, "reject").ok, false);

    const schema = normalizeProjectionSchema(triggerNameSummaryBinding, ["trigger_name_summary"]);
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
    assert.equal(validate({ name: "Review dependency updates" }), true);
    assert.equal(validate({ name: "Review dependency updates", extra: true }), false);
});

test("生成 Provider Schema 保留数组长度、整数元素与过滤器上限", () => {
    const declarations = createBoundUnifiedToolDeclarations([], modelOutputBindings, true, false, false);
    const askUser = declarations.find((declaration) => declaration.id === "ask_user");
    assert.ok(askUser !== undefined);
    const askProperties = askUser.parametersSchema.properties as Record<string, unknown>;
    const questions = askProperties.questions as Record<string, unknown>;
    assert.equal(questions.minItems, 1);
    assert.equal(questions.maxItems, 3);
    const askItems = questions.items as Record<string, unknown>;
    const options = (askItems.properties as Record<string, unknown>).options as Record<string, unknown>;
    assert.equal(options.minItems, 2);
    assert.equal(options.maxItems, 3);

    const complete = declarations.find((declaration) => declaration.id === "system_complete_task");
    assert.ok(complete !== undefined);
    const completeProperties = complete.parametersSchema.properties as Record<string, unknown>;
    const evidence = completeProperties.evidenceSequences as Record<string, unknown>;
    const evidenceItems = evidence.items as Record<string, unknown>;
    assert.equal(evidenceItems.type, "integer");
    assert.equal(evidenceItems.minimum, 0);

    const contextLookup = declarations.find((declaration) => declaration.id === "system_context_lookup");
    assert.ok(contextLookup !== undefined);
    const request = (contextLookup.parametersSchema.properties as Record<string, unknown>).request as Record<string, unknown>;
    const history = (request.anyOf as readonly Record<string, unknown>[]).find((branch) => {
        const operation = (branch.properties as Record<string, unknown>).operation as Record<string, unknown>;
        return (operation.enum as readonly string[])[0] === "history_search";
    });
    assert.ok(history !== undefined);
    const filters = (history.properties as Record<string, unknown>).filters as Record<string, unknown>;
    const filterBranches = filters.anyOf as readonly Record<string, unknown>[] | undefined;
    const filterSchema = filterBranches === undefined ? filters : filterBranches.find((branch) => branch.type === "object")!;
    const filterProperties = filterSchema.properties as Record<string, unknown>;
    const eventTypes = (filterProperties.eventTypes as Record<string, unknown>).anyOf as readonly Record<string, unknown>[];
    const stepIndexes = (filterProperties.stepIndexes as Record<string, unknown>).anyOf as readonly Record<string, unknown>[];
    assert.equal(eventTypes[0]!.maxItems, 16);
    assert.equal(stepIndexes[0]!.maxItems, 16);
    const stepItems = stepIndexes[0]!.items as Record<string, unknown>;
    assert.equal(stepItems.type, "integer");
    assert.equal(stepItems.minimum, 0);
});

test("真实绑定拒绝越界数组与非法整数元素", () => {
    const completeRun = modelOutputBindings.systemTools.completeRun.read({
        summary: "done",
        evidenceSequences: [1.5],
    }, "strip");
    assert.equal(completeRun.ok, false);
    if (!completeRun.ok) assert.ok(completeRun.issues.some((issue) => issue.code === "invalid_type" && issue.path === "/evidenceSequences/0"));

    const negative = modelOutputBindings.systemTools.completeRun.read({
        summary: "done",
        evidenceSequences: [-1],
    }, "strip");
    assert.equal(negative.ok, false);
    if (!negative.ok) assert.ok(negative.issues.some((issue) => issue.code === "number_minimum" && issue.path === "/evidenceSequences/0"));

    const noQuestions = modelOutputBindings.systemTools.askUser.read({ questions: [] }, "strip");
    assert.equal(noQuestions.ok, false);
    if (!noQuestions.ok) assert.ok(noQuestions.issues.some((issue) => issue.code === "array_min_items" && issue.path === "/questions"));

    const oneOption = modelOutputBindings.systemTools.askUser.read({
        questions: [{
            header: "h",
            question: "q",
            options: [{ label: "only" }],
            multiSelect: false,
        }],
    }, "strip");
    assert.equal(oneOption.ok, false);
    if (!oneOption.ok) assert.ok(oneOption.issues.some((issue) => issue.code === "array_min_items" && issue.path === "/questions/0/options"));

    const tooManyFilters = modelOutputBindings.systemTools.contextLookup.read({
        request: {
            operation: "history_search",
            need: "historical_execution",
            question: "find",
            filters: { eventTypes: Array.from({ length: 17 }, () => "tool") },
        },
    }, "strip");
    assert.equal(tooManyFilters.ok, false);
    if (!tooManyFilters.ok) assert.ok(tooManyFilters.issues.some((issue) => issue.code === "array_max_items" && issue.path === "/request/filters/eventTypes"));

    const badStepIndex = modelOutputBindings.systemTools.contextLookup.read({
        request: {
            operation: "history_search",
            need: "historical_execution",
            question: "find",
            filters: { stepIndexes: [-1] },
        },
    }, "strip");
    assert.equal(badStepIndex.ok, false);
    if (!badStepIndex.ok) assert.ok(badStepIndex.issues.some((issue) => issue.code === "number_minimum" && issue.path === "/request/filters/stepIndexes/0"));

    const emptyEvidence = modelOutputBindings.systemTools.completeTask.read({
        summary: "done",
        completionEvidence: [],
        memoryPatch: {
            protocolVersion: 1,
            operations: [{
                type: "upsert_fact",
                fact: {
                    subject: "s",
                    predicate: "p",
                    value: true,
                    stability: "stable",
                    evidenceSequences: [],
                },
            }],
        },
    }, "strip");
    assert.equal(emptyEvidence.ok, false);
    if (!emptyEvidence.ok) {
        assert.ok(emptyEvidence.issues.some((issue) => issue.code === "array_min_items" && issue.path === "/memoryPatch/operations/0/fact/evidenceSequences"));
    }
});

test("真实绑定驱动动态组合、诊断与授权拒绝", () => {
    const tool = evidenceTool();
    const bundle = createBoundModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [tool],
        allowThink: true,
    }, modelOutputBindings);
    assert.equal(branchKinds(anyOfBranches(bundle)).includes("tool_call"), true);

    const diagnostics: string[] = [];
    const decoded = bundle.decode({
        result: {
            kind: "tool_call",
            action: { actionId: "a1", toolId: "evidence_tool", input: { summary: "done", evidenceSequences: [1], memoryPatch: null, debug: true } },
            memoryPatch: null,
            contextNotes: null,
        },
    }, { onDiagnostic: (diagnostic) => diagnostics.push(...diagnostic.paths) });
    assert.equal(decoded.kind, "tool_call");
    assert.deepEqual(diagnostics, ["/result/action/input/*"]);

    assert.throws(
        () => bundle.decode({
            result: {
                kind: "tool_call",
                action: { actionId: "a1", toolId: "evidence_tool", input: { summary: "done", evidenceSequences: [0.5], memoryPatch: null } },
                memoryPatch: null,
                contextNotes: null,
            },
        }),
        (error: unknown) => error instanceof ContractValidationError,
    );
    assert.throws(
        () => bundle.decode({
            result: {
                kind: "tool_call",
                action: { actionId: "a1", toolId: "unknown_tool", input: { summary: "done", evidenceSequences: [1], memoryPatch: null } },
                memoryPatch: null,
                contextNotes: null,
            },
        }),
        (error: unknown) => error instanceof ContractValidationError,
    );
    assert.throws(
        () => createBoundModelOutputContractBundle({
            kind: "executing",
            authorizedTools: [tool, { ...tool }],
        }, modelOutputBindings),
        (error: unknown) => error instanceof ModelOutputContractDefinitionError,
    );
    assert.throws(
        () => bundle.decode({
            result: {
                kind: "ask_user",
                questions: [],
                memoryPatch: null,
                contextNotes: null,
            },
        }),
        (error: unknown) => error instanceof ContractValidationError,
    );
});

test("真实绑定支持 strict 与 prompt-only 共用可移植 Schema", () => {
    const bundle = createBoundModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [evidenceTool()],
        allowThink: true,
    }, modelOutputBindings);
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(bundle.jsonSchema);
    assert.equal(validate({
        result: {
            kind: "tool_call",
            action: { actionId: "a1", toolId: "evidence_tool", input: { summary: "done", evidenceSequences: [1], memoryPatch: null } },
            memoryPatch: null,
            contextNotes: null,
        },
    }), true);
    assert.equal(validate({
        result: { kind: "ask_user", questions: [{ header: "h", question: "q", options: [{ label: "a", description: null }, { label: "b", description: null }], multiSelect: false }], memoryPatch: null },
    }), true);
    assert.equal(validate({
        result: { kind: "ask_user", questions: [{ header: "h", question: "q", options: [{ label: "a", description: null }], multiSelect: false }], memoryPatch: null },
    }), false);
    assert.equal(bundle.shapeGuide.startsWith(SHAPE_GUIDE_PREFIX), true);
    assert.equal(JSON.parse(bundle.shapeGuide.slice(SHAPE_GUIDE_PREFIX.length + 1)).type, "object");

    for (const declaration of createBoundUnifiedToolDeclarations([], modelOutputBindings, true, false, false)) {
        assert.doesNotThrow(() => new Ajv2020({ strict: true, allErrors: true }).compile(declaration.parametersSchema));
        const probe = declaration.id === "ask_user"
            ? { questions: [{ header: "h", question: "q", options: [{ label: "a", description: null }, { label: "b", description: null }], multiSelect: false }], memoryPatch: null }
            : declaration.id === "system_context_checkpoint"
                ? {}
                : undefined;
        if (probe !== undefined) {
            assert.equal(decodePhaseToolCall([declaration], declaration.id, probe) instanceof Object, true);
        }
    }
});

test("完成审查绑定保留拒绝反馈约束", () => {
    const declaration = createBoundCompletionReviewDeclaration(modelOutputBindings);
    assert.deepEqual(declaration.decode({ result: { kind: "accept" } }), { kind: "accept" });
    assert.deepEqual(declaration.decode({ result: { kind: "reject", feedback: "缺少验证" } }), { kind: "reject", feedback: "缺少验证" });
    assert.throws(
        () => declaration.decode({ result: { kind: "reject", feedback: "   " } }),
        (error: unknown) => error instanceof ContractValidationError,
    );
    assert.throws(
        () => declaration.decode({ result: { kind: "reject" } }),
        (error: unknown) => error instanceof ContractValidationError,
    );
});
