import assert from "node:assert/strict";
import { test } from "node:test";
import { safeParse } from "../../contracts/src/index";
import {
    RunPlanRouteCandidateContract,
} from "../src/index";

test("Plan Run route candidate accepts ordered stages without Runtime-owned state", () => {
    const candidate = {
        stages: [
            { target: "调查代码", acceptanceCriteria: ["找到入口"] },
            { target: "实现并验证", acceptanceCriteria: ["功能可用", "回归通过"] },
        ],
    };
    const parsed = safeParse(RunPlanRouteCandidateContract, candidate);
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.deepEqual(parsed.data, candidate);
});

test("Plan Run route candidate rejects missing stages and model-assigned identity/status", () => {
    assert.equal(safeParse(RunPlanRouteCandidateContract, { stages: [] }).success, false);
    assert.equal(safeParse(RunPlanRouteCandidateContract, { stages: [{ target: "目标", acceptanceCriteria: [] }] }).success, false);
    assert.equal(safeParse(RunPlanRouteCandidateContract, {
        stages: [{ stageId: "model-id", status: "accepted", target: "目标", acceptanceCriteria: ["条件"] }],
    }).success, false);
});
