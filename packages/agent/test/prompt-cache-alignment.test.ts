import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
import { createGoal } from "../../runtime/src/domain";
import type { Goal, StepRecord } from "../../runtime/src/domain";
import type { ToolDefinition } from "../../runtime/src/tool";
import { goalSnapshotCodec } from "../../storage/src/index";
import { createDefaultPromptBundleRenderer } from "../src/prompting/default-bundles";
import { buildStepRequest, buildPreparationRequest } from "../src/prompt";
import {
    currentProtocols,
    currentWorkingMemory,
    createInMemoryTrajectoryStore,
} from "./current-fixtures";
import {
    TrajectoryModelContextAssembler,
    createModelContextBudgetPolicy,
    DropOldestContextCompactor,
} from "../src/index";

const policy = createModelContextBudgetPolicy({ modelInputBudget: 100_000 });
const contextCompactor = new DropOldestContextCompactor();
const LOCATION_INPUT_CONTRACT = contract.object({ location: contract.string() });

function sha256(content: string): string {
    return createHash("sha256").update(content).digest("hex");
}

const profile = {
    id: "profile-test",
    name: "Cache Alignment Agent",
    systemPrompt: "你是一个支持前缀缓存对齐的执行代理。",
    instructions: ["读取环境最新状态", "执行动作并推进任务"],
    toolIds: ["navigate_to"],
};

const task = {
    objective: "完成前缀对齐验证",
    completionCriteria: [{ text: "根前缀完全固定" }, { text: "尾部增量最小化" }],
};

const tools: readonly ToolDefinition[] = [
    {
        id: "navigate_to",
        description: "移动到指定目标位置",
        inputContract: LOCATION_INPUT_CONTRACT,
    },
];

function createExecutingGoal(options: {
    readonly stepCount?: number;
    readonly lastStep?: StepRecord;
    readonly workflow?: Goal["state"]["workflow"];
} = {}): Goal {
    const goal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-cache-test",
        intent: "完成前缀对齐验证",
        profile,
        runId: "run-cache-1",
        messages: [
            { role: "user", content: "请帮我验证前缀缓存对齐" },
            {
                role: "assistant",
                assistant: { profileId: profile.id },
                content: "好的，我已经规划完毕，正在开始执行任务。",
            },
        ],
        maxSteps: 50,
    });

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: options.workflow ?? {
                phase: "executing",
                preparation: { status: "completed" },
                task,
            },
            run: {
                ...goal.state.run,
                status: "running",
                stepCount: options.stepCount ?? 0,
                ...(options.lastStep === undefined ? {} : { lastStep: options.lastStep }),
            },
        },
    };
}

test("同一 Goal 在 Executing 阶段连续执行 10 步，Goal-stable 根前缀 SHA-256 100% 完全相同", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const hashes: string[] = [];

    for (let step = 1; step <= 10; step++) {
        const previousStep: StepRecord = {
            kind: "action",
            action: {
                actionId: `action-${step - 1}`,
                toolId: "navigate_to",
                input: { location: `loc_${step}` },
            },
            observation: {
                kind: "success",
                output: { text: `成功到达 loc_${step}` },
                summary: `到达 loc_${step}`,
            },
        };
        const goal = createExecutingGoal({ stepCount: step, lastStep: previousStep });

        const trajectoryStore = createInMemoryTrajectoryStore();
        const assembler = new TrajectoryModelContextAssembler({ trajectoryStore, policy });

        const { request } = await buildStepRequest(
            goal,
            tools,
            renderer,
            contextCompactor,
            undefined,
            currentWorkingMemory,
            assembler,
        );

        const systemMessage = request.messages[0]!;
        assert.equal(systemMessage.role, "system");
        assert.match(systemMessage.content, /Approved Goal Task Contract:/);
        assert.match(systemMessage.content, /Objective: 完成前缀对齐验证/);
        assert.match(systemMessage.content, /- \[0\] 根前缀完全固定/);
        assert.match(systemMessage.content, /- \[1\] 尾部增量最小化/);

        hashes.push(sha256(systemMessage.content));
    }

    assert.equal(hashes.length, 10);
    const expectedHash = hashes[0]!;
    for (const hash of hashes) {
        assert.equal(hash, expectedHash, "每一步的 Goal-stable 根前缀 SHA-256 必须完全相同");
    }
});

