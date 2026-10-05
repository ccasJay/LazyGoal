import assert from "node:assert/strict";
import { test } from "node:test";
import { createCheckpointToolDeclarations, createUnifiedToolDeclarations } from "../../contracts/src/index";
import type {
    ModelDynamicContext,
    ModelInferenceView,
    PromptContext,
} from "../src/model-inference-view";
import { renderWorkingContextMessage } from "../src/render";
import {
    CURRENT_PROMPT_BUNDLE_VERSION,
    DEFAULT_PROMPT_BUNDLE_MANIFEST,
    DEFAULT_PROMPT_TEMPLATE_ASSETS,
    PROMPT_BUNDLE_V1_MANIFEST,
    createDefaultPromptBundleProtocolValidator,
    createDefaultPromptBundleRenderer,
} from "../src/prompting/default-bundles";

const currentProtocols = {
    memoryProtocol: { kind: "structured" as const, version: 1 as const },
    modelContextProtocol: { kind: "trajectory-layered" as const, version: 1 as const },
    contextRetrievalProtocol: { kind: "bm25-lite" as const, version: 1 as const },
};

function prompt(overrides: Partial<PromptContext> = {}): PromptContext {
    return {
        promptBundleVersion: 1,
        phase: "executing",
        stage: "decide",
        profile: { id: "profile-1", systemPrompt: "system", instructions: [] },
        ...currentProtocols,
        ...overrides,
    };
}

function view(
    dynamicOverrides: Partial<ModelDynamicContext> = {},
    options: { readonly checkpoint?: boolean } = {},
): ModelInferenceView {
    return {
        prompt: prompt(),
        dynamicContext: {
            runMode: "normal",
            goalPlanWritable: false,
            authorizedTools: [],
            ...dynamicOverrides,
        },
        conversation: [],
        workingContext: {
            phase: "executing",
            intent: "完成目标",
            execution: { stepCount: 0 },
        },
        workingMemory: {
            protocolVersion: 1,
            derivedThroughSequence: 0,
            facts: [],
            hypotheses: [],
            blockers: [],
        },
        contextEpoch: {
            protocolVersion: 1,
            epochNumber: 0,
            conversationStartIndex: 0,
            openedAtSequence: 0,
            control: options.checkpoint
                ? { status: "checkpoint_required", reason: "input_threshold" }
                : { status: "active" },
        },
    };
}

function sectionText(id: string, messages: readonly { sectionId: string; content: string }[]) {
    const result = messages.find((message) => message.sectionId === id);
    assert.ok(result, `missing section ${id}`);
    return result.content;
}

test("默认 Bundle v1 只组合固定 system section，动态 section 独立注册", () => {
    assert.equal(CURRENT_PROMPT_BUNDLE_VERSION, 1);
    assert.equal(DEFAULT_PROMPT_BUNDLE_MANIFEST, PROMPT_BUNDLE_V1_MANIFEST);
    assert.deepEqual(DEFAULT_PROMPT_BUNDLE_MANIFEST.sections.map((section) => section.slot), [
        "global_overview",
        "profile",
        "phase_protocol",
    ]);
    assert.deepEqual(
        DEFAULT_PROMPT_TEMPLATE_ASSETS.map((asset) => asset.id),
        [
            "global-overview@1",
            "profile@1",
            "agent-decision@1",
            "agent-think@1",
            "authorized-tools@1",
            "run-mode@1",
            "approved-task@1",
            "goal-plan@1",
            "working-memory@1",
        ],
    );
});

