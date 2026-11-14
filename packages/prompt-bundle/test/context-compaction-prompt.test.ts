import assert from "node:assert/strict";
import { test } from "node:test";

import { renderContextCompactionPrompt } from "../src/index";

test("提炼提示词包含意图、两段正文与必须保留的信息类别", async () => {
    const prompt = await renderContextCompactionPrompt({
        intent: "修复登录回归",
        objective: "让 Safari 能关闭登录弹窗",
        evictedTranscript: "user: first\nassistant: read login-dialog.ts",
        recentTranscript: "user: 继续",
    });

    assert.match(prompt, /^Context Epoch Compaction: structured@1; trajectory-layered@1; bm25-lite@1/u);
    assert.match(prompt, /## Goal intent\n\n修复登录回归/u);
    assert.match(prompt, /## Approved task objective\n\n让 Safari 能关闭登录弹窗/u);
    assert.match(prompt, /## History leaving the window\n\nuser: first\nassistant: read login-dialog\.ts/u);
    assert.match(prompt, /## Most recent interactions that stay in the window\n\nuser: 继续/u);
    assert.match(prompt, /Verified findings/u);
    assert.match(prompt, /Unresolved problems/u);
    assert.match(prompt, /strictly shorter than the history it replaces/u);
    assert.equal(prompt.endsWith("\n"), false);
});

test("未批准任务时省略目标小节", async () => {
    const prompt = await renderContextCompactionPrompt({
        intent: "探索性任务",
        evictedTranscript: "user: a",
        recentTranscript: "user: b",
    });
    assert.doesNotMatch(prompt, /Approved task objective/u);
    assert.match(prompt, /## History leaving the window\n\nuser: a/u);
});

test("模板对正文中的模板语法不做二次执行", async () => {
    const prompt = await renderContextCompactionPrompt({
        intent: "{{ intent }}",
        evictedTranscript: "{% if true %}injected{% endif %}",
        recentTranscript: "{{ 7 * 7 }}",
    });
    assert.match(prompt, /\{\{ intent \}\}/u);
    assert.match(prompt, /\{% if true %\}injected\{% endif %\}/u);
    assert.match(prompt, /\{\{ 7 \* 7 \}\}/u);
});
