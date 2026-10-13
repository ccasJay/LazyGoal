import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
    createCheckpointToolDeclarations, createUnifiedToolDeclarations,
    createModelOutputContractBundle, decodePhaseToolCall,
    type AgentDecision, type ModelOutputContractBundle,
} from "../../model-contracts/src/index";
import type { LLMResponse } from "../../llm/src/core/types";
import type { StructuredOutputMode } from "../../config/src/index";
import { readLLMConfig, LLMConfigurationError } from "../../config/src/index";
import { createLlmAdapter } from "../../llm/src/factory";
import { DEFAULT_PROMPT_TEMPLATE_ASSETS, DEFAULT_PROMPT_BUNDLE_MANIFEST } from "../src/prompting/default-bundles";
import { createPromptBundleRenderer } from "../src/prompting/renderer";
import type { PromptBundleRenderer, PromptContext } from "../src/prompting/types";
import { createStageMessages } from "../src/prompt";
import { renderRequest } from "../src/render";
import { parseModelOutput } from "../src/model-output";
import { createDefaultDynamicSectionRegistry } from "../src/prompting/dynamic-section-registry";
import { decisionScenarios, decisionScenarioView, decisionScenarioTools, scoreDecision } from "./decision-guidance-fixtures";
import { runCompletionReviewEvaluation } from "./completion-review-eval";

const baseline = new URL("./fixtures/decision-guidance-baseline/", import.meta.url);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Variant = "old" | "new";
type Scenario = typeof decisionScenarios[number];

/** 从冻结基线与当前模板创建两个独立 Renderer；旧资产不进入生产 Registry。 */
export async function evaluationRenderers() {
    const oldDescriptions: Record<string, string> = JSON.parse(await readFile(new URL("tool-descriptions.json", baseline), "utf8"));
    const current = await Promise.all(DEFAULT_PROMPT_TEMPLATE_ASSETS.map(async asset => ({ id: asset.id, source: await readFile(asset.sourceUrl, "utf8") })));
    const baselineTemplateIds = new Set(["global-overview@1", "agent-decision@1"]);
    const old = await Promise.all(current.map(async asset => baselineTemplateIds.has(asset.id) ? {
        id: asset.id, source: await readFile(new URL(`${asset.id}.njk`, baseline), "utf8"),
    } : asset));
    const dynamicSectionRegistry = createDefaultDynamicSectionRegistry();
    return {
        old: createPromptBundleRenderer({ templates: old, bundles: [DEFAULT_PROMPT_BUNDLE_MANIFEST], dynamicSectionRegistry }),
        new: createPromptBundleRenderer({ templates: current, bundles: [DEFAULT_PROMPT_BUNDLE_MANIFEST], dynamicSectionRegistry }),
        oldDescriptions,
        templateHashes: { old: hash(old), new: hash(current) },
    };
}

/** 使用生产 Renderer、输出契约和声明构造固定单步请求；业务工具仅声明，不执行。 */
export function evaluationRequest(scenario: Scenario, renderer: PromptBundleRenderer, mode: StructuredOutputMode,
    oldDescriptions?: Readonly<Record<string, string>>) {
    const tools = decisionScenarioTools(scenario);
    const bundle = createModelOutputContractBundle(scenario.checkpoint
        ? { kind: "checkpoint" }
        : { kind: "executing", authorizedTools: tools, taskPresent: scenario.approved, planMode: scenario.approved || scenario.id === "proposal" }) as ModelOutputContractBundle<AgentDecision>;
    const declarations = scenario.checkpoint ? createCheckpointToolDeclarations() : createUnifiedToolDeclarations(tools, scenario.approved, scenario.approved || scenario.id === "proposal");
    const view = decisionScenarioView(scenario);
    const requestRenderer: PromptBundleRenderer = oldDescriptions === undefined ? renderer : {
        render: () => renderer.render(Object.assign({}, view.prompt, {
            task: view.dynamicContext.task,
            goalPlan: view.dynamicContext.goalPlan,
            authorizedTools: view.dynamicContext.authorizedTools,
        }) as PromptContext),
        renderDynamicSections: renderer.renderDynamicSections,
        dynamicSectionIdentities: renderer.dynamicSectionIdentities,
    };
    const request = {
        ...renderRequest(view, requestRenderer, mode === "prompt_only" ? bundle.shapeGuide : undefined, undefined, createStageMessages("decide", scenario.runtimeFeedback === undefined ? undefined : { runtimeFeedback: scenario.runtimeFeedback })),
        tools: declarations.map(d => ({ id: d.id, description: oldDescriptions?.[d.id] ?? d.description, parametersSchema: d.parametersSchema })),
        toolChoice: "required" as const,
        ...(mode === "strict" ? { structuredOutput: { name: bundle.name, schema: bundle.jsonSchema } } : {}),
    };
    return { request, bundle, declarations };
}

