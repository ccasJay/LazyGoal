import type { BrowserActivityPage, BrowserGoalLiveEvent } from "../../../packages/web-contracts/src/index";

/** 候选与正式消息使用的稳定 React 展示身份。 */
export function candidatePresentationKey(goalId: string, runId: string, candidateId: string): string {
  return "candidate:" + goalId + ":" + runId + ":" + candidateId;
}

/**
 * 一个公开完成候选在浏览器中的临时展示状态。
 *
 * @remarks
 * 候选正文只来自 Browser 安全投影，不代表已保存消息。确定作废后立即从临时显示中移除；
 * 保存结果不明时保持 pending-verification。
 *
 * @example
 * const candidate: CandidatePresentation = {
 *   goalId: "goal-1", runId: "run-1", candidateId: "call-1",
 *   presentationKey: candidatePresentationKey("goal-1", "run-1", "call-1"),
 *   content: "完成结果", startOffset: 0, sourceCursor: 4,
 *   truncated: false, complete: true, missingPrefix: false, status: "ready",
 * };
 */
export interface CandidatePresentation {
  /** 候选所属 Goal。 */
  readonly goalId: string;
  /** 候选所属 Run。 */
  readonly runId: string;
  /** Runtime 分配的模型调用候选身份。 */
  readonly candidateId: string;
  /** 与关联正式消息共享的 React 展示 key。 */
  readonly presentationKey: string;
  /** 公开候选正文；不写入 Snapshot。 */
  readonly content: string;
  /** 本段正文在候选中的起始 UTF-16 偏移。 */
  readonly startOffset: number;
  /** 最近一次公开预览是否已截断。 */
  readonly truncated: boolean;
  /** 最近一次公开预览是否报告完整。 */
  readonly complete: boolean;
  /** 已观察正文存在缺失前缀或不能与前一段安全拼接。 */
  readonly missingPrefix: boolean;
  /** 当前候选生命周期。 */
  readonly status: "generating" | "ready" | "pending-verification";
  /** 最后一次预览／作废来源游标。 */
  readonly sourceCursor: number;
}

/**
 * 按来源归约后的 Goal Board 会话输出状态。
 *
 * @remarks
 * 正式 Activity 页继续拥有已保存消息正文；该状态只保存流中的临时候选与有界身份标记。
 * 明确作废的候选立即丢弃，身份标记用于忽略迟到片段。会话目标或流连接重建时清空，等待下一轮公开来源。
 *
 * @example
 * const display = EMPTY_SESSION_OUTPUT_DISPLAY;
 */
export interface SessionOutputDisplay {
  /** 普通正文增量的临时显示值。 */
  readonly liveText: string;
  /** 当前安全活动提示。 */
  readonly liveActivity: string;
  /** 是否存在尚未核验的候选正文。 */
  readonly unconfirmed: boolean;
  /** 当前未保存或等待保存核验的候选。 */
  readonly candidates: readonly CandidatePresentation[];
  /** 最近处理的候选来源游标。 */
  readonly latestCandidateCursor: number;
  /** 已作废候选身份；只保留有界去重标记，不保留正文。 */
  readonly retiredCandidateKeys: readonly string[];
  /** 已由正式 Activity 确认的候选及其可比较状态。 */
  readonly settledCandidates: readonly {
    readonly presentationKey: string;
    readonly issue?: "official-text-differs" | "preview-incomplete";
  }[];
}

const MAX_RETIRED_CANDIDATE_KEYS = 128;
const MAX_SETTLED_CANDIDATES = 128;

/** 没有活动或候选时的会话输出状态。 */
export const EMPTY_SESSION_OUTPUT_DISPLAY: SessionOutputDisplay = {
  liveText: "",
  liveActivity: "",
  unconfirmed: false,
  candidates: [],
  latestCandidateCursor: 0,
  retiredCandidateKeys: [],
  settledCandidates: [],
};

