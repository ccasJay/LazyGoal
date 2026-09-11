import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadSwebenchManifest, parseSwebenchManifest } from "../src/manifest.js";
import { parseSwebenchArgs, parseSwebenchGradeArgs, runSwebenchCli } from "../src/cli.js";
import { parseSwebenchTasks } from "../src/container.js";

test("checked-in manifest pins revision, instances and finite budgets", async () => {
    const manifest = await loadSwebenchManifest(fileURLToPath(new URL("../manifests/smoke.json", import.meta.url)));
    assert.equal(manifest.instanceIds.length, 5);
    for (const change of [
        { revision: "main" }, { maxSteps: 0 }, { maxSteps: 1.5 }, { taskTimeoutSeconds: Infinity },
        { instanceIds: [manifest.instanceIds[0], manifest.instanceIds[0]] }, { instanceIds: ["../escape"] },
        { instanceIds: [] }, { unknown: true }, { dataset: "other" },
    ]) assert.throws(() => parseSwebenchManifest({ ...manifest, ...change }), /Invalid SWE-bench manifest/);
    assert.throws(() => parseSwebenchManifest({ ...manifest, testTimeoutSeconds: 86400,
        instanceIds: Array.from({ length: 30 }, (_, i) => `astropy__astropy-${i}`) }), /timer limit/);
});

test("single-task manifest exercises one complete official instance", async () => {
    const manifest = await loadSwebenchManifest(fileURLToPath(new URL("../manifests/single.json", import.meta.url)));
    assert.deepEqual(manifest.instanceIds, ["astropy__astropy-12907"]);
    assert.equal(manifest.revision, "c104f840cc67f8b6eec6f759ebc8b2693d585d4a");
});

test("CLI requires explicit routing and never accepts retry options", () => {
    assert.deepEqual(parseSwebenchArgs(["eval", "swebench", "--manifest", "fixed.json", "--output", "run", "--python", "/venv/python"], "/workspace"),
        { manifest: "/workspace/fixed.json", output: "/workspace/run", python: "/venv/python" });
    for (const args of [["eval", "swebench"], ["eval", "alfworld", "--manifest", "a"],
        ["eval", "swebench", "--manifest", "a", "--retries", "2"],
        ["eval", "swebench", "--manifest", "a", "--output", ""]]) {
        assert.throws(() => parseSwebenchArgs(args));
    }
});

test("grade CLI parser requires an existing output directory and no model settings", () => {
    const command = parseSwebenchGradeArgs(["grade", "swebench", "--output", "run"], "/workspace");
    assert.equal(command.output, "/workspace/run");
    assert.equal(command.python, "python3");
    assert.throws(() => parseSwebenchGradeArgs(["grade", "swebench"], "/workspace"), /requires --output/);
});

test("real bin routes SWE-bench argument errors without starting TUI or Python", () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../../bin/lazygoal.cjs", import.meta.url)), "eval", "swebench"],
        { encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage: lazygoal eval swebench/);
    assert.equal(result.stdout, "");
});

test("Python task projection excludes grading-only data and rejects arbitrary image references", () => {
    const row = { instance_id: "astropy__astropy-12907", repo: "astropy/astropy", base_commit: "a".repeat(40),
        problem_statement: "Fix this issue", image: "swebench/sweb.eval.x86_64.astropy_1776_astropy-12907:latest",
        patch: "GOLD", test_patch: "TEST", FAIL_TO_PASS: ["secret"] };
    const tasks = parseSwebenchTasks({ tasks: [row] });
    assert.equal("patch" in tasks[0]!, false);
    assert.equal("test_patch" in tasks[0]!, false);
    assert.equal("FAIL_TO_PASS" in tasks[0]!, false);
    assert.throws(() => parseSwebenchTasks({ tasks: [{ ...row, image: "arbitrary/image" }] }));
});

