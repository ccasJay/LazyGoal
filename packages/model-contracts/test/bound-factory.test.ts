import assert from "node:assert/strict";
import { test } from "node:test";

import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020.js";

import { ContractValidationError } from "../../contracts/src/index";
import {
    createContractBinding,
    type ContractBinding,
    type ContractReadResult,
    type ContractSchemaNode,
} from "../../contract-binding/src/index";
import {
    createBoundCheckpointToolDeclarations,
    createBoundCompletionReviewDeclaration,
    createBoundModelOutputContractBundle,
    createBoundUnifiedToolDeclarations,
    decodePhaseToolCall,
    ModelOutputContractDefinitionError,
    SHAPE_GUIDE_PREFIX,
} from "../src/index";
import { LLMResponseProtocolError, parseModelOutput } from "../../model-response/src/index";
import type {
    AuthorizedToolBinding,
    ExecutingDecisionBindings,
    ModelOutputBindingSet,
    SystemToolBindingSet,
} from "../src/index";
import type {
    AgentDecision,
    CompletionReviewAccept,
    CompletionReviewReject,
    ToolCallDecisionEnvelope,
} from "../src/model-output/schema-types";

const draftDialect = "http://json-schema.org/draft-07/schema#";

function objectSchema(
    kind: string,
    properties: Readonly<Record<string, unknown>> = {},
    required: readonly string[] = [],
): Record<string, unknown> {
    return {
        type: "object",
        properties: { kind: { const: kind }, ...properties },
        required: ["kind", ...required],
        additionalProperties: false,
    };
}

function emptyObjectSchema(): Record<string, unknown> {
    return { type: "object", properties: {}, required: [], additionalProperties: false };
}

function binding<T>(contractId: string, schema: Record<string, unknown>): ContractBinding<T> {
    const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
    return createContractBinding<T>({
        contractId,
        version: 1,
        schema: schema as ContractSchemaNode,
        validate,
    });
}

function toolCallEnvelopeBinding(): ContractBinding<ToolCallDecisionEnvelope> {
    const schema = {
        $schema: draftDialect,
        type: "object",
        properties: {
            kind: { const: "tool_call" },
            action: {
                type: "object",
                properties: {
                    actionId: { type: "string" },
                    toolId: { type: "string" },
                },
                required: ["actionId", "toolId"],
                additionalProperties: false,
            },
            memoryPatch: {
                anyOf: [
                    emptyObjectSchema(),
                    { type: "null" },
                ],
            },
        },
        required: ["kind", "action", "memoryPatch"],
        additionalProperties: false,
    };
    const contractId = "test.model.tool-call";
    const projection = {
        schema,
        localConstraints: [],
        decode(value: unknown): ContractReadResult<ToolCallDecisionEnvelope> {
            const copied = clone(value);
            if (copied === undefined) {
                return {
                    ok: false,
                    contractId,
                    version: 1,
                    issues: [{ path: "", code: "type" }],
                    truncated: false,
                };
            }
            const mutable = copied as unknown as { memoryPatch?: unknown };
            if (mutable.memoryPatch === null) delete mutable.memoryPatch;
            return { ok: true, data: copied };
        },
    };
    return {
        contractId,
        version: 1,
        schema: schema as ContractSchemaNode,
        read(value: unknown): ContractReadResult<ToolCallDecisionEnvelope> {
            return projection.decode(value);
        },
        modelProjection() {
            return projection;
        },
    };
}

function clone(value: unknown): ToolCallDecisionEnvelope | undefined {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    return JSON.parse(JSON.stringify(value)) as ToolCallDecisionEnvelope;
}

const memoryPatchSchema = {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
} as const;

