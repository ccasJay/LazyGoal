import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  createGoal,
  GoalSessionStream,
  projectGoalSessionState,
  Runner,
} from "../../../packages/runtime/src/index";
import type { Goal, SessionOutputEvent, StepExecutor } from "../../../packages/runtime/src/index";
import { InMemoryGoalStore } from "../../../packages/storage/src/index";
import { readBrowserGoalActivity, readBrowserGoalSessionState } from "../../../packages/browser/src/index";
import { InMemoryExecutionStreamPublisher } from "../../../packages/execution-stream/src/index";
import type { BrowserActivityPage, BrowserGoalLiveEvent } from "../../../packages/web-contracts/src/index";
import { InMemoryTrajectoryStore } from "../../../packages/runtime/test/current-fixtures";
import {
  EMPTY_SESSION_OUTPUT_DISPLAY,
  applySessionOutputEvent,
  candidatePresentationKey,
  MAX_DISCARDED_CANDIDATE_DRAFTS,
  reconcileCandidatePresentation,
  releaseDiscardedCandidate,
  setExpandedCandidate,
} from "../src/session-output-consumer";
import { projectSessionTimeline } from "../src/session-timeline";
import { SessionTimeline } from "../src/components/SessionTimeline";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";

function createCandidateGoal(): Goal {
  return createGoal({
    ...currentProtocols,
    id: "candidate-presentation-goal",
    runId: "run-candidate-presentation",
    intent: "呈现正式完成候选",
    promptBundleVersion: 1,
    profile: { id: "candidate-presentation", systemPrompt: "test", instructions: [], toolIds: [] },
  });
}

function previewEvent(
  candidateId: string,
  sourceCursor: number,
  text: string,
  startOffset = 0,
  options: { readonly truncated?: boolean; readonly complete?: boolean } = {},
): BrowserGoalLiveEvent {
  return {
    type: "activity",
    goalId: "candidate-presentation-goal",
    runId: "run-candidate-presentation",
    activity: {
      kind: "candidate_preview",
      sourceEventId: `preview-${sourceCursor}`,
      sourceCursor,
      candidateId,
      text,
      startOffset,
      truncated: options.truncated ?? false,
      complete: options.complete ?? true,
    },
  };
}

function invalidationEvent(candidateId: string, sourceCursor: number): BrowserGoalLiveEvent {
  return {
    type: "activity",
    goalId: "candidate-presentation-goal",
    runId: "run-candidate-presentation",
    activity: {
      kind: "candidate_invalidated",
      sourceEventId: `invalidated-${sourceCursor}`,
      sourceCursor,
      candidateId,
      reason: "rejected",
    },
  };
}

test("确定作废的候选保留为可展开旧稿，后续迟到预览不能复活", () => {
  const preview = applySessionOutputEvent(EMPTY_SESSION_OUTPUT_DISPLAY, previewEvent("candidate-old", 1, "旧稿正文"));
  assert.ok(preview);
  const discarded = applySessionOutputEvent(preview, invalidationEvent("candidate-old", 2));
  assert.ok(discarded);

  const drafts = (discarded as unknown as {
    readonly discardedDrafts?: readonly { readonly candidateId: string; readonly content: string }[];
  }).discardedDrafts;
  assert.deepEqual(drafts?.map((draft) => [draft.candidateId, draft.content]), [
    ["candidate-old", "旧稿正文"],
  ]);
  const latePreview = applySessionOutputEvent(discarded, previewEvent("candidate-old", 1, "迟到旧稿"));
  assert.deepEqual(
    ((latePreview ?? discarded) as unknown as { readonly discardedDrafts?: readonly { readonly content: string }[] })
      .discardedDrafts?.map((draft) => draft.content),
    ["旧稿正文"],
  );
});

