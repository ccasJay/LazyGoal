import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    GAIA_PROFILE_TOOL_IDS,
    GAIA_STRUCTURED_OUTPUT_MODE,
    GAIA_WORKER_PROFILE,
    GaiaProfileValidationError,
    loadGaiaWorkerProfile,
    materializeGaiaWorkerProfile,
    toGaiaWorkerProfileDocument,
    validateGaiaWorkerProfileDocument,
} from "../src/index";

test("GAIA Profile 物化文件与 Worker 内置 Profile 完全一致", async () => {
    const root = await mkdtemp(join(tmpdir(), "gaia-profile-test-"));
    try {
        const outputPath = await materializeGaiaWorkerProfile(join(root, "nested", "profile.json"));
        const raw = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
        assert.deepEqual(raw, toGaiaWorkerProfileDocument());
        assert.equal((await loadGaiaWorkerProfile(outputPath)).id, GAIA_WORKER_PROFILE.id);
        assert.deepEqual(GAIA_WORKER_PROFILE.toolIds, GAIA_PROFILE_TOOL_IDS);
        assert.equal(GAIA_STRUCTURED_OUTPUT_MODE, "strict");
        assert.match(GAIA_WORKER_PROFILE.systemPrompt, /workspace-relative path/);
        assert.doesNotMatch(GAIA_WORKER_PROFILE.systemPrompt, /\/workspace\/question\.txt/);
        assert.match(GAIA_WORKER_PROFILE.instructions[0]!, /workspace-relative paths/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("GAIA Profile 校验拒绝身份、工具和 Prompt 约束漂移", () => {
    const document = toGaiaWorkerProfileDocument();
    assert.throws(
        () => validateGaiaWorkerProfileDocument({ ...document, id: "default" }),
        (error: unknown) => error instanceof GaiaProfileValidationError && error.code === "PROFILE_DRIFT",
    );
    assert.throws(
        () => validateGaiaWorkerProfileDocument({ ...document, toolIds: ["submit_answer"] }),
        (error: unknown) => error instanceof GaiaProfileValidationError && error.code === "PROFILE_DRIFT",
    );
    assert.throws(
        () => validateGaiaWorkerProfileDocument({ ...document, systemPrompt: "changed" }),
        (error: unknown) => error instanceof GaiaProfileValidationError && error.code === "PROFILE_DRIFT",
    );
});
