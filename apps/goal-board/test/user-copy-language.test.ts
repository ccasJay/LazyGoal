import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const srcRoot = join(import.meta.dirname, "..", "src");

async function listSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listSources(path) : (/\.(tsx|ts)$/.test(entry.name) ? [path] : []);
  }));
  return files.flat();
}

/**
 * 剥离注释后检测字符串字面量中的 CJK 用户文案。
 *
 * @remarks
 * 仓库允许中文 TSDoc 注释；本检查只拦截会到达用户眼前的文案，
 * 因此先剥离块注释与行注释（保留协议前缀 `://`），再扫描其余内容。
 */
function stripComments(source: string): string {
  const placeholder = "\u0000SLASHSLASH\u0000";
  const guarded = source.replaceAll("://", placeholder);
  const withoutBlocks = guarded.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLines = withoutBlocks.split("\n").map((line) => line.replace(/^\s*\/\/.*$/, "").replace(/(?<!:)\/\/.*$/, "")).join("\n");
  return withoutLines.replaceAll(placeholder, "://");
}

test("user-facing copy in goal-board src contains no CJK text", async () => {
  const files = await listSources(srcRoot);
  assert.ok(files.length > 10, "expected to scan the whole src tree");
  const offenders: string[] = [];
  for (const file of files) {
    const content = stripComments(await readFile(file, "utf8"));
    if (/[\u4e00-\u9fff]/.test(content)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
