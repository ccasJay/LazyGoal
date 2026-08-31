import type {
    AgentProfile,
    Goal,
    GoalMessage,
    GoalTask,
    GoalWorkflowState,
    ContextRetrievalProtocol,
    MemoryProtocol,
    ModelContextProtocol,
    Observation,
    PendingAction,
    StepRecord,
    ToolCallAction,
    WorkingMemoryPatch,
} from "../../runtime/src/index";
import {
    GoalSnapshotProtocolError,
    GoalSnapshotV5Schema,
    GoalSnapshotV6Schema,
    GoalSnapshotV7Schema,
    GoalSnapshotV8Schema,
    GoalSnapshotV9Schema,
    GoalSnapshotV10Schema,
} from "./goal-snapshot";
import {
    resolveMemoryProtocol,
    resolveModelContextProtocol,
    resolveContextRetrievalProtocol,
} from "../../runtime/src/index";
import type {
    GoalSnapshotMessageV5,
    GoalSnapshotObservationV5,
    GoalSnapshotPendingActionV5,
    GoalSnapshotProfileV5,
    GoalSnapshotStateV5,
    GoalSnapshotStepRecordV7,
    GoalSnapshotStepRecordV9,
    GoalSnapshotStepRecordV10,
    GoalSnapshotStepRecordV5,
    GoalSnapshotStopReasonV5,
    GoalSnapshotToolCallActionV5,
    GoalSnapshotV5,
    GoalSnapshotV6,
    GoalSnapshotV7,
    GoalSnapshotV8,
    GoalSnapshotV9,
    GoalSnapshotV10,
    GoalSnapshotDefinitionV9,
    GoalSnapshotWorkflowV5,
} from "./goal-snapshot";

/**
 * Runtime Goal 与 Storage v10 Snapshot 之间的双向转换边界。
 *
 * @remarks
 * Codec 是唯一同时看到 Runtime 领域类型与 Snapshot DTO 的模块。decode 只
 * 接受严格 v5–v10：v1 至 v4、未知版本以及快照中的非法结构统一抛出
 * {@link GoalSnapshotProtocolError}，且不产生任何写回副作用。
 * encode 从 Goal 逐字段深复制构造 DTO、补入 `{ schemaVersion: 10 }` 并再次
 * 执行跨字段校验，两侧对象互不共享引用；JSON 值的深复制基于 Node 内置
 * `structuredClone` 实现。
 *
 * @example
 * ```ts
 * const codec: GoalSnapshotCodec = goalSnapshotCodec;
 * const snapshot = codec.encode(goal);
 * const restored = codec.decode(snapshot);
 * ```
 */
export interface GoalSnapshotCodec {
    /**
     * @param goal - 完整的 Runtime Goal 聚合。
     * @returns 通过严格 v10 校验、与输入不共享引用的 Snapshot DTO。
     * @throws Goal 违反 v10 结构或跨字段不变量时抛出 GoalSnapshotProtocolError。
     */
    encode(goal: Goal): GoalSnapshotV10;

    /**
     * @param input - 已解析的快照 JSON 值（通常来自 `JSON.parse`）。
     * @returns 与输入不共享引用、语义等价的 Runtime Goal；v5 输入的提交边界归一化为 `0`。
     * v5–v9 会按各自冻结协议解释，下一次 encode 时升级为 v10。
     * @throws v1 至 v4、未知版本或 v5–v10 结构损坏时抛出
     *   GoalSnapshotProtocolError；本方法不执行任何 I/O，因此失败时不会
     *   改写任何文件。
     */
    decode(input: unknown): Goal;
}

function isRecord(input: unknown): input is Record<string, unknown> {
    return typeof input === "object" && input !== null && !Array.isArray(input);
}

function readSchemaVersion(input: unknown): unknown {
    if (!isRecord(input)) {
        return undefined;
    }

    const metadata = input.metadata;
    return isRecord(metadata) ? metadata.schemaVersion : undefined;
}

function describeLegacyStep(input: unknown): string | undefined {
    if (!isRecord(input) || !isRecord(input.state) || !isRecord(input.state.run)) {
        return undefined;
    }

    const lastStep = input.state.run.lastStep;
    return isRecord(lastStep) && lastStep.kind === "legacy"
        ? " (contains a removed legacy StepRecord)"
        : undefined;
}

