import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import { CommandAwareTextInput } from "../src/command-aware-text-input.js";
import type { ModelCommandEffect } from "../../slash-command/src/index.js";

afterEach(() => {
    cleanup();
});

async function nextFrame(): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 25);
    });
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

test("CommandAwareTextInput: 普通文本正常提交，不触发命令回调", async () => {
    let submittedText: string | undefined;
    let dispatchedEffect: ModelCommandEffect | undefined;

    const instance = render(
        <CommandAwareTextInput
            placeholder="Type here..."
            onSubmit={(text) => {
                submittedText = text;
            }}
            onCommandEffect={(effect) => {
                dispatchedEffect = effect;
            }}
        />,
    );

    assert.match(instance.lastFrame() ?? "", /Type here\.\.\./);

    instance.stdin.write("Hello LazyGoal");
    await waitForFrame(instance, /Hello LazyGoal/);
    instance.stdin.write("\r");
    await nextFrame();

    assert.equal(submittedText, "Hello LazyGoal");
    assert.equal(dispatchedEffect, undefined);
});

test("CommandAwareTextInput: 输入 / 实时展示候选列表与前缀过滤", async () => {
    const instance = render(
        <CommandAwareTextInput
            onSubmit={() => {}}
        />,
    );

    // 初始不显示候选
    assert.doesNotMatch(instance.lastFrame() ?? "", /Available commands/);

    // 输入 /
    instance.stdin.write("/");
    await waitForFrame(instance, /Available commands/);
    await waitForFrame(instance, /\/model/);

    // 输入 m 继续匹配
    instance.stdin.write("m");
    await waitForFrame(instance, /\/model/);

    // 输入 xyz 无匹配候选
    instance.stdin.write("xyz");
    await waitForFrame(instance, /xyz/);
    assert.doesNotMatch(instance.lastFrame() ?? "", /\/model/);
});

test("CommandAwareTextInput: 提交 /model 派发 effect 且不调用 onSubmit", async () => {
    let submittedText: string | undefined;
    let dispatchedEffect: ModelCommandEffect | undefined;

    const instance = render(
        <CommandAwareTextInput
            onSubmit={(text) => {
                submittedText = text;
            }}
            onCommandEffect={(effect) => {
                dispatchedEffect = effect;
            }}
        />,
    );

    instance.stdin.write("/model");
    await waitForFrame(instance, /\/model/);
    instance.stdin.write("\r");
    await nextFrame();

    assert.equal(submittedText, undefined);
    assert.deepEqual(dispatchedEffect, { kind: "open_model_selector" });
});

test("CommandAwareTextInput: 提交未知命令或非法参数渲染错误且阻止 onSubmit", async () => {
    let submittedText: string | undefined;
    let dispatchedEffect: ModelCommandEffect | undefined;
    let reportedError: string | undefined;

    const instance = render(
        <CommandAwareTextInput
            onSubmit={(text) => {
                submittedText = text;
            }}
            onCommandEffect={(effect) => {
                dispatchedEffect = effect;
            }}
            onError={(err) => {
                reportedError = err;
            }}
        />,
    );

    // 提交未知命令
    instance.stdin.write("/unknown-command");
    await waitForFrame(instance, /\/unknown-command/);
    instance.stdin.write("\r");
    await waitForFrame(instance, /Error: Unknown slash command '\/unknown-command'\./);

    assert.equal(submittedText, undefined);
    assert.equal(dispatchedEffect, undefined);
    assert.equal(reportedError, "Unknown slash command '/unknown-command'.");

    // 再次输入字符时错误被清除
    instance.stdin.write("a");
    await nextFrame();
    assert.doesNotMatch(instance.lastFrame() ?? "", /Error: Unknown slash command/);
});

test("CommandAwareTextInput: // 转义移除一个斜杠并按普通文本提交", async () => {
    let submittedText: string | undefined;
    let dispatchedEffect: ModelCommandEffect | undefined;

    const instance = render(
        <CommandAwareTextInput
            onSubmit={(text) => {
                submittedText = text;
            }}
            onCommandEffect={(effect) => {
                dispatchedEffect = effect;
            }}
        />,
    );

    instance.stdin.write("//model");
    await waitForFrame(instance, /\/\/model/);
    instance.stdin.write("\r");
    await nextFrame();

    assert.equal(submittedText, "/model");
    assert.equal(dispatchedEffect, undefined);
});
