import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { captureScreenshot } from "../src/capture";
import { launchEnvironment } from "../src/view-registry";

const TEST_OUT_DIR = resolve("apps/goal-board/ui-harness/.test-artifacts");

test("deterministic screenshot produces identical SHA-256 hashes across consecutive captures", { timeout: 25_000 }, async () => {
  const env = await launchEnvironment({ view: "board" });
  const shot1 = join(TEST_OUT_DIR, "hash-test-1.png");
  const shot2 = join(TEST_OUT_DIR, "hash-test-2.png");

  try {
    const res1 = await captureScreenshot({
      page: env.page,
      outPath: shot1,
      maskSelectors: env.view.maskSelectors,
    });
    const res2 = await captureScreenshot({
      page: env.page,
      outPath: shot2,
      maskSelectors: env.view.maskSelectors,
    });

    assert.equal(res1.width, 1280);
    assert.equal(res1.height, 900);
    assert.equal(res2.width, 1280);
    assert.equal(res2.height, 900);

    const buf1 = await readFile(shot1);
    const buf2 = await readFile(shot2);
    const hash1 = createHash("sha256").update(buf1).digest("hex");
    const hash2 = createHash("sha256").update(buf2).digest("hex");

    assert.equal(hash1, hash2, "Consecutive deterministic screenshots must have identical binary hashes");
  } finally {
    await env.cleanup();
    await rm(TEST_OUT_DIR, { recursive: true, force: true });
  }
});

test("element screenshot extracts element bounding box dimensions", { timeout: 25_000 }, async () => {
  const env = await launchEnvironment({ view: "board" });
  const cardShot = join(TEST_OUT_DIR, "element-card.png");

  try {
    const res = await captureScreenshot({
      page: env.page,
      selector: ".goal-card",
      outPath: cardShot,
      maskSelectors: env.view.maskSelectors,
    });

    assert.ok(res.width > 150, `Card width must be > 150, got ${res.width}`);
    assert.ok(res.height > 40, `Card height must be > 40, got ${res.height}`);
    assert.ok(existsSync(cardShot));
  } finally {
    await env.cleanup();
    await rm(TEST_OUT_DIR, { recursive: true, force: true });
  }
});

test("negative tests: selector_not_found, selector_not_visible, and no empty files written", { timeout: 25_000 }, async () => {
  const env = await launchEnvironment({ view: "board" });
  const missingShot = join(TEST_OUT_DIR, "missing.png");
  const hiddenShot = join(TEST_OUT_DIR, "hidden.png");

  try {
    // 1. 选择器不存在
    await assert.rejects(
      async () => {
        await captureScreenshot({
          page: env.page,
          selector: ".completely-missing-selector-12345",
          outPath: missingShot,
        });
      },
      /selector_not_found/,
    );
    assert.equal(existsSync(missingShot), false, "Must not write file on selector_not_found");

    // 2. 选择器不可见（注入隐藏元素）
    await env.page.evaluate(() => {
      const el = document.createElement("div");
      el.id = "test-hidden-element";
      el.style.display = "none";
      el.textContent = "hidden text";
      document.body.appendChild(el);
    });

    await assert.rejects(
      async () => {
        await captureScreenshot({
          page: env.page,
          selector: "#test-hidden-element",
          outPath: hiddenShot,
        });
      },
      /selector_not_visible/,
    );
    assert.equal(existsSync(hiddenShot), false, "Must not write file on selector_not_visible");
  } finally {
    await env.cleanup();
    await rm(TEST_OUT_DIR, { recursive: true, force: true });
  }
});