function executingBindings(): ExecutingDecisionBindings {
    return {
        toolCall: toolCallEnvelopeBinding(),
        normalComplete: binding("test.model.complete.normal", objectSchema("complete", {
            summary: { type: "string" },
            evidenceSequences: { type: "array", items: { type: "number" } },
            memoryPatch: memoryPatchSchema,
        }, ["summary", "evidenceSequences"])),
        executingComplete: binding("test.model.complete.plan", objectSchema("complete", {
            summary: { type: "string" },
            completionEvidence: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        criterionIndex: { type: "number" },
                        evidenceSequences: { type: "array", items: { type: "number" } },
                    },
                    required: ["criterionIndex", "evidenceSequences"],
                    additionalProperties: false,
                },
            },
        }, ["summary", "completionEvidence"])),
        wait: binding("test.model.wait", objectSchema("wait", {
            reason: { type: "string" },
            memoryPatch: memoryPatchSchema,
        }, ["reason"])),
        fail: binding("test.model.fail", objectSchema("fail", {
            error: { type: "string" },
        }, ["error"])),
        contextLookup: binding("test.model.context-lookup", objectSchema("context_lookup", {
            question: { type: "string" },
        })),
        toolDiscovery: binding("test.model.tool-discovery", objectSchema("tool_discovery", {
            query: { type: "string" },
        }, ["query"])),
        askUser: binding("test.model.ask-user", objectSchema("ask_user", {
            questions: { type: "array", items: emptyObjectSchema() },
        }, ["questions"])),
        taskProposal: binding("test.model.task-proposal", objectSchema("task_proposal", {
            task: emptyObjectSchema(),
            planRoute: emptyObjectSchema(),
            approvalRequest: { type: "string" },
        }, ["task", "planRoute", "approvalRequest"])),
        goalPlanUpdate: binding("test.model.goal-plan-update", objectSchema("goal_plan_update", {
            baseRevision: { type: "number" },
            operations: { type: "array", items: emptyObjectSchema() },
        }, ["baseRevision", "operations"])),
        runStageUpdate: binding("test.model.run-stage-update", objectSchema("run_stage_update", {
            target: { type: "string" },
            acceptanceCriteria: { type: "array", items: { type: "string" } },
        }, ["target", "acceptanceCriteria"])),
        runStageComplete: binding("test.model.run-stage-complete", objectSchema("run_stage_complete", {
            stageId: { type: "string" },
            summary: { type: "string" },
        }, ["stageId", "summary"])),
        runPlanRouteUpdate: binding("test.model.run-plan-route-update", objectSchema("run_plan_route_update", {
            baseRevision: { type: "number" },
            reason: { type: "string" },
            route: emptyObjectSchema(),
        }, ["baseRevision", "reason", "route"])),
        requestThink: binding("test.model.request-think", objectSchema("request_think", {
            goal: { type: "string" },
        }, ["goal"])),
    };
}

