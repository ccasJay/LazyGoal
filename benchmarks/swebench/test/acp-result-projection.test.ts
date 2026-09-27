import { runLazyGoalAcpClient, serveLazyGoalAcpAgent, AcpRequestError } from "../../../packages/acp/src/index.js";
import type { AnyMessage } from "@agentclientprotocol/sdk";
import { readSwebenchAcpFailure, parseSwebenchAcpMeta, toSwebenchAcpFailure } from "../src/acp-result-projection.js";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import type { AcpSessionInput, AcpSessionUpdate } from "../../../packages/acp/src/index.js";
import { InMemoryTrajectoryStore } from "../../../packages/runtime/test/current-fixtures.js";
import type { TrajectoryEventDraft } from "../../../packages/runtime/src/index.js";
import {
    createSwebenchAcpSessionFactory,
    type SwebenchAcpTaskMetadata,
} from "../src/worker-runtime.js";
import {
    AcpTrajectoryStore,
    DEFAULT_ACP_TOOL_VALUE_BYTES,
    SwebenchAcpProjectionError,
} from "../src/acp-result-projection.js";

function startedDraft(input: unknown = { command: "pytest" }): TrajectoryEventDraft {
    return {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        executionUnitId: "unit-1",
        actionId: "action-1",
        eventType: "tool_started",
        payload: {
            type: "tool_started",
            actionId: "action-1",
            toolId: "bash",
            input: input as never,
        },
    };
}

function finishedDraft(): TrajectoryEventDraft {
    return {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        executionUnitId: "unit-1",
        actionId: "action-1",
        eventType: "tool_finished",
        payload: {
            type: "tool_finished",
            actionId: "action-1",
            toolId: "bash",
            observation: {
                kind: "failure",
                code: "TEST_FAILED",
                message: "x".repeat(100),
                retryable: false,
            },
        },
    };
}

test("Trajectory projection emits bounded Tool updates after durable append", async () => {
    const inner = new InMemoryTrajectoryStore();
    const updates: AcpSessionUpdate[] = [];
    const projected = new AcpTrajectoryStore(inner, {
        sessionId: "session-1",
        maxValueBytes: DEFAULT_ACP_TOOL_VALUE_BYTES,
        update: async (notification: AcpSessionUpdate) => { updates.push(notification); },
    });

    await projected.append(startedDraft({ command: "x".repeat(DEFAULT_ACP_TOOL_VALUE_BYTES * 2) }));
    await projected.append(finishedDraft());

    assert.equal(inner.events.length, 2);
    assert.equal(updates.length, 2);
    assert.equal(updates[0]?.sessionId, "session-1");
    assert.equal(updates[0]?.update.sessionUpdate, "tool_call");
    if (updates[0]?.update.sessionUpdate === "tool_call") {
        assert.equal(updates[0].update.toolCallId, "action-1");
        assert.equal(updates[0].update.kind, "execute");
        assert.equal(updates[0].update.status, "in_progress");
        assert.equal((updates[0].update.rawInput as { readonly truncated?: boolean }).truncated, true);
        assert.equal(updates[0].update._meta?.goalId, "goal-1");
        assert.equal(updates[0].update._meta?.sequence, 1);
    }
    assert.equal(updates[1]?.update.sessionUpdate, "tool_call_update");
    if (updates[1]?.update.sessionUpdate === "tool_call_update") {
        assert.equal(updates[1].update.toolCallId, "action-1");
        assert.equal(updates[1].update.status, "failed");
        assert.equal(updates[1].update._meta?.sequence, 2);
    }
});

test("Notification failure does not erase a committed Trajectory fact or form success", async () => {
    const inner = new InMemoryTrajectoryStore();
    const projected = new AcpTrajectoryStore(inner, {
        sessionId: "session-1",
        update: async () => { throw new Error("connection closed"); },
    });
    await assert.rejects(projected.append(startedDraft()), /connection closed/);
    assert.equal(inner.events.length, 1);
    assert.equal(inner.events[0]?.eventType, "tool_started");
});

