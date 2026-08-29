import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createEmptyWorkingMemory,
    createGoal,
    type AgentProfile,
} from "../../runtime/src/index";
import {
    createDefaultPromptBundleProtocolValidator,
    createDefaultPromptBundleRenderer,
    ModelInferenceProjector,
} from "../src/index";
import { UnsupportedPromptBundleVersionError } from "../src/prompting/errors";

const profile: AgentProfile = {
    id: "model-context-profile",
    systemPrompt: "test",
    instructions: [],
    toolIds: [],
};

function structuredContextGoal(
    modelContextProtocol: { kind: "conversation" | "trajectory-layered"; version: 1 },
) {
    return createGoal({
        id: `goal-${modelContextProtocol.kind}`,
        intent: "验证模型上下文协议",
        promptBundleVersion: 4,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol,
        profile,
        runId: `run-${modelContextProtocol.kind}`,
    });
}

test("默认 Prompt Bundle 明确绑定 conversation@1，拒绝未注册的 layered 组合", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const goal = structuredContextGoal({ kind: "trajectory-layered", version: 1 });
    const view = new ModelInferenceProjector().project(
        goal,
        [],
        createEmptyWorkingMemory(),
    );

    assert.throws(
        () => renderer.render(view.prompt),
        (error: unknown) => error instanceof UnsupportedPromptBundleVersionError,
    );
});

test("Projector 只在 layered 协议向模型视图暴露模型上下文标识", () => {
    const projector = new ModelInferenceProjector();
    const conversation = projector.project(
        structuredContextGoal({ kind: "conversation", version: 1 }),
        [],
        createEmptyWorkingMemory(),
    );
    const layered = projector.project(
        structuredContextGoal({ kind: "trajectory-layered", version: 1 }),
        [],
        createEmptyWorkingMemory(),
    );

    assert.equal("modelContextProtocol" in conversation.prompt, false);
    assert.deepEqual(layered.prompt.modelContextProtocol, {
        kind: "trajectory-layered",
        version: 1,
    });
});

test("Projector 拒绝 checkpoint Memory 与 layered 模型上下文交叉组合", () => {
    const goal = createGoal({
        id: "goal-invalid-layered",
        intent: "非法协议组合",
        promptBundleVersion: 1,
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        profile,
        runId: "run-invalid-layered",
    });

    assert.throws(
        () => new ModelInferenceProjector().project(goal),
        /trajectory-layered model context requires structured Memory protocol/,
    );
});

test("Prompt/Memory/Model Context/Retrieval 协议矩阵只接受 v5 的 none@1", () => {
    const validator = createDefaultPromptBundleProtocolValidator();

    validator.validate({
        promptBundleVersion: 5,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "none", version: 1 },
    });

    assert.throws(
        () => validator.validate({
            promptBundleVersion: 5,
            memoryProtocol: { kind: "structured", version: 1 },
            modelContextProtocol: { kind: "trajectory-layered", version: 1 },
            contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        }),
        /不兼容/,
    );

    assert.throws(
        () => validator.validate({
            promptBundleVersion: 5,
            memoryProtocol: { kind: "structured", version: 1 },
            modelContextProtocol: { kind: "trajectory-layered", version: 1 },
            contextRetrievalProtocol: { kind: "future", version: 1 } as never,
        }),
        /Context Retrieval 协议必须是 none@1 或 bm25-lite@1/,
    );
});
