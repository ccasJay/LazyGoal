import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { captureScreenshot } from "../capture";
import { launchEnvironment, type HarnessEnvironment } from "../view-registry";
import type { FlowReport, FlowStep, FlowStepResult, UiFlow } from "./types";

const DEFAULT_STEP_TIMEOUT_MS = 5000;

interface CheckResult {
  readonly ok: boolean;
  readonly detail: string;
}

function failure(detail: string): CheckResult {
  return { ok: false, detail };
}

function success(detail: string): CheckResult {
  return { ok: true, detail };
}

async function pollUntil(
  env: HarnessEnvironment,
  timeoutMs: number,
  check: () => Promise<CheckResult>,
): Promise<CheckResult> {
  const deadline = Date.now() + timeoutMs;
  let last = failure("condition was not evaluated");
  for (;;) {
    last = await check();
    if (last.ok || Date.now() >= deadline) return last;
    await env.page.waitForTimeout(50);
  }
}

async function checkExpectation(env: HarnessEnvironment, step: Extract<FlowStep, { action: "expect" }>): Promise<CheckResult> {
  const locator = env.page.locator(step.selector);
  const count = await locator.count();

  if (step.count !== undefined && count !== step.count) {
    return failure(`expected ${step.count} element(s) for ${step.selector}, found ${count}`);
  }
  if (step.visible !== undefined) {
    const visible = count > 0 && (await locator.first().isVisible());
    if (visible !== step.visible) {
      return failure(`expected ${step.selector} to be ${step.visible ? "visible" : "hidden"}, found ${visible ? "visible" : "hidden"}`);
    }
  }
  if (count === 0) {
    return step.visible === false || step.count === 0
      ? success(`${step.selector} matched ${count} element(s)`)
      : failure(`element ${step.selector} not found`);
  }

  const first = locator.first();
  if (step.attribute !== undefined) {
    const actual = await first.getAttribute(step.attribute.name);
    if (actual !== step.attribute.value) {
      return failure(`expected ${step.selector} attribute ${step.attribute.name} to equal ${JSON.stringify(step.attribute.value)}, found ${JSON.stringify(actual)}`);
    }
  }
  if (step.text !== undefined) {
    const actual = (await first.innerText()).trim();
    if (!actual.includes(step.text)) {
      return failure(`expected ${step.selector} text to contain ${JSON.stringify(step.text)}, found ${JSON.stringify(actual.slice(0, 160))}`);
    }
  }
  if (step.value !== undefined) {
    const actual = await first.inputValue();
    if (actual !== step.value) {
      return failure(`expected ${step.selector} value to equal ${JSON.stringify(step.value)}, found ${JSON.stringify(actual)}`);
    }
  }
  if (step.disabled !== undefined) {
    const actual = await first.isDisabled();
    if (actual !== step.disabled) {
      return failure(`expected ${step.selector} to be ${step.disabled ? "disabled" : "enabled"}, found ${actual ? "disabled" : "enabled"}`);
    }
  }

  return success(`${step.selector} matched ${count} element(s)`);
}

function controlMatches(
  env: HarnessEnvironment,
  step: Extract<FlowStep, { action: "expectControl" }>,
): readonly string[] {
  const intents = env.server?.getReceivedIntents() ?? [];
  return intents
    .filter((intent) => intent.kind === step.kind)
    .filter((intent) => step.inputKind === undefined
      || (intent.kind === "session_input" && intent.input.kind === step.inputKind))
    .map((intent) => intent.intentId);
}

/**
 * 执行单条流程步骤。
 *
 * @remarks
 * 供 `runFlow` 与观察录制器共用；失败时抛出带观测值的错误，不自行截图。
 */