function systemToolBindings(): SystemToolBindingSet {
    return {
        completionReview: binding("test.system.review-completion", {
            type: "object",
            properties: {
                result: {
                    type: "object",
                    properties: {
                        kind: { enum: ["accept", "reject"] },
                        feedback: { type: "string" },
                    },
                    required: ["kind"],
                    additionalProperties: false,
                },
            },
            required: ["result"],
            additionalProperties: false,
        }),
        completeTask: binding("test.system.complete-task", {
            type: "object",
            properties: {
                summary: { type: "string" },
                completionEvidence: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            criterionIndex: { type: "number" },
                            evidenceSequences: { type: "array", items: { type: "number" } },
                        },
                        required: ["criterionIndex", "evidenceSequences"],
                        additionalProperties: false,
                    },
                },
            },
            required: ["summary", "completionEvidence"],
            additionalProperties: false,
        }),
        completeRun: binding("test.system.complete-run", {
            type: "object",
            properties: {
                summary: { type: "string" },
                evidenceSequences: { type: "array", items: { type: "number" } },
            },
            required: ["summary", "evidenceSequences"],
            additionalProperties: false,
        }),
        waitForInput: binding("test.system.wait", {
            type: "object",
            properties: { reason: { type: "string" } },
            required: ["reason"],
            additionalProperties: false,
        }),
        failGoal: binding("test.system.fail", {
            type: "object",
            properties: { error: { type: "string" } },
            required: ["error"],
            additionalProperties: false,
        }),
        contextLookup: binding("test.system.context-lookup", emptyObjectSchema()),
        findTools: binding("test.system.find-tools", {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
            additionalProperties: false,
        }),
        askUser: binding("test.system.ask-user", {
            type: "object",
            properties: {
                questions: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            header: { type: "string" },
                            question: { type: "string" },
                            options: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        label: { type: "string" },
                                        description: { type: "string" },
                                    },
                                    required: ["label"],
                                    additionalProperties: false,
                                },
                            },
                            multiSelect: { type: "boolean" },
                        },
                        required: ["header", "question", "options", "multiSelect"],
                        additionalProperties: false,
                    },
                },
            },
            required: ["questions"],
            additionalProperties: false,
        }),
        proposeTaskPlan: binding("test.system.propose-task-plan", emptyObjectSchema()),
        updatePlanRoute: binding("test.system.update-plan-route", emptyObjectSchema()),
        contextCheckpoint: binding("test.system.checkpoint", emptyObjectSchema()),
        updateGoalPlan: binding("test.system.update-goal-plan", emptyObjectSchema()),
        startRunStage: binding("test.system.start-run-stage", {
            type: "object",
            properties: {
                target: { type: "string" },
                acceptanceCriteria: { type: "array", items: { type: "string" } },
            },
            required: ["target", "acceptanceCriteria"],
            additionalProperties: false,
        }),
        reviseRunStage: binding("test.system.revise-run-stage", {
            type: "object",
            properties: {
                target: { type: "string" },
                acceptanceCriteria: { type: "array", items: { type: "string" } },
                reason: { type: "string" },
            },
            required: ["target", "acceptanceCriteria", "reason"],
            additionalProperties: false,
        }),
        completeRunStage: binding("test.system.complete-run-stage", {
            type: "object",
            properties: {
                summary: { type: "string" },
                evidenceSequences: { type: "array", items: { type: "number" } },
            },
            required: ["summary", "evidenceSequences"],
            additionalProperties: false,
        }),
        startNextRunStage: binding("test.system.start-next-run-stage", emptyObjectSchema()),
        requestThink: binding("test.system.request-think", {
            type: "object",
            properties: { goal: { type: "string" } },
            required: ["goal"],
            additionalProperties: false,
        }),
    };
}

function modelBindings(): ModelOutputBindingSet {
    return {
        executing: executingBindings(),
        checkpoint: binding("test.model.checkpoint", objectSchema("context_checkpoint")),
        completionReview: {
            accept: binding<CompletionReviewAccept>("test.model.review.accept", objectSchema("accept")),
            reject: binding<CompletionReviewReject>("test.model.review.reject", objectSchema("reject", {
                feedback: { type: "string" },
            }, ["feedback"])),
        },
        systemTools: systemToolBindings(),
    };
}

function readTool(id: string): AuthorizedToolBinding {
    return {
        id,
        description: `Read with ${id}`,
        inputBinding: binding(`${id}.input`, {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
            additionalProperties: false,
        }),
        isReadOnly: true,
    };
}

function writeTool(id: string): AuthorizedToolBinding {
    return {
        id,
        description: `Write with ${id}`,
        inputBinding: binding(`${id}.input`, {
            type: "object",
            properties: {
                path: { type: "string" },
                content: { type: "string" },
            },
            required: ["path", "content"],
            additionalProperties: false,
        }),
    };
}

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

function branchToolIds(branches: readonly Record<string, unknown>[]): readonly string[] {
    return branches.flatMap((branch) => {
        const properties = branch.properties as Record<string, unknown>;
        if (branchKinds([branch])[0] !== "tool_call") return [];
        const action = properties.action as Record<string, unknown>;
        const actionProperties = action.properties as Record<string, unknown>;
        const toolId = actionProperties.toolId as Record<string, unknown>;
        return (toolId.enum as readonly string[])[0]!;
    });
}

