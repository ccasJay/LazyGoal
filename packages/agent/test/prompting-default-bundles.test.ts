import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { PromptContext } from "../src/model-inference-view";
import {
    createDefaultPromptBundleRenderer,
    createDefaultPromptBundleProtocolValidator,
    CURRENT_PROMPT_BUNDLE_VERSION,
    DEFAULT_PROMPT_BUNDLE_MANIFEST,
    DEFAULT_PROMPT_TEMPLATE_ASSETS,
    PROMPT_BUNDLE_V1_MANIFEST,
    PROMPT_BUNDLE_V2_MANIFEST,
    PROMPT_BUNDLE_V3_MANIFEST,
    PROMPT_BUNDLE_V4_MANIFEST,
    PROMPT_BUNDLE_V5_MANIFEST,
    PROMPT_BUNDLE_V6_MANIFEST,
    PROMPT_BUNDLE_V7_MANIFEST,
} from "../src/prompting/default-bundles";
import { normalizeNewlines } from "../src/prompting/environment";
import { UnsupportedPromptBundleVersionError } from "../src/prompting/errors";
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

const GLOBAL_OVERVIEW_V2 = [
    "Global Overview:",
    "You are operating inside LazyGoal, a goal-driven and resumable agent runtime.",
    "LazyGoal turns user intent into an approved task through gathering_context and planning, then advances it through a controlled executing phase.",
    "Use only the active Phase Protocol to determine the current responsibility and required response format.",
    "This Global Overview and the active Phase Protocol take precedence over the frozen Profile.",
    "Follow the frozen Profile for role-specific behavior, domain guidance, and working style when it does not conflict with those higher-level instructions.",
    "Treat the supplied Conversation, Working Context, and Authorized Tool definitions as the inputs for the current turn.",
    "Only an Observation in Working Context establishes the result of a Tool Action; never treat an instruction, plan, or requested Action as completed work.",
    "Advance autonomously from available evidence, but do not cross the active Phase boundary or invent unavailable information.",
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

const GATHERING_PROTOCOL_V2 = [
    "Active Phase Protocol: gathering_context",
    "Decision policy:",
    "1. Read the intent and Conversation before deciding whether a question is necessary.",
    "2. Return context_ready when the existing context is sufficient to define a bounded task with verifiable completion criteria.",
    "3. Return question only when one missing fact would materially change the expected result, permit a high-risk operation, or block an executable task.",
    "4. Ask exactly one focused question about the highest-impact missing fact. Do not repeat known information or ask for optional preferences.",
    "5. Infer a detail instead of asking when the inference is supported by context, low risk, and later verifiable or reversible.",
    "Output protocol:",
    "Return exactly one JSON object without a Markdown code block or additional text.",
    "The allowed shapes are {\"kind\":\"question\",\"question\":\"non-empty text\"} or {\"kind\":\"context_ready\"}.",
    "Do not return a task proposal, Tool request, or execution result.",
].join("\n");

const PLANNING_PROTOCOL = [
    "Active Phase Protocol:",
    "只返回一个 JSON 对象，不要使用 Markdown 代码块或附加说明。",
    "唯一允许的形状为 {\"kind\":\"task_proposal\",\"task\":",
    "{\"objective\":\"非空文本\",\"completionCriteria\":[\"非空文本\"]},",
    "\"approvalRequest\":\"非空文本\"}。",
    "不要返回问题、context_ready 或执行结果。",
].join("\n");

const PLANNING_PROTOCOL_V2 = [
    "Active Phase Protocol: planning",
    "Decision policy:",
    "1. Use only facts in Conversation and Working Context plus safe inferences supported by them.",
    "2. Define objective as one concrete expected result with its necessary scope and boundaries; do not merely repeat the broad intent.",
    "3. Define completionCriteria as observable evidence that is collectively sufficient to judge the objective complete and obtainable from Conversation, Working Context, or Authorized Tool Observations available in this runtime.",
    "4. If the user explicitly requires evidence that this runtime cannot obtain, preserve it as an external dependency and state that dependency in both completionCriteria and approvalRequest.",
    "5. Unless the user constrained the implementation, do not turn guessed steps or technical choices into mandatory task requirements.",
    "6. Make approvalRequest explicitly ask the user to approve the complete proposed task contract.",
    "Output protocol:",
    "Return exactly one JSON object without a Markdown code block or additional text.",
    "The only allowed shape is {\"kind\":\"task_proposal\",\"task\":{\"objective\":\"non-empty text\",\"completionCriteria\":[\"non-empty text\"]},\"approvalRequest\":\"non-empty text\"}.",
    "Do not return a question, context_ready, Tool request, or execution result.",
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

const AGENT_DECISION_PROTOCOL_V2 = [
    "Active Phase Protocol: executing",
    "Decision policy:",
    "1. Read the approved task, completion criteria, checkpoint, previousStep, and pendingAction before choosing the next decision.",
    "2. Treat only recorded Observations as Tool results. Use both success and failure evidence to update the next decision; do not invent unobserved outcomes.",
    "3. Return complete only when every completion criterion has sufficient evidence.",
    "4. Otherwise, if an executable and verifiable next step exists, request one Authorized Tool Action that best reduces the most consequential uncertainty or directly advances a completion criterion.",
    "5. After changing task state, obtain verification evidence proportionate to the change risk before returning complete.",
    "6. Return wait only when progress requires external input or a decision unavailable from the current context.",
    "7. Return fail only when the task cannot be completed under current constraints and no reasonable recovery path remains.",
    "8. Do not return complete, wait, or fail while an executable and verifiable next step remains.",
    "Checkpoint policy:",
    "Every checkpoint must be a cumulative recovery summary of confirmed progress, key evidence, and remaining work.",
    "Cover the current evidence status of each completion criterion, not merely the latest actions.",
    "Output protocol:",
    "Return exactly one JSON object without a Markdown code block or additional text.",
    "For a Tool request, use {\"kind\":\"tool_call\",\"checkpoint\":\"non-empty cumulative state\",\"action\":{\"actionId\":\"stable non-empty ID\",\"toolId\":\"Authorized Tool ID\",\"input\":{}}}; replace input with a JSON object satisfying the selected Tool inputSchema.",
    "For completion, use {\"kind\":\"complete\",\"checkpoint\":\"non-empty cumulative state\",\"summary\":\"non-empty implemented result\"}.",
    "For an external blocker, use {\"kind\":\"wait\",\"checkpoint\":\"non-empty cumulative state\",\"reason\":\"non-empty specific blocker\"}.",
    "For an unrecoverable failure, use {\"kind\":\"fail\",\"checkpoint\":\"non-empty cumulative state\",\"error\":\"non-empty stable failure reason\"}.",
    "Use only Tool IDs listed in Authorized Tool definitions, and wait for the Runtime Observation before judging a requested Action's result.",
].join("\n");

function buildContext(
    phase: PromptContext["phase"],
    promptBundleVersion = 1,
): PromptContext {
    return {
        promptBundleVersion,
        phase,
        ...(promptBundleVersion >= 4 && promptBundleVersion <= 7
            ? {
                memoryProtocol: { kind: "structured" as const, version: 1 as const },
                ...(promptBundleVersion >= 5
                    ? {
                        modelContextProtocol: {
                            kind: "trajectory-layered" as const,
                            version: 1 as const,
                        },
                    }
                    : {}),
                ...(promptBundleVersion >= 6
                    ? {
                        contextRetrievalProtocol: {
                            kind: "bm25-lite" as const,
                            version: 1 as const,
                        },
                    }
                    : {}),
            }
            : {}),
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

test("v1 Bundle 对三个 Phase 产生字符级稳定且顺序固定的 system 内容", async () => {
    const renderer = await createDefaultPromptBundleRenderer();

    const gathering = renderer.render(buildContext("gathering_context", 1));
    const planning = renderer.render(buildContext("planning", 1));
    const executing = renderer.render(buildContext("executing", 1));

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

test("默认 Renderer 同时注册隔离的 v1-v7，且当前版本激活 v7", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const v1 = renderer.render(buildContext("planning", 1));
    const v2 = renderer.render(buildContext("planning", 2));
    const v4 = renderer.render(buildContext("planning", 4));
    const v5 = renderer.render(buildContext("planning", 5));
    const v6 = renderer.render(buildContext("planning", 6));
    const v7 = renderer.render(buildContext("planning", 7));

    assert.equal(CURRENT_PROMPT_BUNDLE_VERSION, 7);
    assert.strictEqual(DEFAULT_PROMPT_BUNDLE_MANIFEST, PROMPT_BUNDLE_V7_MANIFEST);
    assert.equal(PROMPT_BUNDLE_V2_MANIFEST.version, 2);
    assert.equal(PROMPT_BUNDLE_V3_MANIFEST.version, 3);
    assert.equal(PROMPT_BUNDLE_V4_MANIFEST.version, 4);
    assert.equal(PROMPT_BUNDLE_V5_MANIFEST.version, 5);
    assert.equal(PROMPT_BUNDLE_V6_MANIFEST.version, 6);
    assert.equal(PROMPT_BUNDLE_V7_MANIFEST.version, 7);
    assert.equal(
        v1,
        [GLOBAL_OVERVIEW, PROFILE_FRAGMENT, PLANNING_PROTOCOL, TOOLS_FRAGMENT]
            .join("\n\n"),
    );
    assert.equal(
        v2,
        [GLOBAL_OVERVIEW_V2, PROFILE_FRAGMENT, PLANNING_PROTOCOL_V2, TOOLS_FRAGMENT]
            .join("\n\n"),
    );
    assert.ok(!v1.includes("Only an Observation in Working Context"));
    assert.ok(v2.includes("Only an Observation in Working Context"));
    assert.ok(v4.includes("Active Phase Protocol: planning (structured@1)"));
    assert.ok(v4.includes("MemoryPatch"));
    assert.ok(v5.includes("Active Phase Protocol: planning (structured@1; trajectory-layered@1)"));
    assert.ok(v5.includes("Current Tool Observations and the current workspace are more authoritative"));
    assert.ok(v6.includes("Context Lookup Result is historical evidence only"));
    assert.ok(v6.includes('"kind":"context_lookup"'));
    assert.ok(v7.includes("durable Facts or planning state"));
    assert.ok(v7.includes("upsert_fact"));
});

test("v2 Global 明确指令优先级、事实输入与 Runtime Observation 边界", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const output = renderer.render(buildContext("executing", 2));

    assert.ok(output.includes(
        "This Global Overview and the active Phase Protocol take precedence over the frozen Profile.",
    ));
    assert.ok(output.includes(
        "Follow the frozen Profile for role-specific behavior, domain guidance, and working style when it does not conflict with those higher-level instructions.",
    ));
    assert.ok(output.includes(
        "Treat the supplied Conversation, Working Context, and Authorized Tool definitions as the inputs for the current turn.",
    ));
    assert.ok(output.includes(
        "Only an Observation in Working Context establishes the result of a Tool Action; never treat an instruction, plan, or requested Action as completed work.",
    ));
});

test("v2 gathering_context 逐字实现最小必要追问与 Phase 禁止边界", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const output = renderer.render(buildContext("gathering_context", 2));

    assert.equal(
        output,
        [GLOBAL_OVERVIEW_V2, PROFILE_FRAGMENT, GATHERING_PROTOCOL_V2, TOOLS_FRAGMENT]
            .join("\n\n"),
    );
    assert.ok(output.includes(
        "Return context_ready when the existing context is sufficient to define a bounded task with verifiable completion criteria.",
    ));
    assert.ok(output.includes(
        "Return question only when one missing fact would materially change the expected result, permit a high-risk operation, or block an executable task.",
    ));
    assert.ok(output.includes(
        "Ask exactly one focused question about the highest-impact missing fact. Do not repeat known information or ask for optional preferences.",
    ));
    assert.ok(output.includes(
        "Infer a detail instead of asking when the inference is supported by context, low risk, and later verifiable or reversible.",
    ));
    assert.ok(output.includes(
        "Do not return a task proposal, Tool request, or execution result.",
    ));
    assert.ok(!output.includes(PLANNING_PROTOCOL));
    assert.ok(!output.includes(AGENT_DECISION_PROTOCOL));
    assert.ok(!output.includes(AGENT_DECISION_PROTOCOL_V2));
});

test("v2 planning 逐字实现可执行任务契约与 Phase 禁止边界", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const output = renderer.render(buildContext("planning", 2));

    assert.equal(
        output,
        [GLOBAL_OVERVIEW_V2, PROFILE_FRAGMENT, PLANNING_PROTOCOL_V2, TOOLS_FRAGMENT]
            .join("\n\n"),
    );
    assert.ok(output.includes(
        "Define objective as one concrete expected result with its necessary scope and boundaries; do not merely repeat the broad intent.",
    ));
    assert.ok(output.includes(
        "Define completionCriteria as observable evidence that is collectively sufficient to judge the objective complete",
    ));
    assert.ok(output.includes(
        "Unless the user constrained the implementation, do not turn guessed steps or technical choices into mandatory task requirements.",
    ));
    assert.ok(output.includes(
        "Make approvalRequest explicitly ask the user to approve the complete proposed task contract.",
    ));
    assert.ok(output.includes(
        "The only allowed shape is {\"kind\":\"task_proposal\"",
    ));
    assert.ok(output.includes(
        "Do not return a question, context_ready, Tool request, or execution result.",
    ));
    assert.ok(!output.includes(GATHERING_PROTOCOL_V2));
    assert.ok(!output.includes(AGENT_DECISION_PROTOCOL));
    assert.ok(!output.includes(AGENT_DECISION_PROTOCOL_V2));
});

test("v2 executing 逐字实现证据驱动 Action 闭环", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const output = renderer.render(buildContext("executing", 2));

    assert.equal(
        output,
        [GLOBAL_OVERVIEW_V2, PROFILE_FRAGMENT, AGENT_DECISION_PROTOCOL_V2, TOOLS_FRAGMENT]
            .join("\n\n"),
    );
    assert.ok(output.includes(
        "Read the approved task, completion criteria, checkpoint, previousStep, and pendingAction before choosing the next decision.",
    ));
    assert.ok(output.includes(
        "Treat only recorded Observations as Tool results. Use both success and failure evidence to update the next decision; do not invent unobserved outcomes.",
    ));
    assert.ok(output.includes(
        "request one Authorized Tool Action that best reduces the most consequential uncertainty or directly advances a completion criterion.",
    ));
    assert.ok(output.includes(
        "After changing task state, obtain verification evidence proportionate to the change risk before returning complete.",
    ));
    assert.ok(output.includes(
        "Return fail only when the task cannot be completed under current constraints and no reasonable recovery path remains.",
    ));
    assert.ok(output.includes(
        "Use only Tool IDs listed in Authorized Tool definitions, and wait for the Runtime Observation before judging a requested Action's result.",
    ));
    assert.ok(output.includes(
        "For a Tool request, use {\"kind\":\"tool_call\"",
    ));
    assert.ok(!output.includes(GATHERING_PROTOCOL_V2));
    assert.ok(!output.includes(PLANNING_PROTOCOL_V2));
    assert.ok(!output.includes(AGENT_DECISION_PROTOCOL));
});

test("v2 executing checkpoint 逐项维护累计证据账本", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const output = renderer.render(buildContext("executing", 2));

    assert.ok(output.includes(
        "Every checkpoint must be a cumulative recovery summary of confirmed progress, key evidence, and remaining work.",
    ));
    assert.ok(output.includes(
        "Cover the current evidence status of each completion criterion, not merely the latest actions.",
    ));
    assert.ok(output.includes(
        "For a Tool request, use {\"kind\":\"tool_call\",\"checkpoint\":\"non-empty cumulative state\"",
    ));
    assert.ok(output.includes(
        "For completion, use {\"kind\":\"complete\",\"checkpoint\":\"non-empty cumulative state\"",
    ));
    assert.ok(output.includes(
        "For an external blocker, use {\"kind\":\"wait\",\"checkpoint\":\"non-empty cumulative state\"",
    ));
    assert.ok(output.includes(
        "For an unrecoverable failure, use {\"kind\":\"fail\",\"checkpoint\":\"non-empty cumulative state\"",
    ));
});

