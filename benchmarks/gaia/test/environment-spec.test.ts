import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { EnvironmentHandle, ProcessResult } from "../../src/index.js";
import {
    GAIA_MANAGED_INSTALL_COMMANDS,
    GaiaEnvironmentSpec,
    type GaiaManifestTask,
} from "../src/index.js";

const sampleTask: GaiaManifestTask = {
    taskId: "gaia-test-1",
    question: "What is the result of 1+1?",
    expectedAnswer: "2",
    level: 1,
    split: "validation",
    attachments: ["attachments/gaia-test-1/data.csv"],
};

class MockEnvironmentHandle implements EnvironmentHandle {
    readonly workdir = "/workspace";
    readonly executedCommands: string[] = [];
    readonly copiedInto: Array<{ source: string; target: string; content?: string }> = [];
    readonly copiedOut: Array<{ source: string; target: string }> = [];

    mockExecHandler: (command: string) => ProcessResult = () => ({
        code: 0,
        stdout: "",
        stderr: "",
    });

    async exec(command: string): Promise<ProcessResult> {
        this.executedCommands.push(command);
        return this.mockExecHandler(command);
    }

    async copyInto(source: string, target: string): Promise<void> {
        let content: string | undefined;
        try {
            content = await readFile(source, "utf8");
        } catch {
            // source 可能在测试中只是一个路径
        }
        this.copiedInto.push({ source, target, ...(content !== undefined ? { content } : {}) });
    }

    async copyOut(source: string, target: string): Promise<string> {
        this.copiedOut.push({ source, target });
        return target;
    }
}

test("GaiaEnvironmentSpec resolveImage 返回 managed 模式与标准安装命令", () => {
    const spec = new GaiaEnvironmentSpec({
        task: sampleTask,
        dataRoot: "/tmp/fake-gaia",
    });

    const imageSource = spec.resolveImage(sampleTask);
    assert.equal(imageSource.mode, "managed");
    if (imageSource.mode === "managed") {
        assert.deepEqual(imageSource.installCommands, GAIA_MANAGED_INSTALL_COMMANDS);
        assert.equal(imageSource.platform, "linux/amd64");
    }

    const workerEntry = spec.getWorkerEntryConfig(sampleTask);
    assert.equal(workerEntry.cwd, "/workspace");
    assert.deepEqual(workerEntry.command, ["/opt/lazygoal/node", "/opt/lazygoal/worker.mjs"]);
});

test("GaiaEnvironmentSpec prepareEnvironment 正确注入 question.txt 和附件", async () => {
    const tmpDataRoot = await mkdtemp(join(tmpdir(), "gaia-env-test-"));
    try {
        const attachmentFile = join(tmpDataRoot, "attachments/gaia-test-1/data.csv");
        const spec = new GaiaEnvironmentSpec({
            task: sampleTask,
            dataRoot: tmpDataRoot,
        });

        const handle = new MockEnvironmentHandle();
        await spec.prepareEnvironment(handle);

        // 验证执行了目录创建命令
        assert.ok(handle.executedCommands.some((cmd) => cmd.includes("mkdir -p /workspace")));

        // 验证写入了 question.txt 且内容正确
        const questionCopy = handle.copiedInto.find((c) => c.target === "/workspace/question.txt");
        assert.ok(questionCopy !== undefined);
        assert.equal(questionCopy.content, sampleTask.question);

        // 验证注入了附件
        const attachmentCopy = handle.copiedInto.find(
            (c) => c.target === "/workspace/attachments/gaia-test-1/data.csv",
        );
        assert.ok(attachmentCopy !== undefined);
        assert.equal(attachmentCopy.source, attachmentFile);
    } finally {
        await rm(tmpDataRoot, { recursive: true, force: true });
    }
});

