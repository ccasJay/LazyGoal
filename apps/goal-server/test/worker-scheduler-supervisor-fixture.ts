import { join } from "node:path";
import type { LLMAdapter } from "../../../packages/llm-core/src/index";
import { createGoal } from "../../../packages/runtime/src/domain";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import { transition } from "../../../packages/runtime/src/transition";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { resumeUnroutedWorkTriggers } from "../src/runtime/trigger-admission";
import { WorkerScheduler } from "../src/runtime/worker-scheduler";

const required = (name: string): string => {
    const value = process.env[name];
    if (value === undefined) throw new Error(`Missing ${name}`);
    return value;
};

const dataDirectory = required("LG_TEST_DATA_DIRECTORY");
const workspace = required("LG_TEST_WORKSPACE");
const home = required("LG_TEST_HOME");
const owner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
const triggers = new TriggerStore(join(dataDirectory, "triggers.db"));
const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
const admissionAdapter: LLMAdapter = {
    structuredOutputMode: "prompt_only",
    async generate() {
        return { blocks: [{ index: 0, type: "text", format: "json", text: JSON.stringify({ kind: "accept", intent: "reconnect", workspaceMode: "shared" }) }] };
    },
};
const permissionAdapter: LLMAdapter = {
    structuredOutputMode: "prompt_only",
    async generate() { throw new Error("Waiting Goals must not call a model"); },
};
const createRecoveredGoal = async (intent: string, reservedGoalId: string | undefined) => {
    const goal = createGoal({ ...currentProtocols, id: reservedGoalId ?? `goal-${intent}`, runId: `run-${intent}`, intent,
        promptBundleVersion: 1, profile: { id: "default", systemPrompt: "", instructions: [], toolIds: [] } });
    const started = transition(goal.state.run, { kind: "start" });
    if (!started.ok) throw new Error("Could not prepare the recovered test Goal");
    const waiting = transition(started.state, { kind: "decision", decision: { kind: "wait", reason: "Supervisor input" } });
    if (!waiting.ok) throw new Error("Could not prepare the recovered test Goal");
    return {
        goal: { ...goal, state: { ...goal.state, run: waiting.state } },
        authorization: { workspace: { mode: "shared" as const, projectRoot: workspace, executionRoot: workspace },
            toolIds: [], sandbox: { extraFiles: [], network: "none" as const } },
    };
};
const scheduler = new WorkerScheduler({
    owner,
    triggers,
    goals,
    cwd: workspace,
    dataDirectory,
    env: { LAZYGOAL_HOME: home, LLM_PROVIDER: "openai", LLM_MODEL: "gpt-4o-mini", LLM_API_KEY: "test" },
    permissionAdapter,
});

void (async () => {
    await resumeUnroutedWorkTriggers(owner, triggers, goals, admissionAdapter, createRecoveredGoal);
    await scheduler.pump();
    const workers = await scheduler.processIds();
    if (workers.length === 0) throw new Error("Supervisor did not start a Worker");
    process.send?.({ kind: "ready", workers, assignments: scheduler.assignments() });
    process.on("message", () => undefined);
})();