test("真实 GoalSessionStream 在保存屏障前展示候选，正式保存核验后同一展示 key 仅保留规范消息", async () => {
  const initial = createCandidateGoal();
  const store = new InMemoryGoalStore();
  const trajectory = new InMemoryTrajectoryStore();
  const publisher = new InMemoryExecutionStreamPublisher();
  await store.save(initial);

  let releaseReview!: () => void;
  const reviewGate = new Promise<void>((resolve) => { releaseReview = resolve; });
  let publishedCandidatePreview = false;
  const executor: StepExecutor = {
    async reviewCompletion() {
      if (!publishedCandidatePreview) {
        publishedCandidatePreview = true;
        publisher.publish({
          goalId: initial.id,
          runId: initial.state.run.id,
          kind: "candidate_preview",
          visibility: "public",
          durability: "live",
          delivery: "control",
          payload: {
            candidateId: "candidate-stream-save",
            modelCallId: "candidate-stream-save",
            blockIndex: 0,
            text: "预览答复",
            startOffset: 0,
            truncated: false,
            complete: true,
          },
        });
      }
      await reviewGate;
      return { kind: "accept" };
    },
    async decide(input) {
      return {
        kind: "decision",
        decision: { kind: "complete", summary: "规范正式答复", evidenceSequences: [] },
        modelContextFrame: {
          stage: "decide",
          epochNumber: input.goal.state.run.contextEpoch.number,
          conversationPosition: input.goal.state.messages.length,
          sections: [],
          modelCallId: "candidate-stream-save",
        },
      };
    },
    async think() { throw new Error("unexpected Think call"); },
  };
  const stream = new GoalSessionStream({
    publisher,
    goalId: initial.id,
    readState: async (goalId) => {
      const goal = await store.restore(goalId);
      return goal === undefined ? undefined : projectGoalSessionState({ goal, executionOwner: true });
    },
  });
  const streamEvents: SessionOutputEvent[] = [];
  const consuming = (async () => {
    for await (const event of stream) streamEvents.push(event);
  })();
  const runPromise = new Runner({ store, trajectoryStore: trajectory, executor, executionStream: publisher })
    .run({ goalId: initial.id, runId: initial.state.run.id });

  try {
    await waitFor(() => streamEvents.some((event) =>
      event.type === "generation_event" && event.event.kind === "candidate_preview"));
    const previewSessionEvent = streamEvents.find((event) =>
      event.type === "generation_event" && event.event.kind === "candidate_preview")!;
    const previewWireEvent = toBrowserCandidateEvent(previewSessionEvent);
    assert.ok(previewWireEvent);
    if (previewWireEvent === undefined) return;

    const beforeSave = applySessionOutputEvent(EMPTY_SESSION_OUTPUT_DISPLAY, previewWireEvent);
    assert.ok(beforeSave);
    const beforeSnapshot = await store.restore(initial.id);
    assert.equal(beforeSnapshot?.state.messages.some((message) => message.role === "assistant"), false);
    assert.equal(beforeSnapshot?.state.messages.some((message) => message.content === "规范正式答复"), false);

    const [beforePage, beforeState] = await Promise.all([
      readActivityPage(initial, store, trajectory),
      readBrowserGoalSessionState(initial.id, store),
    ]);
    assert.equal(beforePage.ok, true);
    assert.ok(beforeState);
    if (!beforePage.ok || beforeState === undefined) return;
    const previewHtml = renderTimeline(beforePage.page, beforeState, beforeSave);
    const stableKey = candidatePresentationKey(initial.id, initial.state.run.id, "candidate-stream-save");
    assert.equal(previewHtml.includes('data-presentation-key="' + stableKey + '"'), true);
    assert.equal(previewHtml.includes("预览答复"), true);

    releaseReview();
    await runPromise;
    await stream.resync();
    await waitFor(() => streamEvents.some((event) => event.type === "message_committed"));
    const committed = streamEvents.find((event) => event.type === "message_committed")!;
    const committedWireEvent = toBrowserCandidateEvent(committed);
    assert.ok(committedWireEvent);
    if (committedWireEvent === undefined) return;
    assert.equal(committedWireEvent.type, "message_committed");

    const pendingVerification = applySessionOutputEvent(beforeSave, committedWireEvent);
    assert.ok(pendingVerification);
    assert.equal(pendingVerification?.discardedDrafts.length, 0);
    assert.equal(pendingVerification?.candidates[0]?.status, "pending-verification");
    const uncertainHtml = renderTimeline(beforePage.page, beforeState, pendingVerification!);
    assert.equal(uncertainHtml.includes("Checking whether this answer was saved"), true);
    assert.equal(uncertainHtml.includes("预览答复"), true);

    const finalSnapshot = await store.restore(initial.id);
    const savedAnswers = finalSnapshot?.state.messages.filter((message) => message.role === "assistant") ?? [];
    assert.equal(savedAnswers.length, 1);
    assert.equal(savedAnswers[0]?.content, "规范正式答复");
    assert.deepEqual(savedAnswers[0]?.source, { kind: "completion_candidate", candidateId: "candidate-stream-save" });
    const finalPage = await readActivityPage(initial, store, trajectory);
    assert.equal(finalPage.ok, true);
    if (!finalPage.ok) return;
    const finalMessages = finalPage.page.items.filter((item) => item.type === "message" && item.previewId === "candidate-stream-save");
    assert.equal(finalMessages.length, 1);
    const promoted = reconcileCandidatePresentation(pendingVerification!, finalPage.page);
    assert.equal(promoted.candidates.length, 0);
    const finalState = await readBrowserGoalSessionState(initial.id, store);
    assert.ok(finalState);
    if (finalState === undefined) return;
    const previewProjection = projectSessionTimeline(beforePage.page, beforeState, "", beforeSave);
    const finalProjection = projectSessionTimeline(finalPage.page, finalState, "", promoted);
    const previewIndex = previewProjection.items.findIndex((item) =>
      item.kind === "candidate-preview" && item.presentationKey === stableKey);
    const formalIndex = finalProjection.items.findIndex((item) =>
      item.kind === "message" && item.presentationKey === stableKey);
    assert.ok(previewIndex >= 0);
    assert.ok(formalIndex >= 0);
    assert.deepEqual(
      finalProjection.items.slice(0, previewIndex).map((item) => item.itemId),
      previewProjection.items.slice(0, previewIndex).map((item) => item.itemId),
    );
    assert.ok(finalProjection.items[formalIndex + 1]?.kind === "terminal");
    const finalHtml = renderTimeline(finalPage.page, finalState, promoted);
    assert.equal(finalHtml.includes('data-presentation-key="' + stableKey + '"'), true);
    assert.equal(finalHtml.includes("规范正式答复"), true);
    assert.equal(finalHtml.includes("预览答复"), false);
    assert.equal(finalHtml.match(new RegExp('data-presentation-key="' + stableKey + '"', "g"))?.length, 1);
  } finally {
    releaseReview();
    await runPromise.catch(() => undefined);
    stream.close();
    await consuming;
  }
});

