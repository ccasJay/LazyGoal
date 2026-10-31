import assert from "node:assert/strict";
import { test } from "node:test";
import { modelOutputBindings } from "../src/index";

function readRoute(route: unknown) {
    return modelOutputBindings.systemTools.updatePlanRoute.read({
        baseRevision: 1,
        reason: "根据新证据调整路线",
        route,
    }, "reject");
}

test("Plan Run 路线候选接受有序阶段且不包含 Runtime 状态", () => {
    const candidate = {
        stages: [
            { target: "调查代码", acceptanceCriteria: ["找到入口"] },
            { target: "实现并验证", acceptanceCriteria: ["功能可用", "回归通过"] },
        ],
    };
    const parsed = readRoute(candidate);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.data.route, candidate);
});

test("Plan Run 路线候选拒绝缺失阶段与模型分配的身份或状态", () => {
    assert.equal(readRoute({ stages: [] }).ok, false);
    assert.equal(readRoute({ stages: [{ target: "目标", acceptanceCriteria: [] }] }).ok, false);
    assert.equal(readRoute({
        stages: [{ stageId: "model-id", status: "accepted", target: "目标", acceptanceCriteria: ["条件"] }],
    }).ok, false);
});