test("v2 executing 以证据和可恢复性约束终止分支", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const output = renderer.render(buildContext("executing", 2));

    assert.ok(output.includes(
        "Return complete only when every completion criterion has sufficient evidence.",
    ));
    assert.ok(output.includes(
        "For completion, use {\"kind\":\"complete\",\"checkpoint\":\"non-empty cumulative state\",\"summary\":\"non-empty implemented result\"}.",
    ));
    assert.ok(output.includes(
        "Return wait only when progress requires external input or a decision unavailable from the current context.",
    ));
    assert.ok(output.includes(
        "For an external blocker, use {\"kind\":\"wait\",\"checkpoint\":\"non-empty cumulative state\",\"reason\":\"non-empty specific blocker\"}.",
    ));
    assert.ok(output.includes(
        "Return fail only when the task cannot be completed under current constraints and no reasonable recovery path remains.",
    ));
    assert.ok(output.includes(
        "For an unrecoverable failure, use {\"kind\":\"fail\",\"checkpoint\":\"non-empty cumulative state\",\"error\":\"non-empty stable failure reason\"}.",
    ));
    assert.ok(output.includes(
        "Do not return complete, wait, or fail while an executable and verifiable next step remains.",
    ));
});

test("v3 executing 保留 v2 闭环并增加专用 Tool 优先与 Bash 搜索护栏", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const v2 = renderer.render(buildContext("executing", 2));
    const v3 = renderer.render(buildContext("executing", 3));

    assert.notEqual(v3, v2);
    assert.ok(v3.includes(
        "Read the approved task, completion criteria, checkpoint, previousStep, and pendingAction before choosing the next decision.",
    ));
    assert.ok(v3.includes(
        "Return complete only when every completion criterion has sufficient evidence.",
    ));
    assert.ok(v3.includes("Tool selection policy:"));
    assert.ok(v3.includes(
        "When an Authorized Tool directly provides the capability needed for the current subtask, prefer that specialized Tool instead of reimplementing the same operation with bash.",
    ));
    assert.ok(v3.includes(
        "For repository text search, prefer the authorized `grep` Tool when it is available.",
    ));
    assert.ok(v3.includes(
        "Use `bash` only when no applicable specialized Tool is authorized, or when shell composition, a system command, or a capability that the specialized Tools cannot express is genuinely required.",
    ));
    assert.ok(v3.includes(
        "narrow the search path and exclude `node_modules`, `.git`, `.lazygoal`, generated files, and source maps.",
    ));
    assert.ok(v3.includes(
        "bound output by bytes or an equivalent bounded-output strategy; line-count truncation alone is not sufficient.",
    ));
    assert.ok(v3.includes(
        "For a Tool request, use {\"kind\":\"tool_call\"",
    ));
    assert.equal(
        renderer.render(buildContext("gathering_context", 3)),
        renderer.render(buildContext("gathering_context", 2)),
    );
    assert.equal(
        renderer.render(buildContext("planning", 3)),
        renderer.render(buildContext("planning", 2)),
    );
});

