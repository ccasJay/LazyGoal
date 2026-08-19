import assert from "node:assert/strict";
import { test } from "node:test";

import {
    AGENT_DECISION_PROTOCOL,
    PREPARATION_RESULT_PROTOCOL,
} from "../src/model-inference-view";
import type {
    ModelInferenceView,
    ModelProfileView,
    ModelToolDefinition,
    ModelWorkingContext,
} from "../src/model-inference-view";
import {
    renderRequest,
    renderWorkingContextMessage,
} from "../src/render";

const profile: ModelProfileView = {
    id: "profile-1",
    name: "示例 Profile",
    systemPrompt: "你是一个严谨的执行代理。",
    instructions: ["先检查输入", "再给出下一步"],
};

const conversation: ModelInferenceView["conversation"] = [
    { role: "user", content: "补充的真实输入" },
    {
        role: "assistant",
        assistant: { profileId: "profile-1" },
        content: "真实响应",
    },
];

const readFileTool: ModelToolDefinition = {
    id: "read_file",
    description: "读取工作区内文本文件",
    inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
    },
};

/**
 * 字符级 System 消息 fixture：按 Profile → Instructions → 协议 → 授权 Tool
 * 的固定顺序组装，分隔符与 Tool JSON 缩进固定。
 */
function expectedSystemMessage(
    protocol: string,
    tools: readonly ModelToolDefinition[],
): { readonly role: "system"; readonly content: string } {
    return {
        role: "system",
        content: [
            profile.systemPrompt,
            "Instructions:\n1. 先检查输入\n2. 再给出下一步",
            protocol,
        ].join("\n\n")
            + "\n\n"
            + "Authorized Tool definitions (only these Tool IDs may be requested):\n"
            + JSON.stringify(tools, null, 2),
    };
}

function expectedMessages(
    protocol: string,
    workingContext: ModelWorkingContext,
    tools: readonly ModelToolDefinition[],
): Array<{
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
}> {
    return [
        expectedSystemMessage(protocol, tools),
        ...conversation.map((message) => ({
            role: message.role,
            content: message.content,
        })),
        { role: "user", content: JSON.stringify(workingContext, null, 2) },
    ];
}

test("gathering_context 请求按固定角色、内容与顺序渲染", () => {
    const workingContext: ModelWorkingContext = {
        phase: "gathering_context",
        intent: "完成示例任务",
    };
    const view: ModelInferenceView = {
        protocol: "gathering_context",
        profile,
        conversation,
        workingContext,
        authorizedTools: [],
    };

    assert.deepEqual(renderRequest(view), {
        messages: expectedMessages(
            PREPARATION_RESULT_PROTOCOL.gathering_context,
            workingContext,
            [],
        ),
    });
    assert.equal(
        renderRequest(view).messages[0]?.role,
        "system",
    );
    assert.equal(renderRequest(view).messages[1]?.role, "user");
    assert.equal(renderRequest(view).messages[2]?.role, "assistant");
    assert.equal(renderRequest(view).messages[3]?.role, "user");
});

test("planning 请求按固定角色、内容与顺序渲染", () => {
    const workingContext: ModelWorkingContext = {
        phase: "planning",
        intent: "完成示例任务",
    };
    const view: ModelInferenceView = {
        protocol: "planning",
        profile,
        conversation,
        workingContext,
        authorizedTools: [],
    };

    assert.deepEqual(renderRequest(view), {
        messages: expectedMessages(
            PREPARATION_RESULT_PROTOCOL.planning,
            workingContext,
            [],
        ),
    });
});

test("executing 请求固定使用 AgentDecision 协议与授权 Tool 的字符级内容", () => {
    const workingContext: ModelWorkingContext = {
        phase: "executing",
        intent: "完成示例任务",
        task: {
            objective: "实现三阶段上下文",
            completionCriteria: ["请求顺序稳定", "控制消息不持久化"],
        },
        execution: {
            stepCount: 2,
            maxSteps: 4,
            checkpoint: "已吸收 README 内容",
            previousStep: {
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
            },
            pendingAction: {
                action: {
                    actionId: "action-2",
                    toolId: "read_file",
                    input: { path: "package.json" },
                },
                status: "approved",
            },
        },
    };
    const view: ModelInferenceView = {
        protocol: "agent_decision",
        profile,
        conversation,
        workingContext,
        authorizedTools: [readFileTool],
    };

    assert.deepEqual(renderRequest(view), {
        messages: expectedMessages(
            AGENT_DECISION_PROTOCOL,
            workingContext,
            [readFileTool],
        ),
    });
});

test("renderWorkingContextMessage 逐字符固定为 JSON 控制的 user 消息", () => {
    const workingContext: ModelWorkingContext = {
        phase: "gathering_context",
        intent: "完成示例任务",
    };

    assert.deepEqual(renderWorkingContextMessage(workingContext), {
        role: "user",
        content: JSON.stringify(workingContext, null, 2),
    });
});