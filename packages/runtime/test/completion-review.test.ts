import { ExecutionAbortedError, TransientModelRequestFailure } from "../../execution-control/src/index";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    CompletionReviewInputBudgetError, createGoal, createStepExecutor,
    Runner,
    type AgentDecision, type Goal, type GoalStore,
} from "../src/index";
import { createToolRegistration, InMemoryToolRegistry } from "../../tool-core/src/index";
import { contract } from "../../contracts/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, InMemoryTrajectoryStore } from "./current-fixtures";

function goal(id: string, mode: "normal" | "plan" = "normal"): Goal {
    const created = createGoal({ ...currentProtocols, id, runId: "run-1", intent: "Explain implementation behavior with source evidence",
        promptBundleVersion: 1, maxSteps: 8,
        profile: { id: "review-test", systemPrompt: "Inspect the source.", instructions: [], toolIds: ["read"] } });
    return { ...created, state: { ...created.state, run: { ...created.state.run, mode, exposedToolIds: ["read"],
        ...(mode === "plan" ? { approvedTask: { objective: created.definition.intent, completionCriteria: [{ text: "Explain implementation behavior" }] } } : {}) } } };
}

test("review input overflow records its own failure code without publishing the candidate", async () => {
    const initial = goal("review-input-budget");
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(initial);
    const executor = createStepExecutor(() => complete(initial, "Draft report"), async () => {
        throw new CompletionReviewInputBudgetError();
    });
    const result = await new Runner({ store, trajectoryStore: trajectory, executor }).run({ goalId: initial.id, runId: "run-1" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    assert.deepEqual(result.state.stopReason, { kind: "execution_error", code: "COMPLETION_REVIEW_INPUT_TOO_LARGE",
        message: "Required completion review input exceeds the model budget" });
    assert.equal((await store.restore(initial.id))!.state.messages.some(message => message.content === "Draft report"), false);
    assert.equal(trajectory.events.some(event => event.eventType === "run_completed"), false);
});

function complete(current: Goal, summary: string, sequences: number[] = []): AgentDecision & { kind: "complete" } {
    return current.state.run.mode === "plan"
        ? { kind: "complete", summary, completionEvidence: [{ criterionIndex: 0, evidenceSequences: sequences }] }
        : { kind: "complete", summary, evidenceSequences: sequences };
}

for (const mode of ["normal", "plan"] as const) {
    test(`${mode}: rejected delivery and Patch stay uncommitted; source investigation and full reply follow`, async () => {
        const initial = goal(`review-${mode}`, mode);
        const store = new InMemoryGoalStore();
        const trajectory = new InMemoryTrajectoryStore();
        await store.save(initial);
        const reads: string[] = [];
        const toolRegistry = new InMemoryToolRegistry([createToolRegistration({
            definition: { id: "read", description: "Read a resource", isReadOnly: true, inputContract: contract.object({ path: contract.string() }) },
            replayPolicy: "safe", validate: () => ({ ok: true }),
            async execute({ input }) {
                reads.push(String(input.path));
                return { kind: "success", output: { text: input.path === "packages" ? "cache.ts" : "export const read = (cache, key) => cache.get(key);" }, summary: "Read resource" };
            },
        })]);
        let decisions = 0;
        let reviews = 0;
        const finalReply = "read delegates lookup to cache.get(key). The cache owns storage; retain this delegation instead of splitting a package without a separate responsibility.";
        const executor = createStepExecutor(async input => {
            decisions++;
            if (decisions === 1 || decisions === 3) {
                if (decisions === 3) {
                    assert.equal(input.runtimeFeedback?.origin, "completion_review");
                    assert.match(input.runtimeFeedback!.issues[0]!.message, /Read source/);
                    assert.equal(input.goal.state.messages.some(message => message.role === "assistant"), false);
                }
                return { kind: "tool_call", action: { actionId: `read-${decisions}`, toolId: "read", input: { path: decisions === 1 ? "packages" : "cache.ts" } } };
            }
            const observed = trajectory.events.filter(event => event.eventType === "observation_recorded").at(-1)!;
            const candidate = complete(input.goal, decisions === 2 ? "Analysis completed." : finalReply, [observed.sequence]);
            if (decisions === 2) return { ...candidate, memoryPatch: { protocolVersion: 1, operations: [{ type: "upsert_fact",
                fact: { subject: "cache", predicate: "rejected_claim", value: true, stability: "last_observed", evidenceSequences: [observed.sequence] } }] } };
            return candidate;
        }, async input => {
            reviews++;
            assert.ok(input.evidence.every(event => event.sequence <= input.goal.state.run.committedThroughSequence));
            assert.ok(input.evidence.some(event => event.eventType === "action_staged"));
            assert.ok(input.evidence.some(event => event.eventType === "observation_recorded"));
            if (mode === "plan") assert.equal(input.goal.state.run.approvedTask?.completionCriteria.length, 1);
            if (reviews === 1) return { kind: "reject", feedback: "Read source and provide concrete findings, evidence and recommendations." };
            assert.match(JSON.stringify(input.evidence), /cache.get/);
            return { kind: "accept" };
        });
        const result = await new Runner({ store, trajectoryStore: trajectory, executor, toolRegistry }).run({ goalId: initial.id, runId: "run-1" });
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.state.status, "completed", JSON.stringify(result.state));
        assert.equal(result.state.stepCount, 3);
        assert.equal(reviews, 2);
        assert.deepEqual(reads, ["packages", "cache.ts"]);
        const saved = (await store.restore(initial.id))!;
        assert.deepEqual(saved.state.messages.filter(message => message.role === "assistant").map(message => message.content), [finalReply]);
        assert.equal(trajectory.events.filter(event => event.eventType === "memory_patch_accepted").some(event => JSON.stringify(event.payload).includes("rejected_claim")), false);
        assert.equal(trajectory.events.filter(event => event.eventType === "run_completed").length, 1);
        assert.equal(trajectory.events.some(event => event.eventType === "model_repair_feedback_recorded" && event.payload.feedback.origin === "completion_review"), true);
    });
}

test("three rejected candidates exhaust correction without a completed reply", async () => {
    const initial = goal("review-exhausted");
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(initial);
    let reviews = 0;
    const executor = createStepExecutor(() => complete(initial, "Analysis completed."), async () => {
        reviews++;
        return { kind: "reject", feedback: "Supply the requested findings." };
    });
    const result = await new Runner({ store, trajectoryStore: trajectory, executor }).run({ goalId: initial.id, runId: "run-1" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    assert.equal(result.state.stepCount, 0);
    assert.equal(reviews, 3);
    assert.equal(trajectory.events.some(event => event.eventType === "run_completed"), false);
    assert.equal((await store.restore(initial.id))!.state.messages.some(message => message.content === "Analysis completed."), false);
});

test("invalid evidence is rejected before review and shares the three-attempt correction budget", async () => {
    const initial = goal("review-invalid-evidence");
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(initial);
    let decisions = 0;
    let reviews = 0;
    const executor = createStepExecutor(input => {
        decisions++;
        if (decisions === 1) return complete(input.goal, "Unsupported result", [9999]);
        assert.ok(input.runtimeFeedback);
        assert.equal(reviews, decisions - 2);
        return complete(input.goal, "Analysis completed.");
    }, async () => {
        reviews++;
        return { kind: "reject", feedback: "Provide the actual analysis." };
    });
    const result = await new Runner({ store, trajectoryStore: trajectory, executor }).run({ goalId: initial.id, runId: "run-1" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    assert.equal(decisions, 3);
    assert.equal(reviews, 2);
    assert.equal(result.state.stepCount, 0);
    assert.equal((await store.restore(initial.id))!.state.messages.some(message => message.role === "assistant"), false);
});

for (const interrupt of ["during-review", "after-feedback"] as const) {
    test(`review resumes safely ${interrupt}`, async () => {
        const initial = goal(`review-resume-${interrupt}`);
        const store = new InMemoryGoalStore();
        const trajectory = new InMemoryTrajectoryStore();
        await store.save(initial);
        let decisions = 0;
        const first = createStepExecutor(() => {
            decisions++;
            if (decisions === 2) throw new ExecutionAbortedError();
            return complete(initial, "Analysis completed.");
        }, async () => {
            if (interrupt === "during-review") throw new ExecutionAbortedError();
            return { kind: "reject", feedback: "Deliver the findings." };
        });
        await assert.rejects(new Runner({ store, trajectoryStore: trajectory, executor: first }).run({ goalId: initial.id, runId: "run-1" }), ExecutionAbortedError);
        const saved = (await store.restore(initial.id))!;
        assert.equal(saved.state.run.status, "running");
        assert.equal(saved.state.messages.some(message => message.role === "assistant"), false);
        assert.ok(saved.state.run.pendingModelRepair);
        let resumedReviews = 0;
        const resumed = createStepExecutor(input => {
            if (interrupt === "after-feedback") assert.equal(input.runtimeFeedback?.origin, "completion_review");
            return complete(input.goal, "The requested result is ready.");
        }, async () => { resumedReviews++; return { kind: "accept" }; });
        const result = await new Runner({ store, trajectoryStore: trajectory, executor: resumed }).run({ goalId: initial.id, runId: "run-1" });
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.state.status, "completed", JSON.stringify(result.state));
        assert.equal(result.state.stepCount, 1);
        assert.equal(resumedReviews, 1);
    });
}

test("review transport retries preserve candidate and failed completion saves never publish a terminal reply", async () => {
    const initial = goal("review-save-failure");
    const backing = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await backing.save(initial);
    let failSave = true;
    const store: GoalStore = { restore: id => backing.restore(id), async save(value) {
        if (failSave && value.state.run.status === "completed") throw new Error("completion save failed");
        await backing.save(value);
    } };
    let reviews = 0;
    const executor = createStepExecutor(input => complete(input.goal, "Hello."), async () => {
        reviews++;
        if (reviews === 1) throw new TransientModelRequestFailure("connection");
        return { kind: "accept" };
    });
    await assert.rejects(new Runner({ store, trajectoryStore: trajectory, executor }).run({ goalId: initial.id, runId: "run-1" }), /completion save failed/);
    assert.equal(reviews, 2);
    assert.equal((await backing.restore(initial.id))!.state.messages.some(message => message.content === "Hello."), false);
    failSave = false;
    const result = await new Runner({ store, trajectoryStore: trajectory, executor }).run({ goalId: initial.id, runId: "run-1" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "completed", JSON.stringify(result.state));
    assert.equal((await backing.restore(initial.id))!.state.messages.filter(message => message.content === "Hello.").length, 1);
});
