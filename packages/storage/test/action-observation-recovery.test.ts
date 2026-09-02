import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
    createGoal,
    transition,
} from "../../runtime/src/index";
import { JsonFileGoalStore } from "../src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import type {
    AgentProfile,
    Goal,
    RunInput,
    ToolCallAction,
} from "../../runtime/src/index";

const tsxCliPath = fileURLToPath(
    new URL("../../../node_modules/tsx/dist/cli.mjs", import.meta.url),
);
const processFixturePath = fileURLToPath(
    new URL("./fixtures/goal-store-process.ts", import.meta.url),
);

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["先读取再完成"],
    toolIds: ["read_file"],
};

const manualProfile: AgentProfile = { ...profile, toolIds: ["manual_tool"] };

function runFixture(args: readonly string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [tsxCliPath, processFixturePath, ...args],
            {
                cwd: process.cwd(),
                stdio: ["ignore", "pipe", "pipe"],
            },
        );
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        child.once("error", reject);
        child.once("close", (code) => {
            if (code === 0) {
                resolve(stdout);
                return;
            }

            reject(new Error(`fixture exited with ${code}: ${stderr}`));
        });
    });
}

function createExecutingGoal(input: {
    readonly id: string;
    readonly runId: string;
    readonly profile: AgentProfile;
}): Goal {
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: input.id,
        intent: "验证 Action/Observation 恢复",
        profile: input.profile,
        runId: input.runId,
    });

    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: "验证 Action/Observation 恢复",
                    completionCriteria: [],
                },
            },
        },
    };
}

function applyTransition(goal: Goal, input: RunInput): Goal {
    const result = transition(goal.state.run, input);

    if (!result.ok) {
        assert.fail(result.error.message);
    }

    return { ...goal, state: { ...goal.state, run: result.state } };
}

test("跨进程 Action 生命周期按 pendingAction→Tool→Observation 顺序持久化", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-action-order-"));
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kai-action-ws-"));

    try {
        await writeFile(join(workspaceRoot, "README.md"), "文件内容", "utf8");
        const goal = createExecutingGoal({
            id: "goal-order",
            runId: "run-order",
            profile,
        });
        await new JsonFileGoalStore(directory).save(goal);

        const output = await runFixture([
            "run-action-lifecycle",
            directory,
            goal.id,
            "",
            goal.state.run.id,
            workspaceRoot,
        ]);
        const parsed = JSON.parse(output) as {
            readonly result: {
                readonly ok: boolean;
                readonly state?: { readonly status: string; readonly stepCount: number };
            };
            readonly events: string[];
            readonly observedActionIds: string[];
        };

        assert.equal(parsed.result.ok, true);
        assert.equal(parsed.result.state?.status, "completed");
        assert.equal(parsed.result.state?.stepCount, 2);
        assert.deepEqual(parsed.observedActionIds, ["action-lifecycle"]);
        assert.deepEqual(parsed.events, [
            "restore",
            "save:running:0:none",
            "executor:0",
            "save:running:0:approved",
            "tool:action-lifecycle",
            "save:running:1:none",
            "executor:1",
            "save:completed:2:none",
        ]);

        const latest = await new JsonFileGoalStore(directory).restore(goal.id);
        assert.equal(latest?.state.run.status, "completed");
        assert.equal(latest?.state.run.stepCount, 2);
        assert.equal(latest?.state.run.pendingAction, undefined);
        assert.equal(latest?.state.run.lastStep?.kind, "decision");
    } finally {
        await rm(directory, { recursive: true, force: true });
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("跨进程恢复 manual Action 进入 outcome_unknown waiting 且不执行 Tool", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-manual-replay-"));

    try {
        const created = createExecutingGoal({
            id: "goal-manual",
            runId: "run-manual",
            profile: manualProfile,
        });
        const action: ToolCallAction = {
            actionId: "action-manual",
            toolId: "manual_tool",
            input: { value: "x" },
        };
        const started = applyTransition(created, { kind: "start" });
        const interrupted = applyTransition(started, {
            kind: "stage_action",
            action,
            status: "approved",
        });
        await new JsonFileGoalStore(directory).save(interrupted);

        const output = await runFixture([
            "run-manual-replay",
            directory,
            interrupted.id,
            "",
            interrupted.state.run.id,
        ]);
        const parsed = JSON.parse(output) as {
            readonly result: {
                readonly ok: boolean;
                readonly state?: {
                    readonly status: string;
                    readonly stepCount: number;
                    readonly pendingAction?: unknown;
                };
            };
            readonly toolCalls: number;
            readonly executorCalls: number;
        };

        assert.equal(parsed.result.ok, true);
        assert.equal(parsed.result.state?.status, "waiting");
        assert.equal(parsed.result.state?.stepCount, 0);
        assert.deepEqual(parsed.result.state?.pendingAction, {
            action,
            status: "outcome_unknown",
        });
        assert.equal(parsed.toolCalls, 0);
        assert.equal(parsed.executorCalls, 0);

        const latest = await new JsonFileGoalStore(directory).restore(interrupted.id);
        assert.deepEqual(latest?.state.run, parsed.result.state);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("跨进程瞬时授权只接受匹配的 actionId 且不重复计 Step", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-authorized-"));
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kai-auth-ws-"));

    try {
        await writeFile(join(workspaceRoot, "README.md"), "授权文件内容", "utf8");
        const created = createExecutingGoal({
            id: "goal-auth",
            runId: "run-auth",
            profile,
        });
        const action: ToolCallAction = {
            actionId: "action-authorized",
            toolId: "read_file",
            input: { path: "README.md" },
        };
        const started = applyTransition(created, { kind: "start" });
        const interrupted = applyTransition(started, {
            kind: "stage_action",
            action,
            status: "approved",
        });
        await new JsonFileGoalStore(directory).save(interrupted);

        const output = await runFixture([
            "run-authorized-action",
            directory,
            interrupted.id,
            "",
            interrupted.state.run.id,
            workspaceRoot,
            action.actionId,
        ]);
        const parsed = JSON.parse(output) as {
            readonly wrong: { readonly ok: boolean; readonly error?: { readonly code: string } };
            readonly correct: {
                readonly ok: boolean;
                readonly state?: { readonly status: string; readonly stepCount: number };
            };
            readonly wrongObserved: string[];
            readonly correctObserved: string[];
        };

        assert.equal(parsed.wrong.ok, false);
        assert.equal(parsed.wrong.error?.code, "ACTION_NOT_AUTHORIZED");
        assert.deepEqual(parsed.wrongObserved, []);

        assert.equal(parsed.correct.ok, true);
        assert.equal(parsed.correct.state?.status, "completed");
        assert.equal(parsed.correct.state?.stepCount, 2);
        assert.deepEqual(parsed.correctObserved, [action.actionId]);

        const latest = await new JsonFileGoalStore(directory).restore(interrupted.id);
        assert.equal(latest?.state.run.status, "completed");
        assert.equal(latest?.state.run.pendingAction, undefined);
    } finally {
        await rm(directory, { recursive: true, force: true });
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});
