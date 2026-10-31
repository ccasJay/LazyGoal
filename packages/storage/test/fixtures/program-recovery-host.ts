import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import {
    createGoal,
    Runner,
    type StepExecutor,
} from "../../../runtime/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
} from "../../../tool-core/src/index";
import { createTestBinding, objectInputSchema } from "../../../tool-core/test/binding-fixtures";
import { currentProtocols } from "../../../runtime/test/current-fixtures";
import { createExecuteProgramRegistration } from "../../../tools/src/index";
import { JsonFileGoalStore } from "../../src/goal-store";
import { JsonFileTrajectoryStore } from "../../src/json-file-trajectory-store";
import { createTestToolRegistration } from "../../../tool-core/test/helpers";

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
                exposedToolIds: [...created.definition.profile.toolIds],
                mode: "plan",
                approvedTask: { objective: "Recover program", completionCriteria: [] },
                currentStage: {
                    stageId: "stage-1",
                    revision: 1,
                    status: "executing" as const,
                    target: "Recover program",
                    acceptanceCriteria: ["测试完成"],
                },
            },
        },
    });
}

const registry = new InMemoryToolRegistry([
    createExecuteProgramRegistration(),
    createTestToolRegistration({
        definition: {
            id: "read_file", description: "Read fixture", inputBinding: createTestBinding("test.fixture", objectInputSchema({ path: { type: "string" } })), isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            await appendFile(join(root, "reads"), "1");
            return { kind: "success", output: "recorded", summary: "Read" };
        },
    }),
    createTestToolRegistration({
        definition: {
            id: "write_file", description: "Write fixture", inputBinding: createTestBinding("test.fixture", objectInputSchema({ path: { type: "string" }, content: { type: "string" } })), isReadOnly: false,
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
        async reviewCompletion() { return { kind: "accept" as const }; },
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
