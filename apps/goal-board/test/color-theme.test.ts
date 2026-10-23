import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { amber, green, mint, ruby, sage, violet } from "@radix-ui/colors";

const palette = new Map(Object.entries({ ...amber, ...green, ...mint, ...ruby, ...sage, ...violet })
  .map(([name, value]) => [`--${name.replace(/(\d+)$/, "-$1")}`, value]));
const style = await readFile(new URL("../src/style.css", import.meta.url), "utf8");
const aliases = new Map([...style.matchAll(/(--[\w-]+):\s*var\((--[\w-]+)\);/g)]
  .map(match => [match[1]!, match[2]!]));

function color(token: string): string {
  return palette.get(token) ?? color(aliases.get(token)!);
}

function luminance(hex: string): number {
  const [r, g, b] = hex.slice(1).match(/../g)!.map(part => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(color(foreground)), luminance(color(background))];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

test("界面文字在背景、交互状态和状态底色上达到 WCAG AA 对比度", () => {
  const pairs: [string, string[]][] = [
    ["--text", ["--panel", "--surface", "--surface-raised", "--surface-hover", "--surface-active", "--accent-selected"]],
    ["--muted", ["--panel", "--surface", "--surface-raised", "--surface-hover", "--accent-selected"]],
    ["--accent-ink", ["--panel", "--surface", "--surface-raised", "--accent-soft"]],
    ["--accent-contrast", ["--accent", "--accent-hover", "--accent-selected"]],
    ["--success", ["--panel", "--surface", "--success-soft"]],
    ["--warning", ["--panel", "--surface", "--warning-soft"]],
    ["--danger", ["--panel", "--surface", "--danger-soft"]],
    ["--event-model", ["--panel", "--event-model-soft"]],
    ["--solid-contrast", ["--danger-solid", "--danger-hover"]],
  ];
  for (const [foreground, backgrounds] of pairs) {
    for (const background of backgrounds) {
      const ratio = contrast(foreground, background);
      assert.ok(ratio >= 4.5, `${foreground} on ${background}: ${ratio.toFixed(2)} < 4.5`);
    }
  }
});

test("输入边框与聚焦环在相邻表面上保持可辨识", () => {
  for (const background of ["--panel", "--surface", "--surface-raised", "--accent-selected"]) {
    assert.ok(contrast("--focus-ring", background) >= 3, `focus on ${background}`);
  }
  for (const background of ["--panel", "--surface", "--surface-raised"]) {
    assert.ok(contrast("--control-border", background) >= 3, `border on ${background}`);
  }
  assert.ok(contrast("--control-border-hover", "--surface-hover") >= 3);
});
