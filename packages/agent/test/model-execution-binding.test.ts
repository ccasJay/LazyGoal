import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter.js";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types.js";
import type { GoalModelSelection } from "../../runtime/src/domain.js";
import {
    createModelExecutionBinding,
    MutableModelBinding,
    ModelCapabilitiesError,
    CharacterModelInputEstimator,
} from "../src/index.js";
import { createInMemoryTrajectoryStore } from "./current-fixtures.js";

class FakeAdapter implements LLMAdapter {
    readonly structuredOutputMode = "strict" as const;
    readonly requests: LLMRequest[] = [];

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.requests.push(request);
        return { content: "{}" };
    }
}

class PromptOnlyAdapter implements LLMAdapter {
    readonly structuredOutputMode = "prompt_only" as const;

    async generate(): Promise<LLMResponse> {
        return { content: "{}" };
    }
}

function stageAdapters(decideAdapter: LLMAdapter) {
    return { thinkAdapter: new PromptOnlyAdapter(), decideAdapter };
}

test("createModelExecutionBinding: 成功构造 Token 模式完整绑定", () => {
    const trajectoryStore = createInMemoryTrajectoryStore();
    const adapter = new FakeAdapter();
    const selection: GoalModelSelection = {
        provider: "openai",
        modelId: "gpt-4o",
        structuredOutputMode: "strict",
        contextWindowTokens: 128_000,
        maxOutputTokens: 4096,
        inputEstimator: { kind: "token-encoding", encoding: "o200k_base" },
    };

    const binding = createModelExecutionBinding({
        generation: 1,
        selection,
        ...stageAdapters(adapter),
        trajectoryStore,
    });

    assert.equal(binding.generation, 1);
    assert.deepEqual(binding.selection, selection);
    assert.equal(binding.decideAdapter, adapter);
    assert.equal(binding.thinkAdapter.structuredOutputMode, "prompt_only");
    assert.ok(binding.modelCapabilities !== undefined);
    assert.equal(binding.modelCapabilities.contextWindowTokens, 128_000);
    assert.equal(binding.modelCapabilities.maxOutputTokens, 4096);
    assert.equal(binding.modelCapabilities.tokenEstimator.unit, "token");
    assert.equal(binding.modelContextPolicy.estimator.unit, "token");
    assert.ok(binding.trajectoryContextAssembler !== undefined);
    assert.ok(Object.isFrozen(binding));
});

test("createModelExecutionBinding: 成功构造字符兜底模式绑定", () => {
    const trajectoryStore = createInMemoryTrajectoryStore();
    const adapter = new FakeAdapter();
    const selection: GoalModelSelection = {
        provider: "openai-compatible",
        modelId: "custom-text",
        structuredOutputMode: "strict",
        inputEstimator: { kind: "character-v1" },
    };

    const binding = createModelExecutionBinding({
        generation: 2,
        selection,
        ...stageAdapters(adapter),
        trajectoryStore,
    });

    assert.equal(binding.generation, 2);
    assert.equal(binding.modelCapabilities, undefined);
    assert.equal(binding.modelContextPolicy.estimator.unit, "character");
});

test("需求 5.3: createModelExecutionBinding 允许不同历史模式或省略模式平滑构造，自适应兼容", () => {
    const trajectoryStore = createInMemoryTrajectoryStore();
    const adapter = new PromptOnlyAdapter(); // prompt_only
    const selection: GoalModelSelection = {
        provider: "openai",
        modelId: "gpt-4o",
        structuredOutputMode: "strict", // 历史 snapshot 可能残留 strict
        contextWindowTokens: 128_000,
        maxOutputTokens: 4096,
        inputEstimator: { kind: "token-encoding", encoding: "o200k_base" },
    };

    const binding = createModelExecutionBinding({
        generation: 1,
        selection,
        ...stageAdapters(adapter),
        trajectoryStore,
    });
    assert.equal(binding.generation, 1);
    assert.equal(binding.decideAdapter, adapter);
});