test("缺失前缀与截断状态明确展示，九份旧稿最多保留八份且展开项不会淘汰", () => {
  let display = EMPTY_SESSION_OUTPUT_DISPLAY;
  display = applySessionOutputEvent(display, previewEvent("candidate-gap", 1, "后半段", 6, { truncated: true }))!;
  assert.equal(display.candidates[0]?.missingPrefix, true);
  assert.equal(display.candidates[0]?.truncated, true);

  let cursor = 1;
  for (let index = 0; index < 9; index += 1) {
    const candidateId = "candidate-old-" + index;
    display = applySessionOutputEvent(display, previewEvent(candidateId, ++cursor, "旧稿 " + index))!;
    display = applySessionOutputEvent(display, invalidationEvent(candidateId, ++cursor))!;
    if (index === 0) display = setExpandedCandidate(display, candidatePresentationKey("candidate-presentation-goal", "run-candidate-presentation", candidateId));
  }
  assert.equal(display.discardedDrafts.length, MAX_DISCARDED_CANDIDATE_DRAFTS);
  assert.equal(display.discardedDrafts.some((draft) => draft.candidateId === "candidate-old-0"), true);
  assert.equal(display.unavailableDraftCount, 1);
  const second = display.discardedDrafts.find((draft) => draft.candidateId === "candidate-old-2")!;
  display = setExpandedCandidate(display, second.presentationKey);
  assert.equal(display.expandedCandidateKey, second.presentationKey);
  display = releaseDiscardedCandidate(display, second.presentationKey);
  assert.equal(display.discardedDrafts.some((draft) => draft.presentationKey === second.presentationKey), false);
  assert.equal(display.unavailableDraftCount, 2);
  const late = applySessionOutputEvent(display, previewEvent(second.candidateId, ++cursor, "迟到内容"));
  assert.equal(late, undefined);
});

