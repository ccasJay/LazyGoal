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
