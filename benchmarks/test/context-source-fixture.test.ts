import assert from "node:assert/strict";
import { readAssistantText, readToolCalls } from "../../packages/llm-core/src/index";
import { blockResponse, textResponse, toolCallResponse } from "../../packages/llm-core/test/response-fixtures";
import { test } from "node:test";
import { scriptedEngineeringRole } from "../context-swebench-smoke.js";
import { createModelOutputContractBundle } from "../../packages/model-contracts/src/index.js";
import { parseModelOutput } from "../../packages/model-response/src/index.js";
import { createSwebenchAcpToolSet } from "../swebench/src/worker-runtime.js";

test("engineering fixture obeys stage native tool and discover-before-invoke contracts without a real model", async () => {
    const role = scriptedEngineeringRole();
    assert.equal(role.kind, "scripted");
    assert.equal(role.configuration?.actualModelCalls, 0);
    const first = await role.adapter.generate({ messages: [{ role: "user", content: JSON.stringify({ phase: "executing", execution: {} }) }] });
    assert.equal(readToolCalls(first)[0]?.toolId, "system_start_run_stage");
    const messages = [{ role: "user" as const, content: JSON.stringify({ phase: "executing", execution: { currentStage: { stageId: "stage" } } }) }];
    const discovery = await role.adapter.generate({ messages });
    assert.equal(parseModelOutput(readAssistantText(discovery), createModelOutputContractBundle({ kind: "executing" })).kind, "tool_discovery");
    const bash = createSwebenchAcpToolSet("/testbed").registry.get("bash")!;
    const toolCall = await role.adapter.generate({ messages, tools: [{ id: "bash", description: "bash", parametersSchema: {} }] });
    const decision = parseModelOutput(readAssistantText(toolCall), createModelOutputContractBundle({ kind: "executing", authorizedTools: [{ id: "bash", inputContract: bash.definition.inputContract }] }));
    assert.equal(decision.kind, "tool_call");
});
