import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    runAlfworldDownload,
} from "../scripts/download-alfworld.js";

test("runAlfworldDownload passes the configured data root to alfworld-download", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-download-"));
    const dataRoot = join(workspace, "configured-data");
    const environmentFilePath = join(workspace, ".env.alfworld");
    const calls: Array<{
        command: string;
        args: readonly string[];
        options: { readonly env?: NodeJS.ProcessEnv };
    }> = [];

    try {
        await writeFile(
            environmentFilePath,
            `ALFWORLD_PYTHON="/fake/python"\nALFWORLD_DATA="${dataRoot}"\n`,
            "utf8",
        );

        const spawn = ((command: string, args: readonly string[], options: { readonly env?: NodeJS.ProcessEnv }) => {
            calls.push({ command, args, options });
            return {
                pid: 1,
                output: [],
                stdout: null,
                stderr: null,
                status: 0,
                signal: null,
                error: undefined,
            };
        }) as unknown as typeof import("node:child_process").spawnSync;

        const exitCode = await runAlfworldDownload({
            environmentFilePath,
            env: {},
            spawn,
            writeError: () => undefined,
        });

        assert.equal(exitCode, 0);
        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.command, "alfworld-download");
        assert.deepEqual(calls[0]?.args, ["--data-dir", dataRoot]);
        assert.equal(calls[0]?.options.env?.ALFWORLD_DATA, dataRoot);
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

test("runAlfworldDownload lets process variables override the environment file", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-download-override-"));
    const fileDataRoot = join(workspace, "file-data");
    const processDataRoot = join(workspace, "process-data");
    const environmentFilePath = join(workspace, ".env.alfworld");
    let downloadedPath: string | undefined;

    try {
        await writeFile(
            environmentFilePath,
            `ALFWORLD_PYTHON="/fake/python"\nALFWORLD_DATA="${fileDataRoot}"\n`,
            "utf8",
        );

        const spawn = ((...args: unknown[]) => {
            const options = args[2] as { readonly env?: NodeJS.ProcessEnv };
            downloadedPath = options.env?.ALFWORLD_DATA;
            return {
                pid: 1,
                output: [],
                stdout: null,
                stderr: null,
                status: 0,
                signal: null,
                error: undefined,
            };
        }) as unknown as typeof import("node:child_process").spawnSync;

        await runAlfworldDownload({
            environmentFilePath,
            env: {
                ALFWORLD_PYTHON: "/fake/python",
                ALFWORLD_DATA: processDataRoot,
            },
            spawn,
            writeError: () => undefined,
        });

        assert.equal(downloadedPath, processDataRoot);
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});
