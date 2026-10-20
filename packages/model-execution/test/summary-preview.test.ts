import assert from "node:assert/strict";
import { test } from "node:test";

import {
    COMPLETION_CANDIDATE_TOOL_ID,
    MAX_SUMMARY_PREVIEW_LENGTH,
    SummaryPreviewExtractor,
    isCompletionCandidateTool,
    readCompletionCandidatePreview,
    readCompleteSummaryPreview,
} from "../src/index";
import type { LLMRequest, LLMResponse } from "../../llm-core/src/index";

test("跨分片的 summary 按解码后的字段值提供有序增量", () => {
    const extractor = new SummaryPreviewExtractor({ toolId: COMPLETION_CANDIDATE_TOOL_ID });
    const increments = [
        ...extractor.accept('{"summary":"第一段'),
        ...extractor.accept('，第二段"}'),
    ];
    assert.equal(extractor.matched, true);
    assert.equal(extractor.isComplete, true);
    assert.equal(extractor.value, "第一段，第二段");
    assert.deepEqual(increments.map((increment) => increment.text), ["第一段", "，第二段"]);
    assert.deepEqual(increments.map((increment) => increment.startOffset), [0, 3]);
});

test("JSON 字符串转义与 Unicode 转义被正确解码", () => {
    const extractor = new SummaryPreviewExtractor({ toolId: COMPLETION_CANDIDATE_TOOL_ID });
    extractor.accept('{"summary":"引号\\" 反斜线\\\\ 换行\\n 制表\\t"}');
    assert.equal(extractor.value, "引号\" 反斜线\\ 换行\n 制表\t");
    assert.equal(extractor.isComplete, true);

    const unicode = new SummaryPreviewExtractor({ toolId: COMPLETION_CANDIDATE_TOOL_ID });
    unicode.accept('{"summary":"\\u4f60\\u597d"}');
    assert.equal(unicode.value, "你好");
});

test("代理项不会被拆断：跨片段的高位与低位仍组成完整字符", () => {
    const extractor = new SummaryPreviewExtractor({ toolId: COMPLETION_CANDIDATE_TOOL_ID });
    const first = extractor.accept('{"summary":"\\ud83d');
    assert.deepEqual(first.map((increment) => increment.text), []);
    const second = extractor.accept('\\ude00 结尾"}');
    assert.deepEqual(second.map((increment) => increment.text), ["😀 结尾"]);
    assert.equal(extractor.value, "😀 结尾");
});

test("同名嵌套字段不会被当作顶层目标", () => {
    const extractor = new SummaryPreviewExtractor({ toolId: COMPLETION_CANDIDATE_TOOL_ID });
    extractor.accept('{"details":{"summary":"嵌套内容"},"summary":"顶层内容"}');
    assert.equal(extractor.value, "顶层内容");
});

test("顶层键重复出现时解析结果歧义，不提供预览", () => {
    const extractor = new SummaryPreviewExtractor({ toolId: COMPLETION_CANDIDATE_TOOL_ID });
    extractor.accept('{"summary":"第一份","summary":"第二份"}');
    assert.equal(extractor.isAmbiguous, true);
    assert.equal(extractor.matched, false);
});

test("目标值不是字符串时不猜测缺失字符", () => {
    const extractor = new SummaryPreviewExtractor({ toolId: COMPLETION_CANDIDATE_TOOL_ID });
    extractor.accept('{"summary":{"nested":"内容"}}');
    assert.equal(extractor.matched, false);
    assert.equal(extractor.value, "");
});

test("公开正文上限只截断预览，不影响原始响应", () => {
    const long = "x".repeat(MAX_SUMMARY_PREVIEW_LENGTH + 100);
    const result = readCompleteSummaryPreview({
        toolId: COMPLETION_CANDIDATE_TOOL_ID,
        argumentsJson: JSON.stringify({ summary: long }),
    });
    assert.equal(result.matched, true);
    assert.equal(result.truncated, true);
    assert.equal(result.text.length, MAX_SUMMARY_PREVIEW_LENGTH);
});

test("完整参数块读取只返回顶层 summary 字段值", () => {
    const result = readCompleteSummaryPreview({
        toolId: COMPLETION_CANDIDATE_TOOL_ID,
        argumentsJson: JSON.stringify({
            summary: "已完成",
            completionEvidence: [{ sequence: 1 }],
            memoryPatch: { operations: [] },
        }),
    });
    assert.equal(result.matched, true);
    assert.equal(result.text, "已完成");
    assert.equal(result.ambiguous, false);
    assert.equal(result.complete, true);
});

test("没有可公开字段时明确不可用", () => {
    const result = readCompleteSummaryPreview({
        toolId: COMPLETION_CANDIDATE_TOOL_ID,
        argumentsJson: JSON.stringify({ completionEvidence: [] }),
    });
    assert.equal(result.matched, false);
    assert.equal(result.text, "");
});

test("只有完成候选工具允许公开 summary 预览", () => {
    assert.equal(isCompletionCandidateTool(COMPLETION_CANDIDATE_TOOL_ID), true);
    assert.equal(isCompletionCandidateTool("read_file"), false);
});

function requestWithTools(toolIds: readonly string[]): LLMRequest {
    return {
        messages: [],
        tools: toolIds.map((id) => ({ id, description: id, parametersSchema: { type: "object" } })),
    };
}

function responseWithToolCall(toolId: string, argumentsJson: string): LLMResponse {
    return {
        blocks: [{
            index: 0,
            type: "tool_call",
            callId: "call-1",
            toolId,
            argumentsJson,
        }],
    };
}

test("只有请求实际声明完成候选工具时才产生预览", () => {
    const response = responseWithToolCall(
        COMPLETION_CANDIDATE_TOOL_ID,
        JSON.stringify({ summary: "已完成", completionEvidence: [] }),
    );
    assert.equal(
        readCompletionCandidatePreview(requestWithTools(["read_file"]), response, "call-1"),
        undefined,
    );
    const preview = readCompletionCandidatePreview(
        requestWithTools([COMPLETION_CANDIDATE_TOOL_ID]),
        response,
        "call-1",
    );
    assert.ok(preview !== undefined);
    assert.equal(preview.text, "已完成");
    assert.equal(preview.modelCallId, "call-1");
    assert.equal(preview.blockIndex, 0);
    assert.equal(preview.complete, true);
    assert.equal(preview.truncated, false);
    assert.equal(preview.candidateId, "call-1:0");
});

test("身份不一致的工具调用不产生预览", () => {
    const response = responseWithToolCall("read_file", JSON.stringify({ summary: "不是候选" }));
    assert.equal(
        readCompletionCandidatePreview(
            requestWithTools([COMPLETION_CANDIDATE_TOOL_ID]),
            response,
            "call-1",
        ),
        undefined,
    );
});
