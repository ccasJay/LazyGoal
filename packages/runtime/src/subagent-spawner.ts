import { randomUUID } from "node:crypto";
import type { ExecutionControl } from "../../execution-control/src/index";
import type { ToolExecutionContext } from "../../tool-core/src/index";
import type { AgentProfile, AgentProfileRegistry } from "./agent-profile";
import { isRunEnded } from "./domain";
import type { GoalModelSelection, RunEndStatus } from "./domain";
import type { GoalStore } from "./goal-store";
import type { Session } from "./session";
import { SessionManager, type SessionCreateRequest, type SessionManagerDependencies } from "./session-manager";

/**
 * spawn_subagent 工具的标准 ID 标识。
 */
export const SPAWN_SUBAGENT_TOOL_ID = "spawn_subagent" as const;

/**
 * 启动子 Agent 任务的入参契约。
 *
 * @example
 * ```ts
 * const input: SpawnSubagentInput = {
 *   intent: "Run all test suites and fix lint errors",
 *   title: "Fix lint errors",
 * };
 * ```
 */
export interface SpawnSubagentInput {
    /**
     * 子任务的核心意图描述（非空字符串）。
     *
     * @minLength 1
     */
    readonly intent: string;

    /**
     * 可选的子任务标题。
     */
    readonly title?: string;
}

/**
 * 子 Agent 任务执行完成后的观察结果。
 *
 * @example
 * ```ts
 * const output: SpawnSubagentOutput = {
 *   childGoalId: "child-goal-123",
 *   status: "completed",
 *   answer: "All tests pass successfully.",
 * };
 * ```
 */
export interface SpawnSubagentOutput {
    /**
     * 所派生的子 Goal ID。
     */
    readonly childGoalId: string;

    /**
     * 子 Agent 任务达到的终态（仅限 completed, failed, cancelled）。
     */
    readonly status: RunEndStatus;

    /**
     * 当状态为 completed 时子任务的最终回答。
     */
    readonly answer?: string;

    /**
     * 当状态为 failed 或 cancelled 时的简洁失败/取消原因。
     */
    readonly reason?: string;
}

/**
 * 子代理衍生执行器抽象接口。
 *
 * @example
 * ```ts
 * const spawner: SubagentSpawner = {
 *   spawn: async (input, context, control) => {
 *     return { childGoalId: "child-1", status: "completed", answer: "Done" };
 *   },
 * };
 * ```
 */
export interface SubagentSpawner {
    /**
     * 派生并等待子代理执行至终态。
     *
     * @param input - 衍生任务入参
     * @param context - 当前工具执行上下文（包含父 Goal ID）
     * @param control - 父 Run 的执行控制；取消时中断子 Run 并等待其终态。
     * @returns 子代理执行终态结果。
     * @throws 子会话创建、Interrupt 受理或会话读取失败时抛出异常。
     */
    spawn(
        input: SpawnSubagentInput,
        context: ToolExecutionContext,
        control?: ExecutionControl,
    ): Promise<SpawnSubagentOutput>;
}

/**
 * 子 Agent 意图前缀，显式注入自主执行契约要求。
 */
export const SUBAGENT_INTENT_PREFIX =
    "You are an autonomous delegated child subagent. Complete the assigned subtask independently and autonomously. Do not ask the user any questions, do not wait for user input, and finish the subtask directly.\n\nAssigned Task:\n";

/**
 * 包装 AgentProfileRegistry，将子 Agent 的 Profile 中的 spawn_subagent 工具剥除，从运行时层面杜绝嵌套派发。
 *
 * @param registry - 底层父 AgentProfileRegistry
 * @returns 移除了 spawn_subagent 权限的子代理 ProfileRegistry
 *
 * @example
 * ```ts
 * const childProfiles = createChildProfileRegistry(parentProfiles);
 * const profile = childProfiles.get("default");
 * // profile.toolIds 中不包含 spawn_subagent
 * ```
 */