test("固定 system 文本与 Run、任务、GoalPlan、工具和 Working Memory 状态无关", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const normal = view();
    const plan = view({
        runMode: "plan",
        goalPlanWritable: true,
        task: { objective: "Task", completionCriteria: [{ text: "Verified" }] },
        goalPlan: { revision: 2, items: [{ id: "todo-1", content: "Check", position: 0, status: "pending" }] },
        authorizedTools: [{ id: "read_file", description: "Read", inputSchema: { type: "object" } }],
    });

    const normalText = renderer.render(normal.prompt);
    const planText = renderer.render(plan.prompt);
    assert.equal(normalText, planText);
    assert.doesNotMatch(normalText, /Objective: Task|revision 2|\"id\": \"read_file\"/);

    const dynamic = renderer.renderDynamicSections(plan);
    assert.deepEqual(dynamic.map((section) => section.sectionId), [
        "run_mode",
        "approved_task",
        "goal_plan",
        "authorized_tools",
        "working_memory",
    ]);
    assert.ok(dynamic.every((section) => section.role === "user" && section.source.length > 0));
    assert.match(sectionText("approved_task", dynamic), /Objective: Task/);
    assert.match(sectionText("goal_plan", dynamic), /revision 2/);
    assert.match(sectionText("authorized_tools", dynamic), /read_file/);
});

test("Run mode section keeps its exact tool list aligned with the active output contract", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    for (const [runMode, taskPresent] of [["normal", false], ["plan", false], ["plan", true]] as const) {
        const dynamicContext: ModelDynamicContext = {
            runMode,
            goalPlanWritable: runMode === "plan",
            authorizedTools: [],
            ...(taskPresent ? { task: { objective: "Test", completionCriteria: [{ text: "Verified" }] } } : {}),
        };
        const target = view(dynamicContext);
        const messages = renderer.renderDynamicSections(target);
        const text = sectionText("run_mode", messages);
        const allowed = text.match(/Outside checkpoint, allowed system tools: (.+)\./);
        assert.ok(allowed);
        assert.deepEqual(
            allowed[1]!.split(", ").sort(),
            createUnifiedToolDeclarations([], taskPresent, runMode === "plan", runMode === "plan")
                .map((tool) => tool.id).sort(),
        );

        if (runMode === "normal") {
            assert.match(text, /act directly on the current user request/);
            assert.doesNotMatch(text, /system_propose_task_plan/);
        } else if (taskPresent) {
            assert.match(sectionText("approved_task", messages), /system_propose_task_plan is prohibited/);
            assert.match(text, /completionEvidence/);
        } else {
            assert.match(text, /first submit a task proposal/);
            assert.match(text, /This ordering is a Prompt instruction/);
            assert.match(text, /Do not call `system_complete_task`/);
            assert.match(text, /before the task is approved\.\n\nCurrent Goal intent:/);
        }
    }
});

test("动态 section 中的数据文本只插值一次，保留 Nunjucks 字面内容", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const target = view({
        authorizedTools: [{
            id: "quoted_tool",
            description: "{{ missing_value }} {% if true %}literal{% endif %}",
            inputSchema: { note: "{{ another_missing }}" },
        }],
    });
    const messages = renderer.renderDynamicSections(target);
    const tools = sectionText("authorized_tools", messages);

    assert.match(tools, /\{\{ missing_value \}\} \{% if true %\}literal\{% endif %\}/);
    assert.match(tools, /\{\{ another_missing \}\}/);
});

test("PTC 指引仅随专用 Tool 授权出现", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const authorized = sectionText("authorized_tools", renderer.renderDynamicSections(view({
        authorizedTools: [{
            id: "execute_program",
            description: "Run a program",
            inputSchema: { type: "object" },
        }],
    })));
    assert.match(authorized, /tools\[toolId\]\(input\)/);
    assert.match(authorized, /result\.observation\.output\.text\.split/);
    assert.match(authorized, /no require, process, fs, or direct workspace access/);
    assert.match(authorized, /do not shadow the provided tools object/);
    assert.match(authorized, /Check observation\.kind for every inner call before using its output/);
    assert.match(authorized, /every relevant implementation and test path in the first program/);
    assert.match(authorized, /read each path once/);
    assert.match(authorized, /answer-ready \{rows, unresolved\}/);
    assert.match(authorized, /JSON-safe return below 64 KiB/);
    assert.match(authorized, /Do not return full files, raw observations/);
    assert.match(authorized, /If unresolved is empty, answer from rows without another tool call/);
    assert.match(authorized, /never on the entire file set again/);
    assert.match(authorized, /attach \{path, line, text\} to each fact/);
    assert.match(authorized, /Copy these triples exactly into the final answer/);
    assert.match(authorized, /numeric limit without matching source evidence is unknown/);
    assert.match(authorized, /When read_file is authorized/);
    assert.match(authorized, /line:i\+1/);
    assert.match(authorized, /src\/a\.ts.*src\/b\.ts/);
    assert.match(authorized, /result\.observation\.kind!=="success"/);
    assert.match(authorized, /unresolved\.push\(\{path,error:result\.observation\.kind\}\)/);
    assert.match(authorized, /return \{rows,unresolved\}/);
    const withoutProgram = sectionText("authorized_tools", renderer.renderDynamicSections(view({
        authorizedTools: [{
            id: "read_file",
            description: "Read a file",
            inputSchema: { type: "object" },
        }],
    })));
    assert.doesNotMatch(withoutProgram, /tools\[toolId\]\(input\)|result\.observation\.output|numeric limit/);
});

