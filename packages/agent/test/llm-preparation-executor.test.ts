import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest } from "../../llm/src/core/types";
import type { AgentProfile } from "../../runtime/src/agent-profile";
import { createGoal } from "../../runtime/src/domain";
import type { Goal } from "../../runtime/src/domain";
import {
    LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    LLMPreparationExecutor,
    LLMResponseProtocolError,
    PREPARATION_RESULT_PROTOCOL,
    TOOLS_NOT_SUPPORTED_ERROR_CODE,
    ToolsNotSupportedError,
} from "../src/index";

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "你是一个任务准备代理。",
    instructions: ["只收集必要信息"],
    toolIds: [],
};

function createPreparationGoal(
    phase: "gathering_context" | "planning" = "gathering_context",
    runProfile: AgentProfile = profile,
): Goal {
    const goal = createGoal({
        id: "goal-1",
        intent: "实现可恢复 Agent",
        profile: runProfile,
        runId: "run-1",
    });

    if (phase === "gathering_context") {
        return goal;
    }

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "planning",
                preparation: { status: "active" },
            },
        },
    };
}

class FakeAdapter implements LLMAdapter {
    readonly requests: LLMRequest[] = [];

    constructor(private readonly content: string) {}

    async generate(request: LLMRequest): Promise<{ content: string }> {
        this.requests.push(request);
        return { content: this.content };
    }
}

class RejectingAdapter implements LLMAdapter {
    readonly requests: LLMRequest[] = [];

    constructor(private readonly failure: unknown) {}

    async generate(request: LLMRequest): Promise<never> {
        this.requests.push(request);
        throw this.failure;
    }
}

test("gathering_context 只解析 question/context_ready 协议", async () => {
    const goal = createPreparationGoal();
    const adapter = new FakeAdapter(JSON.stringify({
        kind: "question",
        question: "任务需要兼容旧快照吗？",
    }));
    const executor = new LLMPreparationExecutor({ adapter });

    const result = await executor.execute(goal);

    assert.deepEqual(result, {
        kind: "question",
        question: "任务需要兼容旧快照吗？",
    });
    assert.equal(adapter.requests.length, 1);
    assert.ok(
        (adapter.requests[0]?.messages[0]?.content ?? "").includes(
            PREPARATION_RESULT_PROTOCOL.gathering_context,
        ),
    );
    assert.deepEqual(
        JSON.parse(adapter.requests[0]?.messages.at(-1)?.content ?? ""),
        { phase: "gathering_context", intent: goal.definition.intent },
    );
});

test("planning 只解析 task_proposal 协议", async () => {
    const goal = createPreparationGoal("planning");
    const adapter = new FakeAdapter(JSON.stringify({
        kind: "task_proposal",
        task: {
            objective: "实现可恢复 Agent",
            completionCriteria: ["恢复测试通过"],
        },
        approvalRequest: "是否批准该任务？",
    }));
    const executor = new LLMPreparationExecutor({ adapter });

    const result = await executor.execute(goal);

    assert.deepEqual(result, {
        kind: "task_proposal",
        task: {
            objective: "实现可恢复 Agent",
            completionCriteria: ["恢复测试通过"],
        },
        approvalRequest: "是否批准该任务？",
    });
    assert.equal(adapter.requests.length, 1);
    assert.ok(
        (adapter.requests[0]?.messages[0]?.content ?? "").includes(
            PREPARATION_RESULT_PROTOCOL.planning,
        ),
    );
});

test("模型返回其他 phase 的 PreparationResult 时不重试", async () => {
    const adapter = new FakeAdapter(JSON.stringify({
        kind: "question",
        question: "不属于 planning",
    }));
    const executor = new LLMPreparationExecutor({ adapter });

    await assert.rejects(
        executor.execute(createPreparationGoal("planning")),
        (error: unknown) => {
            assert.ok(error instanceof LLMResponseProtocolError);
            assert.equal(error.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
            assert.match(error.message, /planning/);
            return true;
        },
    );
    assert.equal(adapter.requests.length, 1);
});

test("Adapter 异常保持原对象传播且不重试", async () => {
    const adapterError = new Error("供应商暂不可用");
    const adapter = new RejectingAdapter(adapterError);
    const executor = new LLMPreparationExecutor({ adapter });

    await assert.rejects(
        executor.execute(createPreparationGoal()),
        (error: unknown) => error === adapterError,
    );
    assert.equal(adapter.requests.length, 1);
});

test("Preparation Profile 含 Tool 时提前拒绝且不调用 Adapter", async () => {
    const adapter = new FakeAdapter(JSON.stringify({ kind: "context_ready" }));
    const executor = new LLMPreparationExecutor({ adapter });
    const goal = createPreparationGoal("gathering_context", {
        ...profile,
        toolIds: ["filesystem"],
    });

    await assert.rejects(
        executor.execute(goal),
        (error: unknown) => {
            assert.ok(error instanceof ToolsNotSupportedError);
            assert.equal(error.code, TOOLS_NOT_SUPPORTED_ERROR_CODE);
            assert.deepEqual(error.toolIds, ["filesystem"]);
            return true;
        },
    );
    assert.equal(adapter.requests.length, 0);
});

test("非 active Preparation Goal 在 Adapter 调用前被拒绝", async () => {
    const active = createPreparationGoal();
    const waiting: Goal = {
        ...active,
        state: {
            ...active.state,
            workflow: {
                phase: "gathering_context",
                preparation: { status: "waiting_input" },
            },
        },
    };
    const adapter = new FakeAdapter(JSON.stringify({ kind: "context_ready" }));
    const executor = new LLMPreparationExecutor({ adapter });

    await assert.rejects(
        executor.execute(waiting),
        /active preparation Goal/,
    );
    assert.equal(adapter.requests.length, 0);
});