test("v2 三个 Phase 渲染字符级确定且保持 fragment 边界", async () => {
    const renderer = await createDefaultPromptBundleRenderer();

    for (const [phase, protocol] of [
        ["gathering_context", GATHERING_PROTOCOL_V2],
        ["planning", PLANNING_PROTOCOL_V2],
        ["executing", AGENT_DECISION_PROTOCOL_V2],
    ] as const) {
        const first = renderer.render(buildContext(phase, 2));
        const second = renderer.render(buildContext(phase, 2));

        assert.equal(first, second);
        assert.equal(
            first,
            [GLOBAL_OVERVIEW_V2, PROFILE_FRAGMENT, protocol, TOOLS_FRAGMENT]
                .join("\n\n"),
        );
        assert.ok(!first.includes("\r"));
        assert.ok(!first.endsWith("\n"));
    }
});

test("默认 Renderer 对未知版本不回退并报告 v1/v2/v3 supported versions", async () => {
    const renderer = await createDefaultPromptBundleRenderer();

    assert.throws(
        () => renderer.render(buildContext("planning", 99)),
        (error: unknown) => {
            assert.ok(error instanceof UnsupportedPromptBundleVersionError);
            assert.equal(error.bundleVersion, 99);
            assert.deepEqual(error.supportedVersions, [1, 2, 3]);
            return true;
        },
    );
});