test("授权工具、阶段与模式动态组合 Provider Schema", () => {
    const bindings = modelBindings();
    const bundle = createBoundModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [writeTool("write_file"), readTool("read_file")],
    }, bindings);
    const branches = anyOfBranches(bundle);
    assert.equal(branches.length, 10);
    assert.deepEqual(branchToolIds(branches), ["read_file", "write_file"]);
    assert.deepEqual(branchKinds(branches).slice(0, 2), ["tool_call", "tool_call"]);

    const noTools = createBoundModelOutputContractBundle({ kind: "executing", authorizedTools: [] }, bindings);
    assert.equal(anyOfBranches(noTools).some((branch) => branchKinds([branch])[0] === "tool_call"), false);
    assert.equal(anyOfBranches(noTools).length, 8);

    const planUnapproved = createBoundModelOutputContractBundle({
        kind: "executing",
        taskPresent: false,
        planMode: true,
        authorizedTools: [readTool("read_file")],
    }, bindings);
    const planKinds = branchKinds(anyOfBranches(planUnapproved));
    assert.equal(planKinds.includes("task_proposal"), true);
    assert.equal(planKinds.includes("wait"), false);
    assert.equal(planKinds.includes("goal_plan_update"), true);

    const think = createBoundModelOutputContractBundle({
        kind: "executing",
        allowThink: true,
        allowToolDiscovery: false,
    }, bindings);
    const thinkKinds = branchKinds(anyOfBranches(think));
    assert.equal(thinkKinds.includes("request_think"), true);
    assert.equal(thinkKinds.includes("tool_discovery"), false);
});

test("解码按未改动判别值选择分支，并拒绝未知或未授权工具", () => {
    const bindings = modelBindings();
    const bundle = createBoundModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [readTool("read_file")],
    }, bindings);

    const diagnostics: string[] = [];
    const decoded = bundle.decode({
        result: {
            kind: "tool_call",
            action: { actionId: "a1", toolId: "read_file", input: { path: "README.md", debug: true } },
            memoryPatch: null,
        },
    }, { onDiagnostic: (diagnostic) => diagnostics.push(...diagnostic.paths) });
    assert.equal(decoded.kind, "tool_call");
    if (decoded.kind === "tool_call") {
        assert.deepEqual(decoded.action.input, { path: "README.md" });
        assert.equal("memoryPatch" in decoded, false);
    }
    assert.deepEqual(diagnostics, ["/result/action/input/*"]);

    assert.throws(
        () => bundle.decode({
            result: {
                kind: "tool_call",
                action: { actionId: "a1", toolId: "read_file", input: { path: 42 } },
                memoryPatch: null,
            },
        }),
        (error: unknown) => error instanceof ContractValidationError
            && error.issues.some((issue) => issue.path.join(".") === "result.action.input.path"),
    );

    assert.throws(
        () => bundle.decode({
            result: {
                kind: "tool_call",
                action: { actionId: "a1", toolId: "bash", input: { command: "ls" } },
                memoryPatch: null,
            },
        }),
        (error: unknown) => error instanceof ContractValidationError,
    );

    assert.throws(
        () => bundle.decode({ result: { kind: "unknown_kind" } }),
        (error: unknown) => error instanceof ContractValidationError,
    );
    assert.throws(
        () => bundle.decode({ decision: { kind: "wait" } }),
        (error: unknown) => error instanceof ContractValidationError,
    );
    assert.throws(
        () => bundle.decode({ result: { kind: "wait", reason: "阻塞" }, extra: true }),
        (error: unknown) => error instanceof ContractValidationError,
    );
});

