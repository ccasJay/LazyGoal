import assert from "node:assert/strict";
import { test } from "node:test";
import { scriptedEngineeringRole } from "../context-swebench-smoke.js";
import { createModelOutputContractBundle } from "../../packages/model-contracts/src/index.js";
import { parseModelOutput } from "../../packages/agent/src/model-output.js";
import { createSwebenchAcpToolSet } from "../swebench/src/worker-runtime.js";

test("engineering fixture obeys stage native tool and discover-before-invoke contracts without a real model", async () => {
    const role = scriptedEngineeringRole();
    assert.equal(role.kind, "scripted");
    assert.equal(role.configuration?.actualModelCalls, 0);
    const first = await role.adapter.generate({ messages: [{ role: "user", content: JSON.stringify({ phase: "executing", execution: {} }) }] });
    assert.equal(first.toolCalls?.[0]?.toolId, "system_update_run_stage");
    const messages = [{ role: "user" as const, content: JSON.stringify({ phase: "executing", execution: { currentStage: { stageId: "stage" } } }) }];
    const discovery = await role.adapter.generate({ messages });
    assert.equal(parseModelOutput(discovery.content, createModelOutputContractBundle({ kind: "executing" })).kind, "tool_discovery");
    const bash = createSwebenchAcpToolSet("/testbed").registry.get("bash")!;
    const toolCall = await role.adapter.generate({ messages, tools: [{ id: "bash", description: "bash", parametersSchema: {} }] });
    const decision = parseModelOutput(toolCall.content, createModelOutputContractBundle({ kind: "executing", authorizedTools: [{ id: "bash", inputContract: bash.definition.inputContract }] }));
    assert.equal(decision.kind, "tool_call");
});