/**
 * 把一条会话输出事件归约为页面临时展示状态。
 *
 * @remarks
 * 预览按 Goal／Run／候选身份隔离；确定作废立即移除候选并保留有限身份标记，ambiguous 与正式消息通知只进入保存核验态。
 * 只有正式 Activity 页出现相同 previewId 才结算候选正文；普通 process 消息不会替换候选。
 *
 * @param current - 当前展示状态。
 * @param event - 会话输出事件。
 * @returns 新的显示状态；该事件不改变候选时返回 undefined。
 * @example
 * const next = applySessionOutputEvent(EMPTY_SESSION_OUTPUT_DISPLAY, event);
 */
export function applySessionOutputEvent(
  current: SessionOutputDisplay,
  event: BrowserGoalLiveEvent,
): SessionOutputDisplay | undefined {
  if (event.type === "message_committed") {
    const previewId = event.message.previewId;
    if (previewId !== undefined) {
      const key = candidatePresentationKey(event.goalId, event.message.runId, previewId);
      if (current.retiredCandidateKeys.includes(key)) return current;
      let found = false;
      const candidates = current.candidates.map((candidate) => {
        if (candidate.presentationKey !== key) return candidate;
        found = true;
        return { ...candidate, status: "pending-verification" as const };
      });
      return {
        ...current,
        candidates,
        unconfirmed: candidates.length > 0,
        liveActivity: found ? "Checking whether the answer was saved" : current.liveActivity,
      };
    }
    return { ...current, liveText: "", liveActivity: "The message was saved" };
  }
  if (event.type === "interaction_required") {
    return { ...current, liveActivity: "Waiting for your answer" };
  }
  if (event.type !== "activity") return undefined;

  if (event.activity.kind === "candidate_preview") {
    const activity = event.activity;
    if (activity.sourceCursor <= current.latestCandidateCursor) return undefined;
    const key = candidatePresentationKey(event.goalId, event.runId, activity.candidateId);
    if (current.retiredCandidateKeys.includes(key)
      || current.settledCandidates.some((candidate) => candidate.presentationKey === key)) return undefined;
    const existing = current.candidates.find((candidate) => candidate.presentationKey === key);
    if (existing?.status === "pending-verification") return undefined;
    const merged = mergeCandidateContent(existing, activity.text, activity.startOffset);
    const candidate: CandidatePresentation = {
      goalId: event.goalId,
      runId: event.runId,
      candidateId: activity.candidateId,
      presentationKey: key,
      content: merged.content,
      startOffset: merged.startOffset,
      truncated: activity.truncated || (activity.startOffset > 0 && (existing?.truncated ?? false)),
      complete: activity.complete,
      missingPrefix: merged.missingPrefix,
      status: activity.complete ? "ready" : "generating",
      sourceCursor: activity.sourceCursor,
    };
    const candidates = existing === undefined
      ? [...current.candidates, candidate]
      : current.candidates.map((item) => item.presentationKey === key ? candidate : item);
    return {
      ...current,
      candidates,
      unconfirmed: true,
      liveActivity: activity.complete ? "A draft answer is ready but not saved yet" : "A draft answer is being generated",
      latestCandidateCursor: activity.sourceCursor,
    };
  }

  if (event.activity.kind === "candidate_invalidated") {
    const activity = event.activity;
    if (activity.sourceCursor <= current.latestCandidateCursor) return undefined;
    const key = candidatePresentationKey(event.goalId, event.runId, activity.candidateId);
    const candidate = current.candidates.find((item) => item.presentationKey === key);
    const latestCandidateCursor = activity.sourceCursor;
    if (activity.reason === "ambiguous") {
      const candidates = current.candidates.map((item) => item.presentationKey === key
        ? { ...item, status: "pending-verification" as const, sourceCursor: activity.sourceCursor }
        : item);
      return {
        ...current,
        candidates,
        unconfirmed: candidates.length > 0,
        liveActivity: candidate === undefined ? current.liveActivity : "Checking whether the answer was saved",
        latestCandidateCursor,
      };
    }

    const candidates = current.candidates.filter((item) => item.presentationKey !== key);
    const retiredCandidateKeys = boundedPush(current.retiredCandidateKeys, key, MAX_RETIRED_CANDIDATE_KEYS);
    return {
      ...current,
      candidates,
      retiredCandidateKeys,
      unconfirmed: candidates.length > 0,
      liveActivity: candidate === undefined ? current.liveActivity : "The draft answer was not adopted",
      latestCandidateCursor,
    };
  }
  return undefined;
}

