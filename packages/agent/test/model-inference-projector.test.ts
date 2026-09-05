import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
import {
    BASH_INPUT_CONTRACT,
    BASH_MAX_TIMEOUT_MS,
    BASH_TOOL_ID,
    BashTool,
    EDIT_FILE_INPUT_CONTRACT,
    EDIT_FILE_TOOL_ID,
    EditFileTool,
    GREP_INPUT_CONTRACT,
    GREP_TOOL_ID,
    GrepTool,
    READ_FILE_INPUT_CONTRACT,
    READ_FILE_TOOL_ID,
    ReadFileTool,
    WRITE_FILE_INPUT_CONTRACT,
    WRITE_FILE_TOOL_ID,
    WriteFileTool,
} from "../../tools/src/index";
import {
    ALFWORLD_RESET_INPUT_CONTRACT,
    ALFWORLD_RESET_TOOL_ID,
    ALFWORLD_STEP_INPUT_CONTRACT,
    ALFWORLD_STEP_TOOL_ID,
} from "../../../benchmarks/alfworld/src/alfworld-tools";
import type { AgentProfile } from "../../runtime/src/agent-profile";
import { createEmptyWorkingMemory, createGoal } from "../../runtime/src/domain";
import type {
    Goal,
    GoalMessage,
    PendingAction,
    StepRecord,
    WorkingMemory,
} from "../../runtime/src/domain";
import type { ToolDefinition } from "../../runtime/src/tool";
import { computeContentHash } from "../../runtime/src/trajectory";
import { currentProtocols, currentWorkingMemory } from "./current-fixtures";
import { ModelInferenceProjector } from "../src/model-inference-projector";

const intent = "完成示例任务";
const task = {
    objective: "实现三阶段上下文",
    completionCriteria: ["请求顺序稳定", "控制消息不持久化"],
};
const profile: AgentProfile = {
    id: "profile-1",
    name: "示例 Profile",
    description: "项目测试用 Profile",
    systemPrompt: "你是一个严谨的执行代理。",
    instructions: ["先检查输入", "再给出下一步"],
    toolIds: ["read_file"],
};

const projector = new ModelInferenceProjector();
const PATH_INPUT_CONTRACT = contract.object({ path: contract.string() });

const CURRENT_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
    {
        id: BASH_TOOL_ID,
        description: "在 workspaceRoot 内以 bash 执行命令并返回截断后的 stdout/stderr",
        inputContract: BASH_INPUT_CONTRACT,
    },
    {
        id: READ_FILE_TOOL_ID,
        description: "读取 workspaceRoot 内的 UTF-8 文本文件",
        inputContract: READ_FILE_INPUT_CONTRACT,
    },
    {
        id: WRITE_FILE_TOOL_ID,
        description: "写入 workspaceRoot 内的 UTF-8 文本文件（覆盖已有内容）",
        inputContract: WRITE_FILE_INPUT_CONTRACT,
    },
    {
        id: EDIT_FILE_TOOL_ID,
        description: "对 workspaceRoot 内的 UTF-8 文本文件执行唯一匹配的字符串替换",
        inputContract: EDIT_FILE_INPUT_CONTRACT,
    },
    {
        id: GREP_TOOL_ID,
        description: "在 workspaceRoot 内按正则搜索文本文件并返回带行号的匹配行",
        inputContract: GREP_INPUT_CONTRACT,
    },
    {
        id: ALFWORLD_RESET_TOOL_ID,
        description: "初始化固定 ALFWorld TextWorld 任务会话",
        inputContract: ALFWORLD_RESET_INPUT_CONTRACT,
    },
    {
        id: ALFWORLD_STEP_TOOL_ID,
        description: "向活动 ALFWorld TextWorld 会话提交一条命令",
        inputContract: ALFWORLD_STEP_INPUT_CONTRACT,
    },
];

function createPreparationGoal(
    phase: "gathering_context" | "planning" = "gathering_context",
    messages: readonly GoalMessage[] = [],
): Goal {
    const goal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-1",
        intent,
        profile,
        messages,
        runId: "run-1",
    });

    if (phase === "gathering_context") return goal;

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "planning",
                preparation: { status: "active" },
            },
        },
    };
}

