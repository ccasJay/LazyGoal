import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
    access,
    mkdtemp,
    readFile,
    readdir,
    realpath,
    rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
    createGoal,
    type AgentProfile,
} from "../../runtime/src/index";
import { JsonFileGoalStore } from "../../storage/src/index";
import { writeDefaultProfile } from "./profile-fixture";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const processFixturePath = fileURLToPath(
    new URL("./fixtures/model-abort-process.ts", import.meta.url),
);
const continueProcessFixturePath = fileURLToPath(
    new URL("./fixtures/model-continue-process.ts", import.meta.url),
);
const tsxLoaderPath = fileURLToPath(
    new URL("../../../node_modules/tsx/dist/esm/index.mjs", import.meta.url),
);

const seededProfile: AgentProfile = {
    id: "seeded-profile",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Resume and continue."],
    toolIds: [],
};

function waitFor<T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string,
): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => {
        if (timer !== undefined) {
            clearTimeout(timer);
        }
    });
}

function listen(server: ReturnType<typeof createServer>): Promise<number> {
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (address === null || typeof address === "string") {
                reject(new Error("Fake server did not expose a TCP port"));
                return;
            }

            resolve(address.port);
        });
    });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
    });
}

function requestHandler(
    request: IncomingMessage,
    response: ServerResponse,
    onRequest: () => void,
    onAbort: () => void,
): void {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
        response.statusCode = 404;
        response.end();
        return;
    }

    onRequest();
    request.on("aborted", onAbort);
    request.on("close", onAbort);
    // Deliberately keep the model response open so the child must abort it.
}

test("CLI composition child aborts an in-flight model request and preserves its checkpoint", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-process-"));
    await writeDefaultProfile(workspace);
    let requestStarted!: () => void;
    let requestAborted!: () => void;
    const modelRequest = new Promise<void>((resolve) => {
        requestStarted = resolve;
    });
    const modelAbort = new Promise<void>((resolve) => {
        requestAborted = resolve;
    });
    const server = createServer((request, response) => {
        requestHandler(request, response, requestStarted, requestAborted);
    });
    const port = await listen(server);
    const child = spawn(
        process.execPath,
        ["--import", tsxLoaderPath, processFixturePath],
        {
            cwd: workspace,
            env: {
                ...process.env,
                LLM_API_KEY: "test-key",
                LLM_BASE_URL: `http://127.0.0.1:${port}/v1`,
                LLM_MODEL: "test-model",
            },
            stdio: ["pipe", "pipe", "pipe"],
        },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
    });

    try {
        await waitFor(modelRequest, 6_000, "the fake model request");
        child.kill("SIGINT");
        await waitFor(modelAbort, 6_000, "the model request abort");
        const result = await waitFor(new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
            child.once("close", (code, signal) => resolve({ code, signal }));
        }), 6_000, "the CLI child exit");

        assert.equal(result.signal, null, stderr);
        assert.equal(result.code, 130, stderr);
        const goalDirectory = join(workspace, ".lazygoal", "goals");
        const files = (await readdir(goalDirectory)).filter((file) => file.endsWith(".json"));
        assert.equal(files.length, 1);
        const snapshot = JSON.parse(await readFile(join(goalDirectory, files[0]!), "utf8")) as {
            readonly state: { readonly workflow: { readonly phase: string }; readonly run: { readonly status: string } };
        };
        assert.equal(snapshot.state.workflow.phase, "gathering_context");
        assert.equal(snapshot.state.run.status, "created");
    } finally {
        if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
        }
        await close(server);
        await rm(workspace, { recursive: true, force: true });
    }
});

test("CLI bin resolves its TSX loader from the project when launched in another workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-bin-workspace-"));
    await writeDefaultProfile(workspace);
    const binPath = join(projectRoot, "bin", "lazygoal.cjs");
    const child = spawn(
        process.execPath,
        [binPath, "-c"],
        {
            cwd: workspace,
            env: {
                ...process.env,
                LLM_API_KEY: "test-key",
                LLM_BASE_URL: "http://127.0.0.1:1/v1",
                LLM_MODEL: "test-model",
            },
            stdio: ["ignore", "pipe", "pipe"],
        },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
    });

    try {
        const result = await waitFor(new Promise<{ code: number | null }>((resolve) => {
            child.once("close", (code) => resolve({ code }));
        }), 6_000, "the bin shim exit");
        assert.equal(result.code, 1, stderr);
        assert.match(stderr, /No resumable Goal was found/);
        await assert.rejects(access(join(workspace, ".lazygoal", "goals")));
    } finally {
        if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
        }
        await rm(workspace, { recursive: true, force: true });
    }
});

test("CLI -c restores a pre-seeded resumable Goal and mid-flight abort preserves its checkpoint", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-continue-process-"));
    await writeDefaultProfile(workspace);
    const store = new JsonFileGoalStore(
        join(await realpath(workspace), ".lazygoal", "goals"),
    );
    await store.save(createGoal({
        id: "goal-seeded",
        intent: "Resume and continue the seeded Goal",
        profile: seededProfile,
        runId: "run-seeded",
    }));
    let requestStarted!: () => void;
    let requestAborted!: () => void;
    const modelRequest = new Promise<void>((resolve) => {
        requestStarted = resolve;
    });
    const modelAbort = new Promise<void>((resolve) => {
        requestAborted = resolve;
    });
    const server = createServer((request, response) => {
        requestHandler(request, response, requestStarted, requestAborted);
    });
    const port = await listen(server);
    const child = spawn(
        process.execPath,
        ["--import", tsxLoaderPath, continueProcessFixturePath],
        {
            cwd: workspace,
            env: {
                ...process.env,
                LLM_API_KEY: "test-key",
                LLM_BASE_URL: `http://127.0.0.1:${port}/v1`,
                LLM_MODEL: "test-model",
            },
            stdio: ["pipe", "pipe", "pipe"],
        },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
    });

    try {
        await waitFor(modelRequest, 6_000, "the fake model request for the seeded Goal");
        child.kill("SIGINT");
        await waitFor(modelAbort, 6_000, "the model request abort");
        const result = await waitFor(new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
            child.once("close", (code, signal) => resolve({ code, signal }));
        }), 6_000, "the CLI child exit");

        assert.equal(result.signal, null, stderr);
        assert.equal(result.code, 130, stderr);
        const goalsDirectory = join(await realpath(workspace), ".lazygoal", "goals");
        const files = (await readdir(goalsDirectory)).filter((file) => file.endsWith(".json"));
        assert.equal(files.length, 1);
        const snapshot = JSON.parse(await readFile(join(goalsDirectory, files[0]!), "utf8")) as {
            readonly id: string;
            readonly state: { readonly workflow: { readonly phase: string } };
        };
        assert.equal(snapshot.id, "goal-seeded");
        assert.equal(snapshot.state.workflow.phase, "gathering_context");
    } finally {
        if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
        }
        await close(server);
        await rm(workspace, { recursive: true, force: true });
    }
});