test("v1 三个 Phase 共享同一 Global Overview，并按各自 Phase 选择协议", async () => {
    const renderer = await createDefaultPromptBundleRenderer();

    const gathering = renderer.render(buildContext("gathering_context", 1));
    const planning = renderer.render(buildContext("planning", 1));
    const executing = renderer.render(buildContext("executing", 1));

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
        defaultRenderer.render(
            buildContext("executing", CURRENT_PROMPT_BUNDLE_VERSION),
        ),
        reversedRenderer.render(
            buildContext("executing", CURRENT_PROMPT_BUNDLE_VERSION),
        ),
    );
});

test("空 Instructions 与空 Tools 具有固定空值表示", async () => {
    const renderer = await createDefaultPromptBundleRenderer();

    const output = renderer.render({
        promptBundleVersion: CURRENT_PROMPT_BUNDLE_VERSION,
        phase: "gathering_context",
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        profile: { id: "profile-1", systemPrompt: "SYS", instructions: [] },
        authorizedTools: [],
    });

    assert.ok(output.includes("Profile Instructions:\n(No additional instructions.)"));
    assert.ok(output.endsWith("Authorized Tool definitions (only these Tool IDs may be requested):\n[]"));
});

test("v4 Bundle 显式绑定 structured@1 并渲染三阶段协议", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const context = {
        ...buildContext("executing", 4),
        memoryProtocol: { kind: "structured" as const, version: 1 as const },
    };
    const output = renderer.render(context);

    assert.deepEqual(PROMPT_BUNDLE_V4_MANIFEST.memoryProtocol, {
        kind: "structured",
        version: 1,
    });
    assert.ok(output.includes("Active Phase Protocol: executing (structured@1)"));
    assert.ok(output.includes("completionEvidence"));
    assert.ok(output.includes("MemoryPatch"));
});