function createExecutingGoal(options: {
    readonly maxSteps?: number;
    readonly messages?: readonly GoalMessage[];
    readonly stepCount?: number;
    readonly previousStep?: StepRecord;
    readonly pendingAction?: PendingAction;
} = {}): Goal {
    const goal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-1",
        intent,
        profile,
        runId: "run-1",
        ...(options.messages === undefined ? {} : { messages: options.messages }),
        ...(options.maxSteps === undefined ? {} : { maxSteps: options.maxSteps }),
    });

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task,
            },
            run: {
                ...goal.state.run,
                status: "running",
                stepCount: options.stepCount ?? 0,
                ...(options.previousStep === undefined
                    ? {}
                    : { lastStep: options.previousStep }),
                ...(options.pendingAction === undefined
                    ? {}
                    : { pendingAction: options.pendingAction }),
            },
        },
    };
}

function toolDefinition(id = "read_file"): ToolDefinition {
    return {
        id,
        description: "读取工作区内文本文件",
        inputContract: PATH_INPUT_CONTRACT,
    };
}

function project(
    goal: Goal,
    tools: readonly ToolDefinition[] = [],
    memory: WorkingMemory = currentWorkingMemory,
) {
    return projector.project(goal, tools, memory);
}

function assertNoContractAst(value: unknown, path: string): void {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => assertNoContractAst(entry, `${path}[${index}]`));
        return;
    }

    if (value === null || typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    assert.equal("kind" in record, false, `${path} 泄漏了 Contract AST`);
    for (const [key, child] of Object.entries(record)) {
        assertNoContractAst(child, `${path}.${key}`);
    }
}

function assertPortableSchema(schema: Record<string, unknown>, path: string): void {
    assert.equal("$ref" in schema, false, `${path} 不应包含递归引用`);
    assert.equal("$defs" in schema, false, `${path} 不应包含递归定义`);
    assert.equal("pattern" in schema, false, `${path} 不应包含供应商相关 pattern`);

    if (schema.type === "object") {
        assert.equal(
            schema.additionalProperties,
            false,
            `${path} 必须是 strict object，而不是开放 record`,
        );
    }

    const properties = schema.properties;
    if (properties !== null && typeof properties === "object" && !Array.isArray(properties)) {
        for (const [key, child] of Object.entries(properties)) {
            assertPortableSchema(child as Record<string, unknown>, `${path}.properties.${key}`);
        }
    }

    if (schema.items !== null && typeof schema.items === "object" && !Array.isArray(schema.items)) {
        assertPortableSchema(schema.items as Record<string, unknown>, `${path}.items`);
    }

    for (const unionKey of ["anyOf", "oneOf", "allOf"] as const) {
        const branches = schema[unionKey];
        if (Array.isArray(branches)) {
            branches.forEach((branch, index) => {
                if (branch !== null && typeof branch === "object") {
                    assertPortableSchema(branch as Record<string, unknown>, `${path}.${unionKey}[${index}]`);
                }
            });
        }
    }
}

test("Projector 按阶段投影当前 PromptContext、Conversation 与 Working Context", () => {
    for (const phase of ["gathering_context", "planning"] as const) {
        const view = project(createPreparationGoal(phase, [
            {
                role: "assistant",
                assistant: { profileId: "profile-1" },
                content: "已记录的问题",
            },
        ]));

        assert.deepEqual(Object.keys(view).sort(), [
            "contextEpoch",
            "conversation",
            "prompt",
            "workingContext",
            "workingMemory",
        ].sort());
        assert.equal(view.prompt.promptBundleVersion, 1);
        assert.deepEqual(view.prompt.memoryProtocol, currentProtocols.memoryProtocol);
        assert.deepEqual(view.prompt.modelContextProtocol, currentProtocols.modelContextProtocol);
        assert.deepEqual(view.prompt.contextRetrievalProtocol, currentProtocols.contextRetrievalProtocol);
        assert.equal(view.prompt.phase, phase);
        assert.equal(view.prompt.profile.id, "profile-1");
        assert.deepEqual(view.workingContext, { phase, intent });
        assert.deepEqual(view.workingMemory, currentWorkingMemory);
        assert.equal(view.contextEpoch.epochNumber, 0);
    }
});