test("GaiaEnvironmentSpec preflight 验证 Python 和关键库检测通过与缺失场景", async () => {
    const spec = new GaiaEnvironmentSpec({
        task: sampleTask,
        dataRoot: "/tmp/fake-gaia",
    });

    // 场景 1：全部关键库就绪
    const successHandle = new MockEnvironmentHandle();
    successHandle.mockExecHandler = (cmd) => {
        if (cmd.includes("python3 -c")) {
            return {
                code: 0,
                stdout: JSON.stringify({
                    pythonVersion: "3.11.2",
                    openpyxl: "available",
                    docx: "available",
                    PyPDF2: "available",
                    pydub: "available",
                    PIL: "available",
                    missing: [],
                }),
                stderr: "",
            };
        }
        return { code: 0, stdout: "", stderr: "" };
    };

    const successResult = await spec.preflight(successHandle);
    assert.equal(successResult.ok, true);
    assert.equal(
        (successResult.details as Record<string, unknown>)?.pythonVersion,
        "3.11.2",
    );

    // 场景 2：存在缺失库
    const failHandle = new MockEnvironmentHandle();
    failHandle.mockExecHandler = (cmd) => {
        if (cmd.includes("python3 -c")) {
            return {
                code: 0,
                stdout: JSON.stringify({
                    pythonVersion: "3.11.2",
                    missing: ["pydub", "openpyxl"],
                }),
                stderr: "",
            };
        }
        return { code: 0, stdout: "", stderr: "" };
    };

    const failResult = await spec.preflight(failHandle);
    assert.equal(failResult.ok, false);
    assert.match(failResult.message ?? "", /Missing required Python libraries/);
});

test("GaiaEnvironmentSpec collectArtifacts 正确回收 answer.json", async () => {
    const tmpOutputDir = await mkdtemp(join(tmpdir(), "gaia-output-"));
    try {
        const spec = new GaiaEnvironmentSpec({
            task: sampleTask,
            dataRoot: "/tmp/fake-gaia",
        });

        const handle = new MockEnvironmentHandle();
        handle.mockExecHandler = (cmd) => {
            if (cmd === "cat /workspace/answer.json") {
                return {
                    code: 0,
                    stdout: JSON.stringify({
                        taskId: "gaia-test-1",
                        answer: "42",
                    }),
                    stderr: "",
                };
            }
            return { code: 0, stdout: "", stderr: "" };
        };

        const artifacts = await spec.collectArtifacts(handle, tmpOutputDir, 1000);
        assert.equal(artifacts.submittedAnswer, "42");
        assert.equal(artifacts.answerTaskId, "gaia-test-1");
        assert.equal(artifacts.errors.length, 0);
    } finally {
        await rm(tmpOutputDir, { recursive: true, force: true });
    }
});

test("GaiaEnvironmentSpec 在 domainOnly 模式下只回收领域答案且不访问容器持久化目录", async () => {
    const tmpOutputDir = await mkdtemp(join(tmpdir(), "gaia-domain-only-"));
    try {
        const spec = new GaiaEnvironmentSpec({
            task: sampleTask,
            dataRoot: "/tmp/fake-gaia",
            domainOnly: true,
        });

        const handle = new MockEnvironmentHandle();
        handle.mockExecHandler = (cmd) => {
            if (cmd === "cat /workspace/answer.json") {
                return {
                    code: 0,
                    stdout: JSON.stringify({
                        taskId: "gaia-test-1",
                        answer: "Paris",
                    }),
                    stderr: "",
                };
            }
            return { code: 0, stdout: "", stderr: "" };
        };

        const artifacts = await spec.collectArtifacts(handle, tmpOutputDir, 1000);
        assert.equal(artifacts.submittedAnswer, "Paris");
        assert.equal(artifacts.answerTaskId, "gaia-test-1");
        assert.equal(artifacts.persistence, null);
        assert.equal(artifacts.errors.length, 0);
        // 断言未调用 copyOut 从容器复制持久化
        assert.equal(handle.copiedOut.length, 0);
    } finally {
        await rm(tmpOutputDir, { recursive: true, force: true });
    }
});