test("v5 Bundle 显式绑定 trajectory-layered@1 并声明来源优先级", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const output = renderer.render(buildContext("executing", 5));

    assert.deepEqual(PROMPT_BUNDLE_V5_MANIFEST.modelContextProtocol, {
        kind: "trajectory-layered",
        version: 1,
    });
    assert.ok(output.includes(
        "Active Phase Protocol: executing (structured@1; trajectory-layered@1)",
    ));
    assert.ok(output.includes("Source authority for current control state is Working Context"));
    assert.ok(output.includes("never guess"));
    assert.ok(output.includes("completionEvidence"));
});

test("v6 Bundle 显式绑定 bm25-lite@1 并声明封闭来源路由", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const output = renderer.render(buildContext("executing", 6));

    assert.deepEqual(PROMPT_BUNDLE_V6_MANIFEST.contextRetrievalProtocol, {
        kind: "bm25-lite",
        version: 1,
    });
    assert.ok(output.includes(
        "Active Phase Protocol: executing (structured@1; trajectory-layered@1; bm25-lite@1)",
    ));
    assert.ok(output.includes(
        "Use Context Lookup only for historical execution or decision rationale.",
    ));
    assert.ok(output.includes(
        "Current Workspace, Environment, and verification status require an Authorized Tool Observation",
    ));
    assert.ok(output.includes("Context Lookup response is exclusive"));
    assert.ok(output.includes("If no committed Observation supports a useful entry yet, omit memoryPatch"));
    assert.ok(output.includes(
        '{"type":"add_finding","finding":{"id":"finding-1","statement":"observed fact","evidenceSequences":[12]}}',
    ));
    assert.ok(output.includes("Do not use legacy keys such as op, findingId, content, or checkpoint"));
});

