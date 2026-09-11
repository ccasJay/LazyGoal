import assert from "node:assert/strict";
import { test } from "node:test";

import { safeParse, compileJsonSchema } from "../../contracts/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
} from "../../runtime/src/index";
import {
    WEB_SEARCH_INPUT_CONTRACT,
    WEB_SEARCH_TOOL_ID,
    WebSearchTool,
    type WebSearchResult,
} from "../src/index";

test("web_search contract 校验正常输入和非法结构", () => {
    const valid = safeParse(WEB_SEARCH_INPUT_CONTRACT, { query: "hello world" });
    assert.equal(valid.success, true);
    if (valid.success) {
        assert.deepEqual(valid.data, { query: "hello world" });
    }

    const withMax = safeParse(WEB_SEARCH_INPUT_CONTRACT, { query: "hello", maxResults: 5 });
    assert.equal(withMax.success, true);

    const missingQuery = safeParse(WEB_SEARCH_INPUT_CONTRACT, {});
    assert.equal(missingQuery.success, false);

    const zeroMax = safeParse(WEB_SEARCH_INPUT_CONTRACT, { query: "hello", maxResults: 0 });
    assert.equal(zeroMax.success, false);

    const overMax = safeParse(WEB_SEARCH_INPUT_CONTRACT, { query: "hello", maxResults: 25 });
    assert.equal(overMax.success, false);
});

test("web_search validate 拒绝纯空白 query", () => {
    const tool = new WebSearchTool();
    const emptyResult = tool.validate({ query: "   " });
    assert.equal(emptyResult.ok, false);
    if (!emptyResult.ok) {
        assert.equal(emptyResult.error.code, "INVALID_TOOL_INPUT");
    }

    const validResult = tool.validate({ query: "LazyGoal" });
    assert.equal(validResult.ok, true);
});

test("web_search 在伪搜索后端下返回符合 schema 的结果列表", async () => {
    const mockResults: readonly WebSearchResult[] = [
        { title: "Result 1", url: "https://example.com/1", snippet: "Snippet 1" },
        { title: "Result 2", url: "https://example.com/2", snippet: "Snippet 2" },
    ];

    let capturedQuery = "";
    let capturedMax = 0;

    const tool = new WebSearchTool(async (query, maxResults) => {
        capturedQuery = query;
        capturedMax = maxResults;
        return mockResults;
    });

    const observation = await tool.execute({
        actionId: "action-search-1",
        input: { query: "LazyGoal runtime", maxResults: 5 },
    });

    assert.equal(observation.kind, "success");
    if (observation.kind === "success") {
        assert.deepEqual(observation.output, mockResults);
        assert.match(observation.summary, /返回 2 条结果/);
    }
    assert.equal(capturedQuery, "LazyGoal runtime");
    assert.equal(capturedMax, 5);
});

test("web_search 后端异常时返回 failure observation", async () => {
    const tool = new WebSearchTool(async () => {
        throw new Error("DNS resolution failed");
    });

    const observation = await tool.execute({
        actionId: "action-search-2",
        input: { query: "failing query" },
    });

    assert.equal(observation.kind, "failure");
    if (observation.kind === "failure") {
        assert.equal(observation.code, "WEB_SEARCH_FAILED");
        assert.match(observation.message, /DNS resolution failed/);
        assert.equal(observation.retryable, true);
    }
});

test("web_search 工具成功注册进 ToolRegistry 且 JSON Schema 编译通过", () => {
    const tool = new WebSearchTool();
    const schema = compileJsonSchema(tool.definition.inputContract);
    assert.equal(typeof schema === "object" && schema !== null, true);
    const properties = (schema as { properties?: Record<string, unknown> }).properties;
    assert.ok(properties !== undefined && "query" in properties);

    const registration = createToolRegistration(tool);
    const registry = new InMemoryToolRegistry([registration]);
    assert.ok(registry.get(WEB_SEARCH_TOOL_ID) !== undefined);

    const prep = registration.prepare({ query: "test query" });
    assert.equal(prep.ok, true);
});
