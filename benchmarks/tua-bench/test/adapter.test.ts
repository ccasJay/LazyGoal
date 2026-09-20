import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TuaBenchBenchmarkAdapter } from "../src/adapter.js";
import { BASH_EXEC_TOOL_ID } from "../src/bash-exec-tool.js";
import type { TuaBenchTaskDefinition } from "../src/types.js";

const sampleTask: TuaBenchTaskDefinition = {
    taskId: "adapter-test-01",
    name: "adapter-task",
    instruction: "Format markdown tables across docs",
    taskFamily: "document",
    imageRef: "tua-bench/adapter-task:latest",
    networkMode: "none",
    agentTimeoutSec: 600,
    verifierTimeoutSec: 600,
    verifierUser: "root",
    taskDir: "/workspace/tasks/adapter-task",
};

describe("TuaBenchBenchmarkAdapter", () => {
    it("describeTask 将任务定义映射为 BenchmarkTaskDescriptor", () => {
        const adapter = new TuaBenchBenchmarkAdapter();
        const descriptor = adapter.describeTask(sampleTask);

        assert.equal(descriptor.intent, sampleTask.instruction);
        assert.match(descriptor.objective, /adapter-task/);
        assert.ok(descriptor.completionCriteria.length > 0);
        assert.equal(descriptor.maxSteps, 50);

        const customAdapter = new TuaBenchBenchmarkAdapter({ maxSteps: 80 });
        assert.equal(customAdapter.describeTask(sampleTask).maxSteps, 80);
    });

    it("createEpisode 成功装配包含 bash_exec 的 ToolRegistry", async () => {
        const adapter = new TuaBenchBenchmarkAdapter({ workdir: "/workspace/agent" });
        const episode = await adapter.createEpisode(sampleTask, {
            runId: "run-1",
            signal: new AbortController().signal,
        });

        assert.ok(episode.registry);
        const bashTool = episode.registry.get(BASH_EXEC_TOOL_ID);
        assert.ok(bashTool, "必须注册 bash_exec 工具");
        assert.equal(bashTool.definition.id, BASH_EXEC_TOOL_ID);

        const outcome = episode.readOutcome();
        assert.equal(outcome.completed, true);

        await episode.close();
    });
});