/**
 * 用新读取的正式 Activity 页核验候选保存结果。
 *
 * @remarks
 * 只按同一 Run 的 previewId 结算；不从正文推导候选关联。正式正文与用途仍以 Activity DTO 为准。
 *
 * @param current - 当前临时输出状态。
 * @param page - 最新正式 Activity 页。
 * @returns 已由 Snapshot 确认的候选已移出临时正文区的状态。
 * @example
 * const next = reconcileCandidatePresentation(display, activityPage);
 */
export function reconcileCandidatePresentation(
  current: SessionOutputDisplay,
  page: BrowserActivityPage,
): SessionOutputDisplay {
  const messages = page.items.filter((item) => item.type === "message" && item.previewId !== undefined);
  if (messages.length === 0 || current.candidates.length === 0) return current;
  const candidates = current.candidates.filter((candidate) => {
    const message = messages.find((item) => item.type === "message"
      && item.runId === candidate.runId
      && item.previewId === candidate.candidateId);
    return message === undefined;
  });
  const confirmed = current.candidates.flatMap((candidate) => {
    const message = messages.find((item) => item.type === "message"
      && item.runId === candidate.runId
      && item.previewId === candidate.candidateId);
    if (message?.type !== "message") return [];
    const issue = candidate.truncated || candidate.missingPrefix || !candidate.complete
      ? "preview-incomplete" as const
      : message.truncated
        ? "preview-incomplete" as const
        : (message.content !== candidate.content || message.contentLength !== candidate.content.length)
          ? "official-text-differs" as const
          : undefined;
    return [{ presentationKey: candidate.presentationKey, ...(issue === undefined ? {} : { issue }) }];
  });
  if (confirmed.length === 0) return current;
  const settledCandidates = [...current.settledCandidates];
  for (const candidate of confirmed) {
    if (!settledCandidates.some((item) => item.presentationKey === candidate.presentationKey)) settledCandidates.push(candidate);
  }
  return {
    ...current,
    candidates,
    unconfirmed: candidates.length > 0,
    settledCandidates: settledCandidates.slice(-MAX_SETTLED_CANDIDATES),
  };
}

function mergeCandidateContent(
  previous: CandidatePresentation | undefined,
  text: string,
  startOffset: number,
): { readonly content: string; readonly startOffset: number; readonly missingPrefix: boolean } {
  if (startOffset === 0) return { content: text, startOffset: 0, missingPrefix: false };
  if (previous === undefined) return { content: text, startOffset, missingPrefix: true };
  if (startOffset > previous.content.length) return { content: text, startOffset, missingPrefix: true };
  const overlapLength = Math.min(previous.content.length - startOffset, text.length);
  const overlapMatches = previous.content.slice(startOffset, startOffset + overlapLength) === text.slice(0, overlapLength);
  if (!overlapMatches) return { content: text, startOffset, missingPrefix: true };
  return {
    content: previous.content + text.slice(overlapLength),
    startOffset: previous.startOffset,
    missingPrefix: previous.missingPrefix,
  };
}

function boundedPush<T>(items: readonly T[], item: T, limit: number): readonly T[] {
  return [...items.filter((existing) => existing !== item), item].slice(-limit);
}