/** Codec 的默认实现；转换失败统一抛出稳定协议错误。 */
export class DefaultGoalSnapshotCodec implements GoalSnapshotCodec {
    encode(goal: Goal): GoalSnapshotV10 {
        // 先按同一严格 Schema 校验输入：拒绝 Runtime 侧的多余字段、
        // legacy StepRecord 与不成立的跨字段组合，再逐字段深复制构造 DTO。
        const memoryProtocol = resolveMemoryProtocol(goal.definition);
        const modelContextProtocol = resolveModelContextProtocol(goal.definition);
        const contextRetrievalProtocol = resolveContextRetrievalProtocol(goal.definition);
        const candidate = {
            ...goal,
            metadata: { schemaVersion: 10 as const },
            definition: {
                ...goal.definition,
                memoryProtocol,
                modelContextProtocol,
                contextRetrievalProtocol,
            },
            state: {
                ...goal.state,
                run: {
                    ...goal.state.run,
                    committedThroughSequence: goal.state.run.committedThroughSequence ?? 0,
                },
            },
        };
        const validation = GoalSnapshotV10Schema.safeParse(candidate);

        if (!validation.success) {
            throw new GoalSnapshotProtocolError(
                "Goal does not satisfy the snapshot schema",
                { cause: validation.error },
            );
        }

        return {
            id: goal.id,
            metadata: { schemaVersion: 10 },
            definition: encodeDefinition(
                goal,
                memoryProtocol,
                modelContextProtocol,
                contextRetrievalProtocol,
            ),
            state: encodeState(goal),
        };
    }

    decode(input: unknown): Goal {
        const schemaVersion = readSchemaVersion(input);

        if (
            schemaVersion !== 5
            && schemaVersion !== 6
            && schemaVersion !== 7
            && schemaVersion !== 8
            && schemaVersion !== 9
            && schemaVersion !== 10
        ) {
            const legacyHint = schemaVersion === 1
                || schemaVersion === 2
                || schemaVersion === 3
                || schemaVersion === 4
                ? `schemaVersion ${String(schemaVersion)} is no longer supported`
                : "unknown Goal snapshot schemaVersion";

            throw new GoalSnapshotProtocolError(
                `Invalid Goal snapshot: ${legacyHint}`,
            );
        }

        const result = schemaVersion === 5
            ? GoalSnapshotV5Schema.safeParse(input)
            : schemaVersion === 6
                ? GoalSnapshotV6Schema.safeParse(input)
                : schemaVersion === 7
                    ? GoalSnapshotV7Schema.safeParse(input)
                    : schemaVersion === 8
                        ? GoalSnapshotV8Schema.safeParse(input)
                        : schemaVersion === 9
                            ? GoalSnapshotV9Schema.safeParse(input)
                            : GoalSnapshotV10Schema.safeParse(input);

        if (!result.success) {
            throw new GoalSnapshotProtocolError(
                `Invalid Goal snapshot${describeLegacyStep(input) ?? ""}`,
                { cause: result.error },
            );
        }

        return decodeSnapshot(
            result.data as GoalSnapshotV5 | GoalSnapshotV6 | GoalSnapshotV7 | GoalSnapshotV8 | GoalSnapshotV9 | GoalSnapshotV10,
            schemaVersion === 5
                ? 0
                : (result.data as GoalSnapshotV6 | GoalSnapshotV7 | GoalSnapshotV8 | GoalSnapshotV9 | GoalSnapshotV10)
                    .state.run.committedThroughSequence,
        );
    }
}