test("同一 Epoch 内连续执行多步，Epoch-stable 会话前缀 SHA-256 100% 完全相同", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const hashes: string[] = [];

    for (let step = 1; step <= 5; step++) {
        const goal = createExecutingGoal({ stepCount: step });
        const trajectoryStore = createInMemoryTrajectoryStore();
        const assembler = new TrajectoryModelContextAssembler({ trajectoryStore, policy });

        const { request } = await buildStepRequest(
            goal,
            tools,
            renderer,
            contextCompactor,
            undefined,
            currentWorkingMemory,
            assembler,
        );

        // messages.slice(1, -1) 是会话历史（Epoch-stable 前缀）
        const conversationMessages = request.messages.slice(1, -1);
        assert.equal(conversationMessages.length, 3);
        hashes.push(sha256(JSON.stringify(conversationMessages)));
    }

    assert.equal(hashes.length, 5);
    const expectedHash = hashes[0]!;
    for (const hash of hashes) {
        assert.equal(hash, expectedHash, "同一 Epoch 内的 Conversation 前缀必须完全一致");
    }
});

test("尾部 Step-dynamic 控制消息精简为纯增量，彻底剥离 intent、task、budget 与静态 contextEpoch", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const goal = createExecutingGoal({ stepCount: 3 });
    const trajectoryStore = createInMemoryTrajectoryStore();
    const assembler = new TrajectoryModelContextAssembler({ trajectoryStore, policy });

    const { request } = await buildStepRequest(
        goal,
        tools,
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        assembler,
    );

    const lastMessage = request.messages.at(-1)!;
    assert.equal(lastMessage.role, "user");
    const payload = JSON.parse(lastMessage.content);

    assert.equal(payload.phase, "executing");
    assert.equal(payload.execution.stepCount, 3);
    assert.equal("intent" in payload, false, "不能在尾部重复序列化 intent");
    assert.equal("task" in payload, false, "不能在尾部重复序列化 task");
    assert.equal("contextEpoch" in payload, false, "不能在尾部序列化静态 contextEpoch");
    assert.equal("responseShapeGuide" in payload, false, "strict 模式默认不注入 responseShapeGuide");
    if (payload.trajectoryContext) {
        assert.equal("budget" in payload.trajectoryContext, false, "不能在尾部泄露内部 budget 报告");
    }
});

test("prompt-only 模式仅在尾部动态消息末尾注入 Shape Guide，Goal-stable 与 Epoch-stable 前缀完全保持固定", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const goalHashes: string[] = [];
    const epochHashes: string[] = [];

    for (let step = 1; step <= 5; step++) {
        const goal = createExecutingGoal({ stepCount: step });
        const trajectoryStore = createInMemoryTrajectoryStore();
        const assembler = new TrajectoryModelContextAssembler({ trajectoryStore, policy });

        const { request } = await buildStepRequest(
            goal,
            tools,
            renderer,
            contextCompactor,
            undefined,
            currentWorkingMemory,
            assembler,
            undefined,
            undefined,
            "prompt_only",
        );

        // 1. Goal-stable 根前缀 (system 消息)
        goalHashes.push(sha256(request.messages[0]!.content));

        // 2. Epoch-stable 会话前缀
        const conversationMessages = request.messages.slice(1, -1);
        epochHashes.push(sha256(JSON.stringify(conversationMessages)));

        // 3. 尾部动态控制消息
        const lastMessage = request.messages.at(-1)!;
        assert.equal(lastMessage.role, "user");
        const payload = JSON.parse(lastMessage.content);
        assert.equal(typeof payload.responseShapeGuide, "string");
        assert.match(payload.responseShapeGuide, /Respond with a JSON object conforming to the following schema:/);
        assert.match(payload.responseShapeGuide, /"result"/);
    }

    // 验证前缀稳定完全一致
    assert.equal(goalHashes.length, 5);
    const expectedGoalHash = goalHashes[0]!;
    for (const h of goalHashes) {
        assert.equal(h, expectedGoalHash, "prompt_only 模式下 Goal-stable 根前缀 SHA-256 必须 100% 完全相同");
    }

    assert.equal(epochHashes.length, 5);
    const expectedEpochHash = epochHashes[0]!;
    for (const h of epochHashes) {
        assert.equal(h, expectedEpochHash, "prompt_only 模式下 Epoch-stable 会话前缀 SHA-256 必须 100% 完全相同");
    }
});

