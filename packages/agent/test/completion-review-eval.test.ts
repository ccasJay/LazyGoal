import assert from "node:assert/strict";
import { test } from "node:test";
import { safeParse } from "../../contracts/src/index";
import { AgentDecisionContract } from "../../model-contracts/src/index";
import { completionReviewScenarios, completionReviewScenarioInput, scoreCompletionReview, completionReviewStatus } from "./completion-review-eval";

test("real-case fixtures require their actual source, independent of Memory Patch", () => {
    const negative = completionReviewScenarios.find(s => s.id === "generic-for-real-case")!;
    const fixture = completionReviewScenarioInput(negative);
    assert.equal(safeParse(AgentDecisionContract, fixture.candidate).success, true);
    assert.equal("memoryPatch" in fixture.candidate, false);
    assert.equal(fixture.evidence.length, 0);
    assert.equal(fixture.contextLookupResult?.status, "not_found");
    assert.equal(scoreCompletionReview(false, { kind: "accept" }).falseCompletion, true);
    assert.equal(scoreCompletionReview(true, { kind: "reject", feedback: "Missing source" }).falseRejection, true);
});

test("missing calls and any wrong judgement cannot pass the review report", () => {
    assert.equal(completionReviewStatus(6, 5, false, 0, 0), "incomplete");
    assert.equal(completionReviewStatus(6, 6, true, 0, 0), "incomplete");
    assert.equal(completionReviewStatus(6, 6, false, 1, 0), "failed");
    assert.equal(completionReviewStatus(6, 6, false, 0, 1), "failed");
    assert.equal(completionReviewStatus(6, 6, false, 0, 0), "passed");
});

test("supported fixtures supply paired committed observations to the production review", () => {
    const fixture = completionReviewScenarioInput(completionReviewScenarios.find(s => s.id === "documented-real-case")!);
    assert.ok(fixture.evidence.some(e => e.eventType === "observation_recorded"));
    assert.ok(fixture.evidence.some(e => e.eventType === "tool_finished"));
    assert.match(JSON.stringify(fixture.evidence), /Decision D1/);
});

test("new stage, failure diagnosis and overall review scenarios produce valid fixtures", () => {
    // 阶段通过但整体遗漏
    const overallMissed = completionReviewScenarios.find(s => s.id === "stage-passed-overall-missed")!;
    const overallFixture = completionReviewScenarioInput(overallMissed);
    assert.equal(overallMissed.accept, false);
    assert.ok(overallFixture.currentStage !== undefined);
    assert.equal(overallFixture.candidate.kind, "complete");

    // 失败诊断合法完成
    const diagScenario = completionReviewScenarios.find(s => s.id === "failure-diagnosis-accepted")!;
    const diagFixture = completionReviewScenarioInput(diagScenario);
    assert.equal(diagScenario.accept, true);
    assert.ok(diagFixture.evidence.some(e => e.eventType === "observation_recorded" && (e.payload as any).observation.kind === "failure"));

    // 中间阶段完成
    const stageScenario = completionReviewScenarios.find(s => s.id === "stage-complete-supported")!;
    const stageFixture = completionReviewScenarioInput(stageScenario);
    assert.equal(stageScenario.accept, true);
    assert.equal(stageFixture.candidate.kind, "run_stage_complete");
    assert.equal(safeParse(AgentDecisionContract, stageFixture.candidate).success, true);
    assert.equal(stageFixture.currentStage?.stageId, "stage-1");
});
