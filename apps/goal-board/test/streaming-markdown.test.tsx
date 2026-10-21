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

async function render(content: string): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { AssistantMarkdown } = await import("../src/components/AssistantMarkdown");
  return renderToStaticMarkup(React.createElement(AssistantMarkdown, { content }));
}

test("GFM 表格与列表保留语义，表格在自身区域横向滚动", async () => {
  const html = await render("| 名称 | 值 |\n| --- | --- |\n| a | 1 |\n\n- 第一项\n- 第二项");

  assert.match(html, /<table>/);
  assert.match(html, /markdown-table-scroll/);
  assert.match(html, /<li>第一项<\/li>/);
  assert.match(html, /<th>名称<\/th>/);
});

test("代码围栏保持代码语义，不改写源文本", async () => {
  const html = await render("```ts\nconst value = 1 < 2;\n```");

  assert.match(html, /<code/);
  assert.match(html, /const value = 1 &lt; 2;/);
});

test("未闭合格式与转义按原样呈现，不补改源文本", async () => {
  const unclosed = await render("```ts\nconst value = 1;");
  assert.match(unclosed, /const value = 1;/);

  const escaped = await render("5 \\* 6 与 emoji 😀 保持");
  assert.match(escaped, /5 \* 6/);
  assert.match(escaped, /😀/);
});

test("原始 HTML 与脚本不执行，也不进入 DOM", async () => {
  const html = await render("正文开始\n\n<script>window.__executed = true;</script>\n\n<div onclick=\"boom()\">注入</div>\n\n正文结束");

  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("__executed"), false, "脚本内容整体被丢弃，不进入公开界面");
  assert.equal(html.includes("<div"), false, "原始 HTML 标签不被渲染");
  assert.equal(html.includes("注入"), false, "原始 HTML 块的内容也不进入公开界面");
  assert.match(html, /正文开始/);
  assert.match(html, /正文结束/);
});

test("模型提供的图片与嵌入降级为链接，不产生自动网络请求", async () => {
  const html = await render("![说明](https://example.invalid/tracker.png)\n\n<iframe src=\"https://example.invalid/embed\"></iframe>");

  assert.equal(html.includes("<img"), false);
  assert.equal(html.includes("<iframe"), false);
  assert.match(html, /https:\/\/example\.invalid\/tracker\.png/);
});

test("外链在新窗口打开并带安全关系", async () => {
  const html = await render("[外部链接](https://example.invalid/path)");

  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test("半截链接与未闭合围栏可以暂时重排，但不丢失已到达的正文", async () => {
  const html = await render("正文开始 [未完成链接](https://example.invalid/");

  assert.match(html, /正文开始/);
  assert.match(html, /example\.invalid/);
});
