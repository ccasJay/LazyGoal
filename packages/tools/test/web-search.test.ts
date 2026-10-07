import assert from "node:assert/strict";
import { test } from "node:test";

import { safeParse, compileJsonSchema } from "../../contracts/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    TransientToolExecutionFailure,
} from "../../tool-core/src/index";
import {
    WEB_SEARCH_INPUT_CONTRACT,
    WEB_SEARCH_TOOL_ID,
    WebSearchTool,
    type WebSearchResult,
} from "../src/index";

const validPlan = {
    actionId: "action-search-1",
    workspaceRoot: "/workspace",
    scope: { extraFiles: [], network: "all_outbound" as const },
};

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

test("web_search resolveSandboxAccess 派生出站网络能力", () => {
    const tool = new WebSearchTool();
    const access = tool.resolveSandboxAccess({ query: "test" });
    assert.ok(access.network !== undefined);
    assert.deepEqual(access.network.targets, ["all_outbound"]);
});

test("web_search 无有效网络计划时阻断执行且不调用后端", async () => {
    let backendCalled = false;
    const tool = new WebSearchTool(async () => {
        backendCalled = true;
        return [];
    });

    // 1. 无 plan
    const obsNoPlan = await tool.execute({
        actionId: "act-no-plan",
        input: { query: "test" },
    });
    assert.equal(obsNoPlan.kind, "failure");
    if (obsNoPlan.kind === "failure") {
        assert.equal(obsNoPlan.code, "SANDBOX_APPROVAL_REQUIRED");
    }
    assert.equal(backendCalled, false);

    // 2. plan network 为 none
    const obsNoneNet = await tool.execute({
        actionId: "act-none-net",
        input: { query: "test" },
        plan: {
            actionId: "act-none-net",
            workspaceRoot: "/workspace",
            scope: { extraFiles: [], network: "none" },
        },
    });
    assert.equal(obsNoneNet.kind, "failure");
    if (obsNoneNet.kind === "failure") {
        assert.equal(obsNoneNet.code, "SANDBOX_APPROVAL_REQUIRED");
    }
    assert.equal(backendCalled, false);

    // 3. plan actionId 不匹配
    const obsMismatch = await tool.execute({
        actionId: "act-real",
        input: { query: "test" },
        plan: {
            actionId: "act-other",
            workspaceRoot: "/workspace",
            scope: { extraFiles: [], network: "all_outbound" },
        },
    });
    assert.equal(obsMismatch.kind, "failure");
    if (obsMismatch.kind === "failure") {
        assert.equal(obsMismatch.code, "SANDBOX_APPROVAL_REQUIRED");
    }
    assert.equal(backendCalled, false);
});

test("web_search 在伪搜索后端下返回符合 schema 的结果列表并限制文本长度", async () => {
    const mockResults: readonly WebSearchResult[] = [
        { title: "A".repeat(1000), url: "https://example.com/1", snippet: "B".repeat(3000) },
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
        plan: validPlan,
    });

    assert.equal(observation.kind, "success");
    if (observation.kind === "success") {
        const out = observation.output as readonly WebSearchResult[];
        assert.equal(out.length, 2);
        assert.equal(out[0]!.title.length, 500);
        assert.equal(out[0]!.snippet.length, 2000);
        assert.match(observation.summary, /returned 2 result\(s\)/);
    }
    assert.equal(capturedQuery, "LazyGoal runtime");
    assert.equal(capturedMax, 5);
});

test("web_search 搜索无结果时返回空列表及准确摘要", async () => {
    const tool = new WebSearchTool(async () => []);

    const observation = await tool.execute({
        actionId: "action-search-empty",
        input: { query: "empty query" },
        plan: {
            actionId: "action-search-empty",
            workspaceRoot: "/workspace",
            scope: { extraFiles: [], network: "all_outbound" },
        },
    });

    assert.equal(observation.kind, "success");
    if (observation.kind === "success") {
        assert.deepEqual(observation.output, []);
        assert.match(observation.summary, /returned 0 result\(s\)/);
    }
});

test("web_search 遭遇 429 或 5xx 抛出 TransientToolExecutionFailure 走安全重试", async () => {
    const tool429 = new WebSearchTool(async () => {
        throw new Error("HTTP 429 Too Many Requests");
    });

    await assert.rejects(
        () => tool429.execute({
            actionId: "act-429",
            input: { query: "test" },
            plan: {
                actionId: "act-429",
                workspaceRoot: "/workspace",
                scope: { extraFiles: [], network: "all_outbound" },
            },
        }),
        TransientToolExecutionFailure,
    );

    const tool503 = new WebSearchTool(async () => {
        throw new TransientToolExecutionFailure("http_503", 1000);
    });

    await assert.rejects(
        () => tool503.execute({
            actionId: "act-503",
            input: { query: "test" },
            plan: {
                actionId: "act-503",
                workspaceRoot: "/workspace",
                scope: { extraFiles: [], network: "all_outbound" },
            },
        }),
        TransientToolExecutionFailure,
    );
});

test("web_search 普通后端异常时返回 failure observation 且不无限重试", async () => {
    const tool = new WebSearchTool(async () => {
        throw new Error("DNS resolution failed");
    });

    const observation = await tool.execute({
        actionId: "action-search-2",
        input: { query: "failing query" },
        plan: {
            actionId: "action-search-2",
            workspaceRoot: "/workspace",
            scope: { extraFiles: [], network: "all_outbound" },
        },
    });

    assert.equal(observation.kind, "failure");
    if (observation.kind === "failure") {
        assert.equal(observation.code, "WEB_SEARCH_FAILED");
        assert.match(observation.message, /DNS resolution failed/);
        assert.equal(observation.retryable, false);
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
