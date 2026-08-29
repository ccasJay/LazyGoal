import { createHash } from "node:crypto";

import type {
    TrajectoryEvent,
} from "../../runtime/src/index";
import { freezeTrajectoryEvent } from "../../runtime/src/index";
import type { ModelExecutionUnit } from "./trajectory-execution-unit-adapter";
import { ModelContextSourceError } from "./trajectory-execution-unit-adapter";
import { stableJson } from "./prompting/environment";

/** 可选的、由上游事件携带或解析出的 Artifact 引用。 */
export interface TrajectoryArtifactReference {
    /** 外部 Artifact 的稳定引用；不由该投影器创建。 */
    readonly reference: string;
    /** 当前引用是否仍可读取原始载荷。 */
    readonly availability: "available" | "unavailable";
}

/**
 * 解决历史输出 Artifact 引用的只读回调。
 *
 * @remarks
 * 回调只能返回已有引用，投影器不会创建、写入或验证 Artifact Store。无法返回
 * 引用时，模型 DTO 必须明确标记 `artifactAvailability: "unavailable"`。
 *
 * @example
 * ```ts
 * const resolver: TrajectoryArtifactResolver = (event) =>
 *     event.eventId === "event-1"
 *         ? { reference: "artifact://event-1", availability: "available" }
 *         : undefined;
 * ```
 */
export type TrajectoryArtifactResolver = (
    event: TrajectoryEvent,
    output: unknown,
) => TrajectoryArtifactReference | undefined;

/** 未被截断的模型可见输出。 */
export interface CompleteModelOutputProjection {
    readonly truncated: false;
    readonly value: unknown;
    readonly sourceSequence: number;
    readonly sourceSequenceRange: { readonly first: number; readonly last: number };
    readonly contentHash: string;
    readonly artifactAvailability: "available" | "unavailable";
    readonly artifactReference?: string;
}

/** 被有界预览替代的模型可见输出。 */
export interface PreviewedModelOutputProjection {
    readonly truncated: true;
    readonly preview: {
        readonly prefix: string;
        readonly suffix: string;
    };
    readonly serializedLength: number;
    readonly sourceSequence: number;
    readonly sourceSequenceRange: { readonly first: number; readonly last: number };
    readonly contentHash: string;
    readonly artifactAvailability: "available" | "unavailable";
    readonly artifactReference?: string;
}

/** Tool 输出在模型上下文中的完整或预览投影。 */
export type ModelOutputProjection =
    | CompleteModelOutputProjection
    | PreviewedModelOutputProjection;

/**
 * 供模型使用的单个 Trajectory 事件 DTO。
 *
 * @remarks
 * 除 Tool Observation 的大型 `output` 外，其余字段保持事件事实语义；输出投影
 * 只在本轮模型上下文中存在，不写回原始事件。
 *
 * @example
 * ```ts
 * const event: ModelTrajectoryEvent = {
 *     eventId: "event-1",
 *     sequence: 12,
 *     eventType: "tool_finished",
 *     phase: "executing",
 *     executionUnitId: "unit-1",
 *     payload: { type: "tool_finished" },
 * };
 * ```
 */
export interface ModelTrajectoryEvent {
    readonly eventId: string;
    readonly sequence: number;
    readonly eventType: TrajectoryEvent["eventType"];
    readonly phase: TrajectoryEvent["phase"];
    readonly goalId: string;
    readonly runId: string;
    readonly executionUnitId?: string;
    readonly actionId?: string;
    readonly parentEventId?: string;
    readonly payload: unknown;
}

/** 输出投影器构造配置。 */
export interface TrajectoryEventProjectorOptions {
    /** 正安全整数预览上限；按 UTF-16 code unit 计量。 */
    readonly previewLimit: number;
    /** 可选的已有 Artifact 引用解析器。 */
    readonly artifactResolver?: TrajectoryArtifactResolver;
}

/**
 * 将已提交 Trajectory 事件投影为有界模型 DTO。
 *
 * @remarks
 * 大型成功 Observation 的原始 JSON 先计算 SHA-256，再以 prefix/suffix preview
 * 替代完整载荷；同一输入和上限得到稳定 hash 与 preview。没有可用 Artifact 时
 * 明确写入 unavailable，不能把 preview 当作完整结果。投影器不保存调用状态，
 * 不修改事件或执行单元。
 *
 * @example
 * ```ts
 * const projector = new TrajectoryEventProjector({ previewLimit: 4096 });
 * const modelEvent = projector.project(event);
 * ```
 */
export class TrajectoryEventProjector {
    private readonly previewLimit: number;
    private readonly artifactResolver: TrajectoryArtifactResolver | undefined;

    /**
     * @param options - 输出上限和可选 Artifact 引用解析器。
     * @throws RangeError 当预览上限不是正安全整数时。
     */
    constructor(options: TrajectoryEventProjectorOptions) {
        if (!Number.isSafeInteger(options.previewLimit) || options.previewLimit <= 0) {
            throw new RangeError("previewLimit must be a positive safe integer");
        }
        this.previewLimit = options.previewLimit;
        this.artifactResolver = options.artifactResolver;
    }