function encodeDefinition(
    goal: Goal,
    memoryProtocol: MemoryProtocol,
    modelContextProtocol: ModelContextProtocol,
    contextRetrievalProtocol: ContextRetrievalProtocol,
): GoalSnapshotDefinitionV9 {
    const profile = goal.definition.profile;

    return {
        intent: goal.definition.intent,
        promptBundleVersion: goal.definition.promptBundleVersion,
        memoryProtocol: {
            kind: memoryProtocol.kind,
            version: memoryProtocol.version,
        },
        modelContextProtocol: {
            kind: modelContextProtocol.kind,
            version: modelContextProtocol.version,
        },
        contextRetrievalProtocol: {
            kind: contextRetrievalProtocol.kind,
            version: contextRetrievalProtocol.version,
        },
        profile: {
            id: profile.id,
            ...(profile.name === undefined ? {} : { name: profile.name }),
            ...(profile.description === undefined
                ? {}
                : { description: profile.description }),
            systemPrompt: profile.systemPrompt,
            instructions: [...profile.instructions],
            toolIds: [...profile.toolIds],
        },
        executionPolicy: {
            maxSteps: goal.definition.executionPolicy.maxSteps,
        },
    };
}

function encodeTask(task: GoalTask): GoalTask {
    return {
        objective: task.objective,
        completionCriteria: [...task.completionCriteria],
    };
}

function encodeWorkflow(workflow: GoalWorkflowState): GoalSnapshotWorkflowV5 {
    switch (workflow.phase) {
        case "gathering_context":
            return {
                phase: "gathering_context",
                preparation: { status: workflow.preparation.status },
            };
        case "planning":
            return workflow.preparation.status === "active"
                ? {
                    phase: "planning",
                    preparation: { status: "active" },
                }
                : {
                    phase: "planning",
                    preparation: {
                        status: "waiting_approval",
                        proposal: encodeTask(workflow.preparation.proposal),
                    },
                };
        case "executing":
            return {
                phase: "executing",
                preparation: { status: "completed" },
                task: encodeTask(workflow.task),
            };
    }
}

function encodeAction(action: ToolCallAction): GoalSnapshotToolCallActionV5 {
    return {
        actionId: action.actionId,
        toolId: action.toolId,
        input: structuredClone(action.input),
    };
}

function encodeObservation(
    observation: Observation,
): GoalSnapshotObservationV5 {
    switch (observation.kind) {
        case "success":
            return {
                kind: "success",
                output: structuredClone(observation.output),
                summary: observation.summary,
            };
        case "failure":
            return {
                kind: "failure",
                code: observation.code,
                message: observation.message,
                retryable: observation.retryable,
            };
        case "rejected":
            return {
                kind: "rejected",
                reason: observation.reason,
            };
    }
}

function cloneMemoryPatch(
    patch: unknown,
): WorkingMemoryPatch {
    return structuredClone(patch) as WorkingMemoryPatch;
}

function encodeStep(
    step: StepRecord,
    memoryProtocol: MemoryProtocol,
): GoalSnapshotStepRecordV5 | GoalSnapshotStepRecordV7 | GoalSnapshotStepRecordV9 | GoalSnapshotStepRecordV10 {
    switch (step.kind) {
        case "action":
            return {
                kind: "action",
                action: encodeAction(step.action),
                observation: encodeObservation(step.observation),
            };
        case "decision": {
            const result = step.result;

            if (memoryProtocol.kind === "structured") {
                if ("checkpoint" in result) {
                    throw new GoalSnapshotProtocolError(
                        "structured Decision cannot contain checkpoint",
                    );
                }

                return {
                    kind: "decision",
                    result: result.kind === "complete"
                        ? {
                            kind: "complete",
                            summary: result.summary,
                            completionEvidence: result.completionEvidence.map((evidence) => ({
                                criterionIndex: evidence.criterionIndex,
                                evidenceSequences: [...evidence.evidenceSequences],
                            })),
                            ...(result.memoryPatch === undefined
                                ? {}
                                : {
                                    memoryPatch: cloneMemoryPatch(result.memoryPatch),
                                }),
                        }
                        : result.kind === "wait"
                            ? {
                                kind: "wait",
                                reason: result.reason,
                                ...(result.memoryPatch === undefined
                                    ? {}
                                    : {
                                        memoryPatch: cloneMemoryPatch(result.memoryPatch),
                                    }),
                            }
                            : result.kind === "fail"
                                ? {
                                    kind: "fail",
                                    error: result.error,
                                    ...(result.memoryPatch === undefined
                                        ? {}
                                        : {
                                            memoryPatch: cloneMemoryPatch(result.memoryPatch),
                                        }),
                                }
                                : {
                                    kind: "context_lookup",
                                    need: result.need,
                                    question: result.question,
                                    ...(result.filters === undefined
                                        ? {}
                                        : { filters: structuredClone(result.filters) }),
                                },
                };
            }

            if (!("checkpoint" in result)) {
                throw new GoalSnapshotProtocolError(
                    "checkpoint Decision must contain checkpoint",
                );
            }

            return {
                kind: "decision",
                result: result.kind === "complete"
                    ? {
                        kind: "complete",
                        checkpoint: result.checkpoint,
                        summary: result.summary,
                    }
                    : result.kind === "wait"
                        ? {
                            kind: "wait",
                            checkpoint: result.checkpoint,
                            reason: result.reason,
                        }
                        : {
                            kind: "fail",
                            checkpoint: result.checkpoint,
                            error: result.error,
                        },
            };
        }
    }
}