/** 保留原始调用数检查，使用生产解码器；文本回退可解码但不算满足原生调用协议。 */
export function evaluateResponse(scenario: Scenario, plan: ReturnType<typeof evaluationRequest>, response: LLMResponse) {
    const calls = response.toolCalls ?? [];
    let decision: AgentDecision | undefined;
    let parseError: string | undefined;
    try {
        if (calls.length > 1) throw new Error("multiple_tool_calls");
        decision = calls.length === 1
            ? decodePhaseToolCall(plan.declarations, calls[0]!.toolId, JSON.parse(calls[0]!.argumentsJson)) as AgentDecision
            : parseModelOutput(response.content, plan.bundle);
    } catch (error) {
        parseError = error instanceof Error ? error.message : "Unknown decode error";
    }
    const protocolValid = calls.length === 1 && !parseError;
    const passed = protocolValid && decision !== undefined && scoreDecision(scenario, decision);
    const claimsComplete = calls.some(c => c.toolId === "system_complete_task") || decision?.kind === "complete";
    const checkpointViolation = !!scenario.checkpoint && (!protocolValid || decision?.kind !== "context_checkpoint");
    const unauthorizedWrite = !scenario.approved && (calls.some(c => c.toolId === "apply_change")
        || (decision?.kind === "tool_call" && decision.action.toolId === "apply_change"));
    return {
        passed, protocolValid, decision, parseError,
        unnecessaryQuestion: decision?.kind === "ask_user" && !scenario.expected.includes("ask_user"),
        criticalViolation: unauthorizedWrite || checkpointViolation || (claimsComplete && !passed),
    };
}

/**
 * 每个固定场景运行三轮旧、新对照请求；配置或传输错误标为 incomplete。
 * @param env - 当前明确选定的模型配置，不回写配置文件。
 * @param scenariosToRun - 默认完整回归集；局部复验只覆盖所选场景，须与其他当前证据合并验收。
 * @returns 逐次结果、模型和判据元数据的报告路径。
 * @example `await runDecisionEvaluation(process.env);`
 */
