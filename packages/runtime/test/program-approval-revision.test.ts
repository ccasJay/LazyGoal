import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
import { isSeatbeltSupported } from "../../sandbox/src/index";
import { createExecuteProgramRegistration } from "../../tools/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    type ToolValidationResult,
} from "../../tool-core/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import {
    createGoal,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    type DecideStageResult,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import { currentProtocols, InMemoryTrajectoryStore } from "./current-fixtures";
import { createTestBinding, objectInputSchema, openObjectSchema, sandboxCommandSchema } from "../../tool-core/test/binding-fixtures";
import { createTestToolRegistration } from "../../tool-core/test/helpers";

const WRITE_INPUT = objectInputSchema({ path: { type: "string" }, content: { type: "string" } });

/** 记录真实执行入参的受控写入 Tool。 */
function createRecordingWriteTool(inputs: { path: string; content: string }[]) {
    return {
        definition: {
            id: "write_file",
            description: "受控写入 Tool",
            inputBinding: createTestBinding("test.tool", WRITE_INPUT),
            isReadOnly: false,
        },
        replayPolicy: "safe" as const,
        validate: (): ToolValidationResult => ({ ok: true }),
        async execute(request: { readonly input: unknown }) {
            inputs.push(request.input as { path: string; content: string });
            return { kind: "success" as const, output: "saved", summary: "Wrote" };
        },
    };
}

/** 写类 Tool 必须先经用户审批的策略。 */
const REQUIRE_APPROVAL = {
    evaluate: ({ tool }: { readonly tool: { readonly id: string; readonly isReadOnly?: boolean } }) =>
        tool.id === "execute_program" || tool.isReadOnly === true
            ? "allow" as const
            : "require_approval" as const,
};

test("PTC 子调用按修订后的最终参数执行，并把修订说明返回给程序", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-ptc-revision-"));
    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();
    const inputs: { path: string; content: string }[] = [];
    const registry = new InMemoryToolRegistry([
        createExecuteProgramRegistration(),
        createTestToolRegistration(createRecordingWriteTool(inputs)),
    ]);

    const code = [
        "const first = await tools.write_file({path:'a.txt', content:'original'});",
        "const second = await tools.write_file({path:'c.txt', content:'third'});",
        "return {first:first.observation.kind, second:second.observation.kind, revision:first.revision ?? null};",
    ].join("");
    const created = createGoal({
        ...currentProtocols,
        id: "ptc-revision-goal",
        runId: "ptc-revision-run",
        intent: "PTC 修订执行",
        promptBundleVersion: 1,
        profile: {
            id: "ptc-revision",
            systemPrompt: "Test",
            instructions: [],
            toolIds: ["execute_program", "write_file"],
        },
        maxSteps: 3,
    });
    const goal = {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                mode: "plan" as const,
                approvedTask: { objective: "PTC 修订执行", completionCriteria: [] },
                exposedToolIds: ["execute_program", "write_file"],
                currentStage: {
                    stageId: "stage-1",
                    revision: 1,
                    status: "executing" as const,
                    target: "PTC 修订执行",
                    acceptanceCriteria: ["测试完成"],
                },
            },
        },
    };
    await store.save(goal);

    let modelCalls = 0;
    const decide = (): DecideStageResult => {
        modelCalls += 1;
        return modelCalls === 1
            ? {
                kind: "decision",
                decision: {
                    kind: "tool_call",
                    action: { actionId: "parent-1", toolId: "execute_program", input: { code } },
                },
            }
            : { kind: "decision", decision: { kind: "complete", summary: "Done", completionEvidence: [] } };
    };
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" as const }; },
        async decide(_input: StepExecutionInput) { return decide(); },
        async think(): Promise<never> { throw new Error("Unexpected Think"); },
    };
    const runner = new Runner({
        store,
        trajectoryStore,
        executor,
        toolRegistry: registry,
        toolPolicy: REQUIRE_APPROVAL,
    });
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore,
        scheduler: new InlineScheduler(runner),
        toolRegistry: registry,
        workspaceId: "ws-1",
        workspaceRoot,
    });
    const ref = { goalId: goal.id, runId: goal.state.run.id };

    // 第一次：程序内的写调用进入审批等待。
    const first = await coordinator.advance(ref);
    assert.ok(first.ok, JSON.stringify(first.ok ? {} : first.error));
    if (!first.ok) return;
    assert.equal(first.kind, "waiting");
    assert.equal(first.waitingFor, "action_approval");
    const childActionId = first.goal.state.run.pendingAction?.action.actionId;
    assert.ok(childActionId !== undefined);
    assert.deepEqual(inputs, []);

    // 修订为 B 并批准。
    const review = await coordinator.reviewActionApproval({
        ref,
        actionId: childActionId,
        input: { path: "b.txt", content: "revised" },
    });
    assert.ok(review.ok, JSON.stringify(review.ok ? {} : review));
    if (!review.ok) return;
    const approved = await coordinator.resume({
        ref,
        action: {
            kind: "approve_action_revision",
            actionId: childActionId,
            input: { path: "b.txt", content: "revised" },
            reviewRef: review.review.reviewRef,
        },
    });
    assert.ok(approved.ok, JSON.stringify(approved.ok ? {} : approved.error));
    if (!approved.ok) return;

    // 实际执行的写调用使用最终参数 B，原请求 A 未被执行。
    assert.deepEqual(inputs, [{ path: "b.txt", content: "revised" }]);

    // 程序继续发起第二次调用并再次等待审批。
    const second = await coordinator.advance(ref);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.kind, "waiting");
    assert.equal(second.waitingFor, "action_approval");
    const secondActionId = second.goal.state.run.pendingAction?.action.actionId;
    assert.ok(secondActionId !== undefined);
    assert.notEqual(secondActionId, childActionId);

    // 批准第二次调用：程序重建并重放第一次调用。
    const completed = await coordinator.resume({
        ref,
        action: { kind: "approve_action", actionId: secondActionId },
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;

    // 第一次调用没有被重复执行，第二次调用正常执行。
    assert.equal(inputs.length, 2);
    assert.deepEqual(inputs[0], { path: "b.txt", content: "revised" });
    assert.deepEqual(inputs[1], { path: "c.txt", content: "third" });

    // 程序收到的结果信封携带一致的修订说明。
    const events = await trajectoryStore.read(ref);
    const parentObservation = events.find((event) =>
        event.eventType === "observation_recorded" && event.actionId === "parent-1");
    assert.ok(parentObservation !== undefined);
    if (parentObservation?.eventType === "observation_recorded") {
        const output = parentObservation.payload.observation.kind === "success"
            ? parentObservation.payload.observation.output
            : undefined;
        assert.ok(output !== undefined);
        const revision = (output as { readonly revision?: { readonly reviewRef: string; readonly originalInput: unknown; readonly finalInput: unknown; readonly source: string } }).revision;
        assert.ok(revision !== undefined);
        assert.equal(revision.source, "user");
        assert.equal(revision.reviewRef, review.review.reviewRef);
        assert.deepEqual(revision.originalInput, { path: "a.txt", content: "original" });
        assert.deepEqual(revision.finalInput, { path: "b.txt", content: "revised" });
    }

    // 原暂存事实保留原请求参数。
    const staged = events.find((event) =>
        event.eventType === "action_staged" && event.actionId === childActionId);
    assert.ok(staged !== undefined);
    if (staged?.eventType === "action_staged") {
        assert.deepEqual(staged.payload.action.input, { path: "a.txt", content: "original" });
    }
    await rm(workspaceRoot, { recursive: true, force: true });
});
