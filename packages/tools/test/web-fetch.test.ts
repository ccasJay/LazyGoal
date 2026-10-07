import assert from "node:assert/strict";
import { test } from "node:test";

import { safeParse, compileJsonSchema } from "../../contracts/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    TransientToolExecutionFailure,
} from "../../tool-core/src/index";
import {
    WEB_FETCH_INPUT_CONTRACT,
    WEB_FETCH_TOOL_ID,
    WebFetchTool,
    type WebFetchOutput,
    htmlToPlainText,
} from "../src/index";

const validPlan = {
    actionId: "action-fetch-1",
    workspaceRoot: "/workspace",
    scope: { extraFiles: [], network: "all_outbound" as const },
};

test("web_fetch contract 校验正常输入与非法结构", () => {
    const valid = safeParse(WEB_FETCH_INPUT_CONTRACT, { url: "https://example.com" });
    assert.equal(valid.success, true);

    const withPagination = safeParse(WEB_FETCH_INPUT_CONTRACT, {
        url: "https://example.com",
        maxChars: 1000,
        offset: 50,
    });
    assert.equal(withPagination.success, true);

    const missingUrl = safeParse(WEB_FETCH_INPUT_CONTRACT, {});
    assert.equal(missingUrl.success, false);

    const negativeChars = safeParse(WEB_FETCH_INPUT_CONTRACT, {
        url: "https://example.com",
        maxChars: 0,
    });
    assert.equal(negativeChars.success, false);

    const overChars = safeParse(WEB_FETCH_INPUT_CONTRACT, {
        url: "https://example.com",
        maxChars: 50_001,
    });
    assert.equal(overChars.success, false);

    const negativeOffset = safeParse(WEB_FETCH_INPUT_CONTRACT, {
        url: "https://example.com",
        offset: -1,
    });
    assert.equal(negativeOffset.success, false);
});

test("web_fetch validate 校验 URL 合法性与协议", () => {
    const tool = new WebFetchTool();

    assert.equal(tool.validate({ url: "" }).ok, false);
    assert.equal(tool.validate({ url: "not-a-valid-url" }).ok, false);
    assert.equal(tool.validate({ url: "ftp://example.com/file" }).ok, false);
    assert.equal(tool.validate({ url: "file:///workspace/test.txt" }).ok, false);

    assert.equal(tool.validate({ url: "https://example.com/docs" }).ok, true);
    assert.equal(tool.validate({ url: "http://localhost:8080/api" }).ok, true);
});

test("web_fetch resolveSandboxAccess 派生出站网络能力与目标域名", () => {
    const tool = new WebFetchTool();
    const access = tool.resolveSandboxAccess({ url: "https://api.github.com/repos" });
    assert.ok(access.network !== undefined);
    assert.deepEqual(access.network.targets, ["api.github.com"]);
});

test("web_fetch 无有效网络计划时阻断执行且不调用后端", async () => {
    let handlerCalled = false;
    const tool = new WebFetchTool(async () => {
        handlerCalled = true;
        return "content";
    });

    // 1. 无 plan
    const obsNoPlan = await tool.execute({
        actionId: "act-fetch-no-plan",
        input: { url: "https://example.com" },
    });
    assert.equal(obsNoPlan.kind, "failure");
    if (obsNoPlan.kind === "failure") {
        assert.equal(obsNoPlan.code, "SANDBOX_APPROVAL_REQUIRED");
    }
    assert.equal(handlerCalled, false);

    // 2. plan network 为 none
    const obsNoneNet = await tool.execute({
        actionId: "act-fetch-none",
        input: { url: "https://example.com" },
        plan: {
            actionId: "act-fetch-none",
            workspaceRoot: "/workspace",
            scope: { extraFiles: [], network: "none" },
        },
    });
    assert.equal(obsNoneNet.kind, "failure");
    if (obsNoneNet.kind === "failure") {
        assert.equal(obsNoneNet.code, "SANDBOX_APPROVAL_REQUIRED");
    }
    assert.equal(handlerCalled, false);
});

test("htmlToPlainText 正确剥离标签与脚本并解码实体", () => {
    const html = `
        <html>
            <head>
                <style>body { color: red; }</style>
                <script>console.log("secret");</script>
            </head>
            <body>
                <h1>标题 &amp; 概述</h1>
                <p>这是段落一。&lt;hello&gt;</p>
            </body>
        </html>
    `;
    const text = htmlToPlainText(html);
    assert.doesNotMatch(text, /secret/);
    assert.doesNotMatch(text, /color: red/);
    assert.match(text, /标题 & 概述/);
    assert.match(text, /这是段落一。<hello>/);
});

