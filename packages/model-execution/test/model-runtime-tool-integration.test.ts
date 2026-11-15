import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { test } from "node:test";

import type { LLMAdapter, LLMRequest, LLMResponse } from "../../llm-core/src/index";
import type { StructuredOutputMode } from "../../llm-core/src/index";
import { toolCallResponse } from "../../llm-core/test/response-fixtures";
import {
    createBoundUnifiedToolDeclarations,
    modelOutputBindings,
    ModelOutputContractDefinitionError,
} from "../../model-contracts/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import {
    createGoal,
    Runner,
    transition,
    type Goal,
} from "../../runtime/src/index";
import {
    InMemoryToolRegistry,
    type BoundToolDefinition,
    type ToolObservation,
} from "../../tool-core/src/index";
import { createTestToolRegistration } from "../../tool-core/test/helpers";
import { createTestToolDefinition, objectInputSchema } from "../../tool-core/test/binding-fixtures";
import {
    createCurrentContextAssembler,
    createInMemoryTrajectoryStore,
    currentProtocols,
} from "../../agent/test/current-fixtures";
import { withDiscoveredProfileTools } from "../../runtime/test/current-fixtures";
import { createDefaultPromptBundleRenderer } from "../../prompt-bundle/src/index";
import { DropOldestContextCompactor } from "../../context-budget/src/index";
import { LLMStepExecutor } from "../src/index";

const readTool: BoundToolDefinition = createTestToolDefinition("read_file", objectInputSchema({
    path: { type: "string" },
}), { description: "Read a file", isReadOnly: true });
const writeTool: BoundToolDefinition = createTestToolDefinition("write_file", objectInputSchema({
    path: { type: "string" },
    content: { type: "string" },
}), { description: "Write a file", isReadOnly: false });

class ScriptedAdapter implements LLMAdapter {
    readonly requests: LLMRequest[] = [];
    private readonly responses: LLMResponse[];

    constructor(
        readonly structuredOutputMode: StructuredOutputMode,
        responses: readonly LLMResponse[],
    ) {
        this.responses = [...responses];
    }

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.requests.push(request);
        const response = this.responses.shift();
        if (response === undefined) throw new Error("ScriptedAdapter exhausted");
        return response;
    }
}

function createGoalFor(toolIds: readonly string[], id: string): Goal {
    return withDiscoveredProfileTools(createGoal({
        ...currentProtocols,
        id,
        runId: "run-1",
        intent: "Read source, then write the requested result.",
        promptBundleVersion: 1,
        profile: {
            id: "integration-profile",
            systemPrompt: "Use the authorized tools and report the result.",
            instructions: [],
            toolIds: [...toolIds],
        },
        maxSteps: 20,
    }));
}

function registryWithCounting(): {
    readonly registry: InMemoryToolRegistry;
    readonly counts: { read: number; write: number };
} {
    const counts = { read: 0, write: 0 };
    const execute = (id: string) => async (): Promise<ToolObservation> => {
        if (id === "read_file") counts.read++;
        else counts.write++;
        return { kind: "success", output: { text: `${id} done` }, summary: `${id} done` };
    };
    return {
        counts,
        registry: new InMemoryToolRegistry([
            createTestToolRegistration({
                definition: readTool,
                replayPolicy: "safe",
                validate: () => ({ ok: true }),
                execute: execute("read_file"),
            }),
            createTestToolRegistration({
                definition: writeTool,
                replayPolicy: "safe",
                validate: () => ({ ok: true }),
                resolveSandboxAccess: () => ({
                    files: [{ path: ".git/index", access: "write", kind: "file", purpose: "审批覆盖一次越界写入" }],
                }),
                execute: execute("write_file"),
            }),
        ]),
    };
}

const renderer = await createDefaultPromptBundleRenderer();

function executor(adapter: LLMAdapter): LLMStepExecutor {
    return new LLMStepExecutor({
        adapter,
        renderer,
        contextCompactor: new DropOldestContextCompactor(),
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });
}

function waitResponse(reason = "Await user input"): LLMResponse {
    return toolCallResponse({
        callId: "wait-call",
        toolId: "system_wait_for_input",
        argumentsJson: JSON.stringify({ reason }),
    });
}

