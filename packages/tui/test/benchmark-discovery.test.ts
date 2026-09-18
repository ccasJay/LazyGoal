import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { Goal, GoalCatalog, GoalCatalogEntry, GoalStore } from "../../runtime/src/index";
import { JsonFileTrajectoryStore } from "../../storage/src/index.js";
import {
    AggregatedGoalStore,
    AggregatedTrajectoryStore,
    discoverBenchmarkGoals,
    formatBenchmarkTag,
} from "../src/index";

function createValidSnapshotJson(id: string, intent: string, profileId = "test-profile", status = "completed"): string {
    const snapshot = {
        id,
        metadata: { schemaVersion: 1 },
        definition: {
            intent,
            promptBundleVersion: 1,
            memoryProtocol: { kind: "structured", version: 1 },
            modelContextProtocol: { kind: "trajectory-layered", version: 1 },
            contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
            profile: {
                id: profileId,
                name: "Test Profile",
                description: "Description",
                systemPrompt: "sys",
                instructions: ["inst"],
                toolIds: [],
            },
            executionPolicy: { maxSteps: 30 },
        },
        state: {
            modelSelection: {
                provider: "openai",
                modelId: "gpt-4o",
                structuredOutputMode: "prompt_only",
                inputEstimator: { kind: "character-v1" },
            },
            workflow: {
                phase: "executing",
                task: {
                    objective: intent,
                    completionCriteria: [{ text: "done" }],
                },
            },
            messages: [
                { role: "user", content: intent },
                { role: "assistant", assistant: { profileId }, content: "ans" },
            ],
            run: {
                id: `run-${id}`,
                status,
                stepCount: 1,
                committedThroughSequence: 1,
                memoryRevision: {
                    eventId: "event-1",
                    sequence: 1,
                },
                lastStep: {
                    kind: "decision",
                    result: {
                        kind: "complete",
                        summary: "done",
                        completionEvidence: [{ criterionIndex: 0, evidenceSequences: [1] }],
                    },
                },
                contextEpoch: {
                    version: 1,
                    number: 1,
                    conversationStartIndex: 0,
                    openedAtSequence: 1,
                },
            },
        },
    };
    return JSON.stringify(snapshot, null, 2);
}

class MemoryGoalStore implements GoalStore, GoalCatalog {
    private readonly goals = new Map<string, Goal>();

    constructor(initialGoals: Goal[] = []) {
        for (const g of initialGoals) {
            this.goals.set(g.id, g);
        }
    }