test("SWE-bench TUI CLI 参数校验与默认模式", () => {
    // 正常指定 --tui、--task 和 --output-dir，默认 mode 为 review
    const cmd = parseSwebenchArgs([
        "eval", "swebench",
        "--tui",
        "--manifest", "m.json",
        "--task", "astropy__astropy-12907",
        "--output-dir", "run-out",
    ], "/workspace");
    assert.equal(cmd.tui, true);
    assert.equal(cmd.task, "astropy__astropy-12907");
    assert.equal(cmd.mode, "review");
    assert.equal(cmd.output, "/workspace/run-out");

    // 支持指定 auto 模式
    const autoCmd = parseSwebenchArgs([
        "eval", "swebench",
        "--tui",
        "--manifest", "m.json",
        "--task", "astropy__astropy-12907",
        "--output", "run-out",
        "--mode", "auto",
    ], "/workspace");
    assert.equal(autoCmd.mode, "auto");

    // 缺少 --task 报错
    assert.throws(
        () => parseSwebenchArgs(["eval", "swebench", "--tui", "--manifest", "m.json", "--output-dir", "out"]),
        /requires explicit --task/,
    );
    // 缺少 --output-dir 报错
    assert.throws(
        () => parseSwebenchArgs(["eval", "swebench", "--tui", "--manifest", "m.json", "--task", "t-1"]),
        /requires explicit --output-dir/,
    );
    // 包含 --resume 报错
    assert.throws(
        () => parseSwebenchArgs(["eval", "swebench", "--tui", "--manifest", "m.json", "--task", "t-1", "--output-dir", "out", "--resume", "123"]),
        /does not support resuming ended sessions/,
    );
    // 非法 mode 报错
    assert.throws(
        () => parseSwebenchArgs(["eval", "swebench", "--tui", "--manifest", "m.json", "--task", "t-1", "--output-dir", "out", "--mode", "unknown"]),
        /Invalid mode/,
    );
});

test("runSwebenchCli 在 --tui 下校验失败快速返回 2 且不创建容器", async () => {
    // 缺失 --task，快速返回 2
    const code1 = await runSwebenchCli(["eval", "swebench", "--tui", "--manifest", "m.json", "--output-dir", "out"]);
    assert.equal(code1, 2);

    // 包含 --resume，快速返回 2
    const code2 = await runSwebenchCli(["eval", "swebench", "--tui", "--manifest", "m.json", "--task", "t-1", "--output-dir", "out", "--resume", "123"]);
    assert.equal(code2, 2);

    // 非法 mode，快速返回 2
    const code3 = await runSwebenchCli(["eval", "swebench", "--tui", "--manifest", "m.json", "--task", "t-1", "--output-dir", "out", "--mode", "wrong"]);
    assert.equal(code3, 2);
});

test("runSwebenchCli 在 --tui 下正常执行进入 runner 传递正确字段", async () => {
    let capturedOptions: any;
    const manifestPath = fileURLToPath(new URL("../manifests/single.json", import.meta.url));

    const exitCode = await runSwebenchCli(
        [
            "eval", "swebench",
            "--tui",
            "--manifest", manifestPath,
            "--task", "astropy__astropy-12907",
            "--output-dir", "/tmp/dummy-swe-out",
            "--mode", "auto",
            "--max-steps", "15",
        ],
        {
            adapter: {
                structuredOutputMode: "strict",
                generate: async () => ({ content: "done" }),
            },
            skipPreflight: true,
            workerArtifact: {
                tarballPath: "/tmp/fake.tar",
                manifest: {
                    entrypoint: "fake",
                    nodeRuntime: { version: "20.0.0", platform: "linux", arch: "x64", downloadUrl: "fake", checksumSha256: "fake" },
                },
            },
            loadTask: async () => ({
                instance_id: "astropy__astropy-12907",
                repo: "astropy/astropy",
                base_commit: "c104f840cc67f8b6eec6f759ebc8b2693d585d4a",
                problem_statement: "Fix astropy issue",
                image: "swebench/sweb.eval.x86_64.astropy_1776_astropy-12907:latest",
            }),
            runner: async (opts) => {
                capturedOptions = opts;
                return {
                    exitCode: 0,
                    status: "completed",
                    artifact: null,
                    errors: [],
                };
            },
        },
    );

    assert.equal(exitCode, 0);
    assert.ok(capturedOptions !== undefined);
    assert.equal(capturedOptions.benchmarkId, "swebench");
    assert.equal(capturedOptions.mode, "auto");
    assert.equal(capturedOptions.maxSteps, 15);
    assert.equal(capturedOptions.task.instance_id, "astropy__astropy-12907");
    assert.equal(capturedOptions.descriptor.objective, "Resolve SWE-bench instance astropy__astropy-12907: Fix astropy issue");
    assert.equal(capturedOptions.descriptor.maxSteps, 15);
});