test("空 ID 与重复 ID 在组合前拒绝", () => {
    const bindings = modelBindings();
    assert.throws(
        () => createBoundModelOutputContractBundle({
            kind: "executing",
            authorizedTools: [{
                id: "  ",
                description: "Blank id",
                inputBinding: readTool("x").inputBinding,
            }],
        }, bindings),
        (error: unknown) => error instanceof ModelOutputContractDefinitionError,
    );
    assert.throws(
        () => createBoundModelOutputContractBundle({
            kind: "executing",
            authorizedTools: [readTool("read_file"), readTool("read_file")],
        }, bindings),
        (error: unknown) => error instanceof ModelOutputContractDefinitionError,
    );
});

test("optional null 消除，业务 null 与已知字段错误保持", () => {
    const bindings = modelBindings();
    const bundle = createBoundModelOutputContractBundle({ kind: "executing" }, bindings);

    const waited = bundle.decode({ result: { kind: "wait", reason: "等待用户", memoryPatch: null } });
    assert.equal(waited.kind, "wait");
    assert.equal("memoryPatch" in waited, false);

    const withPatch = bundle.decode({ result: { kind: "wait", reason: "等待用户", memoryPatch: {} } });
    assert.equal(withPatch.kind, "wait");
    assert.notEqual(withPatch.memoryPatch, undefined);

    const nullTool: AuthorizedToolBinding = {
        id: "null_value",
        description: "Accept a business null",
        inputBinding: binding("null_value.input", {
            type: "object",
            properties: { value: { enum: [null, "text"] } },
            required: ["value"],
            additionalProperties: false,
        }),
    };
    const nullBundle = createBoundModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [nullTool],
    }, bindings);
    const nullDecoded = nullBundle.decode({
        result: {
            kind: "tool_call",
            action: { actionId: "a1", toolId: "null_value", input: { value: null } },
            memoryPatch: null,
        },
    });
    assert.equal(nullDecoded.kind, "tool_call");
    if (nullDecoded.kind === "tool_call") {
        assert.deepEqual(nullDecoded.action.input, { value: null });
    }
});

test("Provider 无法表达的本地约束在解码时强制", () => {
    const localBinding = binding("absolute_path.input", {
        type: "object",
        properties: { path: { type: "string", pattern: "^/" } },
        required: ["path"],
        additionalProperties: false,
    });
    const absolutePathBinding: ContractBinding<unknown> = {
        ...localBinding,
        modelProjection() {
            return {
                schema: {
                    $schema: draftDialect,
                    type: "object",
                    properties: { path: { type: "string" } },
                    required: ["path"],
                    additionalProperties: false,
                },
                localConstraints: [],
                decode: (value: unknown) => localBinding.read(value, "strip"),
            };
        },
    };
    const absolutePathTool: AuthorizedToolBinding = {
        id: "absolute_path",
        description: "Require an absolute path",
        inputBinding: absolutePathBinding,
    };
    const bundle = createBoundModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [absolutePathTool],
    }, modelBindings());
    const serialized = JSON.stringify(bundle.jsonSchema);
    assert.equal(serialized.includes("pattern"), false);

    assert.throws(
        () => bundle.decode({
            result: {
                kind: "tool_call",
                action: { actionId: "a1", toolId: "absolute_path", input: { path: "relative" } },
                memoryPatch: null,
            },
        }),
        (error: unknown) => error instanceof ContractValidationError
            && error.issues.some((issue) => issue.path.join(".") === "result.action.input.path"),
    );

    const decoded = bundle.decode({
        result: {
            kind: "tool_call",
            action: { actionId: "a1", toolId: "absolute_path", input: { path: "/tmp/file" } },
            memoryPatch: null,
        },
    });
    assert.equal(decoded.kind, "tool_call");
});

