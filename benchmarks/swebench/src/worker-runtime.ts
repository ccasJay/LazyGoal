import { isRecord } from "../../../packages/contracts/src/index";
import type { LLMAdapter } from "../../../packages/llm-core/src/index.js";
import type { PromptBundleRenderer } from "../../../packages/prompt-renderer/src/index.js";
import type { ModelConversationMessage } from "../../../packages/model-view/src/index.js";
import type { ContextCompactor } from "../../../packages/context-budget/src/index.js";
import type {
    AcpPromptContent,
    AcpPromptResult,
    AcpSession,
    AcpSessionFactory,
    AcpSessionInput,
} from "../../../packages/acp/src/index.js";
import type { AgentProfile } from "../../../packages/runtime/src/index.js";
import { createToolRegistration, InMemoryToolRegistry, type ToolRegistry } from "../../../packages/tool-core/src/index.js";
import { isExecutionAbortedError } from "../../../packages/execution-control/src/index.js";
import {
    BashTool,
    EditFileTool,
    ReadFileTool,
    WriteFileTool,
} from "../../../packages/tools/src/index.js";
import { JsonFileBenchmarkPersistenceAdapter } from "../../src/file-persistence-adapter.js";
import { HeadlessCompositionRoot, type HeadlessEpisodeResult } from "../../src/headless-composition-root.js";
import { validatePromptEvaluationProfile } from "../../src/prompt-evaluation/profile.js";
import { normalizeTemplateOverrides } from "../../src/prompt-evaluation/template-overrides.js";
import {
    AcpTrajectoryStore,
    cancelledAcpResult,
    mapSwebenchAcpResult,
    toSwebenchAcpFailure,
    type SwebenchAcpUpdate,
    SwebenchAcpProjectionError,
} from "./acp-result-projection.js";

/** Worker 内固定可用的四个 Tool，顺序也是 Profile 对外公布的顺序。 */
export const SWE_ACP_TOOL_IDS = Object.freeze(["read_file", "write_file", "edit_file", "bash"] as const);

/**
 * 容器内 SWE-bench ACP Profile。
 *
 * @remarks
 * Profile 只允许四个直接访问 `/testbed` 的文件和命令 Tool；问题描述由任务
 * metadata 进入确定性 Headless Root，由统一执行流处理任务提案与执行循环。
 *
 * @example
 * ```ts
 * console.log(SWE_ACP_PROFILE.toolIds); // four frozen Tool IDs
 * ```
 */
