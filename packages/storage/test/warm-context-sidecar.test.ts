import assert from "node:assert/strict";
import {
    mkdtemp,
    readFile,
    readdir,
    rm,
    stat,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    allocateImmutableEvent,
} from "../../runtime/src/index";
import type {
    TrajectoryEvent,
    TrajectoryEventDraft,
} from "../../runtime/src/index";
import {
    JsonFileWarmContextSidecarStore,
    WarmContextSidecarProtocolError,
    computeTrajectorySourceDigest,
    warmContextSidecarCodec,
} from "../src/index";
import type { WarmContextSidecar } from "../src/warm-context-sidecar";

test("Warm Sidecar Codec 严格校验、隔离输入并冻结结果", () => {
    const input = sidecar();
    const encoded = warmContextSidecarCodec.encode(input);

    assert.deepEqual(encoded, input);
    assert.notEqual(encoded, input);
    assert.equal(Object.isFrozen(encoded), true);
    assert.equal(Object.isFrozen(encoded.entries), true);
    assert.equal(Object.isFrozen(encoded.entries[0]), true);

    assert.throws(
        () => warmContextSidecarCodec.decode({ ...input, extra: true }),
        (error: unknown) => error instanceof WarmContextSidecarProtocolError,
    );
    assert.throws(
        () => warmContextSidecarCodec.encode({
            ...input,
            entries: [{ ...input.entries[0]!, firstSequence: 20, lastSequence: 10 }],
        }),
        /sequence range/,
    );
    assert.throws(
        () => warmContextSidecarCodec.encode({
            ...input,
            entries: [input.entries[0]!, input.entries[0]!],
        }),
        /duplicate entry IDs/,
    );
});

test("Trajectory 来源摘要覆盖 committed 前缀且忽略 tail，输入顺序变化会被拒绝", () => {
    const events = [
        event(1, "run_started"),
        event(2, "run_resumed"),
        event(3, "run_waiting"),
    ];
    const first = computeTrajectorySourceDigest(events, 2);
    const second = computeTrajectorySourceDigest(events.slice(0, 2), 2);

    assert.equal(first, second);
    assert.match(first, /^sha256:[0-9a-f]{64}$/);
    assert.throws(
        () => computeTrajectorySourceDigest([events[1]!, events[0]!], 2),
        /sequence must increase/,
    );
});

test("JsonFileWarmContextSidecarStore 原子保存、权限受限并按边界/版本/hash 校验", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-sidecar-"));
    t.after(async () => rm(directory, { recursive: true, force: true }));
    const store = new JsonFileWarmContextSidecarStore(directory);
    const events = [event(1, "run_started"), event(2, "run_resumed")];
    const digest = computeTrajectorySourceDigest(events, 2);
    await store.save(sidecar({ sourceDigest: digest }));

    const restored = await store.restore("goal-1", "run-1", {
        committedThroughSequence: 2,
        compactorVersion: "deterministic-warm-v1",
        expectedSourceDigest: digest,
    });
    assert.deepEqual(restored, sidecar({ sourceDigest: digest }));

    assert.equal(await store.restore("goal-1", "run-1", {
        committedThroughSequence: 1,
    }), undefined);
    assert.equal(await store.restore("goal-1", "run-1", {
        compactorVersion: "other",
    }), undefined);
    assert.equal(await store.restore("goal-1", "run-1", {
        expectedSourceDigest: "sha256:wrong",
    }), undefined);

    const goalDirectory = join(directory, Buffer.from("goal-1").toString("base64url"));
    const runDirectory = join(goalDirectory, Buffer.from("run-1").toString("base64url"));
    const filePath = join(runDirectory, "warm-v1.json");
    assert.equal((await stat(goalDirectory)).mode & 0o777, 0o700);
    assert.equal((await stat(runDirectory)).mode & 0o777, 0o700);
    assert.equal((await stat(filePath)).mode & 0o777, 0o600);
    assert.deepEqual((await readdir(runDirectory)).filter((name) => name.endsWith(".tmp")), []);
    assert.match(await readFile(filePath, "utf8"), /"schemaVersion": 1/);
});

test("缺失、损坏、身份失配 Sidecar 被忽略；remove 幂等", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-sidecar-invalid-"));
    t.after(async () => rm(directory, { recursive: true, force: true }));
    const store = new JsonFileWarmContextSidecarStore(directory);

    assert.equal(await store.restore("missing", "run-1"), undefined);
    await store.save(sidecar());
    const filePath = join(
        directory,
        Buffer.from("goal-1").toString("base64url"),
        Buffer.from("run-1").toString("base64url"),
        "warm-v1.json",
    );
    await writeFile(filePath, "{broken", "utf8");
    assert.equal(await store.restore("goal-1", "run-1"), undefined);

    await store.save({ ...sidecar(), goalId: "goal-other" });
    assert.equal(await store.restore("goal-1", "run-1"), undefined);

    await store.remove("goal-1", "run-1");
    await store.remove("goal-1", "run-1");
    assert.equal(await store.restore("goal-1", "run-1"), undefined);
});

function sidecar(overrides: Partial<WarmContextSidecar> = {}): WarmContextSidecar {
    return {
        schemaVersion: 1,
        goalId: "goal-1",
        runId: "run-1",
        derivedThroughSequence: 2,
        sourceDigest: "sha256:source",
        compactorVersion: "deterministic-warm-v1",
        entries: [
            {
                id: "finding-1",
                kind: "finding",
                summary: "finding",
                status: "active",
                lossy: true,
                evidenceSequences: [1, 2],
                firstSequence: 1,
                lastSequence: 2,
                lastAccessedSequence: 2,
                reinforcementCount: 1,
                sourceHash: "sha256:finding",
            },
        ],
        ...overrides,
    };
}

function event(sequence: number, type: "run_started" | "run_resumed" | "run_waiting"): TrajectoryEvent {
    const payload: TrajectoryEventDraft["payload"] = type === "run_started"
        ? { type }
        : type === "run_resumed"
            ? { type }
            : { type, reason: "wait" };
    return allocateImmutableEvent({
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        eventType: type,
        payload,
    } as TrajectoryEventDraft, sequence, `event-${sequence}`) as TrajectoryEvent;
}
