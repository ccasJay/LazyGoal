import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { contract } from "../../contracts/src/index";
import {
    createGoal,
    createToolRegistration,
    ExecutionAbortedError,
    GoalCoordinator,
    InMemoryToolRegistry,
    InlineScheduler,
    Runner,
    transition,
    type StepExecutor,
} from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import { isSeatbeltSupported } from "../../sandbox/src/index";
import { BashTool, createExecuteProgramRegistration, ReadFileTool, WriteFileTool } from "../../tools/src/index";
import { JsonFileGoalStore } from "../src/goal-store";
import { JsonFileTrajectoryStore } from "../src/json-file-trajectory-store";

test("PTC restores committed reads and waits for a write with an unknown result", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-ptc-recovery-"));
    try {
        const createStores = () => ({
            store: new JsonFileGoalStore(join(root, "goals")),
            trajectoryStore: new JsonFileTrajectoryStore(join(root, "trajectory")),
        });
        const created = createGoal({
            ...currentProtocols,
            id: "recovery-goal",
            runId: "recovery-run",
            intent: "Read then write",
            promptBundleVersion: 1,
            profile: {
                id: "ptc-test",
                systemPrompt: "Test",
                instructions: [],
                toolIds: ["execute_program", "read_file", "write_file"],
            },
            maxSteps: 3,
        });
        const goal = {
            ...created,
            state: {
                ...created.state,
                run: {
                    ...created.state.run,
                    mode: "plan" as const,
                    approvedTask: { objective: "Read then write", completionCriteria: [] },
                },
            },
        };
        await createStores().store.save(goal);
        let readCalls = 0;
        let writeCalls = 0;
        const readInput = contract.object({ path: contract.string() });
        const writeInput = contract.object({ path: contract.string(), content: contract.string() });
        const registry = new InMemoryToolRegistry([
            createExecuteProgramRegistration(),
            createToolRegistration({
                definition: {
                    id: "read_file", description: "Read", inputContract: readInput, isReadOnly: true,
                },
                replayPolicy: "safe",
                validate: () => ({ ok: true }),
                async execute() {
                    readCalls += 1;
                    return { kind: "success", output: "old", summary: "Read" };
                },
            }),
            createToolRegistration({
                definition: {
                    id: "write_file", description: "Write", inputContract: writeInput, isReadOnly: false,
                },
                replayPolicy: "safe",
                validate: () => ({ ok: true }),
                async execute() {
                    writeCalls += 1;
                    if (writeCalls === 1) throw new ExecutionAbortedError();
                    return { kind: "success", output: "saved", summary: "Wrote" };
                },
            }),
        ]);
        const code = "const r = await tools.read_file({path:'a'}); const w = await tools.write_file({path:'b',content:r.observation.output}); return {read:r.observation.output,write:w.observation.kind};";
        const initialDecision = {
            kind: "tool_call" as const,
            action: { actionId: "parent-recovery", toolId: "execute_program", input: { code } },
        };
        let firstModelCalls = 0;
        const firstExecutor: StepExecutor = {
            async execute() { firstModelCalls += 1; return initialDecision; },
            async decide() { firstModelCalls += 1; return { kind: "decision", decision: initialDecision }; },
            async think() { throw new Error("Unexpected Think"); },
        };
        const ref = { goalId: goal.id, runId: goal.state.run.id };
        await assert.rejects(new Runner({
            ...createStores(), executor: firstExecutor, toolRegistry: registry,
        }).run(ref), ExecutionAbortedError);
        assert.equal(firstModelCalls, 1);
        assert.equal(readCalls, 1);
        assert.equal(writeCalls, 1);

        let resumedModelCalls = 0;
        const resumedExecutor: StepExecutor = {
            async execute() {
                resumedModelCalls += 1;
                return { kind: "complete", summary: "Done", completionEvidence: [] };
            },
            async decide() {
                resumedModelCalls += 1;
                return {
                    kind: "decision",
                    decision: { kind: "complete", summary: "Done", completionEvidence: [] },
                };
            },
            async think() { throw new Error("Unexpected Think"); },
        };
        const resumedStores = createStores();
        const resumedRunner = new Runner({
            ...resumedStores, executor: resumedExecutor, toolRegistry: registry,
        });
        const waiting = await resumedRunner.run(ref);
        assert.equal(waiting.ok, true);
        if (!waiting.ok) return;
        assert.equal(waiting.state.status, "waiting");
        assert.equal(waiting.state.pendingAction?.status, "outcome_unknown");
        assert.equal(readCalls, 1);
        assert.equal(writeCalls, 1);
        assert.equal(resumedModelCalls, 0);
        const actionId = waiting.state.pendingAction?.action.actionId;
        assert.ok(actionId);
        const approved = transition(waiting.state, {
            kind: "approve_action", actionId, approvalScope: "action",
        });
        assert.equal(approved.ok, true);
        if (!approved.ok) return;
        const current = await resumedStores.store.restore(goal.id);
        assert.ok(current);
        await resumedStores.store.save({
            ...current,
            state: {
                ...current.state,
                run: {
                    ...approved.state,
                    pendingProgram: { ...approved.state.pendingProgram!, resultBytes: 0 },
                },
            },
        });
        await assert.rejects(resumedRunner.run(ref, { authorizedActionId: actionId }),
            /PTC_REPLAY_MISMATCH/);
        assert.equal(writeCalls, 1);
        await resumedStores.store.save({
            ...current,
            state: { ...current.state, run: approved.state },
        });
        const completed = await resumedRunner.run(ref, { authorizedActionId: actionId });
        assert.equal(completed.ok, true);
        if (!completed.ok) return;
        assert.equal(completed.state.status, "completed");
        assert.equal(completed.state.stepCount, 2);
        assert.equal(readCalls, 1);
        assert.equal(writeCalls, 2);
        assert.equal(resumedModelCalls, 1);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("PTC survives a killed host process without repeating committed reads or an unknown write", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-ptc-process-"));
    const fixture = fileURLToPath(new URL("./fixtures/program-recovery-host.ts", import.meta.url));
    try {
        const launch = (mode: string) => spawnSync(process.execPath,
            ["--import", "tsx", fixture, mode, root], {
                cwd: process.cwd(), encoding: "utf8", timeout: 15_000,
            });
        const killed = launch("start");
        assert.equal(killed.signal, "SIGKILL", killed.stderr);
        const resumed = launch("resume");
        assert.equal(resumed.status, 0, resumed.stderr);
        const result = JSON.parse(resumed.stdout) as {
            ok: boolean;
            state: { status: string; stepCount: number; pendingAction: { status: string } };
        };
        assert.equal(result.ok, true);
        assert.equal(result.state.status, "waiting");
        assert.equal(result.state.pendingAction.status, "outcome_unknown");
        assert.equal(result.state.stepCount, 0);
        assert.equal(await readFile(join(root, "reads"), "utf8"), "1");
        assert.equal(await readFile(join(root, "writes"), "utf8"), "1");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("PTC resumes a reviewed real write, runs Bash, and returns one parent result", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-ptc-real-tools-"));
    const workspace = join(root, "workspace");
    await mkdir(workspace);
    await writeFile(join(workspace, "input.txt"), "original\n");
    try {
        const stores = () => ({
            store: new JsonFileGoalStore(join(root, "goals")),
            trajectoryStore: new JsonFileTrajectoryStore(join(root, "trajectory")),
        });
        const code = "const r=await tools.read_file({path:'input.txt'}); const w=await tools.write_file({path:'output.txt',content:r.observation.output.text.trim()}); const b=await tools.bash({command:'cat output.txt'}); return {read:r.observation.output.text.trim(),write:w.observation.kind,stdout:b.observation.kind==='success'?b.observation.output.stdout.trim():null};";
        const created = createGoal({
            ...currentProtocols,
            id: "real-tools-goal", runId: "real-tools-run", intent: "Read, write and verify",
            promptBundleVersion: 1,
            profile: {
                id: "real-tools", systemPrompt: "Test", instructions: [],
                toolIds: ["execute_program", "read_file", "write_file", "bash"],
            },
            maxSteps: 3,
        });
        const goal = {
            ...created,
            state: { ...created.state, run: {
                ...created.state.run, mode: "plan" as const,
                approvedTask: { objective: "Read, write and verify", completionCriteria: [] },
            } },
        };
        await stores().store.save(goal);
        let modelCalls = 0;
        const executor: StepExecutor = {
            async execute() {
                return modelCalls++ === 0
                    ? { kind: "tool_call", action: { actionId: "real-parent", toolId: "execute_program", input: { code } } }
                    : { kind: "complete", summary: "Done", completionEvidence: [] };
            },
            async decide() {
                return { kind: "decision", decision: modelCalls++ === 0
                    ? { kind: "tool_call", action: { actionId: "real-parent", toolId: "execute_program", input: { code } } }
                    : { kind: "complete", summary: "Done", completionEvidence: [] } };
            },
            async think() { throw new Error("Unexpected Think"); },
        };
        const registry = new InMemoryToolRegistry([
            createExecuteProgramRegistration(),
            createToolRegistration(new ReadFileTool(workspace)),
            createToolRegistration(new WriteFileTool(workspace)),
            createToolRegistration(new BashTool(workspace)),
        ]);
        const dependencies = {
            executor, toolRegistry: registry, workspaceRoot: workspace,
            toolPolicy: {
                evaluate: ({ action }: { action: { toolId: string } }) =>
                    action.toolId === "write_file" ? "require_approval" as const : "allow" as const,
            },
        };
        const ref = { goalId: goal.id, runId: goal.state.run.id };
        const initial = await new Runner({ ...stores(), ...dependencies }).run(ref);
        assert.equal(initial.ok, true);
        if (!initial.ok) return;
        assert.equal(initial.state.status, "waiting");
        assert.equal(initial.state.pendingAction?.action.toolId, "write_file");
        assert.equal(modelCalls, 1);
        await writeFile(join(workspace, "input.txt"), "changed\n");
        const resumedStores = stores();
        const resumedRunner = new Runner({ ...resumedStores, ...dependencies });
        const coordinator = new GoalCoordinator({
            ...resumedStores,
            scheduler: new InlineScheduler(resumedRunner),
        });
        const result = await coordinator.resume({
            ref,
            action: { kind: "approve_action", actionId: initial.state.pendingAction!.action.actionId },
        });
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.goal.state.run.status, "completed");
        assert.equal(result.goal.state.run.stepCount, 2);
        assert.equal(modelCalls, 2);
        assert.equal(await readFile(join(workspace, "output.txt"), "utf8"), "original");
        const events = await resumedStores.trajectoryStore.read(ref);
        const parent = events.find((event) => event.eventType === "observation_recorded"
            && event.actionId === "real-parent");
        assert.equal(parent?.eventType, "observation_recorded");
        if (parent?.eventType === "observation_recorded"
            && parent.payload.observation.kind === "success") {
            assert.deepEqual(parent.payload.observation.output, {
                read: "original", write: "success", stdout: "original",
            });
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
