import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadTuaBenchManifest, parseTuaBenchTask } from "../src/manifest-loader.js";

describe("TuaBenchManifestLoader", () => {
    it("正确解析完整字段的任务目录", async () => {
        const tmpDir = await mkdtemp(path.join(os.tmpdir(), "tua-test-"));
        try {
            const taskDir = path.join(tmpDir, "task-doc-01");
            await mkdir(taskDir, { recursive: true });

            await writeFile(
                path.join(taskDir, "task.toml"),
                `
name = "custom-doc-task"
task_id = "doc-01"

[metadata]
category = "document"

[environment]
docker_image = "registry.example.com/tua-bench/doc:1.0"
network_mode = "public"
setup_script = "scripts/init.sh"

[agent]
timeout_sec = 1200

[verifier]
timeout_sec = 300
user = "testuser"
script = "tests/verify.sh"
`,
                "utf8",
            );

            await writeFile(
                path.join(taskDir, "instruction.md"),
                "Please edit the file /workspace/report.txt and fix typos.\n",
                "utf8",
            );

            const { task, warning } = await parseTuaBenchTask(taskDir);
            assert.equal(warning, undefined);
            assert.ok(task !== null);
            assert.equal(task.taskId, "doc-01");
            assert.equal(task.name, "custom-doc-task");
            assert.equal(task.instruction, "Please edit the file /workspace/report.txt and fix typos.");
            assert.equal(task.taskFamily, "document");
            assert.equal(task.imageRef, "registry.example.com/tua-bench/doc:1.0");
            assert.equal(task.networkMode, "public");
            assert.equal(task.agentTimeoutSec, 1200);
            assert.equal(task.verifierTimeoutSec, 300);
            assert.equal(task.verifierUser, "testuser");
            assert.equal(task.setupScript, "scripts/init.sh");
            assert.equal(task.verifierPath, "tests/verify.sh");
            assert.equal(task.taskDir, path.resolve(taskDir));
        } finally {
            await rm(tmpDir, { recursive: true, force: true });
        }
    });

    it("缺省字段正确回退至默认值", async () => {
        const tmpDir = await mkdtemp(path.join(os.tmpdir(), "tua-test-"));
        try {
            const taskDir = path.join(tmpDir, "task-minimal");
            await mkdir(taskDir, { recursive: true });

            await writeFile(
                path.join(taskDir, "task.toml"),
                `
[metadata]
category = "general"
`,
                "utf8",
            );

            await writeFile(
                path.join(taskDir, "instruction.md"),
                "Do something basic.",
                "utf8",
            );

            const { task, warning } = await parseTuaBenchTask(taskDir);
            assert.equal(warning, undefined);
            assert.ok(task !== null);
            assert.equal(task.taskId, "task-minimal");
            assert.equal(task.name, "task-minimal");
            assert.equal(task.taskFamily, "general");
            assert.equal(task.imageRef, "tua-bench/task-minimal:latest");
            assert.equal(task.networkMode, "none");
            assert.equal(task.agentTimeoutSec, 600);
            assert.equal(task.verifierTimeoutSec, 600);
            assert.equal(task.verifierUser, "root");
            assert.equal(task.setupScript, "environment/setup.sh");
            assert.equal(task.verifierPath, "tests/test.sh");
        } finally {
            await rm(tmpDir, { recursive: true, force: true });
        }
    });

    it("TOML 解析失败或关键字段缺失时跳过并记录警告", async () => {
        const tmpDir = await mkdtemp(path.join(os.tmpdir(), "tua-test-"));
        try {
            // 场景 1：非法 TOML 格式
            const brokenTomlDir = path.join(tmpDir, "task-broken-toml");
            await mkdir(brokenTomlDir, { recursive: true });
            await writeFile(path.join(brokenTomlDir, "task.toml"), "invalid = [toml content", "utf8");
            await writeFile(path.join(brokenTomlDir, "instruction.md"), "instruction", "utf8");

            const res1 = await parseTuaBenchTask(brokenTomlDir);
            assert.equal(res1.task, null);
            assert.match(res1.warning ?? "", /task.toml 解析失败/);

            // 场景 2：缺失 metadata.category
            const missingCatDir = path.join(tmpDir, "task-missing-cat");
            await mkdir(missingCatDir, { recursive: true });
            await writeFile(path.join(missingCatDir, "task.toml"), 'name = "no-cat"', "utf8");
            await writeFile(path.join(missingCatDir, "instruction.md"), "instruction", "utf8");

            const res2 = await parseTuaBenchTask(missingCatDir);
            assert.equal(res2.task, null);
            assert.match(res2.warning ?? "", /缺少必要字段 metadata.category/);

            // 场景 3：缺失 instruction.md
            const missingInstDir = path.join(tmpDir, "task-missing-inst");
            await mkdir(missingInstDir, { recursive: true });
            await writeFile(path.join(missingInstDir, "task.toml"), '[metadata]\ncategory = "cat"', "utf8");

            const res3 = await parseTuaBenchTask(missingInstDir);
            assert.equal(res3.task, null);
            assert.match(res3.warning ?? "", /缺少 instruction.md/);
        } finally {
            await rm(tmpDir, { recursive: true, force: true });
        }
    });

    it("loadTuaBenchManifest 能正确构建并按任务族聚合", async () => {
        const repoRoot = await mkdtemp(path.join(os.tmpdir(), "tua-repo-"));
        try {
            const tasksRoot = path.join(repoRoot, "tasks");
            await mkdir(tasksRoot, { recursive: true });

            // 任务 1: doc
            const task1Dir = path.join(tasksRoot, "doc-01");
            await mkdir(task1Dir);
            await writeFile(path.join(task1Dir, "task.toml"), '[metadata]\ncategory = "document"\n');
            await writeFile(path.join(task1Dir, "instruction.md"), "Doc instruction");

            // 任务 2: doc
            const task2Dir = path.join(tasksRoot, "doc-02");
            await mkdir(task2Dir);
            await writeFile(path.join(task2Dir, "task.toml"), '[metadata]\ncategory = "document"\n');
            await writeFile(path.join(task2Dir, "instruction.md"), "Doc instruction 2");

            // 任务 3: web
            const task3Dir = path.join(tasksRoot, "web-01");
            await mkdir(task3Dir);
            await writeFile(
                path.join(task3Dir, "task.toml"),
                '[metadata]\ncategory = "live-web"\n[environment]\nnetwork_mode = "public"\n',
            );
            await writeFile(path.join(task3Dir, "instruction.md"), "Web instruction");

            // 损坏任务（不应中断整体构建）
            const badDir = path.join(tasksRoot, "broken");
            await mkdir(badDir);
            await writeFile(path.join(badDir, "task.toml"), "bad toml [");
            await writeFile(path.join(badDir, "instruction.md"), "Bad");

            const manifest = await loadTuaBenchManifest(repoRoot);
            assert.equal(manifest.tasks.length, 3);
            assert.equal(manifest.warnings?.length, 1);
            assert.equal(manifest.repoRoot, path.resolve(repoRoot));
            assert.ok(manifest.loadedAt);

            // 分组验证
            assert.equal(manifest.byFamily["document"]?.length, 2);
            assert.equal(manifest.byFamily["live-web"]?.length, 1);
            assert.equal(manifest.byFamily["live-web"]?.[0]?.networkMode, "public");
        } finally {
            await rm(repoRoot, { recursive: true, force: true });
        }
    });
});
