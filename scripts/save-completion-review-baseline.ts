import { createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createGoal, allocateImmutableEvent } from "../packages/runtime/src/index.ts";
import { buildCompletionReviewRequest } from "../packages/agent/src/completion-review.ts";
import { createDefaultModelContextBudgetPolicy } from "../packages/agent/src/index.ts";
import type { CompletionReviewInput } from "../packages/runtime/src/step-executor.ts";

const currentProtocols = {
    memoryProtocol: { kind: "structured" as const, version: 1 as const },
    modelContextProtocol: { kind: "trajectory-layered" as const, version: 1 as const },
    contextRetrievalProtocol: { kind: "bm25-lite" as const, version: 1 as const },
};

const source = "export const read = (cache, key) => cache.get(key);";
const scenarios = [
    { id: "status-only", request: "Analyze read's responsibility using source and recommend whether to extract a package.", evidence: source,
        answer: "Source analysis completed; identified extraction candidates.", accept: false },
    { id: "directory-only", request: "Read implementation and explain cache ownership and whether extraction is justified.", evidence: "Directory listing: cache.ts, storage.ts. Total: 420 lines.",
        answer: "cache.ts owns memory caching while storage.ts owns recovery. Extract caching into a new package.", accept: false },
    { id: "unverified-change", request: "Set the banner text to Welcome and verify the resulting banner.", evidence: "Saved banner text Welcome. Verification has not run.",
        answer: "Changed the banner to Welcome and verified the result.", accept: false },
    { id: "missing-criterion", request: "Explain read's implementation and recommend whether to extract it.", evidence: source,
        answer: "read calls cache.get(key) and returns the result.", accept: false, plan: true },
    { id: "supported-analysis", request: "Analyze read's responsibility using source and recommend whether to extract a package.", evidence: source,
        answer: "read delegates lookup to cache.get(key) and returns its result. The caller-supplied cache owns storage, so this function is a thin adapter. Retain it with its consumer; this single delegation does not establish an independent responsibility that justifies another package.", accept: true },
    { id: "greeting", request: "Hi", answer: "Hello!", accept: true },
    { id: "supplied-source", request: `Explain this supplied implementation: ${source}`,
        answer: "read calls get(key) on the supplied cache and returns that value; it does not create or own the cache.", accept: true },
    { id: "verified-change", request: "Set the banner text to Welcome and verify the resulting banner.", evidence: "Saved banner text Welcome. Verification: actual banner text is Welcome, check passed.",
        answer: "Changed the banner to Welcome; verification confirmed the displayed text is Welcome.", accept: true },
    { id: "generic-for-real-case", request: "Read project-memory files, choose a real historical decision and propose a reversal condition.", lookup: true,
        answer: "No project decisions exist. As a generic example, split a monolith into microservices and reverse if latency rises 35%.", accept: false },
    { id: "lookup-absence", request: "Determine whether project-memory files document a decision about storage.", lookup: true,
        answer: "The historical query had no match, therefore the repository has no storage decision document.", accept: false },
    { id: "design-as-implementation", request: "Explain what the source proves about storage recovery.", evidence: "Design proposal: the store should recover snapshots after a crash. Implementation has not been inspected.",
        answer: "Storage recovery is implemented and verified to recover every snapshot after crashes.", accept: false },
    { id: "documented-real-case", request: "Read project memory, choose a documented historical decision and propose a reversal condition.", evidence: "Decision D1: Store one latest Goal Snapshot; keep committed trajectory as the recovery source. Reason: avoid a second competing state owner.",
        answer: "D1 keeps one latest Goal Snapshot and uses committed trajectory for recovery, avoiding a second state owner. Proposed reversal condition: if verified product requirements need historical snapshot queries that cannot be answered by trajectory replay within the measured latency budget, revisit this storage choice. This is a proposed condition, not an observed failure.", accept: true },
    { id: "explicit-generic-example", request: "Give a hypothetical architecture decision and an observable reversal condition. No repository case is required.",
        answer: "Hypothetically split a monolith into microservices. Revisit the split if measured end-to-end P99 latency remains 35% above the established baseline for two iterations despite mitigations.", accept: true },
] as const;

function scenarioInput(scenario: typeof scenarios[number]): CompletionReviewInput {
    const created = createGoal({
        ...currentProtocols,
        id: `eval-${scenario.id}`,
        runId: "run-eval",
        intent: scenario.request,
        promptBundleVersion: 1,
        profile: { id: "completion-eval", systemPrompt: "Complete the user's request using evidence.", instructions: [], toolIds: [] },
    });
    const observation = "evidence" in scenario ? { kind: "success" as const, output: { path: "source.ts", text: scenario.evidence }, summary: "Observed resource" } : undefined;
    const evidence = observation === undefined ? [] : [
        allocateImmutableEvent({
            goalId: created.id, runId: "run-eval", phase: "executing", actionId: "read-eval", eventType: "tool_finished",
            payload: { type: "tool_finished", actionId: "read-eval", toolId: "read_file", observation },
        }, 1),
        allocateImmutableEvent({
            goalId: created.id, runId: "run-eval", phase: "executing", actionId: "read-eval", eventType: "observation_recorded",
            payload: { type: "observation_recorded", actionId: "read-eval", observation },
        }, 2),
    ];
    const plan = "plan" in scenario;
    const goal = {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                committedThroughSequence: evidence.length,
                ...(plan ? { mode: "plan" as const, approvedTask: { objective: scenario.request, completionCriteria: [{ text: "Explain the implementation" }, { text: "Recommend whether package extraction is justified" }] } } : {}),
            },
        },
    };
    return {
        goal,
        authorizedTools: [],
        evidence,
        ...("lookup" in scenario ? { contextLookupResult: { status: "not_found" as const, lookupId: "historical-query", reason: "no_context_match" } } : {}),
        candidate: { kind: "complete", summary: scenario.answer, evidenceSequences: evidence.map(e => e.sequence) },
    };
}

async function run() {
    const binding = {
        decideAdapter: { structuredOutputMode: "strict" as const, async generate() { throw new Error("not called"); } },
        modelContextPolicy: createDefaultModelContextBudgetPolicy(),
    };

    const baseline = scenarios.map(s => {
        const inp = scenarioInput(s);
        const { request, bundle } = buildCompletionReviewRequest(inp, binding);
        const content = request.messages[1]!.content;
        const digest = createHash("sha256").update(content).digest("hex");
        return {
            id: s.id,
            messagesCount: request.messages.length,
            systemPromptLength: request.messages[0]!.content.length,
            userContentLength: content.length,
            userContentDigest: `sha256:${digest}`,
            tools: request.tools,
            toolChoice: request.toolChoice,
            structuredOutputSchema: request.structuredOutput,
            bundleName: bundle.name,
        };
    });

    await mkdir("benchmarks/context/test/fixtures", { recursive: true });
    await writeFile("benchmarks/context/test/fixtures/completion-review-baseline.json", JSON.stringify(baseline, null, 2));
    console.log("Successfully saved baseline with", baseline.length, "scenarios to benchmarks/context/test/fixtures/completion-review-baseline.json");
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