test("createModelExecutionBinding: 容量缺失或非法时拒绝构造", () => {
    const trajectoryStore = createInMemoryTrajectoryStore();
    const adapter = new FakeAdapter();

    // 缺少 contextWindowTokens
    assert.throws(() => {
        createModelExecutionBinding({
            generation: 1,
            selection: {
                provider: "openai",
                modelId: "gpt-4o",
                structuredOutputMode: "strict",
                maxOutputTokens: 4096,
                inputEstimator: { kind: "token-encoding", encoding: "o200k_base" },
            },
            ...stageAdapters(adapter),
            trajectoryStore,
        });
    }, (error: unknown) => error instanceof ModelCapabilitiesError);

    // maxOutputTokens >= contextWindowTokens
    assert.throws(() => {
        createModelExecutionBinding({
            generation: 1,
            selection: {
                provider: "openai",
                modelId: "gpt-4o",
                structuredOutputMode: "strict",
                contextWindowTokens: 4096,
                maxOutputTokens: 4096,
                inputEstimator: { kind: "token-encoding", encoding: "o200k_base" },
            },
            ...stageAdapters(adapter),
            trajectoryStore,
        });
    }, (error: unknown) => error instanceof ModelCapabilitiesError);

    // generation <= 0
    assert.throws(() => {
        createModelExecutionBinding({
            generation: 0,
            selection: {
                provider: "openai",
                modelId: "gpt-4o",
                structuredOutputMode: "strict",
                contextWindowTokens: 128_000,
                maxOutputTokens: 4096,
                inputEstimator: { kind: "token-encoding", encoding: "o200k_base" },
            },
            ...stageAdapters(adapter),
            trajectoryStore,
        });
    }, (error: unknown) => error instanceof RangeError);
});

test("MutableModelBinding: 候选创建、generation 隔离与同步发布", () => {
    const trajectoryStore = createInMemoryTrajectoryStore();
    const adapter1 = new FakeAdapter();
    const initialSelection: GoalModelSelection = {
        provider: "openai",
        modelId: "gpt-4o-mini",
        structuredOutputMode: "strict",
        contextWindowTokens: 128_000,
        maxOutputTokens: 4096,
        inputEstimator: { kind: "token-encoding", encoding: "o200k_base" },
    };

    const initialBinding = createModelExecutionBinding({
        generation: 1,
        selection: initialSelection,
        ...stageAdapters(adapter1),
        trajectoryStore,
    });

    const bindingManager = new MutableModelBinding(initialBinding);
    assert.equal(bindingManager.current().generation, 1);
    assert.equal(bindingManager.current().selection.modelId, "gpt-4o-mini");

    // 创建候选 Binding（generation 应为 2）
    const adapter2 = new FakeAdapter();
    const candidateSelection: GoalModelSelection = {
        provider: "openai",
        modelId: "gpt-4o",
        structuredOutputMode: "strict",
        contextWindowTokens: 128_000,
        maxOutputTokens: 8192,
        inputEstimator: { kind: "token-encoding", encoding: "o200k_base" },
    };

    const candidate = bindingManager.createCandidate({
        selection: candidateSelection,
        ...stageAdapters(adapter2),
        trajectoryStore,
    });
    assert.equal(candidate.generation, 2);
    assert.equal(candidate.selection.modelId, "gpt-4o");

    // 尚未 publish 时，current 保持不变
    assert.equal(bindingManager.current().generation, 1);
    assert.equal(bindingManager.current().selection.modelId, "gpt-4o-mini");

    // 候选构造失败测试（不合法的候选）不会破坏当前状态
    assert.throws(() => {
        bindingManager.createCandidate({
            selection: {
                ...candidateSelection,
                contextWindowTokens: 1000,
                maxOutputTokens: 2000, // 非法
            },
            ...stageAdapters(adapter2),
            trajectoryStore,
        });
    }, (error: unknown) => error instanceof ModelCapabilitiesError);
    assert.equal(bindingManager.current().generation, 1);

    // 发布候选
    bindingManager.publish(candidate);
    assert.equal(bindingManager.current().generation, 2);
    assert.equal(bindingManager.current().selection.modelId, "gpt-4o");

    // 试图发布 generation <= 当前 generation 的 binding 必须被拒绝
    assert.throws(() => {
        bindingManager.publish(initialBinding); // generation 1 <= 2
    }, (error: unknown) => error instanceof RangeError);
    assert.equal(bindingManager.current().generation, 2);
});
