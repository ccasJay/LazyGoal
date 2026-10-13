import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createGoal,
    createStepExecutor,
    Runner,
    type Goal,
} from "../src/index";
import { ExecutionAbortedError } from "../../execution-control/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, InMemoryTrajectoryStore } from "./current-fixtures";

function goal(id: string): Goal {
    const created = createGoal({
        ...currentProtocols,
        id,
        runId: "run-1",
        intent: "Recovery verification",
        promptBundleVersion: 1,
        maxSteps: 8,
        profile: {
            id: "recovery-test",
            systemPrompt: "Inspect state.",
            instructions: [],
            toolIds: ["read_file"],
        },
    });
    return {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                exposedToolIds: ["read_file"],
            },
        },
    };
}

test("rejected stage feedback survives crash and recovers in next process attempt", async () => {
    const initial = goal("crash-after-reject");
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(initial);

    let decideCount = 0;

    // 实例 1：执行阶段声明并产生一次审查拒绝，然后模拟崩溃中断
    const executor1 = createStepExecutor(
        async () => {
            decideCount++;
            if (decideCount === 1) {
                return {
                    kind: "run_stage_update",
                    target: "Analyze system",
                    acceptanceCriteria: ["Find issues"],
                };
            }
            if (decideCount === 2) {
                return {
                    kind: "run_stage_complete",
                    stageId: "stage-1",
                    summary: "Candidate 1",
                };
            }
            throw new ExecutionAbortedError();
        },
        async () => {
            return { kind: "reject", feedback: "Missing log evidence." };
        },
    );

    const runner1 = new Runner({ store, trajectoryStore: trajectory, executor: executor1 });
    try {
        await runner1.run({ goalId: initial.id, runId: "run-1" });
    } catch {
        // 允许崩溃中止
    }

    // 检查此时持久化的 Snapshot
    const restoredSnapshot = await store.restore(initial.id);
    assert.ok(restoredSnapshot !== undefined);
    assert.equal(restoredSnapshot.state.run.currentStage?.stageId, "stage-1");
    assert.equal(restoredSnapshot.state.run.currentStage?.status, "executing");
    assert.ok(restoredSnapshot.state.run.currentStage?.latestReviewRejection !== undefined);
    assert.equal(restoredSnapshot.state.run.currentStage?.latestReviewRejection?.feedback, "Missing log evidence.");

    // 实例 2：新进程重启并恢复，收到前序拒绝反馈并成功交付
    let resumedFeedbackReceived = false;
    const executor2 = createStepExecutor(
        async (input) => {
            if (input.runtimeFeedback?.issues[0]?.message.includes("Missing log evidence.")) {
                resumedFeedbackReceived = true;
            }
            return {
                kind: "complete",
                summary: "Analysis complete with log evidence attached.",
                evidenceSequences: [],
            };
        },
        async () => ({ kind: "accept" }),
    );

    const runner2 = new Runner({ store, trajectoryStore: trajectory, executor: executor2 });
    const result2 = await runner2.run({ goalId: initial.id, runId: "run-1" });
    assert.equal(result2.ok, true);
    if (!result2.ok) return;

    assert.equal(result2.state.status, "completed");
    assert.equal(resumedFeedbackReceived, true);
});


test("final review rejection after accepted stage survives restoration without accepting the rejected reply", async () => {
    const initial = goal("restore-final-rejection");
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(initial);
    let decisions = 0;
    let reviews = 0;
    const first = createStepExecutor(async () => {
        decisions++;
        if (decisions === 1) return { kind: "run_stage_update", target: "Inspect", acceptanceCriteria: ["Deliver findings"] };
        if (decisions === 2) return { kind: "run_stage_complete", stageId: "stage-1", summary: "Local findings" };
        if (decisions === 3) return { kind: "complete", summary: "Rejected reply", evidenceSequences: [] };
        throw new ExecutionAbortedError();
    }, async () => {
        reviews++;
        return reviews === 1 ? { kind: "accept" } : { kind: "reject", feedback: "Add recommendation" };
    });
    await assert.rejects(
        new Runner({ store, trajectoryStore: trajectory, executor: first }).run({ goalId: initial.id, runId: "run-1" }),
        error => error instanceof ExecutionAbortedError,
    );
    const snapshot = (await store.restore(initial.id))!;
    assert.equal(snapshot.state.run.currentStage?.status, "executing");
    assert.equal(snapshot.state.run.currentStage?.acceptedSequence, undefined);
    assert.equal(snapshot.state.messages.some(message => message.content === "Rejected reply"), false);
    assert.equal(trajectory.events.filter(event => event.eventType === "run_stage_accepted").length, 1);
    const second = createStepExecutor(async input => {
        assert.equal(input.goal.state.run.currentStage?.stageId, "stage-1");
        assert.match(input.runtimeFeedback!.issues[0]!.message, /Add recommendation/);
        return { kind: "complete", summary: "Findings and recommendation", evidenceSequences: [] };
    }, async () => ({ kind: "accept" }));
    const result = await new Runner({ store, trajectoryStore: trajectory, executor: second }).run({ goalId: initial.id, runId: "run-1" });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.state.status, "completed");
});