    /**
     * @param event - 已通过 Trajectory 协议校验的不可变事件。
     * @returns 深冻结的新模型事件；原始 Observation 不会被替换。
     * @throws ModelContextSourceError 当事件不符合 Trajectory 协议或 Artifact 返回非法引用时。
     */
    project(event: TrajectoryEvent): ModelTrajectoryEvent {
        const immutableEvent = freezeTrajectoryEvent(event) as TrajectoryEvent;
        const payload = this.projectPayload(immutableEvent);
        return deepFreeze({
            eventId: immutableEvent.eventId,
            sequence: immutableEvent.sequence,
            eventType: immutableEvent.eventType,
            phase: immutableEvent.phase,
            goalId: immutableEvent.goalId,
            runId: immutableEvent.runId,
            ...(immutableEvent.executionUnitId === undefined
                ? {}
                : { executionUnitId: immutableEvent.executionUnitId }),
            ...(immutableEvent.actionId === undefined
                ? {}
                : { actionId: immutableEvent.actionId }),
            ...(immutableEvent.parentEventId === undefined
                ? {}
                : { parentEventId: immutableEvent.parentEventId }),
            payload,
        });
    }

    /**
     * @param unit - Adapter 产生的完整执行单元。
     * @returns 保持事件顺序的模型执行单元投影。
     * @throws ModelContextSourceError 当单元事件无法通过 Trajectory 协议校验时。
     */
    projectExecutionUnit(unit: ModelExecutionUnit): ModelExecutionUnitProjection {
        const events = Object.freeze(unit.events.map((event) => this.project(event)));
        return Object.freeze({
            executionUnitId: unit.executionUnitId,
            goalId: unit.goalId,
            runId: unit.runId,
            phase: unit.phase,
            firstSequence: unit.firstSequence,
            lastSequence: unit.lastSequence,
            events,
        });
    }

    private projectPayload(event: TrajectoryEvent): unknown {
        if (event.eventType === "tool_finished") {
            return {
                ...structuredClone(event.payload),
                observation: this.projectObservation(event, event.payload.observation),
            };
        }
        if (event.eventType === "observation_recorded") {
            return {
                ...structuredClone(event.payload),
                observation: this.projectObservation(event, event.payload.observation),
            };
        }
        return structuredClone(event.payload);
    }

    private projectObservation(event: TrajectoryEvent, observation: unknown): unknown {
        if (
            typeof observation !== "object"
            || observation === null
            || !("kind" in observation)
            || (observation as { readonly kind?: unknown }).kind !== "success"
            || !("output" in observation)
        ) {
            return structuredClone(observation);
        }

        const output = (observation as { readonly output: unknown }).output;
        const projection = this.projectOutput(event, output, observation);
        return {
            kind: "success",
            output: projection,
            ...(
                "summary" in observation
                    ? { summary: (observation as { readonly summary: unknown }).summary }
                    : {}
            ),
        };
    }

    private projectOutput(
        event: TrajectoryEvent,
        output: unknown,
        observation: unknown,
    ): ModelOutputProjection {
        const serializedOutput = stableJson(output);
        const serializedObservation = stableJson(observation);
        const contentHash = createHash("sha256")
            .update(serializedObservation, "utf8")
            .digest("hex");
        const artifact = this.artifactResolver?.(event, output);
        const artifactAvailability = artifact?.availability ?? "unavailable";
        let artifactReference: string | undefined;
        if (artifact !== undefined) {
            if (
                typeof artifact.reference !== "string"
                || artifact.reference.trim().length === 0
                || !["available", "unavailable"].includes(artifact.availability)
            ) {
                throw new ModelContextSourceError("Artifact reference projection is invalid");
            }
            artifactReference = artifact.reference;
        }

        if (serializedOutput.length <= this.previewLimit) {
            return deepFreeze({
                truncated: false as const,
                value: structuredClone(output),
                sourceSequence: event.sequence,
                sourceSequenceRange: { first: event.sequence, last: event.sequence },
                contentHash,
                artifactAvailability,
                ...(artifactReference === undefined ? {} : { artifactReference }),
            });
        }

        const prefixLength = Math.ceil(this.previewLimit / 2);
        const suffixLength = Math.floor(this.previewLimit / 2);
        return deepFreeze({
            truncated: true as const,
            preview: {
                prefix: serializedOutput.slice(0, prefixLength),
                suffix: suffixLength === 0 ? "" : serializedOutput.slice(-suffixLength),
            },
            serializedLength: serializedOutput.length,
            sourceSequence: event.sequence,
            sourceSequenceRange: { first: event.sequence, last: event.sequence },
            contentHash,
            artifactAvailability,
            ...(artifactReference === undefined ? {} : { artifactReference }),
        });
    }
}

/** 已完成执行单元的模型 DTO。 */
export interface ModelExecutionUnitProjection {
    readonly executionUnitId: string;
    readonly goalId: string;
    readonly runId: string;
    readonly phase: "executing";
    readonly firstSequence: number;
    readonly lastSequence: number;
    readonly events: readonly ModelTrajectoryEvent[];
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
    if (typeof value !== "object" || value === null || seen.has(value as object)) return value;
    seen.add(value as object);
    for (const child of Object.values(value as Record<string, unknown>)) {
        deepFreeze(child, seen);
    }
    return Object.freeze(value);
}