test("GoalPlan、Working Memory 与检查点各自保持独立来源和动态 section 身份", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const checkpoint = view({ runMode: "plan", goalPlanWritable: true }, { checkpoint: true });
    const messages = renderer.renderDynamicSections(checkpoint);
    const modeText = sectionText("run_mode", messages);
    const workingMemory = messages.find((message) => message.sectionId === "working_memory");

    assert.match(modeText, /Call only `system_context_checkpoint`/);
    assert.deepEqual(createCheckpointToolDeclarations().map((tool) => tool.id), ["system_context_checkpoint"]);
    assert.equal(workingMemory?.source, "WorkingMemory");
    assert.equal(workingMemory?.role, "user");

    const plan = view({ runMode: "plan", goalPlanWritable: true });
    const planMessages = renderer.renderDynamicSections(plan);
    const planText = sectionText("goal_plan", planMessages);
    assert.match(planText, /baseRevision 0/);
    assert.match(planText, /system_update_goal_plan/);

    const control = renderWorkingContextMessage(plan.workingContext);
    assert.equal("workingMemory" in JSON.parse(control.content), false);
});

test("默认 Renderer 编译全部模板，固定文本稳定且拒绝未知 Bundle", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const fixed = renderer.render(prompt());
    assert.match(fixed, /trajectory-layered@1/);
    assert.match(fixed, /bm25-lite@1/);
    assert.equal(renderer.render(prompt()), fixed);
    assert.throws(
        () => renderer.render(prompt({ promptBundleVersion: 8 as never })),
        /不支持的 Prompt Bundle 版本|UnsupportedPromptBundleVersionError/,
    );
    assert.throws(
        () => renderer.renderDynamicSections({ ...view(), prompt: prompt({ promptBundleVersion: 8 as never }) }),
        /不支持的 Prompt Bundle 版本|UnsupportedPromptBundleVersionError/,
    );
});

test("默认协议校验器只接受唯一当前组合", () => {
    const validator = createDefaultPromptBundleProtocolValidator();
    validator.validate({ promptBundleVersion: 1, ...currentProtocols });

    for (const invalid of [
        { promptBundleVersion: 8, ...currentProtocols },
        {
            promptBundleVersion: 1,
            memoryProtocol: { kind: "checkpoint", version: 1 },
            modelContextProtocol: currentProtocols.modelContextProtocol,
            contextRetrievalProtocol: currentProtocols.contextRetrievalProtocol,
        },
        {
            promptBundleVersion: 1,
            memoryProtocol: currentProtocols.memoryProtocol,
            modelContextProtocol: { kind: "trajectory-layered", version: 2 },
            contextRetrievalProtocol: currentProtocols.contextRetrievalProtocol,
        },
        {
            promptBundleVersion: 1,
            memoryProtocol: currentProtocols.memoryProtocol,
            modelContextProtocol: currentProtocols.modelContextProtocol,
            contextRetrievalProtocol: { kind: "bm25-lite", version: 2 },
        },
    ]) {
        assert.throws(() => validator.validate(invalid as never), /仅支持/);
    }
});