test("从已持久化的 Goal Snapshot 恢复后生成的 LLM 请求完全幂等", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const lastStep: StepRecord = {
        kind: "action",
        action: {
            actionId: "act_prev",
            toolId: "navigate_to",
            input: { location: "checkpoint_room" },
        },
        observation: {
            kind: "success",
            output: { text: "已进入检查点房间" },
            summary: "到达检查点房间",
        },
    };
    const originalGoal = createExecutingGoal({ stepCount: 5, lastStep });

    const trajectoryStore = createInMemoryTrajectoryStore();
    const assembler = new TrajectoryModelContextAssembler({ trajectoryStore, policy });

    // 恢复前构建请求
    const planBefore = await buildStepRequest(
        originalGoal,
        tools,
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        assembler,
    );

    // 模拟持久化到 Snapshot 并从 Snapshot 恢复
    const snapshot = goalSnapshotCodec.encode(originalGoal);
    const restoredGoal = goalSnapshotCodec.decode(snapshot);

    // 恢复后构建请求
    const planAfter = await buildStepRequest(
        restoredGoal,
        tools,
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        assembler,
    );

    // 断言请求消息完全相同且逐字节幂等
    assert.deepStrictEqual(planBefore.request.messages, planAfter.request.messages);
    assert.equal(planBefore.bundle.name, planAfter.bundle.name);
});

test("阶段切换与跨 Epoch 演化时，前缀按需更新并在新阶段中恢复连续哈希稳定性", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const trajectoryStore = createInMemoryTrajectoryStore();
    const assembler = new TrajectoryModelContextAssembler({ trajectoryStore, policy });

    // 1. Planning 阶段：无任务契约
    const planningGoal = createExecutingGoal({
        stepCount: 0,
        workflow: {
            phase: "planning",
            preparation: { status: "active" },
        },
    });
    const planningPlan = await buildPreparationRequest(
        planningGoal,
        tools,
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        assembler,
    );
    assert.match(planningPlan.request.messages[0]!.content, /Active Phase Protocol: planning/);
    assert.doesNotMatch(planningPlan.request.messages[0]!.content, /Approved Goal Task Contract:/);

    // 2. 进入 Executing 阶段后，注入 Task 契约
    const executingGoal1 = createExecutingGoal({ stepCount: 1 });
    const executingPlan1 = await buildStepRequest(
        executingGoal1,
        tools,
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        assembler,
    );
    assert.match(executingPlan1.request.messages[0]!.content, /Active Phase Protocol: executing/);
    assert.match(executingPlan1.request.messages[0]!.content, /Approved Goal Task Contract:/);

    // 3. 进入 Executing 阶段的后续步，哈希保持一致
    const executingGoal2 = createExecutingGoal({ stepCount: 2 });
    const executingPlan2 = await buildStepRequest(
        executingGoal2,
        tools,
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        assembler,
    );
    assert.equal(
        sha256(executingPlan1.request.messages[0]!.content),
        sha256(executingPlan2.request.messages[0]!.content),
    );
});
