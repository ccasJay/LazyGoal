import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import type { LlmModelDescriptor } from "../../llm/src/model-catalog";
import { ModelSelector } from "../src/index";

afterEach(() => {
    cleanup();
});

async function nextFrame(): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 25);
    });
}

async function waitForCondition(condition: () => boolean, timeoutMs = 2000): Promise<void> {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start >= timeoutMs) {
            assert.equal(condition(), true);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
}

async function waitForFrame(
    instance: { lastFrame(): string | undefined },
    pattern: RegExp,
    timeoutMs = 2000,
): Promise<string> {
    const start = Date.now();
    for (;;) {
        const frame = instance.lastFrame() ?? "";
        if (pattern.test(frame)) {
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
            return instance.lastFrame() ?? "";
        }
        if (Date.now() - start >= timeoutMs) {
            assert.match(frame, pattern);
        }
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 10);
        });
    }
}

function createModel(
    id: string,
    displayName: string,
    selectable: boolean,
    unavailableReason?: string,
    contextTokens?: number,
): LlmModelDescriptor {
    return {
        id,
        displayName,
        provider: "anthropic",
        selectable,
        unavailableReason,
        availabilitySource: "live",
        metadataSource: "catalog",
        contextWindowTokens: contextTokens,
    };
}

test("ModelSelector renders loading state and handles ESC cancellation", async () => {
    let cancelled = false;
    const instance = render(
        <ModelSelector
            currentModelId="claude-3-5-sonnet"
            state={{ status: "loading", generation: 1 }}
            busy={false}
            onSelect={() => undefined}
            onCancel={() => {
                cancelled = true;
            }}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /Fetching available models\.\.\./);
    assert.match(frame, /Press ESC to cancel/);

    instance.stdin.write("\u001b");
    await waitForCondition(() => cancelled);
    assert.equal(cancelled, true);
});

test("ModelSelector renders model list, highlights current model, and supports navigation and selection", async () => {
    const models: LlmModelDescriptor[] = [
        createModel("claude-3-5-sonnet", "Claude 3.5 Sonnet", true, undefined, 200 * 1024),
        createModel("claude-3-opus", "Claude 3 Opus", true, undefined, 200 * 1024),
    ];
    let selectedModel: LlmModelDescriptor | undefined;

    const instance = render(
        <ModelSelector
            currentModelId="claude-3-5-sonnet"
            state={{ status: "list", generation: 1, models }}
            busy={false}
            onSelect={(model) => {
                selectedModel = model;
            }}
            onCancel={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /Select Language Model/);
    assert.match(frame, /> Claude 3\.5 Sonnet/);
    assert.match(frame, /\(current\)/);
    assert.match(frame, /\[200k\]/);

    // 下移到第二个模型
    instance.stdin.write("\u001b[B");
    await waitForFrame(instance, /> Claude 3 Opus/);

    // 按 Enter 提交
    instance.stdin.write("\r");
    await nextFrame();

    assert.equal(selectedModel?.id, "claude-3-opus");
});

test("ModelSelector blocks selection of ineligible models and displays reason", async () => {
    const models: LlmModelDescriptor[] = [
        createModel("model-valid", "Valid Model", true),
        createModel("model-disabled", "Disabled Model", false, "Missing structured outputs support"),
    ];
    let selectedModel: LlmModelDescriptor | undefined;

    const instance = render(
        <ModelSelector
            currentModelId="model-valid"
            state={{ status: "list", generation: 1, models }}
            busy={false}
            onSelect={(model) => {
                selectedModel = model;
            }}
            onCancel={() => undefined}
        />,
    );

    // 下移到不可选模型
    instance.stdin.write("\u001b[B");
    await waitForFrame(instance, /> Disabled Model/);
    assert.match(instance.lastFrame() ?? "", /Reason: Missing structured outputs support/);

    // 尝试按 Enter 提交
    instance.stdin.write("\r");
    await nextFrame();

    // 此时不应调用 onSelect
    assert.equal(selectedModel, undefined);
    assert.match(instance.lastFrame() ?? "", /Missing structured outputs support/);

    // 上移回到有效模型，错误提示被清除
    instance.stdin.write("\u001b[A");
    await waitForFrame(instance, /> Valid Model/);
});

test("ModelSelector renders error state and handles ESC", async () => {
    let cancelled = false;
    const instance = render(
        <ModelSelector
            currentModelId="claude-3-5-sonnet"
            state={{
                status: "error",
                generation: 1,
                error: { code: "FETCH_FAILED", message: "Network timeout while fetching models" },
            }}
            busy={false}
            onSelect={() => undefined}
            onCancel={() => {
                cancelled = true;
            }}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /FETCH_FAILED/);
    assert.match(frame, /Network timeout while fetching models/);
    assert.match(frame, /Press ESC to return/);

    instance.stdin.write("\u001b");
    await waitForCondition(() => cancelled);
    assert.equal(cancelled, true);
});

test("ModelSelector ignores keyboard input while busy", async () => {
    let cancelled = false;
    let selectedModel: LlmModelDescriptor | undefined;
    const models = [createModel("model-1", "Model 1", true)];

    const instance = render(
        <ModelSelector
            currentModelId="model-1"
            state={{ status: "list", generation: 1, models }}
            busy={true}
            onSelect={(model) => {
                selectedModel = model;
            }}
            onCancel={() => {
                cancelled = true;
            }}
        />,
    );

    instance.stdin.write("\r");
    instance.stdin.write("\u001b");
    await nextFrame();

    assert.equal(selectedModel, undefined);
    assert.equal(cancelled, false);
    assert.match(instance.lastFrame() ?? "", /Switching model\.\.\./);
});