test("ACP Session maps a real Headless completion and max-step terminal", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-acp-projection-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const metadata: SwebenchAcpTaskMetadata = {
        instanceId: "astropy__astropy-12907",
        repo: "astropy/astropy",
        baseCommit: "a".repeat(40),
        problemStatement: "Fix the reported issue.",
        goalId: "goal-projection-1",
        runId: "run-projection-1",
        maxSteps: 3,
        structuredOutputMode: "strict",
    };
    const updates: AcpSessionUpdate[] = [];
    const session = await createSwebenchAcpSessionFactory({
        metadata,
        problemStatement: metadata.problemStatement,
        workspaceRoot: root,
        stateRoot: join(root, "state"),
        llmAdapter: completionAdapter(),
        renderer: {
            render: () => "system",
            renderDynamicSections: () => [],
            dynamicSectionIdentities: () => [],
        },
        contextCompactor: { compact: async (units) => units },
    }).create(sessionInput("session-1", async (update) => { updates.push(update); }));
    const result = await session.prompt([{ type: "text", text: metadata.problemStatement }], { signal: new AbortController().signal });
    assert.equal(result.stopReason, "end_turn");
    assert.equal(result.meta?.goalId, metadata.goalId);
    assert.equal(result.meta?.runId, metadata.runId);
    assert.equal(updates.map((update) => update.update.sessionUpdate).join(","), "tool_call,tool_call_update");
    assert.equal(await readFile(join(root, "fixed.txt"), "utf8"), "done\n");
    await session.dispose();

    const maxMetadata = { ...metadata, goalId: "goal-projection-max", runId: "run-projection-max", maxSteps: 1 };
    const maxSession = await createSwebenchAcpSessionFactory({
        metadata: maxMetadata,
        problemStatement: maxMetadata.problemStatement,
        workspaceRoot: root,
        stateRoot: join(root, "max-state"),
        llmAdapter: oneToolAdapter(),
        renderer: {
            render: () => "system",
            renderDynamicSections: () => [],
            dynamicSectionIdentities: () => [],
        },
        contextCompactor: { compact: async (units) => units },
    }).create(sessionInput("session-max", async () => undefined));
    const maxResult = await maxSession.prompt([{ type: "text", text: maxMetadata.problemStatement }], { signal: new AbortController().signal });
    assert.equal(maxResult.stopReason, "max_turn_requests");
    assert.equal(maxResult.meta?.stopReason && (maxResult.meta.stopReason as { kind: string }).kind, "max_steps_exceeded");
});

test("ACP Session cancellation returns cancelled and rejects mismatched Prompt", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-acp-cancel-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const metadata: SwebenchAcpTaskMetadata = {
        instanceId: "astropy__astropy-12907",
        repo: "astropy/astropy",
        baseCommit: "a".repeat(40),
        problemStatement: "Wait for cancellation.",
        goalId: "goal-cancel",
        runId: "run-cancel",
        maxSteps: 3,
        structuredOutputMode: "strict",
    };
    const session = await createSwebenchAcpSessionFactory({
        metadata,
        problemStatement: metadata.problemStatement,
        workspaceRoot: root,
        stateRoot: join(root, "state"),
        llmAdapter: {
            structuredOutputMode: "strict",
            generate: async (_request, control) => new Promise((resolve) => {
                if (control === undefined) throw new TypeError("expected execution control");
                const signal = control.signal;
                if (signal === undefined) throw new TypeError("expected execution signal");
                signal.addEventListener("abort", () => resolve({ content: "{}" }), { once: true });
            }),
        },
        renderer: {
            render: () => "system",
            renderDynamicSections: () => [],
            dynamicSectionIdentities: () => [],
        },
        contextCompactor: { compact: async (units) => units },
    }).create(sessionInput("session-cancel", async () => undefined));
    const controller = new AbortController();
    const prompt = session.prompt([{ type: "text", text: metadata.problemStatement }], { signal: controller.signal });
    controller.abort();
    const result = await prompt;
    assert.equal(result.stopReason, "cancelled");
    await assert.rejects(
        session.prompt([{ type: "text", text: "wrong issue" }], { signal: new AbortController().signal }),
        (error: unknown) => error instanceof SwebenchAcpProjectionError && error.code === "PROMPT_MISMATCH",
    );
});

function sessionInput(sessionId: string, update: (value: AcpSessionUpdate) => Promise<void>): AcpSessionInput {
    return {
        sessionId,
        cwd: "/testbed",
        signal: new AbortController().signal,
        update,
    };
}