test("strict/prompt-only Model→Runtime→Tool approval resumes across Runner instances", async () => {
    for (const mode of ["strict", "prompt_only"] as const) {
        const store = new InMemoryGoalStore();
        const goal = createGoalFor(["read_file", "write_file"], `integration-approval-${mode}`);
        await store.save(goal);
        const { registry, counts } = registryWithCounting();
        const trajectoryStore = createInMemoryTrajectoryStore();
        const adapter = new ScriptedAdapter(mode, [
            toolCallResponse({
                callId: "read-call",
                toolId: "read_file",
                argumentsJson: JSON.stringify({ path: "README.md" }),
            }),
            toolCallResponse({
                callId: "write-call",
                toolId: "write_file",
                argumentsJson: JSON.stringify({ path: "out.txt", content: "hello" }),
            }),
            waitResponse(),
        ]);
        const policy = {
            evaluate: ({ action }: { readonly action: { readonly toolId: string } }) =>
                action.toolId === "write_file" ? "require_approval" as const : "allow" as const,
        };
        const first = await new Runner({
            store,
            trajectoryStore,
            workspaceRoot: tmpdir(),
            executor: executor(adapter),
            toolRegistry: registry,
        }).run({ goalId: goal.id, runId: goal.state.run.id });

        assert.equal(first.ok, true);
        if (!first.ok) continue;
        assert.equal(first.state.status, "waiting");
        assert.equal(counts.read, 1);
        assert.equal(counts.write, 0);
        const actionId = first.state.pendingAction?.action.actionId;
        if (typeof actionId !== "string") continue;

        const waiting = await store.restore(goal.id);
        assert.ok(waiting !== undefined);
        const approved = transition(waiting.state.run, {
            kind: "approve_action",
            actionId,
            approvalScope: "action",
        });
        assert.equal(approved.ok, true);
        if (!approved.ok) continue;
        await store.save({
            ...waiting,
            state: { ...waiting.state, run: approved.state },
        });

        const resumed = await new Runner({
            store,
            trajectoryStore,
            workspaceRoot: tmpdir(),
            executor: executor(adapter),
            toolRegistry: registry,
        }).run(
            { goalId: goal.id, runId: goal.state.run.id },
            { authorizedActionId: actionId },
        );
        assert.equal(resumed.ok, true);
        if (!resumed.ok) continue;
        assert.equal(resumed.state.status, "waiting");
        assert.equal(counts.read, 1);
        assert.equal(counts.write, 1);
        assert.equal(adapter.requests.length >= 3, true);
    }
});

test("invalid generated tool input is corrected before Runtime executes the Tool", async () => {
    const store = new InMemoryGoalStore();
    const goal = createGoalFor(["read_file"], "integration-correction");
    await store.save(goal);
    const { registry, counts } = registryWithCounting();
    const adapter = new ScriptedAdapter("strict", [
        toolCallResponse({
            callId: "bad-read",
            toolId: "read_file",
            argumentsJson: JSON.stringify({ path: 42 }),
        }),
        toolCallResponse({
            callId: "good-read",
            toolId: "read_file",
            argumentsJson: JSON.stringify({ path: "README.md" }),
        }),
        waitResponse(),
    ]);
    const runner = new Runner({
        store,
        trajectoryStore: createInMemoryTrajectoryStore(),
        executor: executor(adapter),
        toolRegistry: registry,
        toolPolicy: { evaluate: () => "allow" },
    });
    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "waiting");
    assert.equal(counts.read, 1);
    assert.equal(adapter.requests.length, 3);
});

test("declarations use the same binding facts and reject duplicate tool identity", async () => {
    const goal = createGoalFor(["read_file"], "integration-declarations");
    const duplicate = [readTool, { ...readTool }] as const;
    assert.throws(
        () => createBoundUnifiedToolDeclarations(duplicate, modelOutputBindings, true),
        (error: unknown) => error instanceof ModelOutputContractDefinitionError,
    );

    const declarations = createBoundUnifiedToolDeclarations([readTool], modelOutputBindings, true);
    assert.deepEqual(declarations.filter(declaration => declaration.id === "read_file").length, 1);
    assert.equal(declarations.some(declaration => declaration.id === "write_file"), false);
    const declared = declarations.find(declaration => declaration.id === "read_file")!;
    const { $schema: _dialect, ...expectedSchema } = readTool.inputBinding.modelProjection().schema;
    assert.deepEqual(declared.parametersSchema, expectedSchema);
});