    async save(goal: Goal): Promise<void> {
        this.goals.set(goal.id, goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        return this.goals.get(goalId);
    }

    async listResumable(): Promise<readonly GoalCatalogEntry[]> {
        return Array.from(this.goals.values())
            .filter((g) => g.state.run.status === "waiting")
            .map((g) => ({
                goalId: g.id,
                runId: g.state.run.id,
                intent: g.definition.intent,
                workflowPhase: g.state.workflow.phase,
                runStatus: g.state.run.status,
                updatedAt: "2026-09-11T12:00:00.000Z",
            }));
    }

    async listHistory(): Promise<readonly GoalCatalogEntry[]> {
        return Array.from(this.goals.values()).map((g) => ({
            goalId: g.id,
            runId: g.state.run.id,
            intent: g.definition.intent,
            workflowPhase: g.state.workflow.phase,
            runStatus: g.state.run.status,
            updatedAt: "2026-09-11T12:00:00.000Z",
        }));
    }
}

test("formatBenchmarkTag normalizes standard benchmark prefixes", () => {
    assert.equal(formatBenchmarkTag("gaia"), "[GAIA]");
    assert.equal(formatBenchmarkTag("swebench"), "[SWE-bench]");
    assert.equal(formatBenchmarkTag("swebench-acp"), "[SWE-bench]");
    assert.equal(formatBenchmarkTag("alfworld"), "[ALFWorld]");
    assert.equal(formatBenchmarkTag("unknown"), "[UNKNOWN]");
    assert.equal(formatBenchmarkTag(undefined), "[Benchmark]");
});

test("discoverBenchmarkGoals discovers attempts and runtime goals with labels", async () => {
    const root = await mkdtemp(join(tmpdir(), "bench-discovery-"));
    try {
        // 1. 创建 attempts 结构
        const run1Dir = join(root, "tui-gaia-smoke");
        const attemptDir = join(run1Dir, "attempts", "gaia-smoke-001");
        const runtimeGoals1 = join(run1Dir, "runtime", "gaia", "goals");
        await mkdir(attemptDir, { recursive: true });
        await mkdir(runtimeGoals1, { recursive: true });

        const gaiaJson = createValidSnapshotJson("gaia-goal-1", "What is 1+1?", "gaia-profile");
        const gaiaFileName = `${Buffer.from("gaia-goal-1").toString("base64url")}.json`;
        await writeFile(join(runtimeGoals1, gaiaFileName), gaiaJson, "utf8");

        const attemptRecord = {
            benchmarkId: "gaia",
            taskId: "gaia-smoke-001",
            goalId: "gaia-goal-1",
            runId: "run-gaia-1",
            status: "completed",
            artifactLocator: {
                goalSnapshot: "runtime/gaia/goals",
            },
        };
        await writeFile(join(attemptDir, "attempt-1.json"), JSON.stringify(attemptRecord), "utf8");

        // 2. 创建无 attempt 但有 runtime 的 swebench 结构
        const swebenchKey = Buffer.from("swebench").toString("base64url");
        const taskKey = Buffer.from("astropy-12907").toString("base64url");
        const runtimeGoals2 = join(root, "swe-run", "runtime", swebenchKey, taskKey, "goals");
        await mkdir(runtimeGoals2, { recursive: true });

        const sweJson = createValidSnapshotJson("swe-goal-2", "Fix astropy issue", "swebench-shell-profile");
        const sweFileName = `${Buffer.from("swe-goal-2").toString("base64url")}.json`;
        await writeFile(join(runtimeGoals2, sweFileName), sweJson, "utf8");

        const discovered = await discoverBenchmarkGoals(root);
        assert.equal(discovered.length, 2);

        const gaiaEntry = discovered.find((e) => e.goalId === "gaia-goal-1");
        assert.ok(gaiaEntry);
        assert.equal(gaiaEntry.intent, "[GAIA] gaia-smoke-001");
        assert.equal(gaiaEntry.runStatus, "completed");
        assert.equal(gaiaEntry.goalDirectory, runtimeGoals1);

        const sweEntry = discovered.find((e) => e.goalId === "swe-goal-2");
        assert.ok(sweEntry);
        assert.equal(sweEntry.intent, "[SWE-bench] astropy-12907");
        assert.equal(sweEntry.goalDirectory, runtimeGoals2);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("AggregatedGoalStore transparently merges primary and benchmark goals and restores across roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "bench-agg-"));
    try {
        const primaryGoal = {
            id: "user-goal-1",
            definition: { intent: "Inspect codebase" },
            state: { run: { status: "waiting", id: "run-1" }, workflow: { phase: "executing" } },
        } as unknown as Goal;
        const primaryStore = new MemoryGoalStore([primaryGoal]);

        // 在 root 下创建一个 benchmark 产物
        const benchGoalsDir = join(root, "my-eval", "runtime", "gaia", "goals");
        await mkdir(benchGoalsDir, { recursive: true });
        const benchJson = createValidSnapshotJson("bench-goal-42", "Solve QA task", "gaia-worker-profile");
        const benchFileName = `${Buffer.from("bench-goal-42").toString("base64url")}.json`;
        await writeFile(join(benchGoalsDir, benchFileName), benchJson, "utf8");

        const aggStore = new AggregatedGoalStore(primaryStore, root);

        // 1. listResumable 仅代理 primary
        const resumable = await aggStore.listResumable();
        assert.equal(resumable.length, 1);
        assert.equal(resumable[0]?.goalId, "user-goal-1");

        // 2. listHistory 合并 primary 与 benchmark 并带有 [Goal] / [GAIA] 标签
        const history = await aggStore.listHistory();
        assert.equal(history.length, 2);
        assert.ok(history.some((e) => e.goalId === "user-goal-1" && e.intent.startsWith("[Goal]")));
        assert.ok(history.some((e) => e.goalId === "bench-goal-42" && e.intent.startsWith("[GAIA]")));

        // 3. restore 优先从 primary 恢复
        const restoredPrimary = await aggStore.restore("user-goal-1");
        assert.ok(restoredPrimary);
        assert.equal(restoredPrimary.id, "user-goal-1");

        // 4. restore 能从 benchmark 目录中恢复
        const restoredBench = await aggStore.restore("bench-goal-42");
        assert.ok(restoredBench);
        assert.equal(restoredBench.id, "bench-goal-42");
        assert.equal(restoredBench.definition.intent, "Solve QA task");

        // 5. 不存在的 goal 返回 undefined
        const missing = await aggStore.restore("non-existent-goal");
        assert.equal(missing, undefined);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("AggregatedTrajectoryStore routes read queries to primary or benchmark trajectory directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "bench-agg-traj-"));
    try {
        const primaryTrajDir = join(root, "primary-trajectories");
        const benchRunDir = join(root, "my-eval");
        const benchGoalsDir = join(benchRunDir, "runtime", "gaia", "goals");
        const benchTrajDir = join(benchRunDir, "runtime", "gaia", "trajectories");

        await mkdir(primaryTrajDir, { recursive: true });
        await mkdir(benchGoalsDir, { recursive: true });
        await mkdir(benchTrajDir, { recursive: true });

        // 1. 在 primary store 写入一条事件
        const primaryStore = new JsonFileTrajectoryStore(primaryTrajDir);
        await primaryStore.append({
            goalId: "primary-goal-1",
            runId: "run-primary-1",
            phase: "executing",
            eventType: "run_completed",
            payload: {
                type: "run_completed",
                summary: "done",
            },
        });

        // 2. 在 benchmark 写入 goal snapshot 和 trajectory 事件
        const benchGoalId = "bench-goal-99";
        const benchJson = createValidSnapshotJson(benchGoalId, "Solve benchmark task", "test-profile");
        const benchFileName = `${Buffer.from(benchGoalId).toString("base64url")}.json`;
        await writeFile(join(benchGoalsDir, benchFileName), benchJson, "utf8");

        const benchTrajStore = new JsonFileTrajectoryStore(benchTrajDir);
        await benchTrajStore.append({
            goalId: benchGoalId,
            runId: "run-bench-1",
            phase: "executing",
            eventType: "decision_received",
            executionUnitId: "unit-1",
            stepIndex: 1,
            payload: {
                type: "decision_received",
                decision: {
                    kind: "complete",
                    summary: "Benchmark completed",
                    completionEvidence: [],
                },
            },
        });
        await benchTrajStore.append({
            goalId: benchGoalId,
            runId: "run-bench-1",
            phase: "executing",
            eventType: "run_completed",
            executionUnitId: "unit-1",
            stepIndex: 1,
            payload: {
                type: "run_completed",
                summary: "all done",
            },
        });

        const aggregatedStore = new AggregatedTrajectoryStore(primaryStore, root);

        // 3. 读取 primary 轨迹
        const primaryEvents = await aggregatedStore.read({
            goalId: "primary-goal-1",
            runId: "run-primary-1",
        });
        assert.equal(primaryEvents.length, 1);
        assert.equal(primaryEvents[0]?.eventType, "run_completed");

        // 4. 读取 benchmark 轨迹
        const benchEvents = await aggregatedStore.read({
            goalId: benchGoalId,
            runId: "run-bench-1",
        });
        assert.equal(benchEvents.length, 2);
        assert.equal(benchEvents[0]?.eventType, "decision_received");
        assert.equal(benchEvents[1]?.eventType, "run_completed");

        // 5. 使用 readWithBoundary 验证序列切分
        const boundaryResult = await aggregatedStore.readWithBoundary(
            { goalId: benchGoalId, runId: "run-bench-1" },
            1,
        );
        assert.equal(boundaryResult.committed.length, 1);
        assert.equal(boundaryResult.uncommittedTail?.length, 1);

        // 6. append 总是作用在 primaryStore 上
        await aggregatedStore.append({
            goalId: "appended-goal",
            runId: "run-appended",
            phase: "executing",
            eventType: "run_completed",
            payload: {
                type: "run_completed",
                summary: "appended done",
            },
        });
        const appendedRead = await primaryStore.read({
            goalId: "appended-goal",
            runId: "run-appended",
        });
        assert.equal(appendedRead.length, 1);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
