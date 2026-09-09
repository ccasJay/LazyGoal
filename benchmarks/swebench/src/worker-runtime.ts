import type { ContextCompactor, LLMAdapter, ModelConversationMessage, PromptBundleRenderer } from "../../../packages/agent/src/index.js";
import { createToolRegistration, InMemoryToolRegistry, type AgentProfile, type ToolRegistry } from "../../../packages/runtime/src/index.js";
import {
    BashTool,
    EditFileTool,
    GrepTool,
    ReadFileTool,
    WriteFileTool,
} from "../../../packages/tools/src/index.js";
import { JsonFileBenchmarkPersistenceAdapter } from "../../src/file-persistence-adapter.js";
import { HeadlessCompositionRoot, type HeadlessEpisodeResult } from "../../src/headless-composition-root.js";

/** Worker 内固定可用的五个 Tool，顺序也是 Profile 对外公布的顺序。 */
export const SWE_ACP_TOOL_IDS = Object.freeze(["read_file", "write_file", "edit_file", "grep", "bash"] as const);

/**
 * 容器内 SWE-bench ACP Profile。
 *
 * @remarks
 * Profile 只允许五个直接访问 `/testbed` 的文件和命令 Tool；问题描述由任务
 * metadata 进入确定性 Headless Root，不创建交互式 Preparation 模型调用。
 *
 * @example
 * ```ts
 * console.log(SWE_ACP_PROFILE.toolIds); // five frozen Tool IDs
 * ```
 */
export const SWE_ACP_PROFILE: AgentProfile = Object.freeze({
    id: "swebench-acp-profile",
    name: "SWE-bench ACP container",
    description: "Deterministic five-tool profile rooted at /testbed.",
    systemPrompt: "You are a software engineer working only in /testbed. Use the authorized tools to resolve the issue and verify the change.",
    instructions: Object.freeze([
        "Use read_file, write_file, edit_file, grep, and bash only; all paths are relative to /testbed.",
        "Do not access model configuration, credentials, or files outside /testbed.",
        "Complete only after the repository change is ready and relevant verification has run.",
    ]),
    toolIds: SWE_ACP_TOOL_IDS,
});

/**
 * 绑定固定 Profile 与工作区根的容器 Tool Registry。
 *
 * @example
 * ```ts
 * const { registry } = createSwebenchAcpToolSet("/testbed");
 * registry.get("read_file");
 * ```
 */
export interface SwebenchAcpToolSet {
    /** 对外冻结的五个 Tool 配置。 */
    readonly profile: AgentProfile;
    /** 只包含本次 Worker 工作区实例的 Tool 实现。 */
    readonly registry: ToolRegistry;

}

/**
 * 为一个 Worker 会话装配五个独立 Tool 实例；不会复用其他题目的 Registry。
 *
 * @param workspaceRoot - 容器工作区；生产 Worker 固定为 `/testbed`。
 * @returns 固定 Profile 和新建的内存 Registry。
 * @example
 * ```ts
 * const tools = createSwebenchAcpToolSet("/testbed");
 * const read = tools.registry.get("read_file");
 * ```
 */
export function createSwebenchAcpToolSet(workspaceRoot: string): SwebenchAcpToolSet {
    const registry = new InMemoryToolRegistry([
        createToolRegistration(new ReadFileTool(workspaceRoot)),
        createToolRegistration(new WriteFileTool(workspaceRoot)),
        createToolRegistration(new EditFileTool(workspaceRoot)),
        createToolRegistration(new GrepTool(workspaceRoot)),
        createToolRegistration(new BashTool(workspaceRoot)),
    ]);
    return { profile: SWE_ACP_PROFILE, registry };
}

/**
 * 宿主经预检后传给 Worker 的题目 metadata；Prompt 只携带 `problemStatement`。
 *
 * @example
 * ```ts
 * const metadata: SwebenchAcpTaskMetadata = {
 *     instanceId: "astropy__astropy-12907",
 *     repo: "astropy/astropy",
 *     baseCommit: "a".repeat(40),
 *     problemStatement: "Fix the reported issue.",
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     maxSteps: 8,
 *     structuredOutputMode: "strict",
 * };
 * ```
 */
export interface SwebenchAcpTaskMetadata {
    /** 题目实例的稳定标识；同时作为持久化 namespace 输入。 */
    readonly instanceId: string;
    /** 数据集中的仓库标识。 */
    readonly repo: string;
    /** 宿主预检确认的 40 位 base commit。 */
    readonly baseCommit: string;
    /** 题目原始问题描述；不得包含参考补丁或评分结果。 */
    readonly problemStatement: string;
    /** 本次 Goal 的稳定标识。 */
    readonly goalId: string;
    /** 本次 Run 的稳定标识。 */
    readonly runId: string;
    /** executing 阶段允许的最大 Step 数。 */
    readonly maxSteps: number;
    /** 宿主 Adapter 固定的结构化输出模式。 */
    readonly structuredOutputMode: LLMAdapter["structuredOutputMode"];
}