export function createChildProfileRegistry(
    registry: AgentProfileRegistry,
): AgentProfileRegistry {
    return {
        get(profileId: string): AgentProfile | undefined {
            const profile = registry.get(profileId);
            if (!profile) return undefined;
            return {
                ...profile,
                toolIds: profile.toolIds.filter((id) => id !== SPAWN_SUBAGENT_TOOL_ID),
            };
        },
    };
}

/**
 * 基于运行时 SessionManager 与 GoalStore 的子 Agent 派发器实现。
 *
 * @remarks
 * 为每个派生的子 Goal 创建独立的子 SessionManager 实例（共享底层 GoalStore 与事件总线，但隔离 activeGoal 槽位并屏蔽递归衍生工具）。
 *
 * @example
 * ```ts
 * const spawner = new RuntimeSubagentSpawner(goalStore, sessionManagerDependencies);
 * const output = await spawner.spawn({ intent: "do something" }, context, control);
 * ```
 */
export class RuntimeSubagentSpawner implements SubagentSpawner {
    constructor(
        private readonly goalStore: GoalStore,
        private readonly baseDependencies: SessionManagerDependencies,
    ) {}

    protected async createChildSession(
        deps: SessionManagerDependencies,
        request: SessionCreateRequest,
    ): Promise<Session> {
        const childSessionManager = new SessionManager(deps);
        const createResult = await childSessionManager.create(request);
        if (!createResult.ok) {
            throw new Error(`Failed to create child goal session: ${JSON.stringify(createResult.error ?? createResult)}`);
        }
        return createResult.session;
    }