export async function runDecisionEvaluation(env: Readonly<Record<string, string | undefined>>, scenariosToRun: readonly Scenario[] = decisionScenarios) {
    const outputDir = resolve("build/decision-guidance", new Date().toISOString().replace(/[:.]/g, "-"));
    await mkdir(outputDir, { recursive: true });
    let config;
    try { config = readLLMConfig(env); }
    catch (error) {
        const report = { status: "incomplete", reason: "Invalid or missing explicit model configuration",
            missing: error instanceof LLMConfigurationError ? error.missing : [], outputDir };
        await writeFile(resolve(outputDir, "summary.json"), JSON.stringify(report, null, 2));
        return report;
    }
    const renderers = await evaluationRenderers();
    const adapter = createLlmAdapter(config);
    const rows: { scenario: string; variant: Variant; repeat: number; passed: boolean; criticalViolation: boolean; protocolValid: boolean; unnecessaryQuestion: boolean }[] = [];
    const plans = scenariosToRun.map(scenario => ({ scenario, old: evaluationRequest(scenario, renderers.old, config.structuredOutputMode, renderers.oldDescriptions),
        new: evaluationRequest(scenario, renderers.new, config.structuredOutputMode) }));
    await writeFile(resolve(outputDir, "manifest.json"), JSON.stringify({
        baselineCommit: "2397e31155786d274c02b51fbc309266d3b58577", provider: config.provider, model: config.model,
        mode: config.structuredOutputMode, maxOutputTokens: config.maxOutputTokens,
        templateHashes: renderers.templateHashes,
        scorerHash: hash(await readFile(new URL("./decision-guidance-fixtures.ts", import.meta.url), "utf8")),
        plans: plans.map(p => ({ scenario: p.scenario.id, expected: p.scenario.expected, old: p.old.request, new: p.new.request })),
    }, null, 2));
    let transportFailure = false;
    outer: for (let repeat = 0; repeat < 3; repeat++) {
        for (const item of plans) {
            const order: Variant[] = repeat % 2 === 0 ? ["old", "new"] : ["new", "old"];
            for (const variant of order) {
                const plan = item[variant];
                let response: LLMResponse;
                try {
                    response = await adapter.generate({ ...plan.request,
                        ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
                    }, { signal: AbortSignal.timeout(60000) });
                } catch (error) {
                    transportFailure = true;
                    await appendFile(resolve(outputDir, "results.jsonl"), JSON.stringify({ scenario: item.scenario.id, variant, repeat,
                        status: "transport_error", errorType: error instanceof Error ? error.name : "UnknownError" }) + "\n");
                    break outer;
                }
                const result = evaluateResponse(item.scenario, plan, response);
                const row = { scenario: item.scenario.id, variant, repeat, ...result };
                rows.push(row);
                const metadata = response.providerMetadata;
                const usage = metadata && typeof metadata === "object" && "usage" in metadata ? metadata.usage : undefined;
                await appendFile(resolve(outputDir, "results.jsonl"), JSON.stringify({ ...row,
                    raw: { content: response.content, toolCalls: response.toolCalls }, ...(usage === undefined ? {} : { usage }) }) + "\n");
                console.log(JSON.stringify({ scenario: row.scenario, variant, repeat, passed: row.passed }));
            }
        }
    }
    const scenarios = scenariosToRun.map(s => ({ scenario: s.id,
        old: rows.filter(r => r.scenario === s.id && r.variant === "old" && r.passed).length,
        new: rows.filter(r => r.scenario === s.id && r.variant === "new" && r.passed).length,
    }));
    const totals = (variant: Variant) => ({ passed: rows.filter(r => r.variant === variant && r.passed).length,
        protocolViolations: rows.filter(r => r.variant === variant && !r.protocolValid).length,
        unnecessaryQuestions: rows.filter(r => r.variant === variant && r.unnecessaryQuestion).length,
        criticalViolations: rows.filter(r => r.variant === variant && r.criticalViolation).length });
    const old = totals("old"); const current = totals("new");
    const expectedPerVariant = scenariosToRun.length * 3;
    const complete = !transportFailure && rows.length === expectedPerVariant * 2;
    const passed = complete && current.criticalViolations === 0 && current.passed >= old.passed && scenarios.every(s => s.new >= s.old)
        && scenariosToRun.filter(s => s.required).every(s => rows.filter(r => r.scenario === s.id && r.variant === "new" && r.passed).length === 3);
    const report = { status: !complete ? "incomplete" : passed ? "passed" : "failed", requestsCompleted: rows.length, selectedScenarios: scenariosToRun.map(s => s.id),
        provider: config.provider, model: config.model, mode: config.structuredOutputMode, calls: rows.length,
        requiredScenarios: scenariosToRun.filter(s => s.required).map(s => s.id),
        old, new: current, scenarios, outputDir,
        conclusion: complete && old.passed === expectedPerVariant && current.passed === expectedPerVariant ? "No regression observed in these scenarios; no significant improvement claim." : "Bounded single-step comparison; not a long-running task success estimate." };
    await writeFile(resolve(outputDir, "summary.json"), JSON.stringify(report, null, 2));
    return report;
}

if (!process.env.NODE_TEST_CONTEXT && process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try { process.loadEnvFile(); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const evaluate = process.argv.includes("--completion-review") ? runCompletionReviewEvaluation : runDecisionEvaluation;
    evaluate(process.env).then(report => {
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = report.status === "passed" ? 0 : report.status === "incomplete" ? 2 : 1;
    }).catch(error => {
        console.error(JSON.stringify({ status: "incomplete", errorType: error instanceof Error ? error.name : "UnknownError" }));
        process.exitCode = 2;
    });
}
