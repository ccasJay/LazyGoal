import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { contract } from "../../contracts/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    type Tool,
    type ToolExecutionRequest,
    type ToolObservation,
} from "../../tool-core/src/index";
import {
    createGoal as createUnexposedGoal,
    transition,
    type AgentProfile,
    type Goal,
    type JsonValue,
    type RunState,
    type ToolCallAction,
} from "../src/index";
import { InMemoryGoalStore, JsonFileSandboxGrantStore, JsonFileToolGrantStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor, withDiscoveredProfileTools } from "./current-fixtures";

/** 受控写入 Tool 的输入契约；字段级错误由 Tool Contract 负责。 */
export const WRITE_INPUT_CONTRACT = contract.object({
    path: contract.string(),
    content: contract.string(),
});

/** 受控写入 Tool 的输入形状。 */
export interface WriteToolInput {
    readonly path: string;
    readonly content: string;
}

/** 一次受控 Tool 调用的捕获记录。 */
export interface CapturedToolCall {
    readonly toolId: string;
    readonly input: JsonValue;
}

/**
 * 创建受控写入 Tool；执行时记录真实入参并返回成功观察。
 *
 * @remarks Tool 标识固定为 `write_file`，使授权匹配器使用目标路径语义。
 */
export function createControlledWriteTool(
    calls: CapturedToolCall[],
    options: { readonly failure?: (input: WriteToolInput) => ToolObservation | undefined } = {},
): Tool<typeof WRITE_INPUT_CONTRACT> {
    return {
        definition: {
            id: "write_file",
            description: "受控写入 Tool",
            inputContract: WRITE_INPUT_CONTRACT,
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute(request: ToolExecutionRequest): Promise<ToolObservation> {
            const input = request.input as unknown as WriteToolInput;
            calls.push({ toolId: "write_file", input: structuredClone(request.input) });
            const failure = options.failure?.(input);
            if (failure !== undefined) return failure;
            return { kind: "success", output: { written: input.path }, summary: `wrote ${input.path}` };
        },
    };
}

/** 审批测试使用的 Profile；工具集合只含受控写入 Tool。 */
export const APPROVAL_PROFILE: AgentProfile = {
    id: "approval-profile",
    name: "Approval Profile",
    toolIds: ["write_file"],
    instructions: [],
    systemPrompt: "system prompt",
};

/** 一次审批测试的装配结果。 */
export interface ApprovalFixture {
    readonly workspaceRoot: string;
    readonly store: InMemoryGoalStore;
    readonly toolGrantStore: JsonFileToolGrantStore;
    readonly sandboxGrantStore: JsonFileSandboxGrantStore;
    readonly registry: InMemoryToolRegistry;
    readonly calls: CapturedToolCall[];
    readonly dispose: () => Promise<void>;
}

/** 创建隔离工作区与真实 JSON 授权账本。 */
export async function createApprovalFixture(): Promise<ApprovalFixture> {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-approval-"));
    const store = new InMemoryGoalStore();
    const toolGrantStore = new JsonFileToolGrantStore(workspaceRoot);
    const sandboxGrantStore = new JsonFileSandboxGrantStore(workspaceRoot);
    const calls: CapturedToolCall[] = [];
    const registry = new InMemoryToolRegistry([
        createToolRegistration(createControlledWriteTool(calls)),
    ]);
    return {
        workspaceRoot,
        store,
        toolGrantStore,
        sandboxGrantStore,
        registry,
        calls,
        dispose: async () => {
            await rm(workspaceRoot, { recursive: true, force: true });
        },
    };
}

/** 创建一个处于首次审批等待的 Goal；原始参数写入 `a.txt`。 */
export function createAwaitingApprovalGoal(
    options: {
        readonly goalId?: string;
        readonly runId?: string;
        readonly actionId?: string;
        readonly input?: JsonValue;
        readonly toolId?: string;
    } = {},
): Goal {
    const goalId = options.goalId ?? "goal-approval";
    const runId = options.runId ?? "run-approval";
    const actionId = options.actionId ?? "action-approval";
    const toolId = options.toolId ?? "write_file";
    const input = options.input ?? { path: "a.txt", content: "original" };

    const created = withDiscoveredProfileTools(createUnexposedGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: goalId,
        intent: "受控审批测试",
        profile: APPROVAL_PROFILE,
        runId,
    }));

    const started = transition(created.state.run, { kind: "start" });
    if (!started.ok) throw new Error(started.error.message);
    const staged = transition(started.state, {
        kind: "stage_action",
        status: "awaiting_approval",
        action: { actionId, toolId, input },
    });
    if (!staged.ok) throw new Error(staged.error.message);

    return {
        ...created,
        state: {
            ...created.state,
            workflow: { phase: "executing" },
            run: staged.state,
        },
    };
}

/** 把 Run 状态推进到结果未知等待；返回新的 Run 状态。 */
export function toOutcomeUnknown(run: RunState, actionId: string): RunState {
    const approved = transition(run, { kind: "approve_action", actionId });
    if (!approved.ok) throw new Error(approved.error.message);
    const recovered = transition(approved.state, { kind: "recover_action", actionId });
    if (!recovered.ok) throw new Error(recovered.error.message);
    return recovered.state;
}

/** 生成一个当前待审批 Action 的稳定引用。 */
export function actionRef(action: ToolCallAction): { actionId: string; toolId: string } {
    return { actionId: action.actionId, toolId: action.toolId };
}

export { trajectoryStoreFor };
