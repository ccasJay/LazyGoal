import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LLMAdapter } from "../../../packages/llm-core/src/index";
import { createGoal } from "../../../packages/runtime/src/domain";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerDeliveryStore } from "../../../packages/storage/src/trigger-delivery-store";
import { admitTrigger } from "../src/runtime/trigger-admission";

function mockAdapter(handler: LLMAdapter["generate"], structuredOutputMode: "strict" | "prompt_only" = "prompt_only"): LLMAdapter {
    return { structuredOutputMode, generate: handler };
}
function factory(intent: string, reserved: string | undefined) {
    return Promise.resolve({ goal: createGoal({ ...currentProtocols, id: reserved ?? `goal-${intent}`, runId: "run", intent,
        promptBundleVersion: 1, profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] } }), authorization: { workspaceRoot: "/workspace", toolIds: [], sandbox: { extraFiles: [], network: "none" as const } } });
}
const user = { role: "user", mayCreateGoal: true, goalIds: [] } as const;
const external = { role: "external", mayCreateGoal: true, goalIds: [] } as const;

test("fast path accepts explicit user work and routes control without creating a Goal", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-admission-"));
    try {
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const deliveries = new TriggerDeliveryStore(join(dir, "db"));
        const goals = new JsonFileGoalStore(dir);
        const adapter = mockAdapter(async () => { throw new Error("unexpected model call"); });
        const input = { deliveryId: "d", trigger: { id: "t", purpose: "work", source: "user", payload: '{"intent":"inspect"}' } };
        assert.equal((await admitTrigger(owner, deliveries, goals, adapter, input, user, factory)).kind, "settled");
        assert.deepEqual(deliveries.queuedGoalIds(), ["goal-inspect"]);
        assert.deepEqual((await goals.restore("goal-inspect"))?.definition.triggerContext, {
            deliveryId: "d", trigger: input.trigger,
            authorization: { workspaceRoot: "/workspace", toolIds: [], sandbox: { extraFiles: [], network: "none" } },
        });
        const control = { deliveryId: "c", goalId: "goal-inspect", trigger: { id: "tc", purpose: "cancel", source: "user", payload: "{}" } };
        assert.deepEqual(await admitTrigger(owner, deliveries, goals, adapter, control, { ...user, goalIds: ["goal-inspect"] }, factory), { kind: "routed" });
        assert.deepEqual(deliveries.queuedGoalIds(), ["goal-inspect"]);
        await owner.close(); deliveries.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("slow path ignores or accepts using Supervisor model and enqueues in completion order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-admission-"));
    try {
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const deliveries = new TriggerDeliveryStore(join(dir, "db"));
        const goals = new JsonFileGoalStore(dir);
        let release!: () => void;
        const wait = new Promise<void>((resolve) => { release = resolve; });
        const adapter = mockAdapter(async (request) => {
            assert.ok(request.structuredOutput);
            const body = String(request.messages[1]?.content);
            if (body.includes("slow")) await wait;
            const decision = body.includes("ignore") ? { kind: "ignore", intent: "" } : { kind: "accept", intent: body.includes("slow") ? "slow" : "fast" };
            return { blocks: [{ index: 0, type: "text", format: "json", text: JSON.stringify(decision) }] };
        }, "strict");
        const event = (id: string) => ({ deliveryId: `d-${id}`, trigger: { id: `t-${id}`, purpose: "work", source: "external", payload: JSON.stringify({ kind: id }) } });
        const slow = admitTrigger(owner, deliveries, goals, adapter, event("slow"), external, factory);
        const fast = await admitTrigger(owner, deliveries, goals, adapter, event("fast"), external, factory);
        const ignored = await admitTrigger(owner, deliveries, goals, adapter, event("ignore"), external, factory);
        assert.equal(fast.kind, "settled");
        assert.equal(ignored.kind, "settled");
        release();
        assert.equal((await slow).kind, "settled");
        assert.deepEqual(deliveries.queuedGoalIds(), ["goal-fast", "goal-slow"]);
        await owner.close(); deliveries.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("model failures and malformed decisions remain pending across restart and can retry", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-admission-"));
    try {
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const path = join(dir, "db");
        let deliveries = new TriggerDeliveryStore(path);
        const goals = new JsonFileGoalStore(dir);
        const event = { deliveryId: "d", trigger: { id: "t", purpose: "work", source: "external", payload: "{}" } };
        const fail = mockAdapter(async () => { throw new Error("private provider detail"); });
        assert.deepEqual(await admitTrigger(owner, deliveries, goals, fail, event, external, factory), { kind: "pending", reason: "model-failed" });
        deliveries.close();
        deliveries = new TriggerDeliveryStore(path);
        assert.equal(deliveries.read("d")?.status, "pending");
        const pending = deliveries.read("d");
        assert.equal(pending?.status === "pending" ? pending.reason : undefined, "model-failed");
        const invalid = mockAdapter(async () => ({ blocks: [{ index: 0, type: "text", format: "plain", text: '{"kind":"accept","intent":""}' }] }));
        assert.deepEqual(await admitTrigger(owner, deliveries, goals, invalid, event, external, factory), { kind: "pending", reason: "invalid-model-result" });
        assert.deepEqual(deliveries.queuedGoalIds(), []);
        const success = mockAdapter(async () => ({ blocks: [{ index: 0, type: "text", format: "plain", text: '{"kind":"accept","intent":"recover"}' }] }));
        assert.equal((await admitTrigger(owner, deliveries, goals, success, event, external, factory)).kind, "settled");
        assert.deepEqual(deliveries.queuedGoalIds(), ["goal-recover"]);
        await owner.close(); deliveries.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});
