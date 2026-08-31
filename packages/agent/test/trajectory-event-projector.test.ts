import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
    TrajectoryEventProjector,
} from "../src/index";
import { stableJson } from "../src/prompting/environment";
import type {
    TrajectoryEvent,
    TrajectoryEventDraft,
} from "../../runtime/src/index";
import {
    allocateImmutableEvent,
} from "../../runtime/src/index";

test("大型 Tool 输出被替换为稳定有界 preview、hash 与来源序号", () => {
    const output = "0123456789abcdefghij";
    const event = observationEvent(7, output);
    const original = structuredClone(event);
    const projector = new TrajectoryEventProjector({ previewLimit: 10 });

    const projected = projector.project(event);
    const payload = projected.payload as {
        readonly observation: {
            readonly output: {
                readonly truncated: boolean;
                readonly preview?: { readonly prefix: string; readonly suffix: string };
                readonly serializedLength?: number;
                readonly sourceSequence: number;
                readonly sourceSequenceRange: { readonly first: number; readonly last: number };
                readonly contentHash: string;
                readonly artifactAvailability: string;
                readonly artifactReference?: string;
            };
        };
    };
    const result = payload.observation.output;
    const serializedOutput = stableJson(output);
    const serializedObservation = stableJson({
        kind: "success",
        output,
        summary: "done",
    });

    assert.equal(result.truncated, true);
    assert.equal(result.preview?.prefix.length, 5);
    assert.equal(result.preview?.suffix.length, 5);
    assert.equal(result.serializedLength, serializedOutput.length);
    assert.equal(result.sourceSequence, 7);
    assert.deepEqual(result.sourceSequenceRange, { first: 7, last: 7 });
    assert.equal(
        result.contentHash,
        createHash("sha256").update(serializedObservation, "utf8").digest("hex"),
    );
    assert.equal(result.artifactAvailability, "unavailable");
    assert.equal(result.artifactReference, undefined);
    assert.deepEqual(event, original);
});

test("小型输出保留完整值但仍附带定位 metadata", () => {
    const value = { answer: "ok", count: 2 };
    const event = observationEvent(3, value);
    const projected = new TrajectoryEventProjector({ previewLimit: 200 }).project(event);
    const output = (projected.payload as {
        readonly observation: { readonly output: Record<string, unknown> };
    }).observation.output;

    assert.equal(output.truncated, false);
    assert.deepEqual(output.value, value);
    assert.equal(output.sourceSequence, 3);
    assert.deepEqual(output.sourceSequenceRange, { first: 3, last: 3 });
    assert.equal(typeof output.contentHash, "string");
    assert.equal(output.artifactAvailability, "unavailable");
    assert.equal("preview" in output, false);
    assert.notEqual(output.value, value);
});

test("已有 Artifact 引用只被带入模型投影，不由投影器创建", () => {
    const event = observationEvent(11, "large output");
    const projector = new TrajectoryEventProjector({
        previewLimit: 4,
        artifactResolver: (source) => ({
            reference: `artifact://${source.eventId}`,
            availability: "available",
        }),
    });
    const projected = projector.project(event);
    const output = (projected.payload as {
        readonly observation: { readonly output: Record<string, unknown> };
    }).observation.output;

    assert.equal(output.artifactAvailability, "available");
    assert.equal(output.artifactReference, "artifact://event-11");
});

test("相同 payload 重复投影产生稳定 DTO，执行单元投影保持顺序", () => {
    const events = [
        observationEvent(1, "short"),
        observationEvent(2, "short"),
    ];
    const unit = {
        executionUnitId: "unit-1",
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing" as const,
        firstSequence: 1,
        lastSequence: 2,
        items: events,
        events,
        characterCount: 100,
    };
    const projector = new TrajectoryEventProjector({ previewLimit: 100 });
    const first = projector.projectExecutionUnit(unit);
    const second = projector.projectExecutionUnit(unit);

    assert.deepEqual(first, second);
    assert.deepEqual(first.events.map((item) => item.sequence), [1, 2]);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.events), true);
});

test("投影器拒绝非法 preview 配置或 Artifact 引用", () => {
    assert.throws(
        () => new TrajectoryEventProjector({ previewLimit: 0 }),
        /positive safe integer/,
    );
    assert.throws(
        () => new TrajectoryEventProjector({ previewLimit: 1.5 }),
        /positive safe integer/,
    );

    const projector = new TrajectoryEventProjector({
        previewLimit: 4,
        artifactResolver: () => ({
            reference: "",
            availability: "available",
        }),
    });
    assert.throws(
        () => projector.project(observationEvent(1, "large")),
        /Artifact reference projection is invalid/,
    );
});

function observationEvent(sequence: number, output: unknown): TrajectoryEvent {
    const draft: TrajectoryEventDraft = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        executionUnitId: "unit-1",
        actionId: "action-1",
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded",
            actionId: "action-1",
            observation: {
                kind: "success",
                output: output as never,
                summary: "done",
            },
        },
    };
    return allocateImmutableEvent(draft, sequence, `event-${sequence}`) as TrajectoryEvent;
}
