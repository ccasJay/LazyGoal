import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { checkDocs } from "./check-docs.mjs";

const executable = fileURLToPath(new URL("./check-docs.mjs", import.meta.url));

async function put(root, file, contents) {
    const target = join(root, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
}

async function project() {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-docs-"));
    await put(root, "README.md", "# 项目\n\n[包](packages/sample/README.md)\n");
    await put(root, "AGENTS.md", "# 项目规则\n");
    await put(root, "CLAUDE.md", "# 使用规则\n");
    await put(root, "packages/sample/package.json", '{"name":"sample"}\n');
    await put(root, "packages/sample/README.md", "# 示例包\n\n[说明](notes/overview.md) · [语义](notes/semantics.md)\n");
    await put(root, "packages/sample/src/index.ts", "export const item = 1;\n");
    await put(root, "packages/sample/notes/overview.md", "# 概述\n\n[源码](../src/index.ts)\n");
    await put(root, "packages/sample/notes/semantics.md", "# 语义表\n\n| 概念 | 简明含义 | 归属模块 | 权威说明 |\n| --- | --- | --- | --- |\n| Item | 项目中的示例值 | [示例包](../README.md) | [概述](./overview.md#概述) |\n");
    return root;
}

test("valid package docs pass and the CLI leaves files unchanged", async t => {
    const root = await project();
    t.after(() => rm(root, { recursive: true, force: true }));
    const doc = join(root, "packages/sample/notes/semantics.md");
    const before = await readFile(doc);
    assert.deepEqual((await checkDocs(root)).errors, []);
    const result = spawnSync(process.execPath, [executable, root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 个模块/);
    assert.deepEqual(await readFile(doc), before);
});

test("missing module docs and README navigation produce concrete errors", async t => {
    const root = await project();
    t.after(() => rm(root, { recursive: true, force: true }));
    await rm(join(root, "packages/sample/notes/overview.md"));
    const result = spawnSync(process.execPath, [executable, root], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /packages\/sample\/notes\/overview\.md: 必需的说明文件不存在或为空/);
    await put(root, "packages/sample/notes/overview.md", "# 概述\n");
    await put(root, "packages/sample/README.md", "# 示例包\n");
    const errors = (await checkDocs(root)).errors.join("\n");
    assert.match(errors, /缺少指向 packages\/sample\/notes\/overview\.md 的入口/);
    assert.match(errors, /缺少指向 packages\/sample\/notes\/semantics\.md 的入口/);
});

test("semantic rows require a recognized owner and existing local authority", async t => {
    const root = await project();
    t.after(() => rm(root, { recursive: true, force: true }));
    await put(root, "packages/sample/notes/semantics.md", "| 概念 | 简明含义 | 归属模块 | 权威说明 |\n| --- | --- | --- | --- |\n| Item | 示例 | [未知](../../absent/README.md) | [失效](./overview.md#不存在) |\n");
    const errors = (await checkDocs(root)).errors.join("\n");
    assert.match(errors, /归属模块不是已发现的 README/);
    assert.match(errors, /链接目标不存在/);
    assert.match(errors, /锚点不存在/);
});

test("empty semantic tables and module-root notes fail their documented boundaries", async t => {
    const root = await project();
    t.after(() => rm(root, { recursive: true, force: true }));
    await put(root, "packages/sample/notes/semantics.md", "| 概念 | 简明含义 | 归属模块 | 权威说明 |\n| --- | --- | --- | --- |\n");
    await put(root, "packages/sample/HOWTO.md", "# 旧的模块说明\n");
    const errors = (await checkDocs(root)).errors.join("\n");
    assert.match(errors, /语义表需要四列表头与至少一条概念/);
    assert.match(errors, /packages\/sample\/HOWTO\.md: 模块说明必须位于 notes\//);
});

test("duplicate heading anchors and reference links follow Markdown while examples stay inert", async t => {
    const root = await project();
    t.after(() => rm(root, { recursive: true, force: true }));
    await put(root, "packages/sample/notes/overview.md", "# 概述\n\n## 重复\n## 重复\n\n[第二个标题][second]\n\n[second]: #重复-1\n\n`[示例](missing.md)`\n\n```md\n[代码块](missing.md)\n```\n");
    assert.deepEqual((await checkDocs(root)).errors, []);
    await put(root, "packages/sample/notes/overview.md", "# 概述\n\n[不存在][ref]\n\n[ref]: #错误锚点\n");
    assert.match((await checkDocs(root)).errors.join("\n"), /锚点不存在/);
});

test("historical Specs, Memory and unrelated fixtures are not scanned", async t => {
    const root = await project();
    t.after(() => rm(root, { recursive: true, force: true }));
    await put(root, "specs/historical/tasks.md", "[旧架构](../../docs/architecture/runtime.md)\n");
    await put(root, "project-memory/features/historical.md", "[丢失](../../absent.md)\n");
    await put(root, "scripts/fixtures/example.md", "[不存在](missing.md)\n");
    assert.deepEqual((await checkDocs(root)).errors, []);
    await put(root, "AGENTS.md", "当前权威目录 docs/architecture/\n");
    assert.match((await checkDocs(root)).errors.join("\n"), /当前说明仍引用旧架构文档目录/);
});
