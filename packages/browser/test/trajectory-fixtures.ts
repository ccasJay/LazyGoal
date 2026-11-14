import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    allocateImmutableEvent,
    createGoal,
    type Goal,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
} from "../../runtime/src/index";
import { JsonFileTrajectoryStore } from "../../storage/src/index";
import { encodePathSegment } from "../../storage/src/path-segment";
import { createBrowserTrajectoryRoutes } from "../src/index";

export const goalId = "goal-1";
export const runId = "run-1";

export function goal(boundary = 500): Goal {
    const value = createGoal({
        id: goalId,
        intent: "Inspect trajectory",
        runId,
        promptBundleVersion: 1,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        profile: { id: "private-profile", systemPrompt: "private-system", instructions: [], toolIds: [] },
    });
    return { ...value, state: { ...value.state, run: { ...value.state.run, committedThroughSequence: boundary } } };
}

export function fact(sequence: number, draft?: TrajectoryEventDraft): TrajectoryEvent {
    return allocateImmutableEvent(draft ?? {
        goalId,
        runId,
        phase: "executing",
        executionUnitId: `unit-${sequence}`,
        stepIndex: sequence,
        eventType: "run_started",
        payload: { type: "run_started" },
    }, sequence);
}

export async function writeTrajectory(
    directory: string,
    eventsByRun: Readonly<Record<string, readonly TrajectoryEvent[]>>,
): Promise<void> {
    for (const [targetRunId, events] of Object.entries(eventsByRun)) {
        const runDirectory = join(
            directory,
            encodePathSegment(goalId),
            "runs",
            encodePathSegment(targetRunId),
        );
        await mkdir(runDirectory, { recursive: true });
        await writeFile(
            join(runDirectory, "trajectory.jsonl"),
            events.map((event) => JSON.stringify({ storageEncodingVersion: 2, ...event })).join("\n") + "\n",
            "utf8",
        );
    }
}

export async function withTrajectory(
    value: Goal,
    eventsByRun: Readonly<Record<string, readonly TrajectoryEvent[]>>,
    run: (context: { readonly app: ReturnType<typeof createBrowserTrajectoryRoutes>; readonly store: JsonFileTrajectoryStore; readonly directory: string }) => Promise<void>,
): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-browser-trajectory-"));
    try {
        await writeTrajectory(directory, eventsByRun);
        const store = new JsonFileTrajectoryStore(directory);
        const app = createBrowserTrajectoryRoutes(
            { restore: async (id) => id === value.id ? value : undefined },
            store,
        );
        await run({ app, store, directory });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
