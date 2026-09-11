import assert from "node:assert/strict";
import { test } from "node:test";

import { safeParse, compileJsonSchema } from "../../contracts/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
} from "../../runtime/src/index";
import {
    WEB_FETCH_INPUT_CONTRACT,
    WEB_FETCH_TOOL_ID,
    WebFetchTool,
    htmlToPlainText,
} from "../src/index";

test("web_fetch contract 校验正常输入与非法结构", () => {
    const valid = safeParse(WEB_FETCH_INPUT_CONTRACT, { url: "https://example.com" });
    assert.equal(valid.success, true);

    const withMaxChars = safeParse(WEB_FETCH_INPUT_CONTRACT, {
        url: "https://example.com",
        maxChars: 1000,
    });
    assert.equal(withMaxChars.success, true);

    const missingUrl = safeParse(WEB_FETCH_INPUT_CONTRACT, {});
    assert.equal(missingUrl.success, false);

    const negativeChars = safeParse(WEB_FETCH_INPUT_CONTRACT, {
        url: "https://example.com",
        maxChars: 0,
    });
    assert.equal(negativeChars.success, false);

    const overChars = safeParse(WEB_FETCH_INPUT_CONTRACT, {
        url: "https://example.com",
        maxChars: 600_000,
    });
    assert.equal(overChars.success, false);
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

test("web_fetch 返回有界纯文本且超过 maxChars 时截断", async () => {
    const fullText = "A".repeat(100);
    const tool = new WebFetchTool(async () => fullText);

    // 不截断场景
    const normalObs = await tool.execute({
        actionId: "action-fetch-1",
        input: { url: "https://example.com/api", maxChars: 150 },
    });
    assert.equal(normalObs.kind, "success");
    if (normalObs.kind === "success") {
        assert.equal(normalObs.output, fullText);
        assert.doesNotMatch(normalObs.summary, /已截断/);
    }

    // 截断场景
    const truncatedObs = await tool.execute({
        actionId: "action-fetch-2",
        input: { url: "https://example.com/api", maxChars: 40 },
    });
    assert.equal(truncatedObs.kind, "success");
    if (truncatedObs.kind === "success") {
        assert.equal(typeof truncatedObs.output, "string");
        assert.equal((truncatedObs.output as string).length, 40);
        assert.match(truncatedObs.summary, /已截断/);
    }
});

test("web_fetch 请求失败时返回 failure observation", async () => {
    const tool = new WebFetchTool(async () => {
        throw new Error("Connection refused");
    });

    const obs = await tool.execute({
        actionId: "action-fetch-3",
        input: { url: "https://example.com/down" },
    });

    assert.equal(obs.kind, "failure");
    if (obs.kind === "failure") {
        assert.equal(obs.code, "WEB_FETCH_FAILED");
        assert.match(obs.message, /Connection refused/);
        assert.equal(obs.retryable, true);
    }
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
