import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
    checkProject,
    inspectProject,
    parseCapsule,
    renderIndex,
    writeIndex,
} from "./project-memory.mjs";

async function fixtureProject() {
    const root = await mkdtemp(path.join(os.tmpdir(), "lazygoal-memory-"));
    await mkdir(path.join(root, "project-memory", "features"), { recursive: true });
    await mkdir(path.join(root, "specs", "sample"), { recursive: true });
    await mkdir(path.join(root, "docs", "architecture"), { recursive: true });
    await mkdir(path.join(root, "packages", "sample", "src"), { recursive: true });
    await writeFile(path.join(root, "specs", "sample", "requirements.md"), '<a id="req-1-1"></a>\n');
    await writeFile(path.join(root, "specs", "sample", "design.md"), "# Design\n");
    await writeFile(path.join(root, "specs", "sample", "tasks.md"), "- [x] //TODO 1 done\n");
    await writeFile(path.join(root, "docs", "architecture", "sample.md"), "# Sample\n");
    await writeFile(path.join(root, "packages", "sample", "src", "index.ts"), "export {};\n");
    return root;
}

function capsule(overrides = {}) {
    const fields = {
        feature: "sample",
        status: "active",
        summary: '"Sample decision boundary"',
        source_spec: "specs/sample/",
        distilled_at: "2026-08-16",
        reviewed_at: "2026-08-18",
        tags: "[sample, boundary]",
        authorities: "[docs/architecture/sample.md]",
        ...overrides,
    };
    const frontmatter = Object.entries(fields)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
    return `---\n${frontmatter}\n---\n\n# Sample\n\n## Purpose\n\n- Preserve the sample boundary. [S1, S2]\n\n## Durable Decisions\n\n- D1 — Keep one owner because duplicate state drifts. [S2, S3]\n\n## Guardrails\n\n- Do not copy current implementation details. [S1, S3]\n\n## Revisit When\n\n- The ownership boundary changes.\n\n## Sources\n\n- S1: \`specs/sample/requirements.md#req-1-1\`\n- S2: \`specs/sample/design.md\`\n- S3: \`packages/sample/src/index.ts\`\n`;
}

async function writeValidCapsule(root, text = capsule()) {
    await writeFile(path.join(root, "project-memory", "features", "sample.md"), text);
}

test("generates and verifies a deterministic index", async () => {
    const root = await fixtureProject();
    await writeValidCapsule(root);
    const inspection = await writeIndex(root);
    assert.equal(inspection.capsules.length, 1);
    assert.match(inspection.index, /\[project-memory\/features\/sample\.md\]/);
    assert.match(inspection.index, /\| 2026-08-18 \|/);
    await checkProject(root);
    assert.equal(await readFile(path.join(root, "project-memory", "index.md"), "utf8"), inspection.index);
});

test("rejects missing required metadata", () => {
    assert.throws(
        () => parseCapsule(capsule({ reviewed_at: undefined }), "sample.md"),
        /reviewed_at/,
    );
});

test("rejects an illegal status", async () => {
    const root = await fixtureProject();
    await writeValidCapsule(root, capsule({ status: "draft" }));
    await assert.rejects(() => inspectProject(root), /\u975e\u6cd5 status draft/);
});

test("rejects non-reciprocal supersession", async () => {
    const root = await fixtureProject();
    await writeValidCapsule(root, capsule({ supersedes: "[project-memory/features/old.md]" }));
    await assert.rejects(() => inspectProject(root), /\u76ee\u6807\u4e0d\u5b58\u5728/);
});

test("rejects missing source files", async () => {
    const root = await fixtureProject();
    await writeValidCapsule(root, capsule().replace("packages/sample/src/index.ts", "packages/sample/src/missing.ts"));
    await assert.rejects(() => inspectProject(root), /\u6765\u6e90 S3 \u4e0d\u5b58\u5728/);
});

test("rejects an invalid section order", async () => {
    const root = await fixtureProject();
    const text = capsule().replace("## Guardrails", "## Revisit Later");
    await writeValidCapsule(root, text);
    await assert.rejects(() => inspectProject(root), /\u4e8c\u7ea7\u7ae0\u8282/);
});

test("rejects duplicate durable decision records", async () => {
    const root = await fixtureProject();
    const text = capsule().replace(
        "- D1 — Keep one owner because duplicate state drifts. [S2, S3]",
        "- D1 — Keep one owner because duplicate state drifts. [S2, S3]\n- D1 — Keep the same identifier. [S1]",
    );
    await writeValidCapsule(root, text);
    await assert.rejects(() => inspectProject(root), /Durable Decision ID/);
});

test("detects index drift", async () => {
    const root = await fixtureProject();
    await writeValidCapsule(root);
    await writeFile(path.join(root, "project-memory", "index.md"), "# stale\n");
    await assert.rejects(() => checkProject(root), /memory:index/);
});

test("reports completed Specs without writing Capsules", async () => {
    const root = await fixtureProject();
    await writeValidCapsule(root);
    await mkdir(path.join(root, "specs", "later"));
    for (const name of ["requirements.md", "design.md"]) {
        await writeFile(path.join(root, "specs", "later", name), `# ${name}\n`);
    }
    await writeFile(path.join(root, "specs", "later", "tasks.md"), "- [X] //TODO 1 done\n");
    const inspection = await inspectProject(root);
    assert.deepEqual(inspection.warnings, [
        "specs/later/ 的 checkbox 已全部完成但尚无 Capsule；需要单独证据核验和明确 distillation 授权",
    ]);
    assert.equal(renderIndex(inspection.capsules), inspection.index);
});

