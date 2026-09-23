import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createCompositionRoot } from "../src/cli";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    type AgentProfile,
    type ToolPolicy,
} from "../../runtime/src/index";
import { ReadFileTool, READ_FILE_TOOL_ID } from "../../tools/src/index";
import type { LLMAdapter } from "../../llm/src/core/adapter";

async function computeDirectoryFingerprint(dir: string): Promise<string> {
    const hash = createHash("sha256");
    async function scan(current: string): Promise<void> {
        let entries: string[];
        try {
            entries = await readdir(current);
        } catch {
            return;
        }
        entries.sort();
        for (const entry of entries) {
            const path = join(current, entry);
            hash.update(entry);
            try {
                const content = await readFile(path);
                hash.update(content);
            } catch {
                await scan(path);
            }
        }
    }
    await scan(dir);
    return hash.digest("hex");
}

function createMockAdapter(): LLMAdapter {
    return {
        structuredOutputMode: "prompt_only",
        generate: async () => ({
            content: JSON.stringify({
                result: {
                    kind: "wait",
                    reason: "Wait for the persistence attempt to be inspected.",
                    memoryPatch: null,
                },
            }),
            usage: { inputTokens: 10, outputTokens: 10 },
        }),
    };
}

test("虚拟工作区持久化将 Store/Trace/Sidecar 隔离到 dataDirectory 且不污染原工作区", async () => {
    // 1. 准备独立原工作区
    const workspaceDir = await mkdtemp(join(tmpdir(), "lazygoal-ws-origin-"));
    await writeFile(join(workspaceDir, "README.md"), "# Original Workspace Content\n", "utf8");
    await mkdir(join(workspaceDir, "src"), { recursive: true });
    await writeFile(join(workspaceDir, "src", "index.ts"), "export const hello = 'world';\n", "utf8");

    const initialFingerprint = await computeDirectoryFingerprint(workspaceDir);

    // 2. 准备外部 output-dir 结构
    const outputDir = await mkdtemp(join(tmpdir(), "lazygoal-output-"));
    const attempt1Dir = join(outputDir, "runtime", "gaia", "task-1", "attempt-1");
    const attempt2Dir = join(outputDir, "runtime", "gaia", "task-1", "attempt-2");

    const customTool = new ReadFileTool(workspaceDir);
    const customRegistry = new InMemoryToolRegistry([createToolRegistration(customTool)]);
    const profile: AgentProfile = {
        id: "benchmark-agent",
        name: "Benchmark Agent",
        description: "Agent for benchmark evaluation",
        systemPrompt: "Solve tasks",
        instructions: ["Follow instructions"],
        toolIds: [READ_FILE_TOOL_ID],
    };
    const policy: ToolPolicy = { evaluate: () => "allow" };
    const adapter = createMockAdapter();
    // 3. 执行 Attempt 1
    const root1 = await createCompositionRoot({
        cwd: workspaceDir,
        dataDirectory: attempt1Dir,
        adapter,
        profile,
        toolRegistry: customRegistry,
        toolPolicy: policy,
        goalIdGenerator: () => "goal-attempt-1",
        runIdGenerator: () => "run-attempt-1",
    });

    assert.equal(root1.dataDirectory, attempt1Dir);
    assert.equal(root1.goalsDirectory, join(attempt1Dir, "goals"));
    assert.equal(root1.trajectoriesDirectory, join(attempt1Dir, "trajectories"));
    assert.equal(root1.tracesDirectory, join(attempt1Dir, "traces"));
    assert.equal(root1.contextSidecarsDirectory, join(attempt1Dir, "context-sidecars"));

    await root1.controller.dispatch({ kind: "create", intent: "Run attempt 1" });

    // 验证 Attempt 1 持久化事实
    const attempt1Goals = await readdir(join(attempt1Dir, "goals"));
    assert.ok(attempt1Goals.length > 0, "Attempt 1 应当写入 Goal 快照");
    const resumable1 = await root1.store.listResumable();
    assert.equal(resumable1.length, 1);
    assert.equal(resumable1[0]?.goalId, "goal-attempt-1");

    // 验证不产生独立的 catalog.json
    await assert.rejects(access(join(attempt1Dir, "catalog.json")));
    await assert.rejects(access(join(outputDir, "catalog.json")));

    // 验证原工作区指纹完全未变，且无 .lazygoal 目录
    await assert.rejects(access(join(workspaceDir, ".lazygoal")));
    const workspaceFingerprintAfter1 = await computeDirectoryFingerprint(workspaceDir);
    assert.equal(workspaceFingerprintAfter1, initialFingerprint);

    const attempt1Fingerprint = await computeDirectoryFingerprint(attempt1Dir);

    // 4. 执行 Attempt 2（独立尝试，不覆盖 Attempt 1）
    const root2 = await createCompositionRoot({
        cwd: workspaceDir,
        dataDirectory: attempt2Dir,
        adapter,
        profile,
        toolRegistry: customRegistry,
        toolPolicy: policy,
        goalIdGenerator: () => "goal-attempt-2",
        runIdGenerator: () => "run-attempt-2",
    });

    await root2.controller.dispatch({ kind: "create", intent: "Run attempt 2" });

    // 验证 Attempt 2 的持久化独立且不影响 Attempt 1
    const attempt2Goals = await readdir(join(attempt2Dir, "goals"));
    assert.ok(attempt2Goals.length > 0, "Attempt 2 应当写入 Goal 快照");
    const resumable2 = await root2.store.listResumable();
    assert.equal(resumable2.length, 1);
    assert.equal(resumable2[0]?.goalId, "goal-attempt-2");

    // 验证 Attempt 1 目录内容保持不变（未被覆盖或污染）
    const attempt1FingerprintAfter2 = await computeDirectoryFingerprint(attempt1Dir);
    assert.equal(attempt1FingerprintAfter2, attempt1Fingerprint);

    // 再次确认原工作区完全干净
    await assert.rejects(access(join(workspaceDir, ".lazygoal")));
    const workspaceFingerprintFinal = await computeDirectoryFingerprint(workspaceDir);
    assert.equal(workspaceFingerprintFinal, initialFingerprint);
});
