import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
    createToolGrantMatcher,
    toolGrantMatchersEqual,
} from "../src/index";

test("修订目标路径后派生的匹配器不匹配旧授权，同一路径的不同正文仍属同一授权", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "perm-matcher-"));
    try {
        const original = await createToolGrantMatcher(
            "write_file",
            { path: "a.txt", content: "original" },
            tempDir,
        );
        const revised = await createToolGrantMatcher(
            "write_file",
            { path: "b.txt", content: "revised" },
            tempDir,
        );

        assert.equal(original.kind, "target_path");
        assert.equal(revised.kind, "target_path");
        assert.notEqual(
            original.kind === "target_path" ? original.path : "",
            revised.kind === "target_path" ? revised.path : "",
        );
        assert.equal(toolGrantMatchersEqual(original, revised), false);

        const sameTargetOtherBody = await createToolGrantMatcher(
            "write_file",
            { path: "a.txt", content: "different body" },
            tempDir,
        );
        assert.equal(toolGrantMatchersEqual(original, sameTargetOtherBody), true);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});