test("accepts archived and retired source_spec prefixes and renders index", async () => {
    for (const prefix of ["specs/archived/", "specs/retired/"]) {
        const root = await fixtureProject();
        // 模拟真实物理迁移：将 specs/sample 移动至归档/退役路径，原路径不再存在
        const specDir = path.join(root, prefix, "sample");
        await mkdir(specDir, { recursive: true });
        await writeFile(path.join(specDir, "spec.md"), "# Spec\n");
        await writeFile(path.join(specDir, "design.md"), "# Design\n");
        await rm(path.join(root, "specs", "sample"), { recursive: true, force: true });

        const capsuleText = capsule({
            source_spec: `${prefix}sample/`,
        }).replace(
            "- S1: `specs/sample/requirements.md#req-1-1`",
            `- S1: \`${prefix}sample/spec.md\``,
        ).replace(
            "- S2: `specs/sample/design.md`",
            `- S2: \`${prefix}sample/design.md\``,
        );
        await writeValidCapsule(root, capsuleText);
        const inspection = await inspectProject(root);
        assert.equal(inspection.capsules.length, 1);
        assert.match(inspection.index, new RegExp(`\\[${prefix}sample/\\]\\(\\.\\./${prefix}sample/\\)`));
    }
});

test("rejects invalid source_spec prefixes or format", async () => {
    const root = await fixtureProject();
    await writeValidCapsule(root, capsule({ source_spec: "specs/sample" }));
    await assert.rejects(() => inspectProject(root), /source_spec 必须与 feature 一致并以 \/ 结尾/);

    const root2 = await fixtureProject();
    await writeValidCapsule(root2, capsule({ source_spec: "specs/invalid/sample/" }));
    await assert.rejects(() => inspectProject(root2), /source_spec 必须与 feature 一致并以 \/ 结尾/);

    const root3 = await fixtureProject();
    await writeValidCapsule(root3, capsule({ source_spec: "specs/archived/other/" }));
    await assert.rejects(() => inspectProject(root3), /source_spec 必须与 feature 一致并以 \/ 结尾/);
});

test("rejects capsule when source_spec lacks spec.md, requirements.md, or plan.md", async () => {
    const root = await fixtureProject();
    // 移除 specs/sample 目录下的规范文档，仅保留非规范文件
    await rm(path.join(root, "specs", "sample", "requirements.md"));
    const capsuleText = capsule().replace(
        "- S1: `specs/sample/requirements.md#req-1-1`",
        "- S1: `specs/sample/design.md`",
    );
    await writeValidCapsule(root, capsuleText);
    await assert.rejects(
        () => inspectProject(root),
        /source_spec 缺少 spec.md、requirements.md 或 plan.md/,
    );
});

test("scans completed Fast Plan specs in coverageWarnings", async () => {
    const root = await fixtureProject();
    await writeValidCapsule(root);
    await mkdir(path.join(root, "specs", "fast-done"));
    await writeFile(path.join(root, "specs", "fast-done", "plan.md"), "- [x] //TODO 1 done\n- [X] //TODO 2 done\n");

    await mkdir(path.join(root, "specs", "fast-pending"));
    await writeFile(path.join(root, "specs", "fast-pending", "plan.md"), "- [x] //TODO 1 done\n- [ ] //TODO 2 pending\n");

    const inspection = await inspectProject(root);
    assert.deepEqual(inspection.warnings, [
        "specs/fast-done/ 的 checkbox 已全部完成但尚无 Capsule；需要单独证据核验和明确 distillation 授权",
    ]);
});

test("excludes archived and retired directories from coverageWarnings", async () => {
    const root = await fixtureProject();
    await writeValidCapsule(root);
    // 根级与深层归档/退役子目录都不应触发未沉淀覆盖率告警
    await mkdir(path.join(root, "specs", "archived", "nested-delivered"), { recursive: true });
    await writeFile(path.join(root, "specs", "archived", "plan.md"), "- [x] //TODO 1 done\n");
    await writeFile(path.join(root, "specs", "archived", "nested-delivered", "plan.md"), "- [x] //TODO 1 done\n");

    await mkdir(path.join(root, "specs", "retired", "nested-obsolete"), { recursive: true });
    await writeFile(path.join(root, "specs", "retired", "plan.md"), "- [x] //TODO 1 done\n");
    await writeFile(path.join(root, "specs", "retired", "nested-obsolete", "plan.md"), "- [x] //TODO 1 done\n");

    const inspection = await inspectProject(root);
    assert.deepEqual(inspection.warnings, []);
});

test("accepts capsule with only plan.md in source_spec", async () => {
    const root = await fixtureProject();
    await mkdir(path.join(root, "specs", "sample-fast"));
    await writeFile(path.join(root, "specs", "sample-fast", "plan.md"), "- [x] //TODO 1 done\n");
    const capsuleText = capsule({
        feature: "sample-fast",
        source_spec: "specs/sample-fast/",
    }).replace(
        "- S1: `specs/sample/requirements.md#req-1-1`",
        "- S1: `specs/sample-fast/plan.md`",
    ).replace(
        "- S2: `specs/sample/design.md`",
        "- S2: `specs/sample-fast/plan.md`",
    );
    await writeFile(path.join(root, "project-memory", "features", "sample-fast.md"), capsuleText);
    const inspection = await inspectProject(root);
    assert.equal(inspection.capsules.some((c) => c.fields.feature === "sample-fast"), true);
});