function encodeState(goal: Goal) {
    const run = goal.state.run;
    const memoryProtocol = resolveMemoryProtocol(goal.definition);

    return {
        workflow: encodeWorkflow(goal.state.workflow),
        messages: goal.state.messages.map((message): GoalSnapshotMessageV5 =>
            message.role === "user"
                ? { role: "user", content: message.content }
                : {
                    role: "assistant",
                    assistant: { profileId: message.assistant.profileId },
                    content: message.content,
                }
        ),
        run: {
            id: run.id,
            status: run.status,
            stepCount: run.stepCount,
            committedThroughSequence: run.committedThroughSequence ?? 0,
            ...(run.memoryRevision === undefined
                ? {}
                : {
                    memoryRevision: {
                        eventId: run.memoryRevision.eventId,
                        sequence: run.memoryRevision.sequence,
                    },
                }),
            ...(run.lastStep === undefined
                ? {}
                : { lastStep: encodeStep(run.lastStep, memoryProtocol) }),
            ...(run.checkpoint === undefined ? {} : { checkpoint: run.checkpoint }),
            ...(run.pendingAction === undefined
                ? {}
                : {
                    pendingAction: {
                        action: encodeAction(run.pendingAction.action),
                        status: run.pendingAction.status,
                    },
                }),
            ...(run.stopReason === undefined ? {} : { stopReason: run.stopReason }),
        },
    };
}

function decodeProfile(profile: GoalSnapshotProfileV5): AgentProfile {
    return {
        id: profile.id,
        ...(profile.name === undefined ? {} : { name: profile.name }),
        ...(profile.description === undefined
            ? {}
            : { description: profile.description }),
        systemPrompt: profile.systemPrompt,
        instructions: [...profile.instructions],
        toolIds: [...profile.toolIds],
    };
}

function decodeWorkflow(workflow: GoalSnapshotWorkflowV5): GoalWorkflowState {
    switch (workflow.phase) {
        case "gathering_context":
            return {
                phase: "gathering_context",
                preparation: { status: workflow.preparation.status },
            };
        case "planning":
            return workflow.preparation.status === "active"
                ? { phase: "planning", preparation: { status: "active" } }
                : {
                    phase: "planning",
                    preparation: {
                        status: "waiting_approval",
                        proposal: {
                            objective: workflow.preparation.proposal.objective,
                            completionCriteria: [
                                ...workflow.preparation.proposal.completionCriteria,
                            ],
                        },
                    },
                };
        case "executing":
            return {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: workflow.task.objective,
                    completionCriteria: [...workflow.task.completionCriteria],
                },
            };
    }
}

function decodeAction(action: GoalSnapshotToolCallActionV5): ToolCallAction {
    return {
        actionId: action.actionId,
        toolId: action.toolId,
        input: structuredClone(action.input),
    };
}

function decodeObservation(
    observation: GoalSnapshotObservationV5,
): Observation {
    switch (observation.kind) {
        case "success":
            return {
                kind: "success",
                output: structuredClone(observation.output),
                summary: observation.summary,
            };
        case "failure":
            return {
                kind: "failure",
                code: observation.code,
                message: observation.message,
                retryable: observation.retryable,
            };
        case "rejected":
            return {
                kind: "rejected",
                reason: observation.reason,
            };
    }
}

