import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDefaultPromptBundleRenderer, DropOldestContextCompactor } from "../../../packages/agent/src/index.js";
import { HeadlessCompositionRoot } from "../../src/headless-composition-root.js";
import { JsonFileBenchmarkPersistenceAdapter } from "../../src/file-persistence-adapter.js";
import { WORKER_NODE_IMAGE, type WorkerIdentity } from "../../src/worker-builder.js";
import { parseScenario } from "../src/scenario.js";
import { publishCheckpoint } from "../src/checkpoint.js";
import { identity } from "../src/artifacts.js";
export const scenario = parseScenario({
    id: "fixture", image: WORKER_NODE_IMAGE, initialFiles: { "config.json": "{}" }, checkpointAfter: 0,
    profile: { id: "fixture", systemPrompt: "Test", instructions: [], toolIds: ["context_shell"] },
    stages: [{ operation: "launch", prompt: "fail", expect: "failed" }, { operation: "continue", prompt: "hello", expect: "completed" }],
    budget: { maxSteps: 5, maxCalls: 20, stageTimeoutMs: 1000, totalTimeoutMs: 10000 },
    verifier: "test -f config.json", rubric: { text: "A greeting", threshold: 0.5 }, limitations: "Fixture only",
});
export const worker: WorkerIdentity = { workerSha256: "worker", sourceDigest: "source", lockDigest: "lock", promptDigest: "prompt", buildDigest: "build", nodeVersion: "22.22.2", nodeImage: WORKER_NODE_IMAGE, nodeImageId: "image", platform: "linux/amd64", acpProtocolVersion: 1, acpSdkVersion: "1.4.0" };
export async function candidate(directory: string): Promise<void> {
    await mkdir(join(directory, "project"), { recursive: true });
    await writeFile(join(directory, "project", "config.json"), "{}");
    const root = new HeadlessCompositionRoot({
        benchmarkId: "context", workspaceRoot: directory, profile: scenario.profile,
        llmAdapter: { structuredOutputMode: "prompt_only", generate: async () => ({ content: JSON.stringify({ result: { kind: "fail", error: "Expected", memoryPatch: null } }) }) },
        renderer: await createDefaultPromptBundleRenderer(), contextCompactor: new DropOldestContextCompactor(),
        persistence: new JsonFileBenchmarkPersistenceAdapter({ rootDirectory: join(directory, "state"), namespaceFor: () => "session" }),
        adapter: { describeTask: () => ({ intent: "fail", objective: "Follow", completionCriteria: ["Follow"], maxSteps: 5 }),
            createEpisode: async () => ({ registry: { get: () => undefined }, readOutcome: () => null, close: async () => undefined }) },
    });
    const result = await root.run(null);
    await publishCheckpoint(directory, scenario, { goalId: result.goal.id, runId: result.goal.state.run.id, status: result.goal.state.run.status, sequence: result.goal.state.run.committedThroughSequence }, worker, "image");
    await writeFile(join(directory, "scenario.json"), JSON.stringify(scenario));
    await writeFile(join(directory, "capture.json"), JSON.stringify({ model: "fixture", worker, stages: [], scenarioHash: identity(scenario) }));
}
