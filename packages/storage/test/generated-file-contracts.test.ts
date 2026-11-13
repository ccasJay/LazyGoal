import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createGoal } from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import {
    GoalSnapshotProtocolError,
    JsonFileGoalStore,
    JsonFileMetricsStore,
    JsonFileModelInputStore,
    JsonFileModelPreferenceStore,
    JsonFileProcessSessionStore,
    JsonFileProjectPermissionProfileStore,
    JsonFileSandboxGrantStore,
    JsonFileToolGrantStore,
    goalSnapshotCodec,
    ModelCallMetricStoreProtocolError,
} from "../src/index";

function goal() {
    return createGoal({
        ...currentProtocols,
        id: "goal-generated-binding",
        intent: "验证生成绑定",
        promptBundleVersion: 1,
        profile: {
            id: "profile-1",
            systemPrompt: "You are LazyGoal.",
            instructions: [],
            toolIds: [],
        },
        runId: "run-generated-binding",
    });
}

test("Snapshot 生成绑定拒绝未知字段，语义校验拒绝空身份", () => {
    const encoded = goalSnapshotCodec.encode(goal());
    assert.throws(
        () => goalSnapshotCodec.decode({ ...encoded, extra: true }),
        GoalSnapshotProtocolError,
    );
    assert.throws(
        () => goalSnapshotCodec.decode({ ...encoded, id: "" }),
        GoalSnapshotProtocolError,
    );
});