test("Projector 只投影 executing 阶段的任务与有界执行记忆", () => {
    const previousStep: StepRecord = {
        kind: "action",
        action: {
            actionId: "action-1",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        observation: {
            kind: "success",
            output: "完成",
            summary: "已读取 README.md",
        },
    };
    const pendingAction: PendingAction = {
        action: {
            actionId: "action-2",
            toolId: "read_file",
            input: { path: "package.json" },
        },
        status: "approved",
    };
    const view = project(createExecutingGoal({
        maxSteps: 4,
        stepCount: 1,
        previousStep,
        pendingAction,
    }), [toolDefinition()]);

    assert.equal(view.prompt.phase, "executing");
    assert.deepEqual(view.conversation, [{
        role: "user",
        content: intent,
        sourceMessageIndex: 0,
    }]);
    assert.deepEqual(view.workingContext, {
        phase: "executing",
        intent,
        task,
        execution: {
            stepCount: 1,
            maxSteps: 4,
            previousStep,
            pendingAction,
        },
    });
    assert.deepEqual(view.prompt.authorizedTools[0], {
        id: "read_file",
        description: "读取工作区内文本文件",
        inputSchema: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
            additionalProperties: false,
        },
    });
});

test("Projector 投影结果与 Runtime Goal 不共享可变对象", () => {
    const previousStep: StepRecord = {
        kind: "decision",
        result: {
            kind: "wait",
            reason: "等待补充信息",
        },
    };
    const goal = createExecutingGoal({
        maxSteps: 4,
        stepCount: 1,
        previousStep,
    });
    const view = project(goal, [toolDefinition()]);

    assert.notStrictEqual(view.prompt.profile, goal.definition.profile);
    assert.notStrictEqual(view.conversation, goal.state.messages);
    assert.notStrictEqual(view.workingMemory, currentWorkingMemory);
    assert.notStrictEqual(view.workingContext, goal.state.workflow);
    assert.notStrictEqual(view.workingContext.phase === "executing"
        ? view.workingContext.execution.previousStep
        : undefined, previousStep);
});

test("Projector 递归冻结模型输入 DTO", () => {
    const view = project(createExecutingGoal(), [toolDefinition()]);

    assert.ok(Object.isFrozen(view.prompt));
    assert.ok(Object.isFrozen(view.prompt.profile));
    assert.ok(Object.isFrozen(view.prompt.profile.instructions));
    assert.ok(Object.isFrozen(view.prompt.authorizedTools));
    assert.ok(Object.isFrozen(view.prompt.authorizedTools[0]?.inputSchema));
    assert.ok(Object.isFrozen(view.workingMemory));
    assert.ok(Object.isFrozen(view.contextEpoch));
});

test("Projector 按 Tool ID 代码单元顺序升序排序并拒绝重复 ID", () => {
    const view = project(createExecutingGoal(), [
        toolDefinition("zebra"),
        toolDefinition("apple"),
        toolDefinition("mango"),
    ]);
    assert.deepEqual(
        view.prompt.authorizedTools.map((tool) => tool.id),
        ["apple", "mango", "zebra"],
    );

    assert.throws(
        () => project(createExecutingGoal(), [toolDefinition(), toolDefinition()]),
        /重复的 Tool ID：read_file/,
    );
});

