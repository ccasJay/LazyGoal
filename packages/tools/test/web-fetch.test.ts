import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";


import {
    createToolRegistration,
    InMemoryToolRegistry,
    TransientToolExecutionFailure,
} from "../../tool-core/src/index";
import {
    WEB_FETCH_TOOL_ID,
    WebFetchTool,
    type WebFetchOutput,
    htmlToPlainText,
} from "../src/index";
import {
    WebFetchBlockedUrlError,
    WebFetchHttpError,
    WebFetchNetworkError,
    WebFetchRedirectLimitError,
    WebFetchUnsupportedCharsetError,
    WebFetchUnsupportedContentTypeError,
} from "../src/web/fetch-errors";

function fixture(name: string): string {
    return readFileSync(new URL(`./fixtures/web/${name}`, import.meta.url), "utf8");
}

const validPlan = {
    actionId: "action-fetch-1",
    workspaceRoot: "/workspace",
    scope: { extraFiles: [], network: "all_outbound" as const },
};

test("web_fetch 生成输入绑定校验正常输入与非法结构", () => {
    const binding = new WebFetchTool().definition.inputBinding;
    assert.equal(binding.read({ url: "https://example.com" }, "reject").ok, true);
    assert.equal(binding.read({
        url: "https://example.com",
        maxChars: 1000,
        offset: 50,
    }, "reject").ok, true);
    assert.equal(binding.read({}, "reject").ok, false);
    assert.equal(binding.read({ url: "https://example.com", maxChars: 0 }, "reject").ok, false);
    assert.equal(binding.read({ url: "https://example.com", maxChars: 50_001 }, "reject").ok, false);
    assert.equal(binding.read({ url: "https://example.com", offset: -1 }, "reject").ok, false);
});