test("Tool Grant 账本拒绝未知字段和错误版本", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-generated-grant-"));
    try {
        const store = new JsonFileToolGrantStore(directory);
        await store.stage({
            scope: "workspace",
            workspaceId: "workspace-1",
            source: { goalId: "goal-1", runId: "run-1", actionId: "action-1", approvalInputId: "input-1" },
            matcher: { kind: "exact_input", toolId: "bash", version: 1, digest: `sha256:${"a".repeat(64)}` },
        });
        const path = join(directory, "tool-grants.json");
        const ledger = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        await writeFile(path, JSON.stringify({ ...ledger, extra: true }), "utf8");
        await assert.rejects(store.list({ workspaceId: "workspace-1", goalId: "goal-1" }));
        await writeFile(path, JSON.stringify({ ...ledger, version: 2 }), "utf8");
        await assert.rejects(store.list({ workspaceId: "workspace-1", goalId: "goal-1" }));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("Sandbox Grant 账本拒绝未知字段和错误版本", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-generated-sandbox-grant-"));
    try {
        const store = new JsonFileSandboxGrantStore(directory);
        await store.stage({
            scope: "workspace",
            workspaceId: "workspace-1",
            source: { goalId: "goal-1", runId: "run-1", actionId: "action-1", approvalInputId: "input-1" },
            matcher: {
                toolId: "bash",
                inputDigest: "input-digest",
                scope: { extraFiles: [], network: "none" },
                version: 1,
            },
        });
        const path = join(directory, "sandbox-grants.json");
        const ledger = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        await writeFile(path, JSON.stringify({ ...ledger, extra: true }), "utf8");
        await assert.rejects(store.list({ workspaceId: "workspace-1", goalId: "goal-1" }));
        await writeFile(path, JSON.stringify({ ...ledger, version: 2 }), "utf8");
        await assert.rejects(store.list({ workspaceId: "workspace-1", goalId: "goal-1" }));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("模型偏好和权限档位文件拒绝未知字段", async () => {
    const preferenceDirectory = await mkdtemp(join(tmpdir(), "lazygoal-generated-preference-"));
    const permissionDirectory = await mkdtemp(join(tmpdir(), "lazygoal-generated-permission-"));
    try {
        await writeFile(
            join(preferenceDirectory, "model-preference.json"),
            JSON.stringify({ version: 1, modelId: "model-1", extra: true }),
            "utf8",
        );
        await assert.rejects(
            new JsonFileModelPreferenceStore(preferenceDirectory).get(),
            /invalid or unsupported version/,
        );

        await writeFile(
            join(permissionDirectory, "permission-profile.json"),
            JSON.stringify({
                version: 1,
                workspaceId: "ws-1",
                sandbox: "workspace-write",
                approvals: "on-request",
                reviewer: "user",
                writableRoots: [],
                revision: 0,
                extra: true,
            }),
            "utf8",
        );
        await assert.rejects(
            new JsonFileProjectPermissionProfileStore(permissionDirectory).get("ws-1"),
            /structurally invalid/,
        );
    } finally {
        await rm(preferenceDirectory, { recursive: true, force: true });
        await rm(permissionDirectory, { recursive: true, force: true });
    }
});

test("指标、进程会话和模型输入文件拒绝未知字段或非法时间", async () => {
    const metricsDirectory = await mkdtemp(join(tmpdir(), "lazygoal-generated-metrics-"));
    const processDirectory = await mkdtemp(join(tmpdir(), "lazygoal-generated-process-"));
    const inputDirectory = await mkdtemp(join(tmpdir(), "lazygoal-generated-input-"));
    try {
        const metrics = new JsonFileMetricsStore(metricsDirectory);
        await metrics.append({
            recordType: "call_started",
            goalId: "goal-1",
            runId: "run-1",
            callId: "call-1",
            occurredAt: new Date().toISOString(),
        });
        const metricPath = join(
            metricsDirectory,
            Buffer.from("goal-1").toString("base64url"),
            `${Buffer.from("run-1").toString("base64url")}.jsonl`,
        );
        await writeFile(
            metricPath,
            `${JSON.stringify({
                recordType: "call_started",
                goalId: "goal-1",
                runId: "run-1",
                callId: "call-1",
                occurredAt: "not-a-date",
            })}\n`,
            "utf8",
        );
        await assert.rejects(metrics.read({ goalId: "goal-1", runId: "run-1" }), ModelCallMetricStoreProtocolError);

        const processes = new JsonFileProcessSessionStore(processDirectory, "host-1");
        await processes.saveSession({
            goalId: "goal-1",
            processId: "process-1",
            command: "echo test",
            status: "running",
            hostInstanceId: "host-1",
            startedAt: new Date().toISOString(),
        });
        const sessionPath = join(
            processDirectory,
            "processes",
            Buffer.from("goal-1").toString("base64url"),
            Buffer.from("process-1").toString("base64url"),
            "session.json",
        );
        const session = JSON.parse(await readFile(sessionPath, "utf8")) as Record<string, unknown>;
        await writeFile(sessionPath, JSON.stringify({ ...session, extra: true }), "utf8");
        await assert.rejects(processes.getSession("goal-1", "process-1"));

        const inputs = new JsonFileModelInputStore(inputDirectory);
        await inputs.append({
            goalId: "goal-1",
            runId: "run-1",
            callId: "call-1",
            stage: "decide",
            stepIndex: 1,
            occurredAt: new Date().toISOString(),
            messages: [],
        });
        const inputPath = join(
            inputDirectory,
            Buffer.from("goal-1").toString("base64url"),
            Buffer.from("run-1").toString("base64url"),
            "requests.jsonl",
        );
        const manifest = JSON.parse(await readFile(inputPath, "utf8")) as Record<string, unknown>;
        await writeFile(inputPath, `${JSON.stringify({ ...manifest, extra: true })}\n`, "utf8");
        await assert.rejects(inputs.read("goal-1", "run-1"), /Invalid model input manifest/);
    } finally {
        await rm(metricsDirectory, { recursive: true, force: true });
        await rm(processDirectory, { recursive: true, force: true });
        await rm(inputDirectory, { recursive: true, force: true });
    }
});

test("Snapshot 文件存储实际消费生成绑定", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-generated-snapshot-"));
    try {
        const store = new JsonFileGoalStore(directory);
        await store.save(goal());
        const path = join(directory, `${Buffer.from("goal-generated-binding").toString("base64url")}.json`);
        const snapshot = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        await writeFile(path, JSON.stringify({ ...snapshot, extra: true }), "utf8");
        await assert.rejects(store.restore("goal-generated-binding"), GoalSnapshotProtocolError);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
