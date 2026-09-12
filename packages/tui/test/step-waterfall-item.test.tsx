import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { render } from "ink-testing-library";

import {
    StepWaterfallItem,
    truncateSummary,
    MAX_STEP_SUMMARY_CHARS,
} from "../src/step-waterfall-item";

test("truncateSummary 压缩空白并在超过阈值时截断", () => {
    assert.equal(truncateSummary("hello\nworld"), "hello world");
    assert.equal(truncateSummary("   multiple   spaces  \t  "), "multiple spaces");

    const short = "short string";
    assert.equal(truncateSummary(short, 20), short);

    const exact = "a".repeat(10);
    assert.equal(truncateSummary(exact, 10), exact);

    const long = "a".repeat(15);
    assert.equal(truncateSummary(long, 10), "aaaaaaaaaa…");
});

test("StepWaterfallItem 渲染成功步骤条目与摘要", () => {
    const { lastFrame } = render(
        <StepWaterfallItem
            step={{
                stepNumber: 1,
                toolId: "read_file",
                actionId: "act-1",
                status: "success",
                inputSummary: "src/auth.ts",
                outputSummary: "Read 120 lines",
            }}
        />,
    );

    const output = lastFrame() ?? "";
    assert.match(output, /✔/);
    assert.match(output, /Step 1: \[read_file\]/);
    assert.match(output, /src\/auth\.ts/);
    assert.match(output, /\(Read 120 lines\)/);
});

test("StepWaterfallItem 渲染失败步骤条目与失败信息", () => {
    const { lastFrame } = render(
        <StepWaterfallItem
            step={{
                stepNumber: 2,
                toolId: "bash",
                actionId: "act-2",
                status: "failure",
                inputSummary: "npm test",
                outputSummary: "1 test failed",
            }}
        />,
    );

    const output = lastFrame() ?? "";
    assert.match(output, /✖/);
    assert.match(output, /Step 2: \[bash\]/);
    assert.match(output, /npm test/);
    assert.match(output, /\(1 test failed\)/);
});

test("StepWaterfallItem 对超长参数执行安全单行截断", () => {
    const longCommand = "curl -X POST https://example.test/api/v1/very/long/path/with/lots/of/parameters/that/exceeds/threshold -d 'foo=bar'";
    const { lastFrame } = render(
        <StepWaterfallItem
            step={{
                stepNumber: 3,
                toolId: "bash",
                actionId: "act-3",
                status: "success",
                inputSummary: longCommand,
            }}
        />,
    );

    const output = lastFrame() ?? "";
    assert.match(output, /✔/);
    assert.match(output, /Step 3: \[bash\]/);
    assert.match(output, /…/);
    assert.ok(output.includes(longCommand.slice(0, MAX_STEP_SUMMARY_CHARS)));
});
