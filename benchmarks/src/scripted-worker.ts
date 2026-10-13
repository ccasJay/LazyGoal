import { randomUUID } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { createPromptBundleRenderer, createDefaultDynamicSectionRegistry, DEFAULT_PROMPT_BUNDLE_MANIFEST, DropOldestContextCompactor, type LLMAdapter } from "../../packages/agent/src/index.js";
import { serveLazyGoalAcpAgent } from "../../packages/acp/src/index.js";
import type { ToolRegistry } from "../../packages/tool-core/src/index.js";
import type { AgentProfile } from "../../packages/runtime/src/index.js";
import { HeadlessCompositionRoot, type HeadlessSession } from "./headless-composition-root.js";
import { JsonFileBenchmarkPersistenceAdapter } from "./file-persistence-adapter.js";
import { MultiplexedConnection, createAcpMuxStream } from "./multiplex.js";
import { RpcLlmAdapter } from "./llm-rpc.js";
import { parseWorkerOperation, record, textValue } from "./scripted-operation.js";

export const CONTEXT_PROMPT_ASSETS = [
    "packages/agent/src/step-prompt/agent-decision@1.njk",
    "packages/agent/src/step-prompt/agent-think@1.njk",
    "packages/agent/src/global-system-prompt/global-overview@1.njk",
    "packages/agent/src/prompting/profile@1.njk",
    "packages/agent/src/prompting/authorized-tools@1.njk",
    "packages/agent/src/prompting/run-mode@1.njk",
    "packages/agent/src/prompting/approved-task@1.njk",
    "packages/agent/src/prompting/goal-plan@1.njk",
    "packages/agent/src/prompting/working-memory@1.njk",
    "packages/agent/src/prompting/goal-context-navigation@1.njk",
];
/** 使用实际构建内嵌模板，不从题目目录读取 Prompt。 */
export function createEmbeddedPromptRenderer() {
    const assets = (globalThis as typeof globalThis & { __lazygoalPromptAssets?: Record<string, string> }).__lazygoalPromptAssets;
    if (assets === undefined) throw new Error("Embedded Worker Prompt assets missing");
    return createPromptBundleRenderer({
        templates: CONTEXT_PROMPT_ASSETS.map(path => ({ id: path.split("/").at(-1)!.replace(".njk", ""), source: assets[path]! })),
        bundles: [DEFAULT_PROMPT_BUNDLE_MANIFEST],
        dynamicSectionRegistry: createDefaultDynamicSectionRegistry(),
    });
}
/** 容器内真实 Runtime Worker；每个连接仅持有一个 Goal 会话。 */
/**
 * 生命周期 Worker 的领域工具装配；工具实现由来源模块拥有。
 * @example
 * ```ts
 * const options: ScriptedWorkerOptions = { toolIds: ["bash"], createRegistry };
 * ```
 */
export interface ScriptedWorkerOptions {
    /** 固定授权 Tool；宿主 metadata 必须与此顺序一致。 */
    readonly toolIds: readonly string[];
    /** 每个容器会话新建 Registry，不共享工具状态。 */
    createRegistry(workspaceRoot: string): ToolRegistry;
    /** 工程 Worker 的容器内工具权限；原生场景沿用默认策略。 */
    readonly allowTools?: boolean;
}
/**
 * 共用的脚本会话 Worker；只驱动现有 Runtime 入口，不解释题目或评分。
 * @example
 * ```ts
 * await runScriptedWorker({ toolIds: ["bash"], createRegistry });
 * ```
 */
