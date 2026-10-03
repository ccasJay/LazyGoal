import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { contract } from "../../../contracts/src/index";
import {
    createGoal,
    createToolRegistration,
    InMemoryToolRegistry,
    Runner,
    type StepExecutor,
} from "../../../runtime/src/index";
import { currentProtocols } from "../../../runtime/test/current-fixtures";
import { createExecuteProgramRegistration } from "../../../tools/src/index";
import { JsonFileGoalStore } from "../../src/goal-store";
import { JsonFileTrajectoryStore } from "../../src/json-file-trajectory-store";

const mode = process.argv[2];
const root = process.argv[3];
if ((mode !== "start" && mode !== "resume") || root === undefined) {
    throw new Error("Invalid fixture arguments");
}

const store = new JsonFileGoalStore(join(root, "goals"));
const trajectoryStore = new JsonFileTrajectoryStore(join(root, "trajectory"));
const ref = { goalId: "process-ptc-goal", runId: "process-ptc-run" };
const code = "const r = await tools.read_file({path:'a'}); await tools.write_file({path:'b',content:r.observation.output}); return {value:r.observation.output};";
if (mode === "start") {
    const created = createGoal({
        ...currentProtocols,
        id: ref.goalId,
        runId: ref.runId,
        intent: "Recover program",
        promptBundleVersion: 1,
        profile: {
            id: "process-ptc",
            systemPrompt: "Test",
            instructions: [],
            toolIds: ["execute_program", "read_file", "write_file"],
        },
        maxSteps: 3,
    });
    await store.save({
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                mode: "plan",
                approvedTask: { objective: "Recover program", completionCriteria: [] },
            },
        },
    });
}

const registry = new InMemoryToolRegistry([
    createExecuteProgramRegistration(),
    createToolRegistration({
        definition: {
            id: "read_file", description: "Read fixture", inputContract: contract.object({ path: contract.string() }), isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            await appendFile(join(root, "reads"), "1");
            return { kind: "success", output: "recorded", summary: "Read" };
        },
    }),
    createToolRegistration({
        definition: {
            id: "write_file", description: "Write fixture", inputContract: contract.object({ path: contract.string(), content: contract.string() }), isReadOnly: false,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            await appendFile(join(root, "writes"), "1");
            process.kill(process.pid, "SIGKILL");
            return { kind: "success", output: "saved", summary: "Wrote" };
        },
    }),
]);
const executor: StepExecutor = {
    async execute() {
        if (mode !== "start") throw new Error("Model must not run on recovery");
        return { kind: "tool_call", action: { actionId: "process-parent", toolId: "execute_program", input: { code } } };
    },
    async decide() {
        if (mode !== "start") throw new Error("Model must not run on recovery");
        return { kind: "decision", decision: { kind: "tool_call", action: { actionId: "process-parent", toolId: "execute_program", input: { code } } } };
    },
    async think() { throw new Error("Unexpected Think"); },
};
const result = await new Runner({ store, trajectoryStore, executor, toolRegistry: registry }).run(ref);
process.stdout.write(JSON.stringify(result));
