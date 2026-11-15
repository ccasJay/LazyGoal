import assert from "node:assert/strict";
import {
    mkdtemp,
    readFile,
    rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    allocateDiagnosticTraceRecord,
} from "../../runtime/src/index";
import {
    JsonFileDiagnosticTraceSink,
    runTracePath,
} from "../src/index";

test("JsonFileDiagnosticTraceSink writes an isolated ordered JSONL stream", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-trace-"));

    try {
        const sink = new JsonFileDiagnosticTraceSink(directory);
        const records = [
            allocateDiagnosticTraceRecord({
                goalId: "goal/with spaces",
                runId: "run-1",
                kind: "model_request",
                payload: { messages: [] },
            }),
            allocateDiagnosticTraceRecord({
                goalId: "goal/with spaces",
                runId: "run-1",
                kind: "model_response",
                payload: { content: "done" },
            }),
        ];

        await Promise.all(records.map((record) => sink.append(record)));

        const filePath = runTracePath(directory, "goal/with spaces", "run-1");
        const lines = (await readFile(filePath, "utf8"))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line) as { kind: string });

        assert.deepEqual(
            lines.map((line) => line.kind),
            ["model_request", "model_response"],
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
