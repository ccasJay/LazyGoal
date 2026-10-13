import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("favicon.ico exists and has valid ICO header", () => {
  const faviconPath = path.resolve(import.meta.dirname, "../public/favicon.ico");
  assert.equal(fs.existsSync(faviconPath), true, "public/favicon.ico must exist");

  const buffer = fs.readFileSync(faviconPath);
  assert.ok(buffer.length > 22, "ICO file must be larger than header size");

  // Reserved 0x0000, type 0x0001 (ICO), count >= 1
  assert.equal(buffer.readUInt16LE(0), 0);
  assert.equal(buffer.readUInt16LE(2), 1);
  assert.ok(buffer.readUInt16LE(4) >= 1);
});

test("index.html references favicon.ico", () => {
  const htmlPath = path.resolve(import.meta.dirname, "../index.html");
  const html = fs.readFileSync(htmlPath, "utf-8");
  assert.ok(html.includes('href="/favicon.ico"'), "index.html must reference /favicon.ico");
});

test("style.css contains fixed activity-filter, jump and command-notice styles", () => {
  const cssPath = path.resolve(import.meta.dirname, "../src/style.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  // 1. activity-filter solid background & border
  assert.ok(css.includes(".activity-filter"));
  assert.ok(css.includes("border-bottom: 1px solid rgba(255, 255, 255, 0.08)"));
  assert.ok(css.includes("background: var(--panel)"));

  // 2. jump button positioned at bottom-right
  assert.ok(css.includes(".jump"));
  assert.ok(css.includes("bottom: 24px"));
  assert.ok(css.includes("right: 24px"));
  assert.ok(css.includes("transform: none"));

  // 3. command-notice notification style
  assert.ok(css.includes(".command-notice"));
});
