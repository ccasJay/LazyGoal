import assert from "node:assert/strict";
import { test } from "node:test";
import type { LLMAdapter, LLMRequest } from "../../llm-core/src/index";
import { toolCallResponse } from "../../llm-core/test/response-fixtures";
import { InMemoryGoalStore } from "../../storage/src/index";
import { InMemoryToolRegistry } from "../../tool-core/src/index";
import { createGoal, Runner } from "../../runtime/src/index";
import { currentProtocols, trajectoryStoreFor } from "../../runtime/test/current-fixtures";
import { createCurrentContextAssembler } from "../../agent/test/current-fixtures";
import { createDefaultPromptBundleRenderer } from "../../prompt-bundle/src/index";
import { LLMStepExecutor } from "../src/index";
import { DropOldestContextCompactor } from "../../context-budget/src/index";

for (const structuredOutputMode of ["strict", "prompt_only"] as const) {
    test(`${structuredOutputMode}: model work-only tools create, revise, review and advance real Runtime stages`, async () => {
        const store = new InMemoryGoalStore();
        const trajectory = trajectoryStoreFor(store);
        const goal = createGoal({ ...currentProtocols, id: `stage-tools-${structuredOutputMode}`, runId: "run-1",
            intent: "Inspect and verify", promptBundleVersion: 1,
            profile: { id: "stage-tools", systemPrompt: "Inspect", instructions: [], toolIds: [] } });
        await store.save(goal);
        const script: readonly [string, Record<string, unknown>][] = [
            ["system_start_run_stage", { target: "Inspect", acceptanceCriteria: ["Identify the structure"] }],
            ["system_revise_run_stage", { target: "Inspect public entry points", acceptanceCriteria: ["Identify public entry points"], reason: "Focus the investigation" }],
            ["system_complete_run_stage", { summary: "Entry points inspected", evidenceSequences: [] }],
            ["system_start_run_stage", { target: "Verify", acceptanceCriteria: ["Verify the findings"] }],
            ["system_wait_for_input", { reason: "Await user input", memoryPatch: null }],
        ];
        let decisions = 0;
        let reviews = 0;
        const adapter: LLMAdapter = {
            structuredOutputMode,
            async generate(request: LLMRequest) {
                if (request.tools?.[0]?.id === "system_review_completion") {
                    reviews += 1;
                    return toolCallResponse({ callId: "review", toolId: "system_review_completion", argumentsJson: JSON.stringify({ result: { kind: "accept" } }) });
                }
                const [toolId, args] = script[decisions++]!;
                assert.ok(request.tools?.some(tool => tool.id === toolId));
                const stageTools = request.tools!.filter(tool => /system_(start|revise|complete)_run_stage/.test(tool.id));
                assert.deepEqual(stageTools.map(tool => tool.id), decisions === 1 || decisions === 4
                    ? ["system_start_run_stage"] : ["system_revise_run_stage", "system_complete_run_stage"]);
                for (const tool of stageTools) {
                    const fields = Object.keys(tool.parametersSchema.properties ?? {});
                    assert.ok(["stageId", "baseRevision", "memoryPatch"].every(field => !fields.includes(field)));
                }
                return toolCallResponse({ callId: `call-${decisions}`, toolId, argumentsJson: JSON.stringify(args) });
            },
        };
        const executor = new LLMStepExecutor({ adapter, renderer: await createDefaultPromptBundleRenderer(), contextCompactor: new DropOldestContextCompactor(), trajectoryContextAssembler: createCurrentContextAssembler() });
        const runner = new Runner({ store, trajectoryStore: trajectory, executor, toolRegistry: new InMemoryToolRegistry([]), toolPolicy: { evaluate: () => "allow" } });
        const result = await runner.runUntilBlocked({ goalId: goal.id, runId: "run-1" });
        assert.equal(result.ok, true);
        assert.ok(result.ok);
        assert.notEqual(result.state.status, "failed", JSON.stringify(result.state.stopReason));
        assert.equal(decisions, 5);
        assert.equal(reviews, 1);
        const saved = (await store.restore(goal.id))!;
        assert.equal(saved.state.run.status, "waiting");
        assert.equal(saved.state.run.currentStage?.stageId, "stage-2");
        assert.equal(saved.state.run.currentStage?.target, "Verify");
        const accepted = trajectory.events.find(event => event.eventType === "run_stage_accepted");
        assert.ok(accepted?.eventType === "run_stage_accepted");
        assert.equal(accepted.payload.stageId, "stage-1");
        assert.equal(accepted.payload.revision, 2);
        assert.equal(trajectory.events.some(event => event.eventType === "model_repair_feedback_recorded"), false);
    });
}
