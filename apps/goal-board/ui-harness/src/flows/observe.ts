import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { captureScreenshot } from "../capture";
import type { DiagnosticsReport } from "../diagnostics";
import { launchEnvironment, type HarnessEnvironment } from "../view-registry";
import { executeStep } from "./runner";
import type { FlowStep, FlowStepResult, UiFlow } from "./types";

/** 录制期间每帧附带的页面事实，用于把视觉观察锚定到可核对的状态。 */
export interface ObservationFrameFacts {
  /** 输入区主按钮的可访问名称。 */
  readonly sendLabel: string | null;
  /** 当前 Run 状态栏文本；与时间线中显示的历史 Run 摘要分开记录。 */
  readonly currentRunStatus: string | null;
  /** 所有可见 Run 的状态文本。 */
  readonly runStatuses: readonly string[];
  /** 所有可见 Run 的结果文本。 */
  readonly runResults: readonly string[];
  /** 已渲染的消息正文数量。 */
  readonly messageCount: number;
  /** 临时助手正文块；未在流式生成时为空数组。 */
  readonly liveResponses: readonly string[];
  /** 已渲染的步骤、活动组与工具标题。 */
  readonly progressTitles: readonly string[];
  /** 底部状态栏文本。 */
  readonly statusbar: string | null;
  /** 页面上的错误提示文本。 */
  readonly errorBanner: string | null;
}

/** 一帧连续观察画面。 */
export interface ObservationFrame {
  readonly index: number;
  /** 相对录制开始的毫秒数。 */
  readonly capturedAtMs: number;
  /** 该帧对应的流程阶段。 */
  readonly label: string;
  /** 截图文件路径。 */
  readonly path: string;
  readonly facts: ObservationFrameFacts;
}

/** 连续观察报告。 */
export interface ObservationReport {
  /** 流程步骤与运行时诊断均通过时为 true。 */
  readonly ok: boolean;
  readonly flowId: string;
  readonly view: string;
  /** 截图与 manifest 所在目录。 */
  readonly outDir: string;
  readonly manifestPath: string;
  readonly frames: readonly ObservationFrame[];
  readonly steps: readonly FlowStepResult[];
  readonly diagnostics?: DiagnosticsReport;
  readonly error?: string;
}

/** 连续观察选项。 */
export interface ObserveOptions {
  /** 截图间隔（毫秒）；默认 400。 */
  readonly intervalMs?: number;
  /** 输出目录；默认 `ui-harness/visual/artifacts/observations/<flow>-<timestamp>`。 */
  readonly outDir?: string;
  /** 单次录制的最大帧数；默认 80。 */
  readonly maxFrames?: number;
}

const FRAME_FACTS_EXPRESSION = `(() => {
  const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null;
  return {
    sendLabel: document.querySelector(".composer-actions .send")?.getAttribute("aria-label") ?? null,
    currentRunStatus: text(".task-state"),
    runStatuses: Array.from(document.querySelectorAll(".timeline-run-status")).map((node) => node.textContent?.trim() ?? ""),
    runResults: Array.from(document.querySelectorAll(".timeline-run-result")).map((node) => node.textContent?.trim() ?? ""),
    messageCount: document.querySelectorAll(".message-content").length,
    liveResponses: Array.from(document.querySelectorAll(".transient-message .message-body")).map((node) => node.textContent?.trim() ?? ""),
    progressTitles: Array.from(document.querySelectorAll(".timeline-step-trigger, .timeline-activity-heading")).map((node) => node.textContent?.trim() ?? ""),
    statusbar: text(".statusbar"),
    errorBanner: text(".command-error") ?? text("[role='alert']"),
  };
})()`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function frameLabel(step: FlowStep | undefined, index: number): string {
  return step === undefined ? `step-${index + 1}` : `step-${index + 1}-${step.action}`;
}