export const SWE_ACP_PROFILE: AgentProfile = Object.freeze({
    id: "swebench-acp-profile",
    name: "SWE-bench ACP container",
    description: "Deterministic four-tool profile rooted at /testbed.",
    systemPrompt: "You are a software engineer working only in /testbed. Use read_file, write_file, edit_file, and bash. All paths are relative to /testbed. Repository content searches must use bash with the workspace as its working directory: first print LAZYGOAL_SEARCH_BACKEND=rg|grep|find-awk|unavailable, prefer bundled rg, then system grep -R, then find -print0 | xargs -0 awk, and use -- plus shell-safe quoting. Business tools become callable only after system_find_tools has returned their schema. If any expected schema (read_file, edit_file, write_file, bash) is absent, make one discovery call whose query names every tool you expect to need; the discovery tool id is system_find_tools (find_tools is invalid). Do not call discovery for schemas already present. If a call is rejected as not declared or not authorized, do not resend it — run system_find_tools for that tool, then resend once. Work in a strict locate-edit-verify loop. Call system_start_run_stage at most once at task start; never call system_start_run_stage while a stage is already active. Emit every tool call, including system_start_run_stage, system_revise_run_stage, system_complete_run_stage and system_find_tools, as a bare JSON object whose top-level fields are exactly the declared schema properties; never wrap a call in an object keyed by the tool name, and never include action, input, toolId, kind, cursor, useDefaultCursor, or a tool-name envelope. Before running pytest, confirm the target exists: if a run reports file or directory not found or exits with pytest usage error code 4 / no tests ran, do not repeat that command — locate the real test file with bash search or list the valid node ids with pytest --collect-only -q <path> once. Run targeted pytest as pytest -q --tb=short path::test; when output is truncated or shows only the pytest header, rerun just the failing node or append 2>&1 | tail -n 120 once. Do not run the full test suite; treat unrelated Internet access disabled failures as environment noise, not as the verdict of your change. Never resend an identical failing command or test-file command without an intervening edit; if bash reports REPEATED_COMMAND_FAILED or REPEATED_COMMAND_BLOCKED, your next call must be edit_file or write_file. If read_file reports FILE_NOT_FOUND, a directory path, or REPEATED_FILE_NOT_FOUND, do not call read_file again on that exact path; use the returned candidates (for a package candidate, read <candidate>/__init__.py), any indexFile or resolvedFrom, or bash search with a symbol/class name. Before changing validation, exception messages, or public behavior, use bash search for the current message/function and read the assertions you must preserve; when an issue asks for a clearer message, keep existing behavior for missing data and add the new message as a separate branch rather than replacing semantics existing tests assert. After at most two reads or searches on the same file, make one edit_file or write_file change; if six business-tool calls have produced no successful edit, stop investigating and edit from the evidence already gathered. If edit_file reports STRING_NOT_FOUND, never resend that oldString: copy the verbatim region text the tool returned, and on a second miss on the same file call write_file with the corrected full file content. A stage or task is complete only with a committed edit observation and a later targeted verification bash observation showing the new behavior.",
    instructions: Object.freeze([
        "Call system_start_run_stage at most once at task start. While a stage is executing, never call system_start_run_stage again; use business tools (read_file, edit_file, bash) to locate, edit, and verify, and complete with system_complete_run_stage.",
        "Before your first business-tool call, ensure every expected business-tool schema is present. If any of read_file, write_file, edit_file or bash is absent, call system_find_tools exactly once with a query naming every tool you expect to need. A business tool is not callable until its schema has been returned, and calling an undiscovered tool is rejected as not declared or not authorized. The discovery id is system_find_tools; find_tools is never valid. If a repair names a tool id that is not declared, that is a discovery gap: run system_find_tools for that tool and resend once, never answer the same feedback with the same payload a third time.",
        "Emit every tool call, including system_start_run_stage, system_revise_run_stage, system_complete_run_stage and system_find_tools, as a bare JSON object whose top-level fields are exactly the declared schema properties. Never include action, input, toolId, kind, cursor, useDefaultCursor, or a tool-name envelope. For system_start_run_stage send the declared target and acceptanceCriteria fields; for system_revise_run_stage add reason. If a repair says extra_field, remove exactly that field; if it names action or input, drop the wrapper and resend only the inner declared schema arguments.",
        "Use read_file, write_file, edit_file, and bash only; all paths are relative to /testbed. Use bash for repository content searches with the declared rg/grep/find-awk fallback policy.",
        "Do not access model configuration, credentials, or files outside /testbed.",
        "If read_file returns FILE_NOT_FOUND, a directory-path error, or REPEATED_FILE_NOT_FOUND, do not call read_file again on that exact path in this run. Never guess similar non-existent module names; use the returned candidates entry (for a package candidate, read <candidate>/__init__.py), any indexFile or resolvedFrom, or bash search for the symbol/class across the parent directory to locate the real defining file.",
        "Before any pytest run, confirm the target exists. If a run reports ERROR: file or directory not found: <path> or exits with pytest usage-error code 4 / no tests ran, do not rerun that command or a cosmetic variant: locate the real module with bash search, or list valid node ids once with pytest --collect-only -q <path>. Then run pytest -q --tb=short path::test. If bash output is truncated or begins with the pytest header but contains no FAILED/assertion line, rerun only the reported failing node id or append 2>&1 | tail -n 120 once. Do not run the full test suite; unrelated Internet access disabled failures are environment noise, not the verdict of your change.",
        "If bash exits non-zero, read the failing test name, exception, or assertion and edit the implementation or change the command before another run. If bash returns REPEATED_COMMAND_FAILED or REPEATED_COMMAND_BLOCKED, the next business-tool call must be edit_file or write_file, not bash. A third run of the same failing command family without an edit in between is a protocol violation.",
        "For local repository work omit sandboxAccess entirely; never send an empty sandboxAccess.network.targets list.",
        "After at most two read_file or bash search observations on the same file, the next call must be edit_file or write_file unless you are reading a different file for a newly named dependency.",
        "If edit_file reports STRING_NOT_FOUND, do not resend that oldString and do not rebuild it from memory or from a pre-edit read. An earlier edit of your own may have rewritten that region: use the verbatim current region text the tool returned, or re-read the exact 10-30 line window, and anchor on a short unique contiguous block. On a second STRING_NOT_FOUND for the same file, stop anchoring and call write_file with the corrected full file content. An oldString equal to newString is always invalid.",
        "A repeated identical failed edit, read path, or bash command is a protocol violation: track it explicitly and change the code or invocation before retrying.",
        "If six business-tool calls have produced no edit, stop investigating and make one edit from the evidence already gathered; a plausible, revisable patch beats an exhausted step budget. If bash returns a classified failure such as TEST_TARGET_MISSING or TEST_USAGE_ERROR, your next call must be edit_file, write_file, or a discovery call for the real test file — never another run of the same command.",
        "Before changing validation or exception text, use bash search on the test suite for the existing message/function and read the assertions you must preserve. If the issue asks for a clearer error message, keep the existing branch for missing data and add a separate branch for the new case; do not replace semantics that existing tests assert.",
        "A stage or task completion requires a committed edit_file or write_file observation and a later targeted verification bash observation showing the new behavior. A summary, plan statement, a read observation, or an unchanged failing test is insufficient; if a stage is rejected for no edit or for breaking existing tests, the next call must be the missing edit or the test-preserving correction, not another read or completion.",
        "If the test module you planned to run does not exist, run the nearest existing test file located with bash search, or a python -c import/behaviour smoke check, instead of repeating the missing path.",
        "If the same test still fails after two code edits, stop editing and report the remaining failure with its assertion text rather than continuing to loop, then make the most defensible correction to the branch the assertion names.",
        "Complete only after the repository change is ready and relevant targeted verification has run.",
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
    /** 对外冻结的四个 Tool 配置。 */
    readonly profile: AgentProfile;
    /** 只包含本次 Worker 工作区实例的 Tool 实现。 */
    readonly registry: ToolRegistry;
}

/**
 * 为一个 Worker 会话装配四个独立 Tool 实例；不会复用其他题目的 Registry。
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
        createToolRegistration(new BashTool(workspaceRoot, { enableSeatbelt: false, truncationMode: "head_tail" })),
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
    /** Prompt Evaluation 传入并供 Worker 重验的基准 Profile。 */
    readonly baseProfile?: AgentProfile;
    /** Prompt Evaluation 传入的候选 Profile。 */
    readonly profile?: AgentProfile;
    /** Prompt Evaluation 传入的可选框架模板覆盖映射。 */
    readonly templateOverrides?: Readonly<Record<string, string>>;
}

/**
 * 校验 SWE-bench 候选 Profile 保持固定 5 个工具白名单与 `/testbed` 工作区约束。
 *
 * @param profile - 公共层派生或 ACP metadata 反序列化的候选 Profile。
 * @returns 深冻结且可交给 Headless Root 的候选 Profile。
 * @throws 冻结字段变化或指令删除 SWE-bench 必需工具或 `/testbed` 边界时抛出。
 * @example
 * ```ts
 * const candidate = validateSwebenchPromptEvaluationProfile(profile);
 * ```
 */
export function validateSwebenchPromptEvaluationProfile(profile: unknown): AgentProfile {
    const validated = validatePromptEvaluationProfile(profile, SWE_ACP_PROFILE);
    const promptText = `${validated.systemPrompt}\n${validated.instructions.join("\n")}`;
    if (!promptText.includes("/testbed")) {
        throw new TypeError("SWE-bench candidate prompt must reference /testbed");
    }
    for (const toolId of SWE_ACP_TOOL_IDS) {
        if (!promptText.includes(toolId)) {
            throw new TypeError(`SWE-bench candidate prompt must reference ${toolId}`);
        }
    }
    return validated;
}

/**
 * 在 ACP `session/new` 的 metadata 边界校验并提取 SWE-bench 任务身份。
 *
 * @param value - 来自 Worker wire boundary 的未知 metadata。
 * @returns 通过字段、标识和模式校验的当前任务 metadata。
 * @throws metadata 缺失、类型错误或身份字段不符合当前协议时抛出。
 * @example
 * ```ts
 * const metadata = parseSwebenchAcpTaskMetadata(sessionMeta);
 * console.log(metadata.instanceId, metadata.maxSteps);
 * ```
 */
export function parseSwebenchAcpTaskMetadata(value: unknown): SwebenchAcpTaskMetadata {
    if (!isRecord(value)
        || typeof value.instanceId !== "string"
        || typeof value.repo !== "string"
        || typeof value.baseCommit !== "string"
        || typeof value.problemStatement !== "string"
        || typeof value.goalId !== "string"
        || typeof value.runId !== "string"
        || typeof value.maxSteps !== "number"
        || !Number.isSafeInteger(value.maxSteps)) {
        throw new TypeError("Invalid SWE-bench ACP session metadata");
    }
    const profiles = parseSwebenchPromptEvaluationProfiles(value);
    const templateOverrides = normalizeTemplateOverrides(value.templateOverrides);
    const metadata: SwebenchAcpTaskMetadata = {
        instanceId: value.instanceId,
        repo: value.repo,
        baseCommit: value.baseCommit,
        problemStatement: value.problemStatement,
        goalId: value.goalId,
        runId: value.runId,
        maxSteps: value.maxSteps,
        ...profiles,
        ...(templateOverrides === undefined ? {} : { templateOverrides }),
    };
    validateMetadata(metadata);
    return metadata;
}

function parseSwebenchPromptEvaluationProfiles(
    record: Record<string, unknown>,
): Pick<SwebenchAcpTaskMetadata, "baseProfile" | "profile"> {
    if (record.baseProfile === undefined && record.profile === undefined) return {};
    if (record.baseProfile === undefined || record.profile === undefined) {
        throw new TypeError("SWE-bench Prompt Evaluation metadata requires baseProfile and profile together");
    }
    const baseProfile = validatePromptEvaluationProfile(record.baseProfile, SWE_ACP_PROFILE);
    if (
        baseProfile.systemPrompt !== SWE_ACP_PROFILE.systemPrompt
        || baseProfile.instructions.length !== SWE_ACP_PROFILE.instructions.length
        || !baseProfile.instructions.every((val, idx) => val === SWE_ACP_PROFILE.instructions[idx])
    ) {
        throw new TypeError("SWE-bench Prompt Evaluation baseProfile must match the Worker base Profile");
    }
    const profile = validateSwebenchPromptEvaluationProfile(record.profile);
    return { baseProfile, profile };
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
    /** 生产默认 `/testbed`；测试可传临时 workspace 观察四个 Tool。 */
    readonly workspaceRoot?: string;
    /** 生产默认 `/opt/lazygoal/state`；每个 instance 使用独立 namespace。 */
    readonly stateRoot?: string;
    /** 取消当前 Worker Root 调用并传播到 Runtime、模型和 Tool。 */
    readonly signal?: AbortSignal;
    /** 绑定一个 ACP Session；省略时不发送 Tool 更新。 */
    readonly sessionId?: string;
    /** 在 Trajectory 事实提交后接收 ACP Tool 更新。 */
    readonly trajectoryUpdate?: (notification: SwebenchAcpUpdate) => Promise<void>;
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
    const sessionId = options.sessionId;
    const trajectoryUpdate = options.trajectoryUpdate;
    if (trajectoryUpdate !== undefined && sessionId === undefined) {
        throw new TypeError("trajectoryUpdate requires sessionId");
    }
    const workspaceRoot = options.workspaceRoot ?? "/testbed";
    const stateRoot = options.stateRoot ?? "/opt/lazygoal/state";
    const toolSet = createSwebenchAcpToolSet(workspaceRoot);
    const basePersistence = new JsonFileBenchmarkPersistenceAdapter<SwebenchAcpTaskMetadata>({
        rootDirectory: stateRoot,
        namespaceFor: (task) => task.instanceId,
        enableTrace: true,
    });
    const persistence = trajectoryUpdate === undefined
        ? basePersistence
        : (() => {
            if (sessionId === undefined) throw new TypeError("trajectoryUpdate requires sessionId");
            return {
                namespaceFor: (task: SwebenchAcpTaskMetadata) => basePersistence.namespaceFor(task),
                open: async (context: Parameters<typeof basePersistence.open>[0]) => {
                    const bindings = await basePersistence.open(context);
                    return {
                        ...bindings,
                        trajectoryStore: new AcpTrajectoryStore(bindings.trajectoryStore, {
                            sessionId,
                            update: trajectoryUpdate,
                            ...(options.signal === undefined ? {} : { signal: options.signal }),
                        }),
                    };
                },
            };
        })();
    const activeProfile = options.metadata.profile === undefined
        ? toolSet.profile
        : validateSwebenchPromptEvaluationProfile(options.metadata.profile);
    const root = new HeadlessCompositionRoot<SwebenchAcpTaskMetadata, null>({
        benchmarkId: "swebench-acp",
        workspaceRoot,
        profile: activeProfile,
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

/** Worker 内一次 ACP Session 的 Headless Runtime 装配输入。 */
export interface SwebenchAcpSessionFactoryOptions extends Omit<SwebenchAcpRuntimeOptions, "signal" | "sessionId" | "trajectoryUpdate"> {
    /** ACP Prompt 预期携带的唯一问题描述文本。 */
    readonly problemStatement: string;
}

/**
 * 为一个 Worker 连接创建隔离的 ACP Session 工厂。
 *
 * @remarks
 * 每个 Session 只运行一次 Prompt；Prompt 必须包含与 metadata 相同的单个问题文本。
 * Tool 更新由该 Session 的 `update` 回调接收，终态由
 * {@link mapSwebenchAcpResult} 映射。取消返回 `cancelled`，模型、Runtime、通知或
 * 清理错误则抛出不包含供应商凭据的协议错误。
 *
 * @param options - 单题 metadata、模型桥和 Headless Root 装配依赖。
 * @returns 每个连接调用一次的 ACP Session 工厂。
 * @example
 * ```ts
 * const sessions = createSwebenchAcpSessionFactory({
 *     metadata, problemStatement: metadata.problemStatement,
 *     llmAdapter, renderer, contextCompactor,
 * });
 * ```
 */
export function createSwebenchAcpSessionFactory(
    options: SwebenchAcpSessionFactoryOptions,
): AcpSessionFactory {
    if (options.problemStatement.trim() === "") throw new TypeError("problemStatement must be non-empty");
    return {
        async create(input: AcpSessionInput): Promise<AcpSession> {
            let disposed = false;
            let prompting = false;
            return {
                async prompt(content, control): Promise<AcpPromptResult> {
                    if (disposed) throw new SwebenchAcpProjectionError("protocol", "SESSION_DISPOSED", "ACP Session is disposed");
                    if (prompting) throw new SwebenchAcpProjectionError("protocol", "PROMPT_REENTRY", "ACP Session already has a Prompt in progress");
                    const problemStatement = readProblemStatement(content);
                    if (problemStatement.trim() !== options.problemStatement.trim()) {
                        throw new SwebenchAcpProjectionError("protocol", "PROMPT_MISMATCH", "ACP Prompt does not match task metadata");
                    }
                    prompting = true;
                    try {
                        if (control.signal.aborted) return cancelledAcpResult({ goalId: options.metadata.goalId, runId: options.metadata.runId });
                        const result = await runSwebenchAcpTask({
                            ...options,
                            metadata: { ...options.metadata, problemStatement },
                            sessionId: input.sessionId,
                            trajectoryUpdate: input.update,
                            signal: control.signal,
                        });
                        if (control.signal.aborted) return cancelledAcpResult({ goalId: options.metadata.goalId, runId: options.metadata.runId });
                        return mapSwebenchAcpResult(result);
                    } catch (error) {
                        if (control.signal.aborted || isExecutionAbortedError(error)) {
                            return cancelledAcpResult({ goalId: options.metadata.goalId, runId: options.metadata.runId });
                        }
                        throw toSwebenchAcpFailure(error);
                    } finally {
                        prompting = false;
                    }
                },
                async dispose(): Promise<void> {
                    disposed = true;
                },
            };
        },
    };
}

function readProblemStatement(content: readonly AcpPromptContent[]): string {
    if (content.length !== 1 || content[0]?.type !== "text" || content[0].text.trim() === "") {
        throw new SwebenchAcpProjectionError("protocol", "INVALID_PROMPT", "ACP Prompt must contain one non-empty problem statement");
    }
    return content[0].text;
}

function validateMetadata(metadata: SwebenchAcpTaskMetadata): void {
    if (!/^[a-zA-Z0-9_.-]+__[a-zA-Z0-9_.-]+-\d+$/u.test(metadata.instanceId)) throw new TypeError("instanceId is invalid");
    if (!/^[\w.-]+\/[\w.-]+$/u.test(metadata.repo)) throw new TypeError("repo is invalid");
    if (!/^[a-f0-9]{40}$/u.test(metadata.baseCommit)) throw new TypeError("baseCommit is invalid");
    if (metadata.problemStatement.trim() === "") throw new TypeError("problemStatement must be non-empty");
    if (!/^[A-Za-z0-9_.-]+$/u.test(metadata.goalId) || !/^[A-Za-z0-9_.-]+$/u.test(metadata.runId)) throw new TypeError("goalId and runId are invalid");
    if (!Number.isSafeInteger(metadata.maxSteps) || metadata.maxSteps <= 0) throw new RangeError("maxSteps must be positive");
}

