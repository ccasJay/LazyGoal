import assert from "node:assert/strict";
import { test } from "node:test";
import { driveScript } from "../src/script-driver.js";
import { parseScenario } from "../src/scenario.js";
const raw = { id: "probe", image: "node", initialFiles: { "config.json": "{}" }, checkpointAfter: 0,
    profile: { id: "context", systemPrompt: "Test", instructions: [], toolIds: ["context_shell"] },
    budget: { maxSteps: 5, maxCalls: 10, stageTimeoutMs: 1000, totalTimeoutMs: 5000 },
    verifier: "test -f config.json", rubric: { text: "Explain evidence", threshold: 0.5 }, limitations: "Smoke only",
    stages: [{ operation: "launch", prompt: "first", expect: "failed" }, { operation: "continue", prompt: "secret-future", expect: "completed" }] };
test("expected failure triggers continue, sends only current message, retains identities", async () => {
    const scenario = parseScenario(raw);
    const sent: unknown[] = [];
    const result = await driveScript(scenario, async stage => {
        sent.push(stage);
        return { goalId: "g", runId: stage.operation === "launch" ? "r1" : "r2", status: stage.expect, sequence: 2 };
    }, new AbortController().signal);
    assert.equal(result.length, 2);
    assert.equal(JSON.stringify(sent[0]).includes("secret-future"), false);
    assert.equal(JSON.stringify(sent).includes(raw.rubric.text), false);
});
test("wrong state stops before next prompt", async () => {
    let calls = 0;
    await assert.rejects(() => driveScript(parseScenario(raw), async () => {
        calls++; return { goalId: "g", runId: "r", status: "completed", sequence: 2 };
    }, new AbortController().signal), /Actual state/);
    assert.equal(calls, 1);
});
test("waiting resume keeps same Run; wrong waiting type is rejected", async () => {
    const scenario = parseScenario({ ...raw, stages: [
        { operation: "launch", prompt: "wait", expect: "waiting", waitingFor: "blocked" },
        { operation: "resume", prompt: "3", expect: "completed" },
    ] });
    await driveScript(scenario, async stage => ({ goalId: "g", runId: "r", status: stage.expect, sequence: 3, ...(stage.expect === "waiting" ? { waitingFor: "blocked" } : {}) }), new AbortController().signal);
    await assert.rejects(() => driveScript(scenario, async () => ({ goalId: "g", runId: "r", status: "waiting", waitingFor: "ask_user", sequence: 3 }), new AbortController().signal), /Actual state/);
});
test("invalid lifecycle scripts and unsafe files reject at file boundary", () => {
    assert.throws(() => parseScenario({ ...raw, initialFiles: { "../secret": "x" } }), /Unsafe/);
    assert.throws(() => parseScenario({ ...raw, stages: [raw.stages[0], { ...raw.stages[1], operation: "resume" }] }), /Operation/);
});
test("cancellation and stage timeout prevent future delivery", async () => {
    const scenario = parseScenario({ ...raw, budget: { ...raw.budget, stageTimeoutMs: 10 } });
    let calls = 0;
    await assert.rejects(() => driveScript(scenario, async (_stage, _previous, signal) => {
        calls++;
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 100);
            signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
        });
        throw new Error("Unexpected progress");
    }, new AbortController().signal));
    assert.equal(calls, 1);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => driveScript(scenario, async () => { calls++; throw new Error("Must not deliver"); }, controller.signal));
    assert.equal(calls, 1);
});
