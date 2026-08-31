import assert from "node:assert/strict";
import { test } from "node:test";

import {
    CONTEXT_SOURCE_ROUTE_INVALID_CODE,
    CONTEXT_SOURCE_ROUTE_REJECTED_CODE,
    ContextSourceRouter,
    ContextSourceRouterError,
    routeContextSource,
} from "../src/index";

const router = new ContextSourceRouter();

test("历史执行和决策理由只路由到规范化 Trajectory lookup", () => {
    const execution = router.route({
        need: "historical_execution",
        question: "之前哪个 Action 修改了配置？",
        filters: { toolIds: ["edit_file", "edit_file"] },
    });
    const rationale = routeContextSource({
        need: "decision_rationale",
        question: "之前为什么选择这个 Action？",
    });

    assert.equal(execution.source, "trajectory");
    assert.equal(execution.historical, true);
    assert.deepEqual(execution.request, {
        kind: "context_lookup",
        need: "historical_execution",
        question: "之前哪个 Action 修改了配置？",
        filters: { toolIds: ["edit_file"] },
    });
    assert.equal(rationale.source, "trajectory");
    assert.equal(rationale.request.kind, "context_lookup");
});

test("当前 Workspace、Environment 和验证需求保留给授权 Tool", () => {
    for (const need of [
        "current_workspace_state",
        "current_environment_state",
        "verification_status",
    ] as const) {
        const route = router.route({ need });

        assert.equal(route.source, "authorized_tool");
        assert.equal(route.need, need);
        if (route.source !== "authorized_tool") {
            assert.fail("expected an authorized Tool route");
        }
        assert.match(route.instruction, /授权 Tool/);
    }
});

test("任务契约和用户约束来自 Goal/Conversation 权威投影", () => {
    const task = router.route({ need: "task_contract" });
    const constraints = router.route({ need: "user_constraints" });

    assert.equal(task.source, "goal_task");
    assert.equal(task.need, "task_contract");
    assert.match(task.instruction, /Goal Task/);
    assert.equal(constraints.source, "conversation");
    assert.equal(constraints.need, "user_constraints");
    assert.match(constraints.instruction, /Conversation/);
});

test("routeContextLookup 拒绝把当前需求伪装成历史查询且不调用外部能力", () => {
    assert.throws(
        () => router.routeContextLookup({
            kind: "context_lookup",
            need: "current_workspace_state",
            question: "当前文件是什么？",
        }),
        (error: unknown) => {
            assert.ok(error instanceof ContextSourceRouterError);
            assert.equal(error.code, CONTEXT_SOURCE_ROUTE_REJECTED_CODE);
            assert.equal(error.need, "current_workspace_state");
            return true;
        },
    );
});

test("非法需求或历史查询缺少问题时 fail-closed", () => {
    assert.throws(
        () => router.route({ need: "unknown" }),
        (error: unknown) => {
            assert.ok(error instanceof ContextSourceRouterError);
            assert.equal(error.code, CONTEXT_SOURCE_ROUTE_INVALID_CODE);
            return true;
        },
    );
    assert.throws(
        () => router.route({ need: "historical_execution" }),
        (error: unknown) => {
            assert.ok(error instanceof ContextSourceRouterError);
            assert.equal(error.code, CONTEXT_SOURCE_ROUTE_INVALID_CODE);
            assert.equal(error.need, "historical_execution");
            return true;
        },
    );
});
