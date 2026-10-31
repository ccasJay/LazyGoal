import { toolResponseFixture } from "../../packages/agent/test/tool-response-fixture";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { contract } from "../../packages/contracts/src/index.js";
import type { AgentProfile } from "../../packages/runtime/src/index.js";
import type { Tool } from "../../packages/tool-core/src/index.js";
import { createToolRegistration } from "../../packages/tool-core/src/index.js";
import type { JsonValue } from "../../packages/contracts/src/index.js";
import { createTestBinding, objectInputSchema } from "../../packages/tool-core/test/binding-fixtures.js";
import { HeadlessCompositionRoot } from "../src/headless-composition-root.js";
import { JsonFileBenchmarkPersistenceAdapter } from "../src/file-persistence-adapter.js";
import type {
    BenchmarkAdapter,
    BenchmarkPersistenceAdapter,
    HeadlessCompositionRootDependencies,
} from "../src/headless-composition-root.js";
import { createTestToolRegistration } from "../../packages/tool-core/test/helpers";

const profile: AgentProfile = {
    id: "recovery-profile",
    systemPrompt: "recovery",
    instructions: [],
    toolIds: [],
};

const EMPTY_INPUT_SCHEMA = objectInputSchema();

const evidenceTool: Tool = {
    definition: {
        id: "recovery_evidence",
        description: "Record deterministic evidence",
        inputBinding: createTestBinding<JsonValue>("test.recovery_evidence", EMPTY_INPUT_SCHEMA),
        isReadOnly: true,
    },
    replayPolicy: "safe",
    validate: () => ({ ok: true }),
    execute: async () => ({
        kind: "success",
        output: { observed: true },
        summary: "evidence recorded",
    }),
};
const evidenceRegistration = createTestToolRegistration(evidenceTool);

interface FakeTask {
    readonly id: string;
}

function createDependencies(
    adapter: BenchmarkAdapter<FakeTask, boolean>,
    persistence: BenchmarkPersistenceAdapter<FakeTask>,
): HeadlessCompositionRootDependencies<FakeTask, boolean> {
    return {
        benchmarkId: "recovery-benchmark",
        workspaceRoot: "/workspace",
        profile,
        llmAdapter: {
            structuredOutputMode: "strict" as const,
            generate: async () => ({ ...toolResponseFixture(JSON.stringify({ result: { kind: "fail", error: "unused", memoryPatch: null, contextNotes: null } })) }),
        },
        renderer: {
            render: () => "system",
            renderDynamicSections: () => [],
            dynamicSectionIdentities: () => [],
        },
        contextCompactor: { compact: async (units) => units },
        adapter: {
            describeTask: (task) => adapter.describeTask(task),
            createEpisode: async (task, context) => {
                const episode = await adapter.createEpisode(task, context);
                return {
                    ...episode,
                    registry: {
                        get(toolId: string) {
                            return toolId === evidenceTool.definition.id
                                ? evidenceRegistration
                                : episode.registry.get(toolId);
                        },
                    },
                };
            },
        },
        persistence,
        goalIdGenerator: () => "recovery-goal",
        runIdGenerator: () => `recovery-run-${runCounter++}`,
    };
}

let runCounter = 0;

function benchmarkAdapter(): BenchmarkAdapter<FakeTask, boolean> {
    return {
        describeTask: () => ({
            intent: "Follow the current message",
            objective: "Follow the current message",
            completionCriteria: ["Follow the current message"],
            maxSteps: 5,
        }),
        createEpisode: async () => ({
            registry: { get: () => undefined },
            readOutcome: () => true,
            close: async () => undefined,
        }),
    };
}