/**
 * Worker Headless Root 的模型与持久化装配依赖。
 *
 * @example
 * ```ts
 * const options: SwebenchAcpRuntimeOptions = {
 *     metadata,
 *     llmAdapter,
 *     renderer,
 *     contextCompactor,
 * };
 * ```
 */
export interface SwebenchAcpRuntimeOptions {
    /** 已经由宿主校验的题目 metadata。 */
    readonly metadata: SwebenchAcpTaskMetadata;
    /** 只通过模型 RPC 访问宿主的 LLM Adapter。 */
    readonly llmAdapter: LLMAdapter;
    /** Worker 使用的 Prompt Renderer。 */
    readonly renderer: PromptBundleRenderer;
    /** Worker 使用的上下文裁剪策略。 */
    readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    /** 生产默认 `/testbed`；测试可传临时 workspace 观察五个 Tool。 */
    readonly workspaceRoot?: string;
    /** 生产默认 `/opt/lazygoal/state`；每个 instance 使用独立 namespace。 */
    readonly stateRoot?: string;
    /** 取消当前 Worker Root 调用并传播到 Runtime、模型和 Tool。 */
    readonly signal?: AbortSignal;
}

/**
 * 在当前容器内运行一个独立的 SWE-bench Headless Root。
 *
 * @param options - 已校验 metadata、宿主 LLM Adapter、Prompt 装配和容器状态根。
 * @returns 现有 Headless Root 的 Goal、Runtime progress、Runner、模型和 locator 事实。
 * @throws metadata、Persistence、Tool、Runtime 或模型失败时传播原始错误。
 * @example
 * ```ts
 * const result = await runSwebenchAcpTask({
 *   metadata, llmAdapter, renderer, contextCompactor,
 * });
 * console.log(result.goal.state.run.status);
 * ```
 */
export async function runSwebenchAcpTask(
    options: SwebenchAcpRuntimeOptions,
): Promise<HeadlessEpisodeResult<null>> {
    validateMetadata(options.metadata);
    if (options.llmAdapter.structuredOutputMode !== options.metadata.structuredOutputMode) {
        throw new TypeError("LLM structured-output mode does not match Worker metadata");
    }
    const workspaceRoot = options.workspaceRoot ?? "/testbed";
    const stateRoot = options.stateRoot ?? "/opt/lazygoal/state";
    const toolSet = createSwebenchAcpToolSet(workspaceRoot);
    const persistence = new JsonFileBenchmarkPersistenceAdapter<SwebenchAcpTaskMetadata>({
        rootDirectory: stateRoot,
        namespaceFor: (task) => task.instanceId,
        enableTrace: true,
    });
    const root = new HeadlessCompositionRoot<SwebenchAcpTaskMetadata, null>({
        benchmarkId: "swebench-acp",
        workspaceRoot,
        profile: toolSet.profile,
        llmAdapter: options.llmAdapter,
        renderer: options.renderer,
        contextCompactor: options.contextCompactor,
        toolPolicy: { evaluate: () => "allow" },
        goalIdGenerator: () => options.metadata.goalId,
        runIdGenerator: () => options.metadata.runId,
        persistence,
        adapter: {
            describeTask: (task) => ({
                intent: task.problemStatement,
                objective: `Resolve ${task.repo} at base commit ${task.baseCommit} in /testbed.\n\n${task.problemStatement}`,
                completionCriteria: ["The requested repository change is implemented and verified in /testbed."],
                maxSteps: task.maxSteps,
            }),
            createEpisode: async () => ({
                registry: toolSet.registry,
                readOutcome: () => null,
                close: async () => undefined,
            }),
        },
    });
    return root.run(options.metadata, options.signal === undefined ? {} : { signal: options.signal });
}

function validateMetadata(metadata: SwebenchAcpTaskMetadata): void {
    if (!/^[a-zA-Z0-9_.-]+__[a-zA-Z0-9_.-]+-\d+$/u.test(metadata.instanceId)) throw new TypeError("instanceId is invalid");
    if (!/^[\w.-]+\/[\w.-]+$/u.test(metadata.repo)) throw new TypeError("repo is invalid");
    if (!/^[a-f0-9]{40}$/u.test(metadata.baseCommit)) throw new TypeError("baseCommit is invalid");
    if (metadata.problemStatement.trim() === "") throw new TypeError("problemStatement must be non-empty");
    if (!/^[A-Za-z0-9_.-]+$/u.test(metadata.goalId) || !/^[A-Za-z0-9_.-]+$/u.test(metadata.runId)) throw new TypeError("goalId and runId are invalid");
    if (!Number.isSafeInteger(metadata.maxSteps) || metadata.maxSteps <= 0) throw new RangeError("maxSteps must be positive");
    if (metadata.structuredOutputMode !== "strict" && metadata.structuredOutputMode !== "prompt_only") throw new TypeError("structuredOutputMode is invalid");
}
