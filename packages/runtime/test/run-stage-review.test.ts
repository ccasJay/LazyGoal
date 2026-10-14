import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createGoal,
    createStepExecutor,
    Runner,
    type AgentDecision,
    type Goal,
} from "../src/index";
import { createToolRegistration, InMemoryToolRegistry } from "../../tool-core/src/index";
import { contract } from "../../contracts/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, InMemoryTrajectoryStore } from "./current-fixtures";

function goal(id: string): Goal {
    const created = createGoal({
        ...currentProtocols,
        id,
        runId: "run-1",
        intent: "Multi-stage investigation",
        promptBundleVersion: 1,
        maxSteps: 10,
        profile: {
            id: "review-test",
            systemPrompt: "Inspect the system.",
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

test("three semantic review rejections advance across three normal steps and succeed on 4th attempt", async () => {
    const initial = goal("three-rejections-steps");
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(initial);

    let decideCount = 0;
    let reviewCount = 0;
    const feedbackReceived: string[] = [];

    const executor = createStepExecutor(
        async (input) => {
            decideCount++;
            if (input.runtimeFeedback !== undefined) {
                feedbackReceived.push(input.runtimeFeedback.issues[0]?.message ?? "");
            }

            // Step 1: 声明阶段 1
            if (decideCount === 1) {
                return {
                    kind: "run_stage_update",
                    target: "Analyze module architecture",
                    acceptanceCriteria: ["Identify boundaries"],
                };
            }

            // Step 2, 3, 4: 提交完成候选（会被拒绝）
            if (decideCount === 2 || decideCount === 3 || decideCount === 4) {
                return {
                    kind: "run_stage_complete",
                    stageId: "stage-1",
                    summary: `Attempt ${decideCount - 1} summary`,
                    memoryPatch: {
                        protocolVersion: 1,
                        operations: [{
                            type: "create_hypothesis",
                            hypothesis: {
                                statement: `claim_${decideCount}`,
                            },
                        }],
                    },
                };
            }

            // Step 5: 最终满足要求的候选
            return {
                kind: "complete",
                summary: "Full analysis verified with evidence and recommendations.",
                evidenceSequences: [],
            };
        },
        async (input) => {
            reviewCount++;
            if (reviewCount <= 3) {
                return { kind: "reject", feedback: `Gap found in review attempt ${reviewCount}: need more details.` };
            }
            return { kind: "accept" };
        },
    );

    const result = await new Runner({ store, trajectoryStore: trajectory, executor }).run({ goalId: initial.id, runId: "run-1" });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.state.status, "completed");
    // 3 次拒绝作为 3 个正常 Step 结算，加上 stage update 与最终 complete，正常步数应推进
    assert.ok(result.state.stepCount >= 4);
    assert.equal(reviewCount, 4);
    assert.equal(feedbackReceived.length, 3);
    assert.match(feedbackReceived[0]!, /Gap found in review attempt 1/);
    assert.match(feedbackReceived[1]!, /Gap found in review attempt 2/);
    assert.match(feedbackReceived[2]!, /Gap found in review attempt 3/);

    // 拒绝期间提出的 memoryPatch 不能被提交到轨迹
    const acceptedPatches = trajectory.events.filter(e => e.eventType === "memory_patch_accepted");
    assert.equal(acceptedPatches.some(e => JSON.stringify(e.payload).includes("claim_2")), false);
    assert.equal(acceptedPatches.some(e => JSON.stringify(e.payload).includes("claim_3")), false);
    assert.equal(acceptedPatches.some(e => JSON.stringify(e.payload).includes("claim_4")), false);

    // 拒绝事实应当被记录在轨迹中
    const rejections = trajectory.events.filter(e => e.eventType === "run_stage_rejected");
    assert.equal(rejections.length, 3);
});

test("intermediate stage acceptance settles stage results without completing the run", async () => {
    const initial = goal("intermediate-stage-accept");
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(initial);

    let decideCount = 0;
    let reviewCount = 0;

    const executor = createStepExecutor(
        async (input) => {
            decideCount++;
            if (decideCount === 1) {
                return {
                    kind: "run_stage_update",
                    target: "Phase 1: Explore",
                    acceptanceCriteria: ["Explore completed"],
                };
            }
            if (decideCount === 2) {
                return {
                    kind: "run_stage_complete",
                    stageId: "stage-1",
                    summary: "Phase 1 explored successfully.",
                    memoryPatch: {
                        protocolVersion: 1,
                        operations: [{
                            type: "create_hypothesis",
                            hypothesis: {
                                statement: "explored",
                            },
                        }],
                    },
                };
            }
            if (decideCount === 3) {
                // 此时阶段 1 已被接受，验证状态并声明阶段 2
                assert.equal(input.goal.state.run.currentStage?.status, "accepted");
                return {
                    kind: "run_stage_update",
                    target: "Phase 2: Finalize",
                    acceptanceCriteria: ["Finalize completed"],
                };
            }
            return {
                kind: "complete",
                summary: "All phases done.",
                evidenceSequences: [],
            };
        },
        async (input) => {
            reviewCount++;
            return { kind: "accept" };
        },
    );

    const result = await new Runner({ store, trajectoryStore: trajectory, executor }).run({ goalId: initial.id, runId: "run-1" });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.state.status, "completed");
    assert.equal(reviewCount, 2);

    // 阶段 1 接受事实与 patch 均被持久化
    const stageAcceptedEvents = trajectory.events.filter(e => e.eventType === "run_stage_accepted");
    assert.ok(stageAcceptedEvents.length >= 1);
    assert.equal(stageAcceptedEvents[0]!.payload.stageId, "stage-1");

    const patchEvents = trajectory.events.filter(e => e.eventType === "memory_patch_accepted");
    assert.ok(patchEvents.some(e => JSON.stringify(e.payload).includes("explored")));
});

test("final complete acceptance atomically settles active stage and run completion", async () => {
    const initial = goal("final-stage-atomic-complete");
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(initial);

    let decideCount = 0;

    const executor = createStepExecutor(
        async () => {
            decideCount++;
            if (decideCount === 1) {
                return {
                    kind: "run_stage_update",
                    target: "Single phase task",
                    acceptanceCriteria: ["Deliver answer"],
                };
            }
            return {
                kind: "complete",
                summary: "Final deliverable.",
                evidenceSequences: [],
            };
        },
        async () => ({ kind: "accept" }),
    );

    const result = await new Runner({ store, trajectoryStore: trajectory, executor }).run({ goalId: initial.id, runId: "run-1" });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.state.status, "completed");
    // 轨迹中应同时包含阶段接受与 run 完成
    assert.ok(trajectory.events.some(e => e.eventType === "run_stage_accepted"));
    assert.ok(trajectory.events.some(e => e.eventType === "run_completed"));

    const restored = await store.restore(initial.id);
    assert.ok(restored !== undefined);
    assert.equal(restored.state.messages.at(-1)?.content, "Final deliverable.");
    assert.equal(restored.state.run.currentStage?.status, "accepted");
});


for (const maxSteps of [3, 10]) {
test(`overall rejection after intermediate acceptance preserves stage and budget (${maxSteps})`, async () => {
    const created = goal("accepted-stage-final-rejection");
    const initial = { ...created, definition: { ...created.definition, executionPolicy: { ...created.definition.executionPolicy, maxSteps } } };
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(initial);
    let decisions = 0;
    let reviews = 0;
    const executor = createStepExecutor(async (input) => {
        decisions++;
        if (decisions === 1) return { kind: "run_stage_update", target: "Analyze", acceptanceCriteria: ["Deliver analysis"] };
        if (decisions === 2) return { kind: "run_stage_complete", stageId: "stage-1", summary: "Local analysis" };
        if (decisions === 3) {
            assert.equal(input.goal.state.run.currentStage?.status, "accepted");
        } else {
            assert.equal(input.goal.state.run.currentStage?.status, "executing");
            assert.equal(input.goal.state.run.currentStage?.acceptedSequence, undefined);
            assert.equal(input.goal.state.run.currentStage?.stageId, "stage-1");
            assert.match(input.runtimeFeedback!.issues[0]!.message, /Missing recommendation/);
        }
        return { kind: "complete", summary: decisions === 3 ? "Incomplete analysis" : "Analysis and recommendation", evidenceSequences: [] };
    }, async () => {
        reviews++;
        return reviews === 2 ? { kind: "reject", feedback: "Missing recommendation" } : { kind: "accept" };
    });
    const result = await new Runner({ store, trajectoryStore: trajectory, executor }).run({ goalId: initial.id, runId: "run-1" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, maxSteps === 3 ? "failed" : "completed");
    assert.equal(reviews, maxSteps === 3 ? 2 : 3);
    if (maxSteps === 3) assert.equal(result.state.stopReason?.kind, "max_steps_exceeded");
    assert.equal(result.state.currentStage?.stageId, "stage-1");
    assert.equal(trajectory.events.filter(event => event.eventType === "run_stage_rejected").length, 1);
});

}