test("Projector 从七个当前 Contract 生成稳定且可移植的模型 Schema", () => {
    const first = project(createExecutingGoal(), CURRENT_TOOL_DEFINITIONS)
        .prompt.authorizedTools;
    const second = project(
        createExecutingGoal(),
        [...CURRENT_TOOL_DEFINITIONS].reverse(),
    ).prompt.authorizedTools;

    assert.deepEqual(first.map(({ id, inputSchema }) => ({ id, inputSchema })), [
        {
            id: ALFWORLD_RESET_TOOL_ID,
            inputSchema: {
                type: "object",
                properties: {},
                additionalProperties: false,
            },
        },
        {
            id: ALFWORLD_STEP_TOOL_ID,
            inputSchema: {
                type: "object",
                properties: { command: { type: "string" } },
                required: ["command"],
                additionalProperties: false,
            },
        },
        {
            id: BASH_TOOL_ID,
            inputSchema: {
                type: "object",
                properties: {
                    command: { type: "string" },
                    timeoutMs: {
                        type: "integer",
                        minimum: 1,
                        maximum: BASH_MAX_TIMEOUT_MS,
                    },
                },
                required: ["command"],
                additionalProperties: false,
            },
        },
        {
            id: EDIT_FILE_TOOL_ID,
            inputSchema: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    oldString: { type: "string" },
                    newString: { type: "string" },
                },
                required: ["path", "oldString", "newString"],
                additionalProperties: false,
            },
        },
        {
            id: GREP_TOOL_ID,
            inputSchema: {
                type: "object",
                properties: {
                    pattern: { type: "string" },
                    path: { type: "string" },
                    ignoreCase: { type: "boolean" },
                },
                required: ["pattern"],
                additionalProperties: false,
            },
        },
        {
            id: READ_FILE_TOOL_ID,
            inputSchema: {
                type: "object",
                properties: { path: { type: "string" } },
                required: ["path"],
                additionalProperties: false,
            },
        },
        {
            id: WRITE_FILE_TOOL_ID,
            inputSchema: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    content: { type: "string" },
                },
                required: ["path", "content"],
                additionalProperties: false,
            },
        },
    ]);
    assert.equal(JSON.stringify(first), JSON.stringify(second));

    for (const [index, tool] of first.entries()) {
        const source = CURRENT_TOOL_DEFINITIONS.find(({ id }) => id === tool.id);
        assert.ok(source !== undefined);
        assert.deepEqual(Object.keys(tool).sort(), ["description", "id", "inputSchema"]);
        assert.notStrictEqual(tool.inputSchema, source.inputContract);
        assert.notStrictEqual(tool.inputSchema, second[index]?.inputSchema);

        const schema = tool.inputSchema as Record<string, unknown>;
        assert.equal("$schema" in schema, false);
        assertNoContractAst(schema, `${tool.id}[${index}]`);
        assertPortableSchema(schema, `${tool.id}[${index}]`);
    }
});

test("Projector 不修改 Goal 且不泄漏 Snapshot 或瞬时资源字段", () => {
    const goal = createExecutingGoal({
        maxSteps: 4,
        stepCount: 2,
        previousStep: {
            kind: "decision",
            result: {
                kind: "complete",
                summary: "结束",
                completionEvidence: [{ criterionIndex: 0, evidenceSequences: [1] }],
            },
        },
    });
    const before = JSON.stringify(goal);
    const view = project(goal);

    assert.equal(JSON.stringify(goal), before);
    assert.equal("schemaVersion" in view, false);
    assert.equal("metadata" in view, false);
    assert.equal("runId" in view.prompt, false);
    assert.equal("status" in view.workingContext, false);
    assert.equal("stopReason" in view.workingContext, false);
});

test("Projector 对非可推理状态保持前置条件错误", () => {
    const gathering = createPreparationGoal();
    const waiting: Goal = {
        ...gathering,
        state: {
            ...gathering.state,
            workflow: {
                phase: "gathering_context",
                preparation: { status: "waiting_input" },
            },
        },
    };
    const executing = createExecutingGoal();
    const created: Goal = {
        ...executing,
        state: {
            ...executing.state,
            run: { ...executing.state.run, status: "created" },
        },
    };

    assert.throws(() => project(waiting), /active preparation/);
    assert.throws(() => project(created), /running executing/);
});

test("Projector 投影并冻结 structured@1 Working Memory", () => {
    const memory: WorkingMemory = {
        ...createEmptyWorkingMemory(12, { eventId: "patch-12", sequence: 12 }),
        facts: [{
            id: "fact-1",
            kind: "fact",
            subject: "配置文件",
            predicate: "存在",
            value: true,
            stability: "stable",
            evidenceSequences: [10],
            reinforcementCount: 1,
            lastEvidenceSequence: 10,
            source: "tool_projector",
            originPhase: "gathering_context",
            originSequence: 12,
            scope: "goal",
            updatedAtSequence: 12,
        }],
    };
    const view = project(createPreparationGoal(), [], memory);

    assert.deepEqual(view.workingMemory, memory);
    assert.notStrictEqual(view.workingMemory, memory);
    assert.ok(Object.isFrozen(view.workingMemory));
    assert.throws(
        () => projector.project(createPreparationGoal(), [], undefined),
        /requires a WorkingMemory projection/,
    );
});

