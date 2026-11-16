import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter, LLMRequest, LLMResponse } from "../../../packages/llm-core/src/index";
import { createGoal } from "../../../packages/runtime/src/index";
import { createBrowserSessionAccess } from "../../../packages/browser/src/index";
import { runServerSession } from "../src/cli";
import { createCompositionRoot } from "../src/composition-root";

test("Goal 列表在旧版本快照不可读时仍返回可读 Goal 并上报不可读数量", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "lazygoal-goal-list-legacy-"));
    const workspace = join(temporaryRoot, "workspace");
    const dataDirectory = join(temporaryRoot, "data");
    const access = createBrowserSessionAccess();
    const adapter: LLMAdapter = {
        async generate(_request: LLMRequest): Promise<LLMResponse> {
            throw new Error("本用例不触发模型调用");
        },
    };
    let root: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;
    let serving: Promise<number> | undefined;

    try {
        await mkdir(workspace, { recursive: true });
        root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            env: { LAZYGOAL_HOME: join(temporaryRoot, "home") },
            profile: { id: "integration", systemPrompt: "确定性验收代理。", instructions: [], toolIds: [] },
            adapter,
            httpMiddleware: access.middleware,
            exitPort: { exit() {} },
        });
        await root.checkpointStore.save(createGoal({
            id: "readable-goal",
            intent: "可读 Goal",
            runId: "run-readable-goal",
            profile: root.profile,
            modelSelection: root.defaultModelSelection,
            promptBundleVersion: 1,
            memoryProtocol: { kind: "structured", version: 1 },
            modelContextProtocol: { kind: "trajectory-layered", version: 1 },
            contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        }));

        // 旧版本快照：JSON 合法但不符合当前快照协议。
        const legacyDirectory = join(dataDirectory, "goals", Buffer.from("legacy-goal", "utf8").toString("base64url"));
        await mkdir(legacyDirectory, { recursive: true });
        await writeFile(
            join(legacyDirectory, "snapshot.json"),
            JSON.stringify({ id: "legacy-goal", state: { messages: [] } }),
            "utf8",
        );

        const launchReady = new Promise<string>((resolve) => {
            serving = runServerSession(root!, access, resolve);
        });
        const launchUrl = new URL(await launchReady);
        const origin = launchUrl.origin;
        const token = launchUrl.hash.slice(1);

        const response = await fetch(`${origin}/api/goals`, {
            headers: { authorization: `Bearer ${token}`, origin },
        });
        assert.equal(response.status, 200);
        const body = await response.json() as { goals: Array<{ goalId: string }>; unreadableCount: number };
        assert.equal(body.unreadableCount, 1);
        assert.ok(body.goals.some((goal) => goal.goalId === "readable-goal"));

        process.emit("SIGINT");
        assert.equal(await serving, 130);
        serving = undefined;
    } finally {
        if (serving !== undefined) {
            root?.checkpointStore.freeze();
            root?.abortController.abort();
            process.emit("SIGINT");
            await serving.catch(() => undefined);
        }
        if (root !== undefined) {
            root.checkpointStore.freeze();
            root.abortController.abort();
            await root.resources.closeAll().catch(() => undefined);
        }
        await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});
