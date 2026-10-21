import assert from "node:assert/strict";
import { test } from "node:test";

import {
    appendGoalMessage,
    createGoal,
    projectSessionMessageRange,
    projectSessionMessageEntry,
    TrajectoryCheckpointCommitter,
    TrajectoryCommitMarkerError,
    allocateImmutableEvent,
} from "../src/index";
import type {
    AgentProfile,
    Goal,
    GoalStore,
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../src/index";
import { currentProtocols } from "./current-fixtures";

const profile: AgentProfile = {
    id: "timeline-position-profile",
    systemPrompt: "test",
    instructions: [],
    toolIds: [],
};

function createTimelineGoal(): Goal {
    return createGoal({
        ...currentProtocols,
        id: "goal-timeline-position",
        intent: "创建会话",
        promptBundleVersion: 1,
        profile,
        runId: "run-timeline-position",
    });
}

class MemoryGoalStore implements GoalStore {
    current?: Goal;

    async save(goal: Goal): Promise<void> {
        this.current = structuredClone(goal);
    }

    async restore(_goalId: string): Promise<Goal | undefined> {
        return this.current === undefined ? undefined : structuredClone(this.current);
    }
}

class SequenceTrajectoryStore implements TrajectoryStore {
    readonly events: TrajectoryEvent[] = [];
    failNextCommitMarker = false;

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        if (draft.payload.type === "state_committed" && this.failNextCommitMarker) {
            this.failNextCommitMarker = false;
            throw new Error("marker write failed");
        }
        const event = allocateImmutableEvent(draft, this.events.length + 1, `event-${this.events.length + 1}`);
        this.events.push(event);
        return event;
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.events.filter((event) => event.goalId === query.goalId && event.runId === query.runId);
    }

    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        const events = await this.read(query);
        return {
            committed: events.filter((event) => event.sequence <= committedThroughSequence),
            uncommittedTail: events.filter((event) => event.sequence > committedThroughSequence),
        };
    }
}

test("new Goal intent starts before the first Run fact", () => {
    const message = createTimelineGoal().state.messages[0]!;
    assert.deepEqual((message as unknown as { position: unknown }).position, {
        afterSequence: 0,
        order: 0,
    });
});

test("messages committed with their application fact use its sequence and retain same-anchor order", async () => {
    const goal = createTimelineGoal();
    const first = appendGoalMessage(goal, {
        role: "user",
        content: "已应用输入",
        runId: goal.state.run.id,
        source: { kind: "user_input", inputId: "input-1" },
    }).goal;
    const second = appendGoalMessage(first, {
        role: "assistant",
        content: "同一位置的后续正文",
        runId: goal.state.run.id,
        purpose: "process",
        profileId: profile.id,
        source: { kind: "runtime_notice", noticeId: "notice-1" },
    }).goal;
    const store = new MemoryGoalStore();
    const trajectory = new SequenceTrajectoryStore();
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: trajectory });

    const result = await committer.commit(second, {
        facts: [{
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            eventType: "session_input_applied",
            payload: { type: "session_input_applied", inputId: "input-1", runId: goal.state.run.id, messageIndex: 1 },
        }],
    });

    const messages = result.goal.state.messages;
    assert.deepEqual((messages[1] as unknown as { position: unknown }).position, {
        afterSequence: result.events[0]!.sequence,
        order: 0,
    });
    assert.deepEqual((messages[2] as unknown as { position: unknown }).position, {
        afterSequence: result.events[0]!.sequence,
        order: 1,
    });
    assert.equal(messages[1]!.runId, goal.state.run.id);
    assert.equal(result.goal.state.run.committedThroughSequence, result.events[0]!.sequence);
    assert.deepEqual(projectSessionMessageRange(result.goal).recent[1]?.position, messages[1]!.position);
    assert.deepEqual(projectSessionMessageEntry(messages[1]!).position, messages[1]!.position);
});

test("a marker failure after Snapshot save preserves message identity and position on reconstruction", async () => {
    const goal = createTimelineGoal();
    const input = appendGoalMessage(goal, {
        role: "user",
        content: "保存后核对",
        runId: goal.state.run.id,
        source: { kind: "user_input", inputId: "input-retry" },
    }).goal;
    const store = new MemoryGoalStore();
    const trajectory = new SequenceTrajectoryStore();
    trajectory.failNextCommitMarker = true;
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: trajectory });
    const request = {
        facts: [{
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing" as const,
            eventType: "session_input_applied" as const,
            payload: { type: "session_input_applied" as const, inputId: "input-retry", runId: goal.state.run.id, messageIndex: 1 },
        }],
    };

    await assert.rejects(committer.commit(input, request), TrajectoryCommitMarkerError);
    const savedMessage = (await store.restore(goal.id))!.state.messages[1]!;
    const rebuilt = await committer.commit((await store.restore(goal.id))!);
    const retriedMessage = rebuilt.goal.state.messages[1]!;
    assert.equal(retriedMessage.messageId, savedMessage.messageId);
    assert.deepEqual(retriedMessage.position, savedMessage.position);
});

test("a message saved without new facts stays after the latest committed fact", async () => {
    const goal = createTimelineGoal();
    const store = new MemoryGoalStore();
    const trajectory = new SequenceTrajectoryStore();
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: trajectory });
    const firstCommit = await committer.commit(goal, {
        facts: [{
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            eventType: "run_started",
            payload: { type: "run_started" },
        }],
    });
    const appended = appendGoalMessage(firstCommit.goal, {
        role: "assistant",
        content: "无新事实正文",
        runId: goal.state.run.id,
        purpose: "process",
        profileId: profile.id,
        source: { kind: "runtime_notice", noticeId: "notice-no-new-fact" },
    }).goal;
    const saved = await committer.commit(appended);
    assert.deepEqual(saved.goal.state.messages[1]?.position, {
        afterSequence: firstCommit.events[0]!.sequence,
        order: 0,
    });
});

test("a user message that resumes an existing Run anchors to run_resumed, not its old run_created fact", async () => {
    const goal = createTimelineGoal();
    const store = new MemoryGoalStore();
    const trajectory = new SequenceTrajectoryStore();
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: trajectory });
    const started = await committer.commit(goal, {
        facts: [{
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            eventType: "run_created",
            payload: { type: "run_created", mode: "normal" },
        }],
    });
    const resumedInput = appendGoalMessage(started.goal, {
        role: "user",
        content: "从等待中继续",
        runId: goal.state.run.id,
        source: { kind: "user_input", inputId: "resume-input" },
    }).goal;
    const resumed = await committer.commit(resumedInput, {
        facts: [{
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            eventType: "run_resumed",
            payload: { type: "run_resumed" },
        }],
    });

    assert.deepEqual(resumed.goal.state.messages[1]?.position, {
        afterSequence: resumed.events[0]!.sequence,
        order: 0,
    });
});