test("旧稿展开与释放操作在时间线 DOM 中提供可访问控件", async () => {
  const initial = createCandidateGoal();
  const store = new InMemoryGoalStore();
  const trajectory = new InMemoryTrajectoryStore();
  await store.save(initial);
  const [page, state] = await Promise.all([
    readActivityPage(initial, store, trajectory),
    readBrowserGoalSessionState(initial.id, store),
  ]);
  assert.equal(page.ok, true);
  assert.ok(state);
  if (!page.ok || state === undefined) return;

  const preview = applySessionOutputEvent(
    EMPTY_SESSION_OUTPUT_DISPLAY,
    previewEvent("candidate-dom", 1, "旧稿只在展开后显示"),
  );
  assert.ok(preview);
  const discarded = applySessionOutputEvent(preview!, invalidationEvent("candidate-dom", 2));
  assert.ok(discarded);
  const collapsedHtml = renderTimeline(page.page, state, discarded!);
  assert.equal(collapsedHtml.includes("Review old draft"), true);
  assert.equal(collapsedHtml.includes("Release draft"), true);
  assert.equal(collapsedHtml.includes("旧稿只在展开后显示"), false);

  const draft = discarded!.discardedDrafts[0]!;
  const expanded = setExpandedCandidate(discarded!, draft.presentationKey);
  const expandedHtml = renderTimeline(page.page, state, expanded);
  assert.equal(expandedHtml.includes("aria-expanded=\"true\""), true);
  assert.equal(expandedHtml.includes("旧稿只在展开后显示"), true);

  const released = releaseDiscardedCandidate(expanded, draft.presentationKey);
  const releasedHtml = renderTimeline(page.page, state, released);
  assert.equal(releasedHtml.includes("Release draft"), false);
  assert.equal(releasedHtml.includes("cannot be restored in this session"), true);
});

function toBrowserCandidateEvent(event: SessionOutputEvent): BrowserGoalLiveEvent | undefined {
  if (event.type === "generation_event" && event.event.kind === "candidate_preview") {
    return {
      type: "activity",
      goalId: event.event.source.goalId,
      runId: event.event.source.runId,
      activity: {
        kind: "candidate_preview",
        sourceEventId: event.event.source.eventId,
        sourceCursor: event.event.source.cursor,
        candidateId: event.event.candidateId,
        text: event.event.text,
        startOffset: event.event.startOffset,
        truncated: event.event.truncated,
        complete: event.event.complete,
      },
    };
  }
  if (event.type === "message_committed") {
    return {
      type: "message_committed",
      goalId: event.event.source.goalId,
      runId: event.event.runId,
      message: {
        messageId: event.event.messageId,
        role: event.event.role,
        runId: event.event.runId,
        position: event.event.position,
        ...(event.event.purpose === undefined ? {} : { purpose: event.event.purpose }),
        commitRevision: event.event.commitRevision,
        ...(event.event.previewId === undefined ? {} : { previewId: event.event.previewId }),
      },
    };
  }
  return undefined;
}

async function readActivityPage(initial: Goal, store: InMemoryGoalStore, trajectory: InMemoryTrajectoryStore) {
  return readBrowserGoalActivity(initial.id, {}, store, async ({ goalId, runId }) => {
    const goal = await store.restore(goalId);
    const through = goal?.state.run.id === runId
      ? goal.state.run.committedThroughSequence ?? 0
      : goal?.state.completedRuns?.find((run) => run.runId === runId)?.committedThroughSequence ?? 0;
    const events = await trajectory.read({ goalId, runId });
    return {
      committed: events.filter((event) => event.sequence <= through),
      uncommittedTail: events.filter((event) => event.sequence > through),
    };
  });
}

function renderTimeline(
  page: BrowserActivityPage,
  state: NonNullable<Awaited<ReturnType<typeof readBrowserGoalSessionState>>>,
  display: NonNullable<ReturnType<typeof applySessionOutputEvent>>,
): string {
  const projection = projectSessionTimeline(page, state, "", display);
  return renderToStaticMarkup(createElement(SessionTimeline, {
    projection,
    currentRunId: state.currentRunId,
    runStatus: state.runStatus,
    olderAvailable: page.range.olderAvailable,
    showExecutionFacts: true,
    liveActivity: display.liveActivity || null,
    streamConnected: true,
    candidatePresentation: display,
    onExpandCandidate: () => undefined,
    onReleaseCandidate: () => undefined,
    brandMark: "/brand.svg",
  }));
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail("timed out waiting for the candidate session event");
}