test("Projector 投影当前 bm25-lite@1 的历史 Lookup Result", () => {
    const goal = createPreparationGoal();
    const result = {
        status: "found" as const,
        lookupId: "lookup-1",
        committedThroughSequence: 4,
        matches: [{
            documentId: "doc-1",
            goalId: goal.id,
            runId: goal.state.run.id,
            firstSequence: 3,
            lastSequence: 4,
            matchedFields: ["path" as const],
            score: 2,
            preview: "src/config.ts",
            truncated: false,
            historical: true as const,
            sourceEventIds: ["event-3"],
        }],
        truncated: false,
    };
    const view = projector.project(
        goal,
        [],
        currentWorkingMemory,
        undefined,
        result,
    );

    assert.equal(view.contextLookupResult?.status, "found");
    assert.equal(view.contextLookupResult?.lookupId, "lookup-1");
    assert.equal(view.contextLookupResult?.freshness.kind, "historical");
    assert.ok(Object.isFrozen(view.contextLookupResult));
    assert.notStrictEqual(view.contextLookupResult, result);
});

test("Projector 保留 Conversation 原始索引并投影 Preparation provenance", () => {
    const goal = createPreparationGoal("planning", [
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "已记录约束",
        },
        { role: "user", content: "只使用 PostgreSQL" },
    ]);
    const evidence = [{
        sequence: 7,
        messageIndex: 2,
        contentHash: computeContentHash("只使用 PostgreSQL"),
    }] as const;

    const view = projector.project(
        goal,
        [],
        currentWorkingMemory,
        undefined,
        undefined,
        evidence,
    );

    assert.deepEqual(view.conversation, [
        { role: "user", content: intent, sourceMessageIndex: 0 },
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "已记录约束",
            sourceMessageIndex: 1,
        },
        { role: "user", content: "只使用 PostgreSQL", sourceMessageIndex: 2 },
    ]);
    assert.deepEqual(view.preparationInputEvidence, evidence);
    assert.notStrictEqual(view.preparationInputEvidence, evidence);
    assert.ok(Object.isFrozen(view.preparationInputEvidence));
    assert.equal("content" in (view.preparationInputEvidence?.[0] ?? {}), false);
});

test("Projector 在 executing 阶段拒绝任何 Preparation provenance 字段", () => {
    assert.throws(
        () => projector.project(
            createExecutingGoal(),
            [],
            currentWorkingMemory,
            undefined,
            undefined,
            [],
        ),
        /Preparation input evidence requires a preparation phase/,
    );
});

test("Projector 在遇到无效 Tool Contract 时快速抛出异常", () => {
    const invalidTool: ToolDefinition = {
        id: "invalid_tool",
        description: "无效工具",
        inputContract: {
            kind: "unknown_kind" as any,
        } as any,
    };

    assert.throws(
        () => project(createExecutingGoal(), [invalidTool]),
    );
});

test("Projector 确保 View 与外部输入完全隔离且子对象不可变", () => {
    const tools = [toolDefinition()];
    const view = project(createExecutingGoal(), tools);

    tools.push(toolDefinition("extra_tool"));
    assert.equal(view.prompt.authorizedTools.length, 1);

    const toolSchema = view.prompt.authorizedTools[0]?.inputSchema as Record<string, any>;
    assert.ok(Object.isFrozen(toolSchema));
    assert.ok(Object.isFrozen(toolSchema.properties));
    assert.ok(Object.isFrozen(toolSchema.properties.path));
    assert.ok(Object.isFrozen(toolSchema.required));

    assert.throws(
        () => {
            toolSchema.properties.newProp = { type: "string" };
        },
        /Cannot add property newProp|read only/,
    );
});

test("五类实际通用 Tool 实例的 definition 与 CURRENT_TOOL_DEFINITIONS 完全一致", () => {
    const instances: readonly ToolDefinition[] = [
        new BashTool("/workspace").definition,
        new ReadFileTool("/workspace").definition,
        new WriteFileTool("/workspace").definition,
        new EditFileTool("/workspace").definition,
        new GrepTool("/workspace").definition,
    ];

    for (const inst of instances) {
        const found = CURRENT_TOOL_DEFINITIONS.find((t) => t.id === inst.id);
        assert.ok(found !== undefined, `未找到工具 ${inst.id}`);
        assert.equal(inst.description, found.description);
        assert.strictEqual(inst.inputContract, found.inputContract);
    }
});
