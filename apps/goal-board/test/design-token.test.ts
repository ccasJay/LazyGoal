import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

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

test("trajectory stylesheet keeps every selector defined exactly once per scope", () => {
  const trajectory = readFileSync(join(import.meta.dirname, "..", "src", "trajectory.css"), "utf8");
  // 与合并器同款扫描：跟踪 at-rule 作用域，每个作用域内同一选择器不得定义两次。
  const counts = new Map<string, number>();
  const record = (scope: string, selector: string) => {
    if (selector.length === 0) return;
    const key = `${scope} :: ${selector}`;
    assert.ok(!counts.has(key), `${key} defined multiple times`);
    counts.set(key, 1);
  };
  let headStart = 0;
  let scope = "top";
  for (let i = 0; i < trajectory.length; i++) {
    if (trajectory.startsWith("/*", i)) {
      const close = trajectory.indexOf("*/", i + 2);
      i = close === -1 ? trajectory.length : close + 2;
      headStart = i;
      continue;
    }
    if (trajectory[i] === "{") {
      const selector = trajectory.slice(headStart, i).replace(/\s+/g, " ").trim();
      // 找到匹配的 '}' —— 声明体内不含花括号（无嵌套规则与块状值）。
      let depth = 0;
      let j = i;
      for (; j < trajectory.length; j++) {
        if (trajectory[j] === "{") depth++;
        else if (trajectory[j] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      if (scope !== "top") record(scope, selector);
      else if (selector.startsWith("@")) {
        // at-rule：进入其作用域，内部规则不计入顶层
        const body = trajectory.slice(i + 1, j);
        for (const innerMatch of body.matchAll(/(^|[\s;}])((?:[^{};]){1,120})\{/g)) {
          const scopeName = scope + " :: " + selector;
          record(scopeName, innerMatch[2].replace(/\s+/g, " ").trim());
        }
      } else {
        record(scope, selector);
      }
      i = j;
      headStart = j + 1;
    }
  }
  assert.ok(counts.size > 50, `expected to scan many selectors, got ${counts.size}`);
});