test("Checkpoint 与 Completion Review 使用独立分支集合", () => {
    const bindings = modelBindings();
    const checkpoint = createBoundModelOutputContractBundle({ kind: "checkpoint" }, bindings);
    assert.deepEqual(branchKinds(anyOfBranches(checkpoint)), ["context_checkpoint"]);
    const checkpointValue = checkpoint.decode({ result: { kind: "context_checkpoint" } });
    assert.equal(checkpointValue.kind, "context_checkpoint");

    const review = createBoundModelOutputContractBundle({ kind: "completion_review" }, bindings);
    assert.deepEqual(branchKinds(anyOfBranches(review)), ["accept", "reject"]);
    assert.deepEqual(review.decode({ result: { kind: "accept" } }), { kind: "accept" });
    assert.deepEqual(
        review.decode({ result: { kind: "reject", feedback: "缺少验证" } }),
        { kind: "reject", feedback: "缺少验证" },
    );
    assert.throws(
        () => review.decode({ result: { kind: "reject", feedback: "   " } }),
        (error: unknown) => error instanceof ContractValidationError,
    );
});

test("统一工具声明按模式组合并复用同源绑定解码", () => {
    const bindings = modelBindings();
    const tools = [readTool("read_file")];

    const normal = createBoundUnifiedToolDeclarations(tools, bindings, true, false, false);
    const normalIds = normal.map((declaration) => declaration.id);
    assert.ok(normalIds.includes("system_complete_task"));
    assert.ok(normalIds.includes("system_find_tools"));
    assert.ok(normalIds.includes("ask_user"));
    assert.equal(normalIds.includes("system_update_plan_route"), false);
    assert.equal(normalIds.includes("system_propose_task_plan"), false);

    const planApproved = createBoundUnifiedToolDeclarations(tools, bindings, true, true, true);
    assert.equal(planApproved.some((declaration) => declaration.id === "system_update_plan_route"), true);

    const planUnapproved = createBoundUnifiedToolDeclarations(tools, bindings, false, true);
    assert.equal(planUnapproved.some((declaration) => declaration.id === "system_propose_task_plan"), true);
    assert.equal(planUnapproved.some((declaration) => declaration.id === "system_complete_task"), false);

    const diagnostics: string[] = [];
    const discovery = decodePhaseToolCall(
        normal,
        "system_find_tools",
        { query: "read files", debug: true },
        { onDiagnostic: (diagnostic) => diagnostics.push(...diagnostic.paths) },
    );
    assert.deepEqual(discovery, { kind: "tool_discovery", query: "read files" });
    assert.deepEqual(diagnostics, ["/*"]);

    assert.throws(
        () => decodePhaseToolCall(normal, "system_find_tools", { query: 42 }),
        (error: unknown) => error instanceof ContractValidationError,
    );
    assert.throws(
        () => decodePhaseToolCall(normal, "unknown_tool", {}),
        (error: unknown) => error instanceof ContractValidationError,
    );
});

test("阶段工具绑定从请求快照注入身份并限制开始条件", () => {
    const bindings = modelBindings();
    const executing = createBoundUnifiedToolDeclarations([], bindings, true, false, false, false, {
        currentStage: { stageId: "stage-1", revision: 2, status: "executing" },
    });
    const revise = decodePhaseToolCall(executing, "system_revise_run_stage", {
        target: "继续实现",
        acceptanceCriteria: ["测试通过"],
        reason: "补充范围",
    });
    assert.deepEqual(revise, {
        kind: "run_stage_update",
        stageId: "stage-1",
        baseRevision: 2,
        target: "继续实现",
        acceptanceCriteria: ["测试通过"],
        reason: "补充范围",
    });

    const approvedRoute = createBoundUnifiedToolDeclarations([], bindings, true, false, false, false, {
        planRoute: {
            revision: 1,
            nextStageIndex: 0,
            stages: [{ target: "实现修复", acceptanceCriteria: ["回归通过"], status: "pending" }],
        },
    });
    const start = decodePhaseToolCall(approvedRoute, "system_start_run_stage", {});
    assert.deepEqual(start, {
        kind: "run_stage_update",
        target: "实现修复",
        acceptanceCriteria: ["回归通过"],
    });

    const finishedRoute = createBoundUnifiedToolDeclarations([], bindings, true, false, false, false, {
        planRoute: {
            revision: 1,
            nextStageIndex: 1,
            stages: [{ target: "实现修复", acceptanceCriteria: ["回归通过"], status: "accepted" }],
        },
    });
    assert.equal(finishedRoute.some((declaration) => declaration.id === "system_start_run_stage"), false);
});

