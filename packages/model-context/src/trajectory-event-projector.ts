import { deepFreeze } from "../../contracts/src/index";
import { createHash } from "node:crypto";

import type {
    TrajectoryEvent,
} from "../../runtime/src/index";
import { freezeTrajectoryEvent } from "../../runtime/src/index";
import type {
    ModelExecutionUnitProjection,
    ModelOutputProjection,
    ModelTrajectoryEvent,
} from "../../model-view/src/index";
import type { ModelExecutionUnit } from "./trajectory-execution-unit-adapter";
import { ModelContextSourceError } from "./trajectory-execution-unit-adapter";
import { projectContextLookupResult } from "./context-lookup-projection";
import { stableJson } from "../../context-budget/src/index";

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
        const events = Object.freeze(unit.events.filter(event => event.eventType !== "model_response_received").map((event) => this.project(event)));
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
        if (event.eventType === "context_lookup_completed" || event.eventType === "context_lookup_not_found") {
            return { ...structuredClone(event.payload), result: projectContextLookupResult(event.payload.result) };
        }
        if (event.eventType === "context_lookup_failed") {
            return { ...structuredClone(event.payload), result: projectContextLookupResult({
                status: "lookup_error", lookupId: event.payload.lookupId,
                code: event.payload.code, message: event.payload.message,
            }) };
        }
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
        const effectiveOutput = foldBashStdout(output);
        const effectiveObservation = effectiveOutput === output
            ? observation
            : (typeof observation === "object" && observation !== null
                ? { ...observation, output: effectiveOutput }
                : observation);
        const serializedOutput = stableJson(effectiveOutput);
        const serializedObservation = stableJson(effectiveObservation);
        const contentHash = createHash("sha256")
            .update(serializedObservation, "utf8")
            .digest("hex");
        const artifact = this.artifactResolver?.(event, effectiveOutput);
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
                value: structuredClone(effectiveOutput),
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

/**
 * 对长 bash 成功命令输出进行结构化压缩折叠。
 *
 * @param output - 待检查的工具输出。
 * @returns 若满足折叠条件则返回折叠后的对象，否则原样返回。
 */
function foldBashStdout(output: unknown): unknown {
    if (
        typeof output !== "object"
        || output === null
        || !("exitCode" in output)
        || !("stdout" in output)
    ) {
        return output;
    }

    const bashOutput = output as { exitCode: unknown; stdout: unknown };
    if (bashOutput.exitCode !== 0 || typeof bashOutput.stdout !== "string") {
        return output;
    }

    const stdout = bashOutput.stdout;
    if (stdout.length <= 1200) {
        return output;
    }

    const lines = stdout.split("\n");
    if (lines.length <= 30) {
        return output;
    }

    const head = lines.slice(0, 10).join("\n");
    const tail = lines.slice(-10).join("\n");
    const middleLines = lines.slice(10, -10);
    const hiddenLines = middleLines.length;
    const hiddenChars = middleLines.join("\n").length;

    const foldedStdout = `${head}\n... [已折叠 ${hiddenLines} 行成功输出，共 ${hiddenChars} 字符] ...\n${tail}`;

    return {
        ...bashOutput,
        stdout: foldedStdout,
    };
}

