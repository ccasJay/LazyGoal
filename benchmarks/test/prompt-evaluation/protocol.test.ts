import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
    PROMPT_EVALUATION_EXIT_CODES,
    PromptEvaluationRequestError,
    parsePromptEvaluationRequest,
    readPromptEvaluationRequest,
} from "../../src/prompt-evaluation/protocol.js";

async function fixture(): Promise<{
    readonly root: string;
    readonly manifestPath: string;
    readonly request: Record<string, unknown>;
}> {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-prompt-eval-protocol-"));
    const manifestPath = join(root, "manifest.json");
    await writeFile(manifestPath, "{}\n", "utf8");
    return {
        root,
        manifestPath,
        request: {
            protocol: "prompt-evaluation@1",
            benchmark: { id: "alfworld", manifestPath: "manifest.json" },
            candidate: {
                id: "candidate-1",
                baseProfileId: "alfworld-default",
                systemPrompt: "Solve the task.",
                instructions: ["Use authorized tools."],
            },
            model: { configId: "default", modelId: "model-1" },
            outputDirectory: "output",
        },
    };
}

test("parsePromptEvaluationRequest accepts one candidate and normalizes paths without writes", async (t) => {
    const data = await fixture();
    t.after(() => rm(data.root, { recursive: true, force: true }));

    const request = await parsePromptEvaluationRequest(data.request, { cwd: data.root });

    assert.equal(request.benchmark.manifestPath, data.manifestPath);
    assert.equal(request.outputDirectory, join(data.root, "output"));
    assert.equal(Object.isFrozen(request), true);
    assert.equal(Object.isFrozen(request.candidate.instructions), true);
    await assert.rejects(stat(request.outputDirectory), /ENOENT/u);
    assert.equal(PROMPT_EVALUATION_EXIT_CODES.invalidRequest, 2);
});

test("parsePromptEvaluationRequest treats benchmark IDs as opaque without a registry constraint", async (t) => {
    const data = await fixture();
    t.after(() => rm(data.root, { recursive: true, force: true }));

    const request = await parsePromptEvaluationRequest({
        ...data.request,
        benchmark: { id: "custom-benchmark", manifestPath: "manifest.json" },
    }, { cwd: data.root });

    assert.equal(request.benchmark.id, "custom-benchmark");
});

test("parsePromptEvaluationRequest rejects unknown frozen fields and unsupported versions", async (t) => {
    const data = await fixture();
    t.after(() => rm(data.root, { recursive: true, force: true }));

    await assert.rejects(
        parsePromptEvaluationRequest({
            ...data.request,
            candidate: {
                ...(data.request.candidate as Record<string, unknown>),
                toolIds: ["bash"],
            },
        }, { cwd: data.root }),
        (error: unknown) => error instanceof PromptEvaluationRequestError
            && error.code === "UNKNOWN_FIELD"
            && error.field === "$.candidate.toolIds",
    );
    await assert.rejects(
        parsePromptEvaluationRequest({ ...data.request, protocol: "prompt-evaluation@2" }, { cwd: data.root }),
        (error: unknown) => error instanceof PromptEvaluationRequestError
            && error.code === "INVALID_PROTOCOL",
    );
});

test("parsePromptEvaluationRequest rejects unregistered benchmarks and invalid referenced paths", async (t) => {
    const data = await fixture();
    t.after(() => rm(data.root, { recursive: true, force: true }));

    await assert.rejects(
        parsePromptEvaluationRequest({
            ...data.request,
            benchmark: { id: "swebench", manifestPath: "manifest.json" },
        }, {
            cwd: data.root,
            supportedBenchmarkIds: new Set(["alfworld", "gaia"]),
        }),
        (error: unknown) => error instanceof PromptEvaluationRequestError
            && error.code === "UNSUPPORTED_BENCHMARK",
    );
    await assert.rejects(
        parsePromptEvaluationRequest({
            ...data.request,
            benchmark: { id: "alfworld", manifestPath: "missing.json" },
        }, { cwd: data.root }),
        (error: unknown) => error instanceof PromptEvaluationRequestError
            && error.code === "INVALID_PATH"
            && error.field === "$.benchmark.manifestPath",
    );
});

test("readPromptEvaluationRequest distinguishes invalid JSON and invalid output paths", async (t) => {
    const data = await fixture();
    t.after(() => rm(data.root, { recursive: true, force: true }));
    const requestPath = join(data.root, "request.json");
    await writeFile(requestPath, "{", "utf8");
    await assert.rejects(
        readPromptEvaluationRequest(requestPath),
        (error: unknown) => error instanceof PromptEvaluationRequestError
            && error.code === "INVALID_JSON",
    );

    const outputFile = join(data.root, "not-a-directory");
    await writeFile(outputFile, "file", "utf8");
    await assert.rejects(
        parsePromptEvaluationRequest({ ...data.request, outputDirectory: outputFile }, { cwd: data.root }),
        (error: unknown) => error instanceof PromptEvaluationRequestError
            && error.code === "INVALID_PATH"
            && error.field === "$.outputDirectory",
    );
    assert.equal(resolve(data.root, "output"), join(data.root, "output"));
});
