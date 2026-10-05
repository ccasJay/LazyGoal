import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import { createCompositionRoot } from "../../tui/src/cli";

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

class BlockingReportedUsageAdapter implements LLMAdapter {
    readonly provider = "openai";
    readonly structuredOutputMode = "strict" as const;
    readonly entered = deferred<void>();
    private readonly response = deferred<LLMResponse>();

    async generate(request: LLMRequest): Promise<LLMResponse> {
        if (request.tools?.[0]?.id === "system_review_completion") return { content: JSON.stringify({ result: { kind: "accept" } }), providerMetadata: { usage: { inputTokens: 40, outputTokens: 3, cachedInputTokens: 0 } } };
        this.entered.resolve();
        return this.response.promise;
    }

    finish(): void {
        this.response.resolve({
            content: JSON.stringify({
                result: {
                    kind: "complete",
                    summary: "完成",
                    evidenceSequences: [],
                    memoryPatch: null,
                },
            }),
            providerMetadata: {
                usage: { inputTokens: 120, outputTokens: 24, cachedInputTokens: 5 },
            },
        });
    }
}

test("组合根显式启动 HTTP 后可查询运行指标、接收更新并在重建后恢复", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-session-metrics-integration-"));
    const dataDirectory = join(workspace, "runtime-data");
    const adapter = new BlockingReportedUsageAdapter();
    const profile = {
        id: "integration-profile",
        name: "Integration Profile",
        systemPrompt: "Complete the requested task.",
        instructions: [],
        toolIds: [],
    };
    let firstRoot: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;
    let secondRoot: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;
    let execution: Promise<void> | undefined;

    try {
        firstRoot = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            env: { LAZYGOAL_HOME: join(workspace, "lazygoal-home") },
            adapter,
            profile,
            initialScreen: "intent_input",
            goalIdGenerator: () => "goal-metrics-integration",
            runIdGenerator: () => "run-metrics-integration",
        });
        assert.equal(firstRoot.metricsDirectory, join(dataDirectory, "metrics"));

        execution = firstRoot.controller.dispatch({
            kind: "create",
            intent: "Complete one model step",
        });
        await adapter.entered.promise;

        const occupiedServer = createServer();
        await new Promise<void>((resolve) => occupiedServer.listen(0, "127.0.0.1", resolve));
        const occupiedAddress = occupiedServer.address();
        assert.ok(occupiedAddress && typeof occupiedAddress !== "string");
        try {
            await assert.rejects(
                firstRoot.httpService.start(occupiedAddress.port),
                /EADDRINUSE/,
            );
        } finally {
            await new Promise<void>((resolve, reject) => {
                occupiedServer.close((error) => error === undefined ? resolve() : reject(error));
            });
        }

        // Root construction only mounts routes. This explicit start binds the loopback listener.
        const address = await firstRoot.httpService.start(0);
        assert.equal(address.host, "127.0.0.1");

        const activeResponse = await fetch(
            `${address.origin}/goals/goal-metrics-integration/metrics`,
        );
        assert.equal(activeResponse.status, 200);
        const activeSnapshot = await activeResponse.json() as Record<string, unknown>;
        assert.equal(activeSnapshot.goalId, "goal-metrics-integration");
        assert.equal(activeSnapshot.missingCalls, 0, "an in-flight call is not counted as missing usage");

        adapter.finish();
        await execution;

        const updatedResponse = await fetch(
            `${address.origin}/goals/goal-metrics-integration/metrics`,
        );
        assert.equal(updatedResponse.status, 200);
        const updatedSnapshot = await updatedResponse.json() as Record<string, unknown>;
        assert.equal(updatedSnapshot.reportedCalls, 2);
        assert.equal(updatedSnapshot.inputTokens, 160);
        assert.equal(updatedSnapshot.outputTokens, 27);
        assert.equal(updatedSnapshot.stepCount, 1);

        const jsonResponse = await fetch(
            `${address.origin}/goals/goal-metrics-integration/metrics`,
        );
        assert.equal(jsonResponse.status, 200);
        const persistedSnapshot = await jsonResponse.json() as Record<string, unknown>;
        assert.equal(persistedSnapshot.roundCount, 1);
        assert.equal(persistedSnapshot.cacheHitRate, 5 / 160);

        firstRoot.controller.dispose();
        await firstRoot.resources.closeAll();
        firstRoot = undefined;

        secondRoot = await createCompositionRoot({
            cwd: workspace,
            dataDirectory,
            env: { LAZYGOAL_HOME: join(workspace, "lazygoal-home") },
            adapter,
            profile,
            initialScreen: "intent_input",
        });
        const restoredAddress = await secondRoot.httpService.start(0);
        const restoredResponse = await fetch(
            `${restoredAddress.origin}/goals/goal-metrics-integration/metrics`,
        );
        assert.equal(restoredResponse.status, 200);
        const restoredSnapshot = await restoredResponse.json() as Record<string, unknown>;
        assert.equal(restoredSnapshot.inputTokens, 160);
        assert.equal(restoredSnapshot.outputTokens, 27);
        assert.equal(restoredSnapshot.reportedCalls, 2);
        assert.equal(restoredSnapshot.stepCount, 1);
    } finally {
        adapter.finish();
        await execution?.catch(() => undefined);
        if (firstRoot !== undefined) {
            firstRoot.controller.dispose();
            await firstRoot.resources.closeAll();
        }
        if (secondRoot !== undefined) {
            secondRoot.controller.dispose();
            await secondRoot.resources.closeAll();
        }
        await rm(workspace, { recursive: true, force: true });
    }
});