test("web_fetch validate 校验 URL 合法性、协议、凭据与本机/私网地址", () => {
    const tool = new WebFetchTool();

    assert.equal(tool.validate({ url: "" }).ok, false);
    assert.equal(tool.validate({ url: "not-a-valid-url" }).ok, false);
    assert.equal(tool.validate({ url: "ftp://example.com/file" }).ok, false);
    assert.equal(tool.validate({ url: "file:///workspace/test.txt" }).ok, false);
    assert.equal(tool.validate({ url: "http://localhost:8080/api" }).ok, false);
    assert.equal(tool.validate({ url: "http://api.localhost/" }).ok, false);
    assert.equal(tool.validate({ url: "http://127.0.0.1" }).ok, false);
    assert.equal(tool.validate({ url: "http://10.0.0.1" }).ok, false);
    assert.equal(tool.validate({ url: "http://172.16.0.1" }).ok, false);
    assert.equal(tool.validate({ url: "http://192.168.0.1" }).ok, false);
    assert.equal(tool.validate({ url: "http://169.254.169.254/latest/meta-data" }).ok, false);
    assert.equal(tool.validate({ url: "http://[::1]/" }).ok, false);
    assert.equal(tool.validate({ url: "http://[::ffff:127.0.0.1]/" }).ok, false);
    assert.equal(tool.validate({ url: "https://user:pass@example.com/" }).ok, false);

    assert.equal(tool.validate({ url: "https://example.com/docs" }).ok, true);
    assert.equal(tool.validate({ url: "http://93.184.216.34/" }).ok, true);
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

test("htmlToPlainText 保留表格、列表、标题与实体并输出单行", () => {
    const text = htmlToPlainText(fixture("content-page.html"));

    assert.doesNotMatch(text, /\n/);
    assert.equal(text, text.trim());
    assert.match(text, /Product Overview/);
    assert.match(text, /Tom & Jerry <tag> "quoted" 'single' spaced\./);
    assert.match(text, /Name Value Alpha 1 Beta 2/);
    assert.match(text, /First item/);
    assert.match(text, /Second/);
    assert.match(text, /Nested inline text/);
    assert.match(text, /Footer note/);
    assert.doesNotMatch(text, /script-secret/);
    assert.doesNotMatch(text, /color: red/);
    assert.doesNotMatch(text, /hidden-image/);
});

test("web_fetch 非 HTML 文本不经过 HTML 抽取", async () => {
    const plainText = "text/plain 内容 & <not-a-tag> \"quoted\"";
    const tool = new WebFetchTool(async () => ({ text: plainText, isHtml: false }));

    const observation = await tool.execute({
        actionId: "action-fetch-plain",
        input: { url: "https://example.com/plain.txt" },
        plan: {
            actionId: "action-fetch-plain",
            workspaceRoot: "/workspace",
            scope: { extraFiles: [], network: "all_outbound" },
        },
    });

    assert.equal(observation.kind, "success");
    if (observation.kind === "success") {
        assert.equal((observation.output as unknown as WebFetchOutput).text, plainText);
    }
});

test("web_fetch HTML 抽取失败时返回 WEB_FETCH_FAILED 且不返回部分正文", async () => {
    // 深度嵌套会耗尽解析器调用栈，同时文本远小于 2 MiB 响应上限。
    const deeplyNested = `${"<div>".repeat(20_000)}hidden${"</div>".repeat(20_000)}`;
    const tool = new WebFetchTool(async () => ({ text: deeplyNested, isHtml: true }));

    const observation = await tool.execute({
        actionId: "action-fetch-extract-failure",
        input: { url: "https://example.com/broken" },
        plan: {
            actionId: "action-fetch-extract-failure",
            workspaceRoot: "/workspace",
            scope: { extraFiles: [], network: "all_outbound" },
        },
    });

    assert.equal(observation.kind, "failure");
    if (observation.kind === "failure") {
        assert.equal(observation.code, "WEB_FETCH_FAILED");
        assert.doesNotMatch(observation.message, /hidden/);
        assert.equal(observation.retryable, false);
    }
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

test("web_fetch 将 blocked、重定向上限、HTTP 与网络失败映射为稳定错误码", async () => {
    const run = (handler: ConstructorParameters<typeof WebFetchTool>[0]) => {
        const tool = new WebFetchTool(handler);
        return tool.execute({
            actionId: "action-fetch-error-map",
            input: { url: "https://example.com/error" },
            plan: {
                actionId: "action-fetch-error-map",
                workspaceRoot: "/workspace",
                scope: { extraFiles: [], network: "all_outbound" },
            },
        });
    };

    const blocked = await run(async () => {
        throw new WebFetchBlockedUrlError("blocked_address");
    });
    assert.equal(blocked.kind, "failure");
    if (blocked.kind === "failure") {
        assert.equal(blocked.code, "WEB_FETCH_BLOCKED_URL");
        assert.doesNotMatch(blocked.message, /\d+\.\d+\.\d+\.\d+/);
        assert.equal(blocked.retryable, false);
    }

    const limited = await run(async () => {
        throw new WebFetchRedirectLimitError();
    });
    assert.equal(limited.kind, "failure");
    if (limited.kind === "failure") {
        assert.equal(limited.code, "WEB_FETCH_REDIRECT_LIMIT");
        assert.equal(limited.retryable, false);
    }

    const notFound = await run(async () => {
        throw new WebFetchHttpError(404);
    });
    assert.equal(notFound.kind, "failure");
    if (notFound.kind === "failure") {
        assert.equal(notFound.code, "WEB_FETCH_HTTP_ERROR");
        assert.match(notFound.message, /HTTP status 404/);
        assert.equal(notFound.retryable, false);
    }

    const unavailable = run(async () => {
        throw new WebFetchHttpError(503, 1500);
    });
    await assert.rejects(
        () => unavailable,
        (error: unknown) => {
            assert.ok(error instanceof TransientToolExecutionFailure);
            assert.equal(error.reason, "http_503");
            assert.equal(error.retryAfterMs, 1500);
            return true;
        },
    );

    const network = await run(async () => {
        throw new WebFetchNetworkError("dns_resolution_failed");
    });
    assert.equal(network.kind, "failure");
    if (network.kind === "failure") {
        assert.equal(network.code, "WEB_FETCH_FAILED");
        assert.match(network.message, /dns_resolution_failed/);
        assert.equal(network.retryable, false);
    }

    const unsupported = await run(async () => {
        throw new WebFetchUnsupportedContentTypeError();
    });
    assert.equal(unsupported.kind, "failure");
    if (unsupported.kind === "failure") {
        assert.equal(unsupported.code, "WEB_FETCH_UNSUPPORTED_CONTENT_TYPE");
        assert.equal(unsupported.retryable, false);
    }

    const unsupportedCharset = await run(async () => {
        throw new WebFetchUnsupportedCharsetError();
    });
    assert.equal(unsupportedCharset.kind, "failure");
    if (unsupportedCharset.kind === "failure") {
        assert.equal(unsupportedCharset.code, "WEB_FETCH_FAILED");
        assert.match(unsupportedCharset.message, /unsupported character set/);
        assert.equal(unsupportedCharset.retryable, false);
    }
});

test("web_fetch 工具成功注册进 ToolRegistry 且 JSON Schema 编译通过", () => {
    const tool = new WebFetchTool();
    const schema = tool.definition.inputBinding.modelProjection().schema;
    assert.equal(typeof schema === "object" && schema !== null, true);
    const properties = (schema as { properties?: Record<string, unknown> }).properties;
    assert.ok(properties !== undefined && "url" in properties);

    const registration = createToolRegistration(tool);
    const registry = new InMemoryToolRegistry([registration]);
    assert.ok(registry.get(WEB_FETCH_TOOL_ID) !== undefined);

    const prep = registration.prepare({ url: "https://example.com" });
    assert.equal(prep.ok, true);
});
