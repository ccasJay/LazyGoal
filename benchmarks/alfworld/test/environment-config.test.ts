import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    ALFWORLD_VERSION,
    TEXTWORLD_VERSION,
    AlfworldConfigurationError,
    AlfworldPreflightError,
    getCondaSubdir,
    loadAlfworldEnvironmentFile,
    preflightAlfworldEnvironment,
    resolveAlfworldEnvironment,
    runAlfworldPythonProbe,
    type AlfworldEnvironmentConfig,
} from "../src/environment-config.js";

function environment(dataRoot: string): NodeJS.ProcessEnv {
    return {
        ALFWORLD_PYTHON: "/opt/conda/envs/lazygoal-alfworld/bin/python",
        ALFWORLD_DATA: dataRoot,
    };
}

test("loadAlfworldEnvironmentFile parses the package config and expands existing variables", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-env-file-"));
    const filePath = join(workspace, ".env.alfworld");
    try {
        await writeFile(filePath, [
            "# local test configuration",
            "export ALFWORLD_PYTHON=\"${CONDA_PREFIX}/bin/python\"",
            "ALFWORLD_DATA=\"${HOME}/alfworld-data\"",
            "CONDA_SUBDIR=osx-64",
        ].join("\n"), "utf8");

        const parsed = await loadAlfworldEnvironmentFile(filePath, {
            CONDA_PREFIX: "/opt/conda/envs/lazygoal-alfworld",
            HOME: "/Users/tester",
        });

        assert.deepEqual(parsed, {
            ALFWORLD_PYTHON: "/opt/conda/envs/lazygoal-alfworld/bin/python",
            ALFWORLD_DATA: "/Users/tester/alfworld-data",
            CONDA_SUBDIR: "osx-64",
        });
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

test("runAlfworldPythonProbe converts process startup failures into probe results", async () => {
    const result = await runAlfworldPythonProbe(
        "/definitely/missing/lazygoal-alfworld-python",
        "print('unused')",
        { ALFWORLD_DATA: "/data/alfworld" },
    );

    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, "");
    assert.equal(typeof result.stderr, "string");
});

test("resolveAlfworldEnvironment reads explicit paths without starting Conda", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-config-"));
    try {
        const config = resolveAlfworldEnvironment({
            env: environment(join(workspace, "data/alfworld")),
            cwd: workspace,
            platform: "darwin",
            arch: "arm64",
        });

        assert.equal(config.environmentName, "lazygoal-alfworld");
        assert.equal(config.pythonExecutable, "/opt/conda/envs/lazygoal-alfworld/bin/python");
        assert.equal(config.dataRoot, join(workspace, "data/alfworld"));
        assert.equal(config.condaSubdir, "osx-64");
        assert.equal(config.textworldOnly, true);
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

test("resolveAlfworldEnvironment rejects missing Python and data settings", () => {
    assert.throws(
        () => resolveAlfworldEnvironment({ env: { ALFWORLD_DATA: "/data" } }),
        (error: unknown) =>
            error instanceof AlfworldConfigurationError && error.code === "MISSING_PYTHON",
    );
    assert.throws(
        () => resolveAlfworldEnvironment({ env: { ALFWORLD_PYTHON: "/python" } }),
        (error: unknown) =>
            error instanceof AlfworldConfigurationError && error.code === "MISSING_DATA",
    );
    assert.throws(
        () =>
            resolveAlfworldEnvironment({
                env: environment("relative/data"),
            }),
        (error: unknown) =>
            error instanceof AlfworldConfigurationError && error.code === "INVALID_DATA_PATH",
    );
});

test("getCondaSubdir supports explicit override and known platforms", () => {
    assert.equal(getCondaSubdir("darwin", "arm64"), "osx-64");
    assert.equal(getCondaSubdir("linux", "x64"), "linux-64");
    assert.equal(getCondaSubdir("linux", "arm64", "osx-64"), "osx-64");
    assert.throws(
        () => getCondaSubdir("linux", "x64", "mips-64"),
        (error: unknown) =>
            error instanceof AlfworldConfigurationError && error.code === "UNSUPPORTED_PLATFORM",
    );
});

test("preflight reports missing data before invoking Python", async () => {
    const probeCalls: string[] = [];
    const config: AlfworldEnvironmentConfig = {
        environmentName: "lazygoal-alfworld",
        pythonExecutable: "/python",
        dataRoot: "/missing/alfworld",
        alfworldVersion: ALFWORLD_VERSION,
        textworldVersion: TEXTWORLD_VERSION,
        condaSubdir: "linux-64",
        textworldOnly: true,
    };

    await assert.rejects(
        () =>
            preflightAlfworldEnvironment(config, {
                isDirectory: async () => false,
                probePython: async (executable) => {
                    probeCalls.push(executable);
                    return { stdout: "", stderr: "", exitCode: 0 };
                },
            }),
        (error: unknown) =>
            error instanceof AlfworldPreflightError && error.code === "DATA_NOT_FOUND",
    );
    assert.deepEqual(probeCalls, []);
});

test("preflight validates pinned versions and TextWorld-only capability", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-data-"));
    const dataRoot = join(workspace, "data");
    await mkdir(dataRoot);
    try {
        const config = resolveAlfworldEnvironment({
            env: environment(dataRoot),
            platform: "linux",
            arch: "x64",
        });

        const result = await preflightAlfworldEnvironment(config, {
            probePython: async () => ({
                stdout: JSON.stringify({
                    pythonVersion: "3.9.19",
                    alfworldVersion: ALFWORLD_VERSION,
                    textworldVersion: TEXTWORLD_VERSION,
                    dataRoot,
                    textworldOnly: true,
                }),
                stderr: "",
                exitCode: 0,
            }),
        });
        assert.equal(result.alfworldVersion, ALFWORLD_VERSION);
        assert.equal(result.textworldVersion, TEXTWORLD_VERSION);
        assert.equal(result.textworldOnly, true);

        await assert.rejects(
            () =>
                preflightAlfworldEnvironment(config, {
                    probePython: async () => ({
                        stdout: JSON.stringify({
                            pythonVersion: "3.9.19",
                            alfworldVersion: ALFWORLD_VERSION,
                            textworldVersion: "0.0.0",
                            dataRoot,
                            textworldOnly: true,
                        }),
                        stderr: "",
                        exitCode: 0,
                    }),
                }),
            (error: unknown) =>
                error instanceof AlfworldPreflightError && error.code === "VERSION_MISMATCH",
        );
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});