function decodeStep(
    step: GoalSnapshotStepRecordV5 | GoalSnapshotStepRecordV7 | GoalSnapshotStepRecordV9 | GoalSnapshotStepRecordV10,
    memoryProtocol: MemoryProtocol,
): StepRecord {
    switch (step.kind) {
        case "action":
            return {
                kind: "action",
                action: decodeAction(step.action),
                observation: decodeObservation(step.observation),
            };
        case "decision": {
            const result = step.result;

            if (memoryProtocol.kind === "structured") {
                if ("checkpoint" in result) {
                    throw new GoalSnapshotProtocolError(
                        "structured Decision cannot contain checkpoint",
                    );
                }

                return {
                    kind: "decision",
                    result: result.kind === "complete"
                        ? {
                            kind: "complete",
                            summary: result.summary,
                            completionEvidence: result.completionEvidence.map((evidence) => ({
                                criterionIndex: evidence.criterionIndex,
                                evidenceSequences: [...evidence.evidenceSequences],
                            })),
                            ...(result.memoryPatch === undefined
                                ? {}
                                : {
                                    memoryPatch: cloneMemoryPatch(result.memoryPatch),
                                }),
                        }
                        : result.kind === "wait"
                            ? {
                                kind: "wait",
                                reason: result.reason,
                                ...(result.memoryPatch === undefined
                                    ? {}
                                    : {
                                    memoryPatch: cloneMemoryPatch(result.memoryPatch),
                                    }),
                            }
                            : result.kind === "fail"
                                ? {
                                    kind: "fail",
                                    error: result.error,
                                    ...(result.memoryPatch === undefined
                                        ? {}
                                        : {
                                            memoryPatch: cloneMemoryPatch(result.memoryPatch),
                                        }),
                                }
                                : {
                                    kind: "context_lookup",
                                    need: result.need,
                                    question: result.question,
                                    ...(result.filters === undefined
                                        ? {}
                                        : { filters: structuredClone(result.filters) }),
                                },
                };
            }

            if (!("checkpoint" in result)) {
                throw new GoalSnapshotProtocolError(
                    "checkpoint Decision must contain checkpoint",
                );
            }

            return {
                kind: "decision",
                result: result.kind === "complete"
                    ? {
                        kind: "complete",
                        checkpoint: result.checkpoint,
                        summary: result.summary,
                    }
                    : result.kind === "wait"
                        ? {
                            kind: "wait",
                            checkpoint: result.checkpoint,
                            reason: result.reason,
                        }
                        : {
                            kind: "fail",
                            checkpoint: result.checkpoint,
                            error: result.error,
                        },
            };
        }
    }
}

