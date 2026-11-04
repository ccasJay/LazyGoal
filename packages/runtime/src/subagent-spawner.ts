import { randomUUID } from "node:crypto";
import type { ExecutionControl } from "../../execution-control/src/index";
import type { ToolExecutionContext } from "../../tool-core/src/index";
import type { AgentProfile, AgentProfileRegistry } from "./agent-profile";
import type { GoalModelSelection, RunStatus } from "./domain";
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
    readonly status: "completed" | "failed" | "cancelled";

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
     * @param control - 执行控制（用于取消和超时传播）
     * @returns 子代理执行终态结果
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

        // 4. 等待子 Agent 达到终态（completed / failed / cancelled），或父 Run 被取消
        return new Promise<SpawnSubagentOutput>((resolve, reject) => {
            let settled = false;
            let unsubscribeStream: (() => void) | undefined;

            const cleanup = () => {
                if (unsubscribeStream) {
                    unsubscribeStream();
                    unsubscribeStream = undefined;
                }
                try {
                    session.detach();
                } catch {
                    // ignore detach error
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

            // 监听父级 cancellation 信号
            const abortSignal = control?.signal;
            const onParentAbort = async () => {
                if (settled) return;
                try {
                    const currentState = await session.read();
                    if (currentState && currentState.runId) {
                        await session.send({
                            kind: "interrupt",
                            inputId: randomUUID(),
                            runId: currentState.runId,
                        });
                    }
                } catch {
                    // ignore abort send error
                }
                finish({
                    childGoalId,
                    status: "cancelled",
                    reason:
                        typeof abortSignal?.reason === "string"
                            ? abortSignal.reason
                            : "Parent run was cancelled while waiting for subagent",
                });
            };

            if (abortSignal?.aborted) {
                onParentAbort();
                return;
            }

            if (abortSignal) {
                abortSignal.addEventListener("abort", onParentAbort, { once: true });
            }

            // 订阅 session 事件流，每次收到事件时检查子 agent 状态
            const checkTerminal = async (): Promise<boolean> => {
                try {
                    const state = await session.read();
                    if (!state) return false;
                    const runStatus: RunStatus | "created" = state.runStatus;
                    if (
                        runStatus === "completed" ||
                        runStatus === "failed" ||
                        runStatus === "cancelled"
                    ) {
                        let answer: string | undefined;
                        let reason: string | undefined;

                        if (runStatus === "completed") {
                            // 读取子 agent 产生的最后一条 assistant message
                            const listResult = await session.messages();
                            if (listResult.ok) {
                                for (let i = listResult.messages.length - 1; i >= 0; i--) {
                                    const msg = listResult.messages[i];
                                    if (msg !== undefined && msg.role === "assistant") {
                                        const body = await session.message(msg.messageId);
                                        if (body.ok && body.entry && body.entry.content) {
                                            answer = body.entry.content;
                                        }
                                        break;
                                    }
                                }
                            }
                        } else {
                            reason = `Subagent terminated with status ${runStatus}`;
                        }

                        const out: SpawnSubagentOutput = {
                            childGoalId,
                            status: runStatus,
                            ...(answer !== undefined ? { answer } : {}),
                            ...(reason !== undefined ? { reason } : {}),
                        };
                        finish(out);
                        return true;
                    }
                } catch (err) {
                    fail(err);
                    return true;
                }
                return false;
            };

            // 启动事件循环消费
            (async () => {
                try {
                    // 首先立即检查一次，可能直接已结束
                    if (await checkTerminal()) return;

                    const eventStream = session.events();
                    unsubscribeStream = () => {
                        try {
                            eventStream.close();
                        } catch {
                            // ignore
                        }
                    };

                    for await (const _ of eventStream) {
                        if (settled) break;
                        if (await checkTerminal()) break;
                    }

                    // 如果 stream 结束但未 settled，做最后一次检查
                    if (!settled) {
                        const finalState = await session.read();
                        const finalStatus = finalState?.runStatus;
                        if (
                            finalStatus === "completed" ||
                            finalStatus === "failed" ||
                            finalStatus === "cancelled"
                        ) {
                            await checkTerminal();
                        } else {
                            finish({
                                childGoalId,
                                status: "failed",
                                reason: "Subagent event stream ended before reaching terminal state",
                            });
                        }
                    }
                } catch (err) {
                    fail(err);
                }
            })();
        });
    }
}