test("等待后由新实例恢复同一 Run，并保留已提交的模型上下文 frame", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-components-recovery-"));
    const persistence = new JsonFileBenchmarkPersistenceAdapter<FakeTask>({
        rootDirectory: directory,
        namespaceFor: (task) => task.id,
    });
    const dependencies = createDependencies(benchmarkAdapter(), persistence);
    dependencies.llmAdapter.generate = async () => ({
        ...toolResponseFixture(JSON.stringify({ result: { kind: "wait", reason: "Provide the next step", memoryPatch: null, contextNotes: null } })),
    });

    try {
        const first = await new HeadlessCompositionRoot(dependencies).openSession({ id: "waiting" });
        const waiting = await first.launch();
        assert.equal(waiting.progress.ok && waiting.progress.kind, "waiting", JSON.stringify(waiting.goal.state.run));
        const ref = { goalId: waiting.goal.id, runId: waiting.goal.state.run.id };
        await first.close();

        const bindings = await persistence.open({ benchmarkId: dependencies.benchmarkId, namespace: "waiting", ...ref });
        const frames = (await bindings.trajectoryStore.read(ref))
            .filter((event) => event.eventType === "model_context_frame");
        assert.ok(frames.length >= 1, "Launch must commit a model context frame");
        for (const frame of frames) {
            assert.ok(frame.sequence <= waiting.goal.state.run.committedThroughSequence);
        }

        dependencies.llmAdapter.generate = async () => ({
            ...toolResponseFixture(JSON.stringify({ result: { kind: "fail", error: "Expected end of probe", memoryPatch: null, contextNotes: null } })),
        });
        const rebuilt = await new HeadlessCompositionRoot(dependencies).openSession({ id: "waiting" }, { restoreRef: ref });
        try {
            const resumed = await rebuilt.resume({ kind: "message", content: "继续" });
            assert.equal(resumed.goal.state.run.id, ref.runId);
            assert.equal(resumed.goal.state.run.status, "failed");
            const framesAfter = (await bindings.trajectoryStore.read(ref))
                .filter((event) => event.eventType === "model_context_frame");
            assert.ok(framesAfter.length > frames.length, "Resume must commit another frame in the same Run");
            for (const frame of framesAfter) {
                assert.ok(frame.sequence <= resumed.goal.state.run.committedThroughSequence);
            }
        } finally {
            await rebuilt.close();
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("终态后显式后继 Run 复用同一 Goal 并保留前一 Run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-components-successor-"));
    const persistence = new JsonFileBenchmarkPersistenceAdapter<FakeTask>({
        rootDirectory: directory,
        namespaceFor: (task) => task.id,
    });
    const dependencies = createDependencies(benchmarkAdapter(), persistence);
    dependencies.llmAdapter.generate = async (request) => {
        if (request.tools?.[0]?.id === "system_review_completion") {
            return { ...toolResponseFixture(JSON.stringify({ result: { kind: "reject", feedback: "缺少验证证据" } })) };
        }
        return {
            ...toolResponseFixture(JSON.stringify({ result: { kind: "fail", error: "First terminal state", memoryPatch: null, contextNotes: null } })),
        };
    };

    try {
        const session = await new HeadlessCompositionRoot(dependencies).openSession({ id: "successor" });
        try {
            const first = await session.launch();
            assert.equal(first.goal.state.run.status, "failed");
            const successor = await session.continue("Start the explicit successor Run");
            assert.equal(successor.goal.id, first.goal.id);
            assert.notEqual(successor.goal.state.run.id, first.goal.state.run.id);
            assert.equal(successor.goal.state.completedRuns?.length, 1);
            assert.equal(successor.goal.state.completedRuns?.[0]?.runId, first.goal.state.run.id);
        } finally {
            await session.close();
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("完成审查拒绝进入 Decide 纠错链并携带反馈", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-components-review-"));
    const persistence = new JsonFileBenchmarkPersistenceAdapter<FakeTask>({
        rootDirectory: directory,
        namespaceFor: (task) => task.id,
    });
    const dependencies = createDependencies(benchmarkAdapter(), persistence);
    let decideCalls = 0;
    let reviewMessages: readonly { readonly role: string; readonly content: string }[] = [];
    dependencies.llmAdapter.generate = async (request) => {
        if (request.tools?.[0]?.id === "system_review_completion") {
            reviewMessages = request.messages;
            return { ...toolResponseFixture(JSON.stringify({ result: { kind: "reject", feedback: "缺少验证证据" } })) };
        }
        decideCalls += 1;
        if (decideCalls === 1) {
            return {
                ...toolResponseFixture(JSON.stringify({ result: { kind: "complete", summary: "完成", evidenceSequences: [], memoryPatch: null, contextNotes: null } })),
            };
        }
        return {
            ...toolResponseFixture(JSON.stringify({ result: { kind: "fail", error: "审查拒绝后终止", memoryPatch: null, contextNotes: null } })),
        };
    };

    try {
        const session = await new HeadlessCompositionRoot(dependencies).openSession({ id: "review" });
        try {
            const result = await session.launch();
            assert.equal(result.goal.state.run.status, "failed");
            assert.equal(decideCalls, 2, "拒绝后必须经过一次纠错 Decide");
            const bindings = await persistence.open({
                benchmarkId: dependencies.benchmarkId,
                namespace: "review",
                goalId: result.goal.id,
                runId: result.goal.state.run.id,
            });
            const inputs = await bindings.modelInputStore!.read(result.goal.id, result.goal.state.run.id);
            assert.ok(inputs.length >= 3, "decide + review + corrected decide 都必须记录输入");
            const corrected = inputs.at(-1)!;
            const feedbackMessage = corrected.messages.find((message) => message.content.includes('"source":"runtime_feedback"'));
            assert.ok(feedbackMessage, "纠错 Decide 必须携带 runtime_feedback");
            assert.ok(feedbackMessage.content.includes("缺少验证证据"));
            assert.ok(reviewMessages.some((message) => message.role === "system"));
        } finally {
            await session.close();
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
