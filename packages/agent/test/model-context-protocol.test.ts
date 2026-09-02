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

const currentProtocols = {
    memoryProtocol: { kind: "structured" as const, version: 1 as const },
    modelContextProtocol: {
        kind: "trajectory-layered" as const,
        version: 1 as const,
    },
    contextRetrievalProtocol: {
        kind: "bm25-lite" as const,
        version: 1 as const,
    },
};

function currentGoal() {
    return createGoal({
        id: "goal-current",
        intent: "验证当前模型上下文协议",
        promptBundleVersion: 1,
        ...currentProtocols,
        profile,
        runId: "run-current",
    });
}

test("默认 Prompt Bundle 只注册当前联合协议", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const goal = currentGoal();
    const view = new ModelInferenceProjector().project(
        goal,
        [],
        createEmptyWorkingMemory(),
    );

    assert.deepEqual(renderer.render(view.prompt).includes("trajectory-layered@1"), true);
    assert.deepEqual(view.prompt.memoryProtocol, currentProtocols.memoryProtocol);
    assert.deepEqual(view.prompt.modelContextProtocol, currentProtocols.modelContextProtocol);
    assert.deepEqual(view.prompt.contextRetrievalProtocol, currentProtocols.contextRetrievalProtocol);
});

test("Projector 暴露唯一当前协议和 Context Epoch", () => {
    const view = new ModelInferenceProjector().project(
        currentGoal(),
        [],
        createEmptyWorkingMemory(),
    );

    assert.deepEqual(view.prompt, {
        promptBundleVersion: 1,
        phase: "gathering_context",
        profile: {
            id: profile.id,
            systemPrompt: profile.systemPrompt,
            instructions: [],
        },
        authorizedTools: [],
        ...currentProtocols,
    });
    assert.deepEqual(view.contextEpoch, {
        protocolVersion: 1,
        epochNumber: 0,
        conversationStartIndex: 0,
        openedAtSequence: 0,
        control: {
            status: "active",
            inputTokens: 0,
            hardInputLimit: 0,
            remainingTokens: 0,
        },
    });
});

test("当前协议校验器拒绝历史 Bundle 和协议", () => {
    const validator = createDefaultPromptBundleProtocolValidator();

    validator.validate({ promptBundleVersion: 1, ...currentProtocols });

    assert.throws(
        () => validator.validate({
            promptBundleVersion: 7 as never,
            ...currentProtocols,
        }),
        /仅支持|不支持/,
    );
    assert.throws(
        () => validator.validate({
            promptBundleVersion: 1,
            memoryProtocol: { kind: "checkpoint", version: 1 } as never,
            modelContextProtocol: currentProtocols.modelContextProtocol,
            contextRetrievalProtocol: currentProtocols.contextRetrievalProtocol,
        }),
        /仅支持/,
    );
    assert.throws(
        () => validator.validate({
            promptBundleVersion: 1,
            memoryProtocol: currentProtocols.memoryProtocol,
            modelContextProtocol: { kind: "conversation", version: 1 } as never,
            contextRetrievalProtocol: currentProtocols.contextRetrievalProtocol,
        }),
        /仅支持/,
    );
    assert.throws(
        () => validator.validate({
            promptBundleVersion: 1,
            memoryProtocol: currentProtocols.memoryProtocol,
            modelContextProtocol: currentProtocols.modelContextProtocol,
            contextRetrievalProtocol: { kind: "none", version: 1 } as never,
        }),
        /仅支持/,
    );
});

test("Renderer 对历史 Prompt Bundle 版本 fail closed", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const view = new ModelInferenceProjector().project(
        currentGoal(),
        [],
        createEmptyWorkingMemory(),
    );

    assert.throws(
        () => renderer.render({ ...view.prompt, promptBundleVersion: 99 as never }),
        (error: unknown) => error instanceof UnsupportedPromptBundleVersionError,
    );
});
