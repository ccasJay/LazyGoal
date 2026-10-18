import assert from "node:assert/strict";
import { test } from "node:test";

import {
    readAssistantText,
    readReasoningText,
    readTextBlocks,
    readToolCalls,
    type LLMResponse,
} from "../src/index";
import { blockResponse, textResponse } from "./response-fixtures";

test("完整响应以有序 blocks 为唯一权威，读视图按块顺序派生", () => {
    const response = blockResponse(
        { type: "text", text: "先检查文件" },
        { type: "reasoning", text: "比较两个分支" },
        { type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: '{"path":"README.md"}' },
        { type: "text", text: "结论" },
    );

    assert.deepEqual(response.blocks.map(block => block.index), [0, 1, 2, 3]);
    assert.deepEqual(response.blocks.map(block => block.type), ["text", "reasoning", "tool_call", "text"]);
    assert.equal(readAssistantText(response), "先检查文件结论");
    assert.equal(readReasoningText(response), "比较两个分支");
    assert.deepEqual(readToolCalls(response), [{
        callId: "call-1", toolId: "read_file", argumentsJson: '{"path":"README.md"}',
    }]);
});

test("文本格式区分普通正文与请求要求的结构化 JSON", () => {
    const response = blockResponse(
        { type: "text", text: '{"result":{"kind":"complete"}}', format: "json" },
        { type: "text", text: "解释", format: "plain" },
    );

    assert.deepEqual(readTextBlocks(response, "json"), ['{"result":{"kind":"complete"}}']);
    assert.deepEqual(readTextBlocks(response, "plain"), ["解释"]);
    assert.equal(readAssistantText(response), '{"result":{"kind":"complete"}}解释');
});

test("reasoning 与工具参数不进入正文，正文投影不隐式 trim 或插入换行", () => {
    const response = blockResponse(
        { type: "text", text: "  保留空白" },
        { type: "reasoning", text: "内部推理" },
        { type: "tool_call", callId: "call-2", toolId: "bash", argumentsJson: "不是 JSON 的原始参数" },
        { type: "text", text: "换行在其中\n" },
    );

    assert.equal(readAssistantText(response), "  保留空白换行在其中\n");
    assert.equal(readReasoningText(response), "内部推理");
    assert.equal(readReasoningText(textResponse("只有正文")), undefined);
});

test("无内容块的响应派生空正文、无推理与空工具列表", () => {
    const response: LLMResponse = { blocks: [] };

    assert.equal(readAssistantText(response), "");
    assert.equal(readReasoningText(response), undefined);
    assert.deepEqual(readToolCalls(response), []);
});
