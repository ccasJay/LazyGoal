import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
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
