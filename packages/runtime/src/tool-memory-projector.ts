import type {
    FactProposal,
    Goal,
    ToolCallAction,
    WorkingMemory,
} from "./domain";
import type { ToolObservation } from "./tool";

/** Tool Projector 返回的确定性状态。 */
export type ToolMemoryProjectionStatus =
    | "changed"
    | "no_op"
    | "rejected"
    | "unknown";

/**
 * Tool Observation 投影所需的只读输入。
 *
 * @remarks
 * `observationSequence` 指向本次提交边界内已分配的 `tool_finished` Fact Event。
 * Projector 不得修改输入对象，也不得执行 I/O 或模型调用。
 *
 * @example
 * ```ts
 * const input: ToolMemoryProjectionInput = {
 *   goal,
 *   action,
 *   observation,
 *   observationSequence: 21,
 *   workingMemory,
 * };
 * ```
 */
export interface ToolMemoryProjectionInput {
    /** 当前 Snapshot Goal。 */
    readonly goal: Goal;
    /** 产生 Observation 的 Tool Action。 */
    readonly action: ToolCallAction;
    /** 已通过 ToolObservation 协议校验的返回值。 */
    readonly observation: ToolObservation;
    /** 本次 Observation Fact Event 的已分配 sequence。 */
    readonly observationSequence: number;
    /** Tool 执行前最新 committed Working Memory。 */
    readonly workingMemory: WorkingMemory;
}

/**
 * Tool Projector 的候选 Fact 输出。
 *
 * @remarks
 * `changed` 必须提供至少一个 Fact；其他状态不得携带 Fact。输出只是 proposal，
 * Runtime 仍会执行 schema、evidence、冲突、生命周期与容量准入。
 *
 * @example
 * ```ts
 * const result: ToolMemoryProjectionResult = {
 *   status: "changed",
 *   facts: [{
 *     subject: "object:watch-1",
 *     predicate: "location",
 *     value: "dresser-2",
 *     stability: "last_observed",
 *     evidenceSequences: [21],
 *   }],
 * };
 * ```
 */
export type ToolMemoryProjectionResult =
    | { readonly status: "changed"; readonly facts: readonly FactProposal[] }
    | { readonly status: "no_op"; readonly reason?: string }
    | { readonly status: "rejected"; readonly reason: string }
    | { readonly status: "unknown"; readonly reason?: string };

/**
 * 将单个 Tool 的 Action 与 Observation 同步映射为候选 Fact。
 *
 * @remarks
 * 实现必须是同步纯映射。Runner 会捕获异常与非法返回并保留原始 Observation，
 * 因此 Projector 不应承担持久化或重试职责。
 *
 * @example
 * ```ts
 * const projector: ToolMemoryProjector = {
 *   project: ({ observationSequence }) => ({
 *     status: "no_op",
 *     reason: `no durable fact at ${observationSequence}`,
 *   }),
 * };
 * ```
 */
export interface ToolMemoryProjector {
    /**
     * @param input - 当前 Goal、Action、Observation、sequence 与 Memory 投影。
     * @returns 同步 proposal 结果；返回 Promise 属于非法输出。
     * @throws 实现异常由 Runner 转为旁路 Diagnostic，不阻止 Observation 提交。
     */
    project(input: ToolMemoryProjectionInput): ToolMemoryProjectionResult;
}

/**
 * 按 Tool ID 解析可选 Projector 的只读 Registry。
 *
 * @example
 * ```ts
 * const registry: ToolMemoryProjectorRegistry = {
 *   get: (toolId) => toolId === "alfworld" ? projector : undefined,
 * };
 * ```
 */
export interface ToolMemoryProjectorRegistry {
    /** @param toolId - 已授权 Tool 的稳定 ID；未注册时返回 `undefined`。 */
    get(toolId: string): ToolMemoryProjector | undefined;
}

const NOOP_REGISTRY: ToolMemoryProjectorRegistry = Object.freeze({
    get: () => undefined,
});

/** 返回不包含任何领域规则的默认 Projector Registry。 */
export function createNoopToolMemoryProjectorRegistry(): ToolMemoryProjectorRegistry {
    return NOOP_REGISTRY;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 对 Projector 的判别联合外形执行严格校验。
 *
 * @param value - Projector 的未知返回值。
 * @returns 不共享 Projector 可变引用的结果副本。
 * @throws TypeError 当状态、字段组合或 `changed` 空集合非法时。
 */
export function normalizeToolMemoryProjectionResult(
    value: unknown,
): ToolMemoryProjectionResult {
    if (!isRecord(value) || typeof value.status !== "string") {
        throw new TypeError("ToolMemoryProjector result must have a status");
    }
    const keys = Object.keys(value);
    if (value.status === "changed") {
        if (
            keys.length !== 2
            || !keys.includes("facts")
            || !Array.isArray(value.facts)
            || value.facts.length === 0
        ) {
            throw new TypeError("changed ToolMemoryProjector result requires facts");
        }
        return structuredClone(value) as ToolMemoryProjectionResult;
    }
    if (value.status === "rejected") {
        if (
            keys.length !== 2
            || !keys.includes("reason")
            || typeof value.reason !== "string"
            || value.reason.trim().length === 0
        ) {
            throw new TypeError("rejected ToolMemoryProjector result requires reason");
        }
        return { status: "rejected", reason: value.reason };
    }
    if (value.status === "no_op" || value.status === "unknown") {
        if (keys.some((key) => key !== "status" && key !== "reason")) {
            throw new TypeError(`${value.status} ToolMemoryProjector result has unknown fields`);
        }
        if (value.reason !== undefined && typeof value.reason !== "string") {
            throw new TypeError(`${value.status} ToolMemoryProjector reason must be text`);
        }
        return value.reason === undefined
            ? { status: value.status }
            : { status: value.status, reason: value.reason };
    }
    throw new TypeError("ToolMemoryProjector result status is invalid");
}

