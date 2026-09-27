import assert from "node:assert/strict";
import { test } from "node:test";

import {
    DynamicSectionDiffError,
    DynamicSectionRegistry,
    planDynamicSectionUpdates,
} from "../src/index";
import type {
    DynamicSectionMessage,
    DynamicSectionIdentity,
} from "../src/index";
import type {
    ModelContextFramePayload,
    ModelContextSectionUpdate,
} from "../../runtime/src/index";

const registry = new DynamicSectionRegistry([
    {
        id: "goal_plan",
        order: 30,
        source: "GoalState.goalPlan",
        role: "user",
        templateId: "goal-plan@1",
        project: () => undefined,
    },
    {
        id: "working_memory",
        order: 50,
        source: "WorkingMemory",
        role: "user",
        templateId: "working-memory@1",
        project: () => undefined,
    },
]);

function section(
    sectionId: string,
    projection: unknown,
    body: string,
): DynamicSectionMessage {
    const identity = registry.identities().find((entry) => entry.sectionId === sectionId);
    assert.ok(identity);
    return {
        ...identity,
        projection,
        content: `[Dynamic section: ${sectionId}; source: ${identity.source}]\n${body}`,
    };
}

function activeUpdate(message: DynamicSectionMessage): ModelContextSectionUpdate {
    return {
        sectionId: message.sectionId,
        order: message.order,
        source: message.source,
        role: message.role,
        templateId: message.templateId,
        status: "active",
        projection: message.projection as ModelContextSectionUpdate["projection"],
        content: message.content,
    };
}

function frame(sections: readonly ModelContextSectionUpdate[]): ModelContextFramePayload {
    return {
        type: "model_context_frame",
        stage: "decide",
        epochNumber: 0,
        conversationPosition: 2,
        sections,
    };
}

test("无同阶段基线时发送每个当前 Section 的完整状态", () => {
    const goalPlan = section("goal_plan", { items: ["检查实现"] }, "当前计划");
    const memory = section("working_memory", { facts: ["已确认约束"] }, "当前记忆");

    const plan = planDynamicSectionUpdates(registry, [memory, goalPlan], []);

    assert.deepEqual(plan.messages.map((message) => message.sectionId), ["goal_plan", "working_memory"]);
    assert.equal(plan.messages[0]?.content, goalPlan.content);
    assert.equal(plan.messages[1]?.content, memory.content);
    assert.deepEqual(plan.frameSections.map((update) => update.status), ["active", "active"]);
});

test("等价 JSON 投影不重复更新，即使对象键顺序和渲染文本不同", () => {
    const current = section("working_memory", { z: 1, nested: { b: 2, a: 1 } }, "新生成的相同可见状态");
    const previous = {
        ...activeUpdate(section("working_memory", { nested: { a: 1, b: 2 }, z: 1 }, "此前渲染文本")),
    };

    const plan = planDynamicSectionUpdates(registry, [current], [frame([previous])]);

    assert.deepEqual(plan.messages, []);
    assert.deepEqual(plan.frameSections, []);
    assert.match(previous.content, /此前渲染文本$/);
});

test("投影改变时发送带整段替换语义的内容并保存规范化投影", () => {
    const previous = activeUpdate(section("goal_plan", { items: ["旧计划"] }, "旧计划正文"));
    const current = section("goal_plan", { items: ["新计划"] }, "新计划完整正文");

    const plan = planDynamicSectionUpdates(registry, [current], [frame([previous])]);

    assert.equal(plan.messages.length, 1);
    assert.match(plan.messages[0]?.content ?? "", /operation: replace/);
    assert.match(plan.messages[0]?.content ?? "", /replaces all earlier content/);
    assert.match(plan.messages[0]?.content ?? "", /新计划完整正文/);
    assert.deepEqual(plan.frameSections[0]?.projection, { items: ["新计划"] });
    assert.equal(plan.frameSections[0]?.content, plan.messages[0]?.content);
});

test("移除已投影 Section 时发通用 tombstone 并把基线标为失效", () => {
    const previous = activeUpdate(section("goal_plan", { items: ["旧计划"] }, "旧计划正文"));

    const plan = planDynamicSectionUpdates(registry, [], [frame([previous])]);

    assert.equal(plan.messages.length, 1);
    assert.match(plan.messages[0]?.content ?? "", /operation: invalidate/);
    assert.match(plan.messages[0]?.content ?? "", /no longer active/);
    assert.equal(plan.frameSections[0]?.status, "invalidated");
    assert.equal(plan.frameSections[0]?.projection, null);
});

test("Working Memory 只在其投影改变时更新，不受 GoalPlan 更新耦合", () => {
    const previousPlan = activeUpdate(section("goal_plan", { items: ["one"] }, "计划"));
    const previousMemory = activeUpdate(section("working_memory", { facts: ["one"] }, "记忆"));
    const currentPlan = section("goal_plan", { items: ["one"] }, "计划渲染不变");
    const currentMemory = section("working_memory", { facts: ["two"] }, "记忆新全文");

    const plan = planDynamicSectionUpdates(
        registry,
        [currentPlan, currentMemory],
        [frame([previousPlan, previousMemory])],
    );

    assert.deepEqual(plan.messages.map((message) => message.sectionId), ["working_memory"]);
    assert.match(plan.messages[0]?.content ?? "", /operation: replace/);
    assert.deepEqual(plan.frameSections.map((sectionUpdate) => sectionUpdate.sectionId), ["working_memory"]);
});

test("Planner 对未知历史身份、重复当前 ID 和非 JSON 投影 fail closed", () => {
    const message = section("goal_plan", { items: ["current"] }, "状态");
    const staleIdentity = {
        ...activeUpdate(message),
        source: "OldSource",
    };
    const unknownIdentity: ModelContextSectionUpdate = {
        ...activeUpdate(message),
        sectionId: "unknown_section",
    };

    assert.throws(
        () => planDynamicSectionUpdates(registry, [message], [frame([staleIdentity])]),
        DynamicSectionDiffError,
    );
    assert.throws(
        () => planDynamicSectionUpdates(registry, [message], [frame([unknownIdentity])]),
        DynamicSectionDiffError,
    );
    assert.throws(
        () => planDynamicSectionUpdates(registry, [message, message], []),
        /duplicate section/,
    );
    assert.throws(
        () => planDynamicSectionUpdates(registry, [section("goal_plan", undefined, "bad")], []),
        /not JSON data/,
    );
});

test("Registry exposes every stable section identity, including omitted projections", () => {
    const identities: readonly DynamicSectionIdentity[] = registry.identities();
    assert.deepEqual(identities.map(({ sectionId, order }) => [sectionId, order]), [
        ["goal_plan", 30],
        ["working_memory", 50],
    ]);
});
