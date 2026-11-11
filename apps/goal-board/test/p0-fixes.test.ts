import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("index.html references the bundled SVG favicon", () => {
  const htmlPath = path.resolve(import.meta.dirname, "../index.html");
  const html = fs.readFileSync(htmlPath, "utf-8");
  const icon = html.match(/<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="([^"]+)"/);
  assert.ok(icon, "index.html must reference an SVG favicon");
  const faviconPath = icon[1].split("?")[0];
  const favicon = fs.readFileSync(path.resolve(import.meta.dirname, `..${faviconPath}`), "utf-8");
  assert.match(favicon, /<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(favicon, /viewBox="0 0 100 100"/);
});

test("style.css contains fixed jump and command-notice styles", () => {
  const cssPath = path.resolve(import.meta.dirname, "../src/style.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  // 1. sticky chrome keeps a hairline border token
  assert.ok(css.includes("--border-width: 0.5px"));
  assert.ok(css.includes("border-bottom: var(--border-width) solid var(--line)"));
  assert.ok(css.includes("background: var(--panel)"));

  // 2. jump button positioned at bottom-right
  assert.ok(css.includes(".jump"));
  assert.ok(css.includes("bottom: 24px"));
  assert.ok(css.includes("right: 24px"));
  assert.ok(css.includes("transform: none"));

  // 3. command-notice notification style
  assert.ok(css.includes(".command-notice"));
});
