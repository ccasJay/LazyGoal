import { join } from "node:path";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerDeliveryStore } from "../../../packages/storage/src/trigger-delivery-store";
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
const deliveries = new TriggerDeliveryStore(join(dataDirectory, "deliveries.db"));
const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
const never = { structuredOutputMode: "prompt_only" as const, async generate() { throw new Error("Waiting Goals must not call a model"); } };
const scheduler = new WorkerScheduler({
    owner,
    deliveries,
    goals,
    cwd: workspace,
    dataDirectory,
    env: { LAZYGOAL_HOME: home, LLM_PROVIDER: "openai", LLM_MODEL: "gpt-4o-mini", LLM_API_KEY: "test" },
    permissionAdapter: never,
});

void (async () => {
    await scheduler.pump();
    const workers = await scheduler.processIds();
    if (workers.length === 0) throw new Error("Supervisor did not start a Worker");
    process.send?.({ kind: "ready", workers, assignments: scheduler.assignments() });
    process.on("message", () => undefined);
})();
