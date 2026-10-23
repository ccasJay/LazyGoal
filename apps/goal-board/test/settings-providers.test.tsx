import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";

(globalThis as any).React = React;

if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    location: { hash: "", host: "localhost", protocol: "http:" },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
}

const activeProfile = {
  id: "profile-active",
  label: "OpenAI 主账号",
  kind: "openai",
  defaultModel: "gpt-4o",
  hasApiKey: true,
  apiKeyMask: "****c123",
};

const spareProfile = {
  id: "profile-spare",
  label: "Google 备用",
  kind: "google",
  defaultModel: "gemini-2.5-pro",
  hasApiKey: false,
  apiKeyMask: "",
};

async function render(settings: any, extra: Record<string, unknown> = {}): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ProviderSettingsSection } = await import("../src/components/SettingsPage");
  return renderToStaticMarkup(
    React.createElement(ProviderSettingsSection, { settings, ...extra }),
  );
}

test("设置页列出凭据状态、激活标记与只读配置来源", async () => {
  const html = await render({
    activeProfileId: "profile-active",
    profiles: [activeProfile, spareProfile],
    fallback: { source: "config", provider: "google", model: "gemini-2.5-pro" },
  });

  assert.match(html, /OpenAI 主账号/);
  assert.match(html, /Credential saved/);
  assert.match(html, /No credential saved/);
  assert.match(html, /From configuration/);
  assert.match(html, /Read-only/);
  assert.match(html, /Google · gemini-2\.5-pro/);

  // 激活档案不可删除；其它档案仍提供删除入口。
  assert.match(html, /More options for/);
  const activeRow = html.slice(html.indexOf("profile-active"), html.indexOf("profile-spare"));
  assert.match(activeRow, /disabled/);
});

test("设置页默认收起表单且不回显明文凭据", async () => {
  const html = await render({ profiles: [activeProfile] });
  assert.equal(html.includes("sk-"), false, "表单与列表不得出现明文凭据前缀");
  assert.equal(html.includes('type="password"'), false, "打开添加或编辑入口前不渲染密钥输入框");
  assert.equal(html.includes('data-testid="settings-provider-form"'), false);
  assert.match(html, /Add provider/);
});

test("设置页呈现连接测试结果与稳定错误码", async () => {
  const html = await render(
    { profiles: [activeProfile, spareProfile] },
    {
      testResults: {
        "profile-active": { ok: true, modelCount: 29 },
        "profile-spare": { ok: false, error: "model_catalog_authentication" },
      },
    },
  );
  assert.match(html, /29 models/);
  assert.match(html, /model_catalog_authentication/);
});

test("设置页以稳定错误码报告读取失败且空集合可渲染", async () => {
  const empty = await render({ profiles: [] });
  assert.match(empty, /Add provider/);

  const failed = await render({ profiles: [] }, { error: "provider_profile_unavailable" });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /provider_profile_unavailable/);
});
