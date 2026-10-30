import assert from "node:assert/strict";
import { test } from "node:test";

test("browser provider settings wire boundary reads the bare projection and surfaces server errors", async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hash: "#test-access" } } });
  try {
    const { BrowserApiError, browserApi } = await import("../src/api");

    // 读取接口成功时直接返回设置投影本身，不带 ok/settings 信封。
    t.mock.method(globalThis, "fetch", async () => Response.json({
      profiles: [],
      fallback: { source: "config", provider: "google", model: "gemini-3.5-flash-lite" },
    }));
    const settings = await browserApi.listProviders();
    assert.deepEqual(settings.profiles, []);
    assert.equal(settings.fallback?.provider, "google");

    // 含明文凭据的响应必须被拒绝，不得当作成功结果渲染。
    t.mock.method(globalThis, "fetch", async () => Response.json({
      profiles: [{
        id: "profile-1",
        label: "主账号",
        kind: "openai",
        defaultModel: "gpt-4o",
        hasApiKey: true,
        apiKeyMask: "****c123",
        apiKey: "sk-raw",
      }],
    }));
    await assert.rejects(() => browserApi.listProviders(), /invalid_api_response/);

    // 失败由非 2xx 状态与 error 码表达，服务端错误码必须原样透出。
    t.mock.method(globalThis, "fetch", async () => Response.json({ error: "provider_profile_unavailable" }, { status: 503 }));
    await assert.rejects(
      () => browserApi.listProviders(),
      (error: unknown) => error instanceof BrowserApiError && error.code === "provider_profile_unavailable",
    );
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("online provider models return extracted fields and emit a value-free bounded diagnostic", async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hash: "#test-access" } } });
  try {
    const { browserApi } = await import("../src/api");
    const responseBody = {
      ok: true,
      models: [{ id: "m-1", name: "Model", debug: "private-model-detail" }],
      trace: "private-response-detail",
    };
    const diagnostics: unknown[][] = [];
    let requestInit: RequestInit | undefined;
    t.mock.method(console, "debug", (...args: unknown[]) => diagnostics.push(args));
    t.mock.method(globalThis, "fetch", async (input, init) => {
      assert.equal(input, "/api/providers/models");
      requestInit = init;
      return Response.json(responseBody);
    });

    const result = await browserApi.fetchProviderModels({ kind: "openai" });

    assert.deepEqual(result, { ok: true, models: [{ id: "m-1", name: "Model" }] });
    assert.equal(requestInit?.method, "POST");
    assert.equal(new Headers(requestInit?.headers).get("authorization"), "Bearer test-access");
    assert.equal(new Headers(requestInit?.headers).get("accept"), "application/json");
    assert.deepEqual(JSON.parse(String(requestInit?.body)), { kind: "openai" });
    assert.equal(diagnostics.length, 1);
    assert.deepEqual(diagnostics[0]?.[1], {
      contractId: "web.providers.models.success",
      version: 1,
      paths: ["/trace", "/models/0/debug"],
      truncated: false,
    });
    assert.equal(JSON.stringify(diagnostics).includes("private-model-detail"), false);
    assert.equal(JSON.stringify(diagnostics).includes("private-response-detail"), false);
    assert.deepEqual(responseBody.models[0], {
      id: "m-1",
      name: "Model",
      debug: "private-model-detail",
    });
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("online provider models preserve invalid-response and HTTP error handling", async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hash: "#test-access" } } });
  try {
    const { BrowserApiError, browserApi } = await import("../src/api");
    let response = Response.json({ ok: true, models: [{ id: 42, name: "invalid" }] });
    t.mock.method(globalThis, "fetch", async () => response);

    await assert.rejects(() => browserApi.fetchProviderModels({ kind: "openai" }), /invalid_api_response/);

    response = Response.json({ error: "provider_profile_unavailable" }, { status: 503 });
    await assert.rejects(
      () => browserApi.fetchProviderModels({ kind: "openai" }),
      (error: unknown) => error instanceof BrowserApiError
        && error.code === "provider_profile_unavailable"
        && error.status === 503,
    );
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("online provider model diagnostic sink failures do not fail a valid request", async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hash: "#test-access" } } });
  try {
    const { browserApi } = await import("../src/api");
    t.mock.method(console, "debug", () => {
      throw new Error("diagnostic sink failed");
    });
    t.mock.method(globalThis, "fetch", async () => Response.json({
      ok: true,
      models: [],
      debug: true,
    }));

    assert.deepEqual(
      await browserApi.fetchProviderModels({ kind: "openai" }),
      { ok: true, models: [] },
    );
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("online provider model cancellation propagates to fetch", async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hash: "#test-access" } } });
  try {
    const { browserApi } = await import("../src/api");
    const controller = new AbortController();
    controller.abort();
    let requestSignal: AbortSignal | null | undefined;
    t.mock.method(globalThis, "fetch", async (_input, init) => {
      requestSignal = init?.signal;
      throw init?.signal?.reason;
    });

    await assert.rejects(
      () => browserApi.fetchProviderModels({ kind: "openai" }, controller.signal),
      (error: unknown) => error instanceof DOMException && error.name === "AbortError",
    );
    assert.equal(requestSignal, controller.signal);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