export async function executeStep(
  env: HarnessEnvironment,
  flow: UiFlow,
  step: FlowStep,
): Promise<string> {
  const timeoutMs = ("timeoutMs" in step ? step.timeoutMs : undefined)
    ?? flow.stepTimeoutMs
    ?? DEFAULT_STEP_TIMEOUT_MS;

  switch (step.action) {
    case "click": {
      const locator = env.page.locator(step.selector).first();
      await locator.waitFor({ state: "visible", timeout: timeoutMs });
      await locator.click();
      return `clicked ${step.selector}`;
    }
    case "fill": {
      const locator = env.page.locator(step.selector).first();
      await locator.waitFor({ state: "visible", timeout: timeoutMs });
      await locator.fill(step.value);
      return `filled ${step.selector} with ${JSON.stringify(step.value)}`;
    }
    case "press": {
      if (step.selector !== undefined) {
        await env.page.locator(step.selector).first().press(step.key);
      } else {
        await env.page.keyboard.press(step.key);
      }
      return `pressed ${step.key}`;
    }
    case "expect": {
      const result = await pollUntil(env, timeoutMs, () => checkExpectation(env, step));
      if (!result.ok) throw new Error(result.detail);
      return result.detail;
    }
    case "expectControl": {
      if (env.server === undefined) {
        throw new Error("expectControl requires the fixture server; attach mode cannot observe commands");
      }
      const expected = step.count ?? 1;
      const result = await pollUntil(env, timeoutMs, async () => {
        const matches = controlMatches(env, step);
        return matches.length === expected
          ? success(`${step.kind}${step.inputKind === undefined ? "" : `/${step.inputKind}`} received ${matches.length} time(s)`)
          : failure(`expected ${expected} ${step.kind}${step.inputKind === undefined ? "" : `/${step.inputKind}`} command(s), received ${matches.length}`);
      });
      if (!result.ok) throw new Error(result.detail);
      return result.detail;
    }
  }
}

/**
 * 执行一条交互流程并返回结构化报告。
 *
 * @remarks
 * 步骤按声明顺序串行执行，任一断言失败立即停止并截取现场。运行时诊断与步骤结果
 * 相互独立：两者都通过时报告才为通过。
 *
 * @param flow - 待执行流程。
 * @param artifactsDir - 失败截图目录；默认 `ui-harness/visual/artifacts`。
 * @returns 流程执行报告。
 */
export async function runFlow(
  flow: UiFlow,
  artifactsDir?: string,
): Promise<FlowReport> {
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
      steps: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const results: FlowStepResult[] = [];
  let failureMessage: string | undefined;
  let screenshot: string | undefined;

  try {
    for (const [index, step] of flow.steps.entries()) {
      const startedAt = Date.now();
      try {
        const detail = await executeStep(env, flow, step);
        results.push({ index, action: step.action, ok: true, detail, durationMs: Date.now() - startedAt });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        results.push({ index, action: step.action, ok: false, detail, durationMs: Date.now() - startedAt });
        failureMessage = `step ${index + 1} (${step.action}) failed: ${detail}`;
        break;
      }
    }

    if (failureMessage !== undefined) {
      const targetDir = artifactsDir ?? resolve(import.meta.dirname, "../../visual/artifacts");
      const outPath = join(targetDir, `flow-${flow.id}-${Date.now()}.png`);
      try {
        await mkdir(targetDir, { recursive: true });
        await captureScreenshot({ page: env.page, outPath });
        screenshot = outPath;
      } catch {
        // 截图失败不覆盖真实断言失败原因
      }
    }

    const diagnostics = env.diagnostics.getReport();
    const diagnosticsFailure = diagnostics.ok
      ? undefined
      : `runtime diagnostics reported ${diagnostics.failureCount} error(s)`;

    return {
      ok: failureMessage === undefined && diagnosticsFailure === undefined,
      flowId: flow.id,
      view: flow.view,
      steps: results,
      ...(failureMessage === undefined ? {} : { error: failureMessage }),
      ...(screenshot === undefined ? {} : { screenshot }),
      diagnostics,
    };
  } finally {
    await env.cleanup();
  }
}