/**
 * 在流程执行期间连续渲染并截图单个 Goal 的工作流。
 *
 * @remarks
 * 录制在独立循环中进行，与流程步骤并发：流程负责触发状态迁移，录制负责按固定
 * 间隔保留画面与页面事实。终止后写出 `manifest.json`，供视觉分析逐帧核对。
 *
 * @param flow - 要驱动并录制的流程。
 * @param options - 间隔、输出目录与帧数上限。
 * @returns 观察报告，包含帧清单、步骤结果与运行时诊断。
 * @example
 * ```ts
 * const report = await observeFlow(sendMessageFlow, { intervalMs: 500 });
 * ```
 */
export async function observeFlow(
  flow: UiFlow,
  options: ObserveOptions = {},
): Promise<ObservationReport> {
  const intervalMs = options.intervalMs ?? 400;
  const maxFrames = options.maxFrames ?? 80;
  const startedAt = Date.now();
  const outDir = options.outDir
    ?? resolve(import.meta.dirname, `../../visual/artifacts/observations/${flow.id}-${startedAt}`);
  await mkdir(outDir, { recursive: true });

  let env: HarnessEnvironment;
  try {
    env = await launchEnvironment({
      view: flow.view,
      goalId: flow.goalId,
      scenario: flow.scenario,
    });
  } catch (error) {
    return {
      ok: false,
      flowId: flow.id,
      view: flow.view,
      outDir,
      manifestPath: join(outDir, "manifest.json"),
      frames: [],
      steps: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const frames: ObservationFrame[] = [];
  const steps: FlowStepResult[] = [];
  let activeLabel = "initial";
  let capturing = true;
  let captureFailure: string | undefined;
  let failureMessage: string | undefined;

  let captureQueue: Promise<void> = Promise.resolve();
  const enqueueCapture = (label: string): Promise<void> => {
    const next = captureQueue.then(() => capture(label));
    captureQueue = next.catch(() => {});
    return next;
  };

  const capture = async (label: string): Promise<void> => {
    if (frames.length >= maxFrames) return;
    const path = join(outDir, `frame-${String(frames.length + 1).padStart(4, "0")}-${label}.png`);
    try {
      await captureScreenshot({ page: env.page, outPath: path });
    } catch (error) {
      captureFailure = error instanceof Error ? error.message : String(error);
      return;
    }
    // 先固定画面，再读取同一时刻之后的页面事实；避免事实领先于截图。
    const facts = (await env.page.evaluate(FRAME_FACTS_EXPRESSION)) as ObservationFrameFacts;
    frames.push({
      index: frames.length,
      capturedAtMs: Date.now() - startedAt,
      label,
      path,
      facts,
    });
  };

  const loop = (async () => {
    while (capturing && frames.length < maxFrames) {
      await enqueueCapture(activeLabel);
      if (!capturing) break;
      await sleep(intervalMs);
    }
  })();

  try {
    for (const [index, step] of flow.steps.entries()) {
      activeLabel = frameLabel(step, index);
      const stepStartedAt = Date.now();
      try {
        const detail = await executeStep(env, flow, step);
        steps.push({ index, action: step.action, ok: true, detail, durationMs: Date.now() - stepStartedAt });
        await enqueueCapture(`${frameLabel(step, index)}-done`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        steps.push({ index, action: step.action, ok: false, detail, durationMs: Date.now() - stepStartedAt });
        failureMessage = `step ${index + 1} (${step.action}) failed: ${detail}`;
        break;
      }
    }
  } finally {
    capturing = false;
    await loop;
    await captureQueue;
    await capture(failureMessage === undefined ? "final" : "failure");
    await env.cleanup();
  }

  const diagnostics = env.diagnostics.getReport();
  const manifestPath = join(outDir, "manifest.json");
  const report: ObservationReport = {
    ok: failureMessage === undefined && diagnostics.ok,
    flowId: flow.id,
    view: flow.view,
    outDir,
    manifestPath,
    frames,
    steps,
    diagnostics,
    ...(failureMessage === undefined ? {} : { error: failureMessage }),
    ...(captureFailure === undefined ? {} : { error: failureMessage ?? `frame capture failed: ${captureFailure}` }),
  };
  await writeFile(manifestPath, JSON.stringify(report, null, 2), "utf8");
  return report;
}