test("Checkpoint 与 Completion Review 声明来自绑定集合", () => {
    const bindings = modelBindings();
    const checkpoint = createBoundCheckpointToolDeclarations(bindings);
    assert.deepEqual(checkpoint.map((declaration) => declaration.id), ["system_context_checkpoint"]);
    assert.deepEqual(
        decodePhaseToolCall(checkpoint, "system_context_checkpoint", { checkpointSummary: "归档" }),
        { kind: "context_checkpoint" },
    );

    const review = createBoundCompletionReviewDeclaration(bindings);
    assert.equal(review.id, "system_review_completion");
    assert.deepEqual(review.decode({ result: { kind: "accept", feedback: null } }), { kind: "accept" });
    assert.throws(
        () => review.decode({ result: { kind: "reject", feedback: "   " } }),
        (error: unknown) => error instanceof ContractValidationError,
    );
});

test("模型响应解析消费绑定契约包并保留协议错误", () => {
    const bundle = createBoundModelOutputContractBundle({ kind: "executing" }, modelBindings());
    const diagnostics: string[] = [];
    const decoded = parseModelOutput(
        JSON.stringify({ result: { kind: "wait", reason: "等待用户", memoryPatch: null, debug: true } }),
        bundle,
        { onDiagnostic: (diagnostic) => diagnostics.push(...diagnostic.paths) },
    );
    assert.equal(decoded.kind, "wait");
    assert.deepEqual(diagnostics, ["/result/*"]);

    assert.throws(
        () => parseModelOutput(JSON.stringify({ result: { kind: "wait", reason: 42 } }), bundle),
        (error: unknown) => error instanceof LLMResponseProtocolError,
    );
});

test("组合 Schema 与工具参数落在 Provider 严格可移植子集内", () => {
    const bindings = modelBindings();
    const bundle = createBoundModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [readTool("read_file")],
        allowThink: true,
    }, bindings);

    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(bundle.jsonSchema);
    assert.equal(validate({
        result: {
            kind: "tool_call",
            action: { actionId: "a1", toolId: "read_file", input: { path: "README.md" } },
            memoryPatch: null,
        },
    }), true);
    assert.equal(validate({ result: { kind: "wait", reason: "阻塞", memoryPatch: null } }), true);
    assert.equal(validate({ result: { kind: "request_think", goal: "比较方案" } }), true);
    assert.equal(validate({ result: { kind: "wait", reason: 42, memoryPatch: null } }), false);
    assert.equal(bundle.shapeGuide.startsWith(SHAPE_GUIDE_PREFIX), true);
    assert.equal(JSON.parse(bundle.shapeGuide.slice(SHAPE_GUIDE_PREFIX.length + 1)).type, "object");

    const declarations = createBoundUnifiedToolDeclarations([readTool("read_file")], bindings, true, false, false);
    for (const declaration of declarations) {
        const toolValidate = new Ajv2020({ strict: true, allErrors: true }).compile(declaration.parametersSchema);
        assert.equal(typeof toolValidate, "function", declaration.id);
    }
    const readDeclaration = declarations.find((declaration) => declaration.id === "read_file");
    assert.ok(readDeclaration !== undefined);
    assert.equal(new Ajv2020({ strict: true }).compile(readDeclaration!.parametersSchema)({ path: "a.ts" }), true);

    const review = createBoundCompletionReviewDeclaration(bindings);
    const resultSchema = (review.parametersSchema.properties as Record<string, unknown>).result as Record<string, unknown>;
    const kindSchema = (resultSchema.properties as Record<string, unknown>).kind as Record<string, unknown>;
    assert.deepEqual(kindSchema.enum, ["accept", "reject"]);
});
