import assert from "node:assert/strict";
import { access, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    CliConfigurationError,
    DEFAULT_AGENT_PROFILE,
    createCompositionRoot,
    parseCliArgs,
    readLlmConfig,
    runCli,
} from "../src/cli";

function environment(): NodeJS.ProcessEnv {
    return {
        LLM_API_KEY: "test-key",
        LLM_BASE_URL: "https://llm.example.test/v1",
        LLM_MODEL: "test-model",
    };
}

test("parseCliArgs routes the three supported entry intents", () => {
    assert.deepEqual(parseCliArgs([]), { kind: "create" });
    assert.deepEqual(parseCliArgs(["-c"]), { kind: "continueLatest" });
    assert.deepEqual(parseCliArgs(["resume"]), { kind: "resume" });
    assert.throws(
        () => parseCliArgs(["-c", "resume"]),
        /Invalid command line arguments/,
    );
});

test("readLlmConfig reports every missing variable before creating a root", () => {
    assert.throws(
        () => readLlmConfig({ LLM_API_KEY: "  " }),
        (error: unknown) => {
            assert.ok(error instanceof CliConfigurationError);
            assert.deepEqual(error.missing, [
                "LLM_API_KEY",
                "LLM_BASE_URL",
                "LLM_MODEL",
            ]);
            assert.match(error.message, /LLM_API_KEY, LLM_BASE_URL, LLM_MODEL/);
            return true;
        },
    );
});

test("composition root isolates workspace, freezes the default identity, and does not write a Goal", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-"));
    const root = await createCompositionRoot({
        cwd: workspace,
        env: environment(),
        goalIdGenerator: () => "goal-test",
        runIdGenerator: () => "run-test",
    });

    assert.equal(root.workspaceRoot, await realpath(workspace));
    assert.equal(root.goalsDirectory, join(root.workspaceRoot, ".lazygoal", "goals"));
    assert.equal(root.profile.id, DEFAULT_AGENT_PROFILE.id);
    assert.deepEqual(root.profile.toolIds, ["read_file"]);
    assert.match(root.profile.systemPrompt, /English/);
    assert.ok(root.profiles.get("default") !== undefined);
    assert.equal(root.profiles.get("other"), undefined);
    assert.equal(root.goalIdGenerator(), "goal-test");
    assert.equal(root.runIdGenerator(), "run-test");
    assert.deepEqual(await root.store.listResumable(), []);
    await assert.rejects(access(join(root.workspaceRoot, ".lazygoal")));
});

test("missing CLI configuration exits before touching the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-missing-"));
    const errors: string[] = [];
    const exitCode = await runCli([], {
        cwd: workspace,
        env: {},
        writeError: (message) => errors.push(message),
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(errors, [
        "Missing required environment variable(s): LLM_API_KEY, LLM_BASE_URL, LLM_MODEL",
    ]);
    await assert.rejects(access(join(workspace, ".lazygoal")));
});

test("-c reports an empty project without creating a Goal or rendering the TUI", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-empty-"));
    const errors: string[] = [];
    let rendered = false;
    const exitCode = await runCli(["-c"], {
        cwd: workspace,
        env: environment(),
        writeError: (message) => errors.push(message),
        render: (() => {
            rendered = true;
            throw new Error("render should not be called");
        }) as never,
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(errors, ["No resumable Goal was found"]);
    assert.equal(rendered, false);
    await assert.rejects(access(join(workspace, ".lazygoal")));
});
