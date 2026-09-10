import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
    createGaiaWorkerToolRegistry,
    GAIA_PROFILE_TOOL_IDS,
    GAIA_WORKER_PROFILE,
    SUBMIT_ANSWER_TOOL_ID,
    SubmitAnswerTool,
} from "../src/index.js";

test("submit_answer 首次调用写入答案文件并返回成功，第二次调用返回拒绝", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "gaia-submit-test-"));
    const answerFile = join(tmpDir, "answer.json");

    let submittedAnswerText: string | undefined;
    const tool = new SubmitAnswerTool({
        taskId: "gaia-task-001",
        answerFilePath: answerFile,
        onSubmit: (ans) => {
            submittedAnswerText = ans;
        },
    });

    try {
        // 首次提交
        const firstResult = await tool.execute({
            actionId: "action-submit-1",
            input: { answer: "Paris" },
        });

        assert.equal(firstResult.kind, "success");
        assert.equal(tool.isSubmitted(), true);
        assert.equal(submittedAnswerText, "Paris");

        // 验证文件内容
        const fileContent = JSON.parse(await readFile(answerFile, "utf8"));
        assert.deepEqual(fileContent, {
            taskId: "gaia-task-001",
            answer: "Paris",
        });

        // 第二次提交应当被拒绝
        const secondResult = await tool.execute({
            actionId: "action-submit-2",
            input: { answer: "London" },
        });

        assert.equal(secondResult.kind, "failure");
        if (secondResult.kind === "failure") {
            assert.equal(secondResult.code, "ALREADY_SUBMITTED");
            assert.equal(secondResult.retryable, false);
            assert.match(secondResult.message, /已提交过/);
        }

        // 再次验证文件未被覆盖
        const afterContent = JSON.parse(await readFile(answerFile, "utf8"));
        assert.equal(afterContent.answer, "Paris");

        // validate 校验也会在已提交后拒绝
        const validation = tool.validate({ answer: "Berlin" });
        assert.equal(validation.ok, false);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("Worker 工具注册表包含且仅包含四个工具", () => {
    const registry = createGaiaWorkerToolRegistry({
        taskId: "gaia-task-002",
        workspaceRoot: "/tmp/workspace",
    });

    // 验证 Profile 声明四个工具
    assert.deepEqual(GAIA_PROFILE_TOOL_IDS, [
        "read_file",
        "web_search",
        "web_fetch",
        "submit_answer",
    ]);
    assert.deepEqual(GAIA_WORKER_PROFILE.toolIds, GAIA_PROFILE_TOOL_IDS);

    // 验证注册表中正好有这四个工具，且没有多余工具
    for (const toolId of GAIA_PROFILE_TOOL_IDS) {
        assert.ok(registry.get(toolId) !== undefined, `Missing tool: ${toolId}`);
    }

    // 确保没有无关工具（如 bash、write_file、edit_file、grep 等）
    assert.equal(registry.get("bash"), undefined);
    assert.equal(registry.get("write_file"), undefined);
    assert.equal(registry.get("edit_file"), undefined);
    assert.equal(registry.get("grep"), undefined);
});