test("web_fetch 返回结构化正文且支持 UTF-16 offset 与分页截断", async () => {
    const fullText = "0123456789".repeat(10); // 100 字符
    const tool = new WebFetchTool(async () => fullText);

    // 首页未截断
    const normalObs = await tool.execute({
        actionId: "action-fetch-1",
        input: { url: "https://example.com/api", maxChars: 150 },
        plan: validPlan,
    });
    assert.equal(normalObs.kind, "success");
    if (normalObs.kind === "success") {
        const out = normalObs.output as unknown as WebFetchOutput;
        assert.equal(out.url, "https://example.com/api");
        assert.equal(out.text, fullText);
        assert.equal(out.offset, 0);
        assert.equal(out.nextOffset, undefined);
        assert.equal(out.truncated, false);
    }

    // 分页截断第一页
    const page1Obs = await tool.execute({
        actionId: "action-fetch-p1",
        input: { url: "https://example.com/api", maxChars: 40, offset: 0 },
        plan: {
            actionId: "action-fetch-p1",
            workspaceRoot: "/workspace",
            scope: { extraFiles: [], network: "all_outbound" },
        },
    });
    assert.equal(page1Obs.kind, "success");
    if (page1Obs.kind === "success") {
        const out = page1Obs.output as unknown as WebFetchOutput;
        assert.equal(out.text.length, 40);
        assert.equal(out.offset, 0);
        assert.equal(out.nextOffset, 40);
        assert.equal(out.truncated, true);
        assert.match(page1Obs.summary, /next offset 40/);
    }

    // 分页读取第二页
    const page2Obs = await tool.execute({
        actionId: "action-fetch-p2",
        input: { url: "https://example.com/api", maxChars: 40, offset: 40 },
        plan: {
            actionId: "action-fetch-p2",
            workspaceRoot: "/workspace",
            scope: { extraFiles: [], network: "all_outbound" },
        },
    });
    assert.equal(page2Obs.kind, "success");
    if (page2Obs.kind === "success") {
        const out = page2Obs.output as unknown as WebFetchOutput;
        assert.equal(out.text.length, 40);
        assert.equal(out.offset, 40);
        assert.equal(out.nextOffset, 80);
        assert.equal(out.truncated, true);
    }
});

test("web_fetch 响应体超过 2 MiB 硬上限时返回 WEB_RESPONSE_TOO_LARGE 领域失败", async () => {
    const hugeContent = "X".repeat(2 * 1024 * 1024 + 10);
    const tool = new WebFetchTool(async () => hugeContent);

    const obs = await tool.execute({
        actionId: "action-fetch-huge",
        input: { url: "https://example.com/huge" },
        plan: {
            actionId: "action-fetch-huge",
            workspaceRoot: "/workspace",
            scope: { extraFiles: [], network: "all_outbound" },
        },
    });

    assert.equal(obs.kind, "failure");
    if (obs.kind === "failure") {
        assert.equal(obs.code, "WEB_RESPONSE_TOO_LARGE");
        assert.match(obs.message, /2 MiB/);
        assert.equal(obs.retryable, false);
    }
});

test("web_fetch 请求失败时返回 failure observation", async () => {
    const tool = new WebFetchTool(async () => {
        throw new Error("Connection refused");
    });

    const obs = await tool.execute({
        actionId: "action-fetch-3",
        input: { url: "https://example.com/down" },
        plan: {
            actionId: "action-fetch-3",
            workspaceRoot: "/workspace",
            scope: { extraFiles: [], network: "all_outbound" },
        },
    });

    assert.equal(obs.kind, "failure");
    if (obs.kind === "failure") {
        assert.equal(obs.code, "WEB_FETCH_FAILED");
        assert.match(obs.message, /Connection refused/);
        assert.equal(obs.retryable, false);
    }
});

test("web_fetch 向 Runner 传播明确分类的暂时网络故障", async () => {
    const tool = new WebFetchTool(async () => {
        throw new TransientToolExecutionFailure("network_unavailable", 0);
    });

    await assert.rejects(() => tool.execute({
        actionId: "action-fetch-transient",
        input: { url: "https://example.com/down" },
        plan: {
            actionId: "action-fetch-transient",
            workspaceRoot: "/workspace",
            scope: { extraFiles: [], network: "all_outbound" },
        },
    }), TransientToolExecutionFailure);
});

test("web_fetch 工具成功注册进 ToolRegistry 且 JSON Schema 编译通过", () => {
    const tool = new WebFetchTool();
    const schema = compileJsonSchema(tool.definition.inputContract);
    assert.equal(typeof schema === "object" && schema !== null, true);
    const properties = (schema as { properties?: Record<string, unknown> }).properties;
    assert.ok(properties !== undefined && "url" in properties);

    const registration = createToolRegistration(tool);
    const registry = new InMemoryToolRegistry([registration]);
    assert.ok(registry.get(WEB_FETCH_TOOL_ID) !== undefined);

    const prep = registration.prepare({ url: "https://example.com" });
    assert.equal(prep.ok, true);
});
