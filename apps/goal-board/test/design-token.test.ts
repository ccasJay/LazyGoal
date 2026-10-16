import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { join } from "node:path";

const root = new URL(import.meta.dirname, `file://${process.cwd()}/`);

async function readSource(...segments: string[]): Promise<string> {
  return readFile(join(import.meta.dirname, ...segments), "utf8");
}

test("design tokens define the three font size tiers", async () => {
  const style = await readSource("..", "src", "style.css");
  assert.match(style, /--font-size-xs: 11px;/);
  assert.match(style, /--font-size-sm: 12px;/);
  assert.match(style, /--font-size-base: 14px;/);
});

test("9px font sizes are eliminated from both stylesheets", async () => {
  const style = await readSource("..", "src", "style.css");
  const trajectory = await readSource("..", "src", "trajectory.css");
  for (const [name, source] of [["style.css", style], ["trajectory.css", trajectory]] as const) {
    assert.doesNotMatch(
      source,
      /font-size:\s*9px/,
      `${name} must not contain 9px font sizes`,
    );
  }
});

test("high-frequency controls extend their hit area to at least 36px", async () => {
  const style = await readSource("..", "src", "style.css");
  // 顶栏图标按钮通过负 inset 伪元素扩展热区，不放大可见图标、不改变布局。
  assert.match(style, /\.icon::after\s*\{[^}]*inset:\s*-4px/);
  // 卡片菜单按钮位于 overflow:hidden 容器内，伪元素扩展会被裁剪，直接扩大盒子。
  assert.match(style, /\.goal-card-options\s*\{[^}]*width: 36px;/);
  assert.match(style, /\.goal-card-menu\s*\{[^}]*width: 36px;/);
  const trajectory = await readSource("..", "src", "trajectory.css");
  // 分页箭头同处 overflow hidden 容器，直接扩大尺寸。
  assert.match(trajectory, /\.tr-page-arrow\{[^}]*width:36px/);
});