function decodeSnapshot(
    snapshot: GoalSnapshotV5 | GoalSnapshotV6 | GoalSnapshotV7 | GoalSnapshotV8 | GoalSnapshotV9 | GoalSnapshotV10,
    committedThroughSequence: number,
): Goal {
    const state = snapshot.state;
    const run = state.run;
    const memoryProtocol: MemoryProtocol = "memoryProtocol" in snapshot.definition
        ? {
            kind: snapshot.definition.memoryProtocol.kind,
            version: snapshot.definition.memoryProtocol.version,
        }
        : { kind: "checkpoint", version: 1 };
    const modelContextProtocol: ModelContextProtocol =
        "modelContextProtocol" in snapshot.definition
            ? {
                kind: snapshot.definition.modelContextProtocol.kind,
                version: snapshot.definition.modelContextProtocol.version,
            }
            : { kind: "conversation", version: 1 };
    const contextRetrievalProtocol: ContextRetrievalProtocol =
        "contextRetrievalProtocol" in snapshot.definition
            ? {
                kind: snapshot.definition.contextRetrievalProtocol.kind,
                version: snapshot.definition.contextRetrievalProtocol.version,
            }
            : { kind: "none", version: 1 };
    const decodedRun = {
        id: run.id,
        status: run.status,
        stepCount: run.stepCount,
        ...(run.lastStep === undefined
            ? {}
            : { lastStep: decodeStep(run.lastStep, memoryProtocol) }),
        ...(run.checkpoint === undefined
            ? {}
            : { checkpoint: run.checkpoint }),
        ...(run.pendingAction === undefined
            ? {}
            : {
                pendingAction: decodePendingAction(run.pendingAction),
            }),
        ...(run.stopReason === undefined
            ? {}
            : { stopReason: run.stopReason }),
        ...(
            "memoryRevision" in run && run.memoryRevision !== undefined
                ? {
                    memoryRevision: {
                        eventId: run.memoryRevision.eventId,
                        sequence: run.memoryRevision.sequence,
                    },
                }
                : {}
        ),
    } as Goal["state"]["run"];

    if (committedThroughSequence === 0) {
        Object.defineProperty(decodedRun, "committedThroughSequence", {
            value: 0,
            enumerable: false,
            writable: false,
            configurable: true,
        });
    } else {
        Object.defineProperty(decodedRun, "committedThroughSequence", {
            value: committedThroughSequence,
            enumerable: true,
            writable: false,
            configurable: true,
        });
    }

    const definition = {
        intent: snapshot.definition.intent,
        promptBundleVersion:
            snapshot.definition.promptBundleVersion,
        ...("memoryProtocol" in snapshot.definition
            && snapshot.definition.memoryProtocol.kind === "structured"
            ? {
                memoryProtocol: {
                    kind: snapshot.definition.memoryProtocol.kind,
                    version: snapshot.definition.memoryProtocol.version,
                },
            }
            : {}),
        profile: decodeProfile(snapshot.definition.profile),
        executionPolicy: {
            maxSteps: snapshot.definition.executionPolicy.maxSteps,
        },
    } as Goal["definition"];

    if (
        !("memoryProtocol" in snapshot.definition)
        || snapshot.definition.memoryProtocol.kind === "checkpoint"
    ) {
        // Checkpoint snapshots are semantically legacy. Keep this compatibility
        // field non-enumerable so reading a legacy Runtime object does not change
        // its historical serialized shape. The next encode still sees the field
        // and upgrades it to v10.
        Object.defineProperty(definition, "memoryProtocol", {
            value: { kind: "checkpoint", version: 1 },
            enumerable: false,
            writable: false,
            configurable: true,
        });
    }

    if ("modelContextProtocol" in snapshot.definition) {
        Object.defineProperty(definition, "modelContextProtocol", {
            value: modelContextProtocol,
            enumerable: modelContextProtocol.kind === "trajectory-layered",
            writable: false,
            configurable: true,
        });
    } else {
        // v5-v7 have no model-context field. Keep the resolved compatibility value
        // available to new consumers without changing the enumerable legacy shape.
        Object.defineProperty(definition, "modelContextProtocol", {
            value: modelContextProtocol,
            enumerable: false,
            writable: false,
            configurable: true,
        });
    }

    if ("contextRetrievalProtocol" in snapshot.definition) {
        Object.defineProperty(definition, "contextRetrievalProtocol", {
            value: contextRetrievalProtocol,
            // `none@1` is the compatibility default and remains non-enumerable,
            // matching the existing legacy handling for conversation@1.  The
            // explicit bm25 capability is enumerable so a restored Goal carries
            // a visible frozen opt-in for callers that inspect its definition.
            enumerable: contextRetrievalProtocol.kind === "bm25-lite",
            writable: false,
            configurable: true,
        });
    } else {
        // v5-v8 have no retrieval field. Keep the compatibility value available to
        // new consumers without changing the enumerable legacy object shape.
        Object.defineProperty(definition, "contextRetrievalProtocol", {
            value: contextRetrievalProtocol,
            enumerable: false,
            writable: false,
            configurable: true,
        });
    }

    return {
        id: snapshot.id,
        definition,
        state: {
            workflow: decodeWorkflow(state.workflow),
            messages: state.messages.map((message): GoalMessage =>
                message.role === "user"
                    ? { role: "user", content: message.content }
                    : {
                        role: "assistant",
                        assistant: { profileId: message.assistant.profileId },
                        content: message.content,
                    }
            ),
            run: decodedRun,
        },
    };
}

function decodePendingAction(
    pendingAction: GoalSnapshotPendingActionV5,
): PendingAction {
    return {
        action: decodeAction(pendingAction.action),
        status: pendingAction.status,
    };
}

/** 共享的默认 Codec 实例；无状态且可安全复用。 */
export const goalSnapshotCodec: GoalSnapshotCodec =
    new DefaultGoalSnapshotCodec();