test("默认 Prompt Bundle Validator 拒绝旧 structured shape、未知版本和交叉协议", () => {
    const validator = createDefaultPromptBundleProtocolValidator();

    validator.validate({
        promptBundleVersion: 3,
        memoryProtocol: { kind: "checkpoint", version: 1 },
    });
    validator.validate({
        promptBundleVersion: 7,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    });

    for (const promptBundleVersion of [4, 5, 6]) {
        assert.throws(() => validator.validate({
            promptBundleVersion,
            memoryProtocol: { kind: "structured", version: 1 },
            ...(promptBundleVersion >= 5
                ? { modelContextProtocol: { kind: "trajectory-layered" as const, version: 1 as const } }
                : {}),
            ...(promptBundleVersion >= 6
                ? { contextRetrievalProtocol: { kind: "bm25-lite" as const, version: 1 as const } }
                : {}),
        }), /UNSUPPORTED_STRUCTURED_MEMORY_SHAPE/);
    }

    assert.throws(() => validator.validate({
        promptBundleVersion: 4,
        memoryProtocol: { kind: "checkpoint", version: 1 },
    }), /GOAL_PROTOCOL_ERROR/);
    assert.throws(() => validator.validate({
        promptBundleVersion: 3,
        memoryProtocol: { kind: "structured", version: 1 },
    }), /GOAL_PROTOCOL_ERROR/);
    assert.throws(() => validator.validate({
        promptBundleVersion: 5,
        memoryProtocol: { kind: "structured", version: 1 },
    }), /UNSUPPORTED_STRUCTURED_MEMORY_SHAPE/);
    assert.throws(() => validator.validate({
        promptBundleVersion: 4,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
    }), /UNSUPPORTED_STRUCTURED_MEMORY_SHAPE/);
    assert.throws(() => validator.validate({
        promptBundleVersion: 7,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "none", version: 1 },
    }), /GOAL_PROTOCOL_ERROR/);
    assert.throws(() => validator.validate({
        promptBundleVersion: 99,
        memoryProtocol: { kind: "checkpoint", version: 1 },
    }), /GOAL_PROTOCOL_ERROR/);
});