function completionAdapter(): LLMAdapter {
    let calls = 0;
    return {
        structuredOutputMode: "strict",
        generate: async (request) => {
            calls += 1;
            if (calls === 1) return { content: JSON.stringify({ result: toolDecision("write-1") }) };
            const context = JSON.parse(request.messages.at(-1)?.content ?? "{}") as {
                trajectoryContext?: { hot?: readonly { events?: readonly { eventType?: string; sequence?: number }[] }[] };
            };
            const sequence = context.trajectoryContext?.hot
                ?.flatMap((unit) => unit.events ?? [])
                .filter((event) => event.eventType === "tool_finished")
                .at(-1)?.sequence;
            return { content: JSON.stringify({ result: { kind: "complete", summary: "done", evidenceSequences: [sequence], memoryPatch: null } }) };
        },
    };
}

function oneToolAdapter(): LLMAdapter {
    return {
        structuredOutputMode: "strict",
        generate: async () => {
            return {
                content: JSON.stringify({
                    result: toolDecision("write-max"),
                }),
            };
        },
    };
}

function toolDecision(actionId: string): unknown {
    return {
        kind: "tool_call",
        action: { actionId, toolId: "write_file", input: { path: "fixed.txt", content: "done\n" } },
        memoryPatch: null,
    };
}


test("real Headless protocol failure retains state and usage across ACP serialization", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-acp-failure-wire-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const metadata: SwebenchAcpTaskMetadata = { instanceId: "astropy__astropy-12907", repo: "astropy/astropy",
        baseCommit: "a".repeat(40), problemStatement: "Fix the issue", goalId: "wire-goal", runId: "wire-run",
        maxSteps: 3, structuredOutputMode: "strict" };
    const serialized = () => new TransformStream<AnyMessage, AnyMessage>({
        transform(message, controller) { controller.enqueue(JSON.parse(JSON.stringify(message))); },
    });
    const toAgent = serialized(), toClient = serialized();
    serveLazyGoalAcpAgent({ stream: { readable: toAgent.readable, writable: toClient.writable },
        sessions: createSwebenchAcpSessionFactory({ metadata, problemStatement: metadata.problemStatement,
            workspaceRoot: root, stateRoot: join(root, "state"), renderer: {
                render: () => "system",
                renderDynamicSections: () => [],
                dynamicSectionIdentities: () => [],
            },
            contextCompactor: { compact: async units => units },
            llmAdapter: { structuredOutputMode: "strict", generate: async () => ({
                content: JSON.stringify({ result: { kind: "tool_call", summary: "Task completed with verified evidence.", memoryPatch: null } }),
                providerMetadata: { usage: { inputTokens: 37, outputTokens: 11 } },
            }) },
        }),
    });
    await assert.rejects(runLazyGoalAcpClient({ stream: { readable: toClient.readable, writable: toAgent.writable }, cwd: root,
        prompt: [{ type: "text", text: metadata.problemStatement }] }), error => {
        assert.ok(error instanceof AcpRequestError);
        const failure = readSwebenchAcpFailure(error, metadata);
        assert.equal(failure?.stage, "runtime");
        assert.equal(failure?.code, "INVALID_AGENT_DECISION");
        assert.equal(failure?.meta?.runStatus, "failed");
        assert.deepEqual(failure?.meta?.usage, { inputTokens: 37, outputTokens: 11, missingCalls: 0 });
        return true;
    });
});

test("ACP error boundary rejects foreign metadata and hides unknown exception details", () => {
    const identity = { goalId: "goal-1", runId: "run-1" };
    const error = toSwebenchAcpFailure(new Error("Authorization: secret-value"));
    assert.ok(!JSON.stringify(error.toErrorResponse()).includes("secret-value"));
    assert.equal(readSwebenchAcpFailure(error, identity)?.code, "WORKER_RUNTIME_ERROR");
    const meta = { ...identity, runStatus: "failed", completed: false, stopReason: null, usage: { inputTokens: 2, outputTokens: 1, missingCalls: 0 } };
    for (const value of [{ ...meta, goalId: "foreign" }, { ...meta, runStatus: "not_started" },
        { ...meta, usage: { inputTokens: -1, outputTokens: 1, missingCalls: 0 } }]) {
        assert.throws(() => parseSwebenchAcpMeta(value, identity));
    }
    assert.throws(() => readSwebenchAcpFailure(new AcpRequestError(-32603, "error", {
        swebench: { stage: "runtime", code: "INVALID_AGENT_DECISION", message: "Invalid decision", meta: { ...meta, runId: "foreign" } },
    }), identity));
});