export async function runScriptedWorker(options: ScriptedWorkerOptions): Promise<void> {
    const mux = new MultiplexedConnection({ input: Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>, output: Writable.toWeb(process.stdout) as WritableStream<Uint8Array> });
    const renderer = createEmbeddedPromptRenderer();
    const workerInstanceId = randomUUID();
    const connection = serveLazyGoalAcpAgent({
        stream: createAcpMuxStream(mux),
        sessions: {
            async create(input) {
                const meta = record(input.sessionMeta);
                if (Object.keys(meta).some(key => !["profile", "maxSteps", "mode", "restoreRef", "nativeIdentity"].includes(key))) throw new Error("Unexpected context session metadata");
                const profileRaw = record(meta.profile);
                if (!Array.isArray(profileRaw.instructions) || !profileRaw.instructions.every(x => typeof x === "string") ||
                    JSON.stringify(profileRaw.toolIds) !== JSON.stringify(options.toolIds)) throw new Error("Invalid Worker Profile");
                const profile: AgentProfile = { id: textValue(profileRaw.id), systemPrompt: textValue(profileRaw.systemPrompt), instructions: profileRaw.instructions as string[], toolIds: options.toolIds };
                if (!Number.isSafeInteger(meta.maxSteps) || (meta.maxSteps as number) <= 0 || (meta.mode !== "strict" && meta.mode !== "prompt_only")) throw new Error("Invalid Worker budget/mode");
                const restoreRef = meta.restoreRef === undefined ? undefined : record(meta.restoreRef);
                let nativeIdentity: NonNullable<LLMAdapter["nativeConversationIdentity"]> | undefined;
                if (meta.nativeIdentity !== undefined) {
                    const identity = record(meta.nativeIdentity);
                    if (!["openai", "openai-compatible", "google"].includes(String(identity.provider)) || !["openai-chat", "gemini-content"].includes(String(identity.protocol))) throw new Error("Invalid native conversation identity");
                    nativeIdentity = { provider: identity.provider as NonNullable<LLMAdapter["nativeConversationIdentity"]>["provider"], endpoint: textValue(identity.endpoint), model: textValue(identity.model), protocol: identity.protocol as NonNullable<LLMAdapter["nativeConversationIdentity"]>["protocol"] };
                }
                const adapter = new RpcLlmAdapter({ stream: mux.channel("llm"), structuredOutputMode: meta.mode,
                    ...(nativeIdentity === undefined ? {} : { nativeConversationIdentity: nativeIdentity }) });
                const controller = new AbortController();
                input.signal.addEventListener("abort", () => controller.abort(), { once: true });
                let session: HeadlessSession<null> | undefined;
                const root = (prompt: string) => new HeadlessCompositionRoot({
                    benchmarkId: "context", workspaceRoot: input.cwd, profile, ...(options.allowTools ? { toolPolicy: { evaluate: () => "allow" as const } } : {}), llmAdapter: adapter, renderer, contextCompactor: new DropOldestContextCompactor(),
                    persistence: new JsonFileBenchmarkPersistenceAdapter<{ prompt: string }>({ rootDirectory: "/workspace/state", namespaceFor: () => "session", enableTrace: true }),
                    adapter: {
                        describeTask: task => ({ intent: task.prompt, objective: "Follow the current user request.", completionCriteria: ["Follow the current user request."], maxSteps: meta.maxSteps as number }),
                        createEpisode: async () => ({ registry: options.createRegistry(input.cwd), readOutcome: () => null, close: async () => undefined }),
                    },
                });
                return {
                    async prompt(content, control) {
                        if (content.length !== 1 || content[0]?.type !== "text") throw new Error("Expected one JSON operation");
                        const operation = parseWorkerOperation(JSON.parse(content[0].text));
                        const abort = () => controller.abort();
                        control.signal.addEventListener("abort", abort, { once: true });
                        try {
                            session ??= await root(operation.prompt).openSession({ prompt: operation.prompt }, {
                                signal: controller.signal,
                                ...(restoreRef === undefined ? {} : { restoreRef: { goalId: textValue(restoreRef.goalId), runId: textValue(restoreRef.runId) } }),
                            });
                            const before = operation.operation === "launch" ? undefined : await session.restore();
                            const interaction = before?.state.run.pendingInteraction;
                            const result = operation.operation === "launch" ? await session.launch()
                                : operation.operation === "continue" ? await session.continue(operation.prompt)
                                : await session.resume(interaction?.kind === "ask_user"
                                    ? { kind: "answer_ask_user", requestId: interaction.requestId, answers: (operation.answers ?? []).map(answer => ({ questionId: answer.questionId, optionIds: [], otherText: answer.answer })) }
                                    : { kind: "message", content: operation.prompt });
                            const goal = result.goal;
                            return { stopReason: "end_turn" as const, meta: { boundary: {
                                workerInstanceId, workerPid: process.pid, goalId: goal.id, runId: goal.state.run.id, status: goal.state.run.status, sequence: goal.state.run.committedThroughSequence,
                                userMessage: goal.state.messages.filter(message => message.role === "user").at(-1)?.content ?? operation.prompt,
                                ...(goal.state.run.stopReason === undefined ? {} : { stopReason: goal.state.run.stopReason.kind }),
                                ...(result.progress.ok && result.progress.kind === "waiting" ? { waitingFor: result.progress.waitingFor } : {}),
                                ...(goal.state.run.pendingInteraction?.kind === "ask_user" ? { requestId: goal.state.run.pendingInteraction.requestId, questions: goal.state.run.pendingInteraction.questions.map(q => ({ id: q.id, question: q.question })) } : {}),
                            }, usage: result.model.usage ?? null } };
                        } catch (error) { process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + "\n"); throw error; }
                        finally { control.signal.removeEventListener("abort", abort); }
                    },
                    async dispose() { await session?.close(); await adapter.close(); },
                };
            },
        },
    });
    await connection.closed;
    await mux.close();
}
