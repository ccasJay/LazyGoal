import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { PromptContext } from "../src/model-inference-view";
import {
    createDefaultPromptBundleRenderer,
    DEFAULT_PROMPT_BUNDLE_MANIFEST,
    DEFAULT_PROMPT_TEMPLATE_ASSETS,
} from "../src/prompting/default-bundles";
import { normalizeNewlines } from "../src/prompting/environment";
import { createPromptBundleRenderer } from "../src/prompting/renderer";
import type { PromptTemplateDefinition } from "../src/prompting/types";

const GLOBAL_OVERVIEW = [
    "Global Overview:",
    "You are operating inside LazyGoal, a goal-driven and resumable agent runtime.",
    "LazyGoal turns user intent into an approved task through gathering_context and planning, then advances it through a controlled executing phase.",
    "Use the active Phase Protocol to determine the current responsibility and required response format.",
    "This Global Overview and the active Phase Protocol take precedence over the frozen Profile.",
    "Follow the frozen Profile for role-specific behavior, domain guidance, and working style when it does not conflict with those higher-level instructions.",
    "Treat the supplied conversation, Working Context, and Authorized Tool definitions as the inputs for the current turn.",
].join("\n");

const PROFILE_FRAGMENT = [
    "Profile System Prompt:",
    "SYS",
    "",
    "Profile Instructions:",
    "1. a",
    "2. b",
].join("\n");

const TOOLS_FRAGMENT = [
    "Authorized Tool definitions (only these Tool IDs may be requested):",
    "[\n  {\n    \"description\": \"d\",\n    \"id\": \"t1\",\n    \"inputSchema\": {}\n  }\n]",
].join("\n");

const GATHERING_PROTOCOL = [
    "Active Phase Protocol:",
    "只返回一个 JSON 对象，不要使用 Markdown 代码块或附加说明。",
    "允许的形状为 {\"kind\":\"question\",\"question\":\"非空文本\"} 或",
    "{\"kind\":\"context_ready\"}。",
    "不要返回任务提案或执行结果。",
].join("\n");

const PLANNING_PROTOCOL = [
    "Active Phase Protocol:",
    "只返回一个 JSON 对象，不要使用 Markdown 代码块或附加说明。",
    "唯一允许的形状为 {\"kind\":\"task_proposal\",\"task\":",
    "{\"objective\":\"非空文本\",\"completionCriteria\":[\"非空文本\"]},",
    "\"approvalRequest\":\"非空文本\"}。",
    "不要返回问题、context_ready 或执行结果。",
].join("\n");

const AGENT_DECISION_PROTOCOL = [
    "Active Phase Protocol:",
    "只返回一个 JSON 对象，不要使用 Markdown 代码块或附加说明。",
    "输出必须符合 AgentDecision 协议，只能选择以下四个 kind 分支。",
    "Tool 调用形状为 {\"kind\":\"tool_call\",\"checkpoint\":\"累计状态\",",
    "\"action\":{\"actionId\":\"稳定 ID\",\"toolId\":\"授权 Tool ID\",\"input\":对象}}。",
    "结束形状为 {\"kind\":\"complete|wait|fail\",\"checkpoint\":\"累计状态\",",
    "\"summary|reason|error\":\"非空文本\"}，字段名必须与 kind 匹配。",
    "checkpoint、actionId、toolId 和对应文本字段必须是非空字符串。",
    "不要自行声明 Tool 的执行结果；必须等待 Runtime 提供 Observation。",
].join("\n");

function buildContext(phase: PromptContext["phase"]): PromptContext {
    return {
        promptBundleVersion: 1,
        phase,
        profile: {
            id: "profile-1",
            systemPrompt: "SYS",
            instructions: ["a", "b"],
        },
        authorizedTools: [
            { id: "t1", description: "d", inputSchema: {} },
        ],
    };
}

async function loadAllAssets(): Promise<PromptTemplateDefinition[]> {
    return Promise.all(
        DEFAULT_PROMPT_TEMPLATE_ASSETS.map(async (asset) => ({
            id: asset.id,
            source: normalizeNewlines(
                await readFile(fileURLToPath(asset.sourceUrl), "utf8"),
            ),
        })),
    );
}

test("默认 Bundle 对三个 Phase 产生字符级稳定且顺序固定的 system 内容", async () => {
    const renderer = await createDefaultPromptBundleRenderer();

    const gathering = renderer.render(buildContext("gathering_context"));
    const planning = renderer.render(buildContext("planning"));
    const executing = renderer.render(buildContext("executing"));

    assert.equal(
        gathering,
        [GLOBAL_OVERVIEW, PROFILE_FRAGMENT, GATHERING_PROTOCOL, TOOLS_FRAGMENT]
            .join("\n\n"),
    );
    assert.equal(
        planning,
        [GLOBAL_OVERVIEW, PROFILE_FRAGMENT, PLANNING_PROTOCOL, TOOLS_FRAGMENT]
            .join("\n\n"),
    );
    assert.equal(
        executing,
        [GLOBAL_OVERVIEW, PROFILE_FRAGMENT, AGENT_DECISION_PROTOCOL, TOOLS_FRAGMENT]
            .join("\n\n"),
    );
});

test("三个 Phase 共享同一 Global Overview，并按各自 Phase 选择协议", async () => {
    const renderer = await createDefaultPromptBundleRenderer();

    const gathering = renderer.render(buildContext("gathering_context"));
    const planning = renderer.render(buildContext("planning"));
    const executing = renderer.render(buildContext("executing"));

    assert.ok(gathering.startsWith(GLOBAL_OVERVIEW));
    assert.ok(planning.startsWith(GLOBAL_OVERVIEW));
    assert.ok(executing.startsWith(GLOBAL_OVERVIEW));

    assert.ok(gathering.includes(GATHERING_PROTOCOL));
    assert.ok(planning.includes(PLANNING_PROTOCOL));
    assert.ok(executing.includes(AGENT_DECISION_PROTOCOL));
});

test("默认 Bundle 输出与模板注册顺序无关", async () => {
    const assets = await loadAllAssets();
    const defaultRenderer = await createDefaultPromptBundleRenderer();
    const reversedRenderer = createPromptBundleRenderer({
        templates: [...assets].reverse(),
        bundles: [DEFAULT_PROMPT_BUNDLE_MANIFEST],
    });

    assert.equal(
        defaultRenderer.render(buildContext("executing")),
        reversedRenderer.render(buildContext("executing")),
    );
});

test("空 Instructions 与空 Tools 具有固定空值表示", async () => {
    const renderer = await createDefaultPromptBundleRenderer();

    const output = renderer.render({
        promptBundleVersion: 1,
        phase: "gathering_context",
        profile: { id: "profile-1", systemPrompt: "SYS", instructions: [] },
        authorizedTools: [],
    });

    assert.ok(output.includes("Profile Instructions:\n(No additional instructions.)"));
    assert.ok(output.endsWith("Authorized Tool definitions (only these Tool IDs may be requested):\n[]"));
});