    async spawn(
        input: SpawnSubagentInput,
        context: ToolExecutionContext,
        control?: ExecutionControl,
    ): Promise<SpawnSubagentOutput> {
        // 1. 递归防护检查：如果父上下文已处于子 agent 环境中，直接拒绝
        const parentGoal = await this.goalStore.restore(context.goalId);
        if (!parentGoal) {
            throw new Error(`Parent goal ${context.goalId} not found in GoalStore`);
        }

        const parentProfileId = parentGoal.definition.profile.id;
        const parentModelSelection: GoalModelSelection = parentGoal.state.modelSelection;

        // 2. 为子 agent 创建专用的子 SessionManager 依赖项
        // - 共享 store, bus, models, toolRegistry 等
        // - 将 profiles 包装为 childProfileRegistry，剔除 spawn_subagent 权限
        const childProfiles = createChildProfileRegistry(
            this.baseDependencies.profiles,
        );
        const childDeps: SessionManagerDependencies = {
            ...this.baseDependencies,
            profiles: childProfiles,
        };

        // 3. 构造子 Goal 意图及内容
        const subagentIntent = `${SUBAGENT_INTENT_PREFIX}${
            input.title ? `[${input.title}]\n` : ""
        }${input.intent}`;

        const childGoalId = randomUUID();
        const session = await this.createChildSession(childDeps, {
            goalId: childGoalId,
            inputId: randomUUID(),
            content: subagentIntent,
            profileId: parentProfileId,
            mode: "normal",
            modelSelection: parentModelSelection,
        });

        // 4. 等待子 Agent 达到终态；父 Run 取消时先中断子 Run，再等持久化终态。
        return new Promise<SpawnSubagentOutput>((resolve, reject) => {
            let settled = false;
            let eventStream: ReturnType<Session["events"]> | undefined;
            let removeAbortListener: (() => void) | undefined;
            let abortRequested = false;
            let parentAbortReason: string | undefined;
            let interruptSubmitted = false;
            let interruptRequest: Promise<void> | undefined;

            const cleanup = () => {
                removeAbortListener?.();
                removeAbortListener = undefined;
                try {
                    eventStream?.close();
                } catch {
                    // ignore stream close errors during settlement
                }
                try {
                    session.detach();
                } catch {
                    // ignore detach errors during settlement
                }
            };

            const finish = (output: SpawnSubagentOutput) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(output);
            };

            const fail = (err: unknown) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(err);
            };

            const checkTerminal = async (): Promise<boolean> => {
                try {
                    const state = await session.read();
                    if (!state || !isRunEnded(state.runStatus)) return false;

                    let answer: string | undefined;
                    let reason: string | undefined;
                    if (state.runStatus === "completed") {
                        const listResult = await session.messages();
                        if (listResult.ok) {
                            const answerMessage = [...listResult.messages]
                                .reverse()
                                .find((message) => message.role === "assistant" && message.purpose === "answer");
                            if (answerMessage !== undefined) {
                                const body = await session.message(answerMessage.messageId);
                                if (body.ok && body.entry?.content) answer = body.entry.content;
                            }
                        }
                    } else if (state.runStatus === "cancelled" && abortRequested) {
                        reason = parentAbortReason ?? "Parent run was cancelled while waiting for subagent";
                    } else {
                        reason = `Subagent terminated with status ${state.runStatus}`;
                    }

                    finish({
                        childGoalId,
                        status: state.runStatus,
                        ...(answer !== undefined ? { answer } : {}),
                        ...(reason !== undefined ? { reason } : {}),
                    });
                    return true;
                } catch (err) {
                    fail(err);
                    return true;
                }
            };

            const requestInterrupt = (): Promise<void> => {
                if (interruptRequest !== undefined) return interruptRequest;
                if (settled || !abortRequested || interruptSubmitted) return Promise.resolve();

                const request = (async () => {
                    const currentState = await session.read();
                    if (!currentState) throw new Error(`Child goal ${childGoalId} disappeared while being cancelled`);
                    if (isRunEnded(currentState.runStatus)) {
                        await checkTerminal();
                        return;
                    }
                    if (currentState.runStatus === "created") return;

                    const admission = await session.send({
                        kind: "interrupt",
                        inputId: randomUUID(),
                        runId: currentState.runId,
                    });
                    if (admission.ok) {
                        interruptSubmitted = true;
                        return;
                    }

                    const latestState = await session.read();
                    if (latestState && isRunEnded(latestState.runStatus)) {
                        await checkTerminal();
                        return;
                    }
                    throw new Error(`Failed to interrupt child goal ${childGoalId}: ${admission.code} ${admission.message}`);
                })();
                interruptRequest = request;
                void request.then(
                    () => { if (interruptRequest === request) interruptRequest = undefined; },
                    () => { if (interruptRequest === request) interruptRequest = undefined; },
                );
                return request;
            };

            const abortSignal = control?.signal;
            const onParentAbort = () => {
                if (settled || abortRequested) return;
                abortRequested = true;
                parentAbortReason = typeof abortSignal?.reason === "string"
                    ? abortSignal.reason
                    : "Parent run was cancelled while waiting for subagent";
                void requestInterrupt().catch(fail);
            };

            (async () => {
                try {
                    eventStream = session.events();
                    if (abortSignal) {
                        abortSignal.addEventListener("abort", onParentAbort, { once: true });
                        removeAbortListener = () => abortSignal.removeEventListener("abort", onParentAbort);
                        if (abortSignal.aborted) onParentAbort();
                    }

                    if (await checkTerminal()) return;
                    if (abortRequested) await requestInterrupt();

                    for await (const _ of eventStream) {
                        if (settled) break;
                        if (await checkTerminal()) break;
                        if (abortRequested) await requestInterrupt();
                    }

                    if (!settled) {
                        if (!abortRequested) {
                            finish({
                                childGoalId,
                                status: "failed",
                                reason: "Subagent event stream ended before reaching terminal state",
                            });
                            return;
                        }

                        while (!settled) {
                            if (await checkTerminal()) return;
                            await requestInterrupt();
                            if (!settled) await new Promise((resume) => setTimeout(resume, 250));
                        }
                    }
                } catch (err) {
                    fail(err);
                }
            })();
        });
    }
}
