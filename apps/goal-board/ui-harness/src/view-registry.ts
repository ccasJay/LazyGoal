import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { SessionTab } from "../../src/types";
import {
  encodeWorkspacePreferences,
  workspacePreferenceCookieName,
} from "../../src/workspace-preferences";
import {
  createDiagnosticsCollector,
  type DiagnosticsCollector,
} from "./diagnostics";
import { createFixtureServer } from "./fixture-server";
import type { FixtureScenario, FixtureServerInstance } from "./fixture-types";
import {
  boardPopulatedScenario,
  sessionWaitingScenario,
  settingsScenario,
  trajectoryScenario,
} from "./scenarios";

export type ViewName = "board" | "session" | "trajectory" | "settings";

/** 视图定义契约。 */
export interface ViewDefinition {
  /** 视图唯一名称。 */
  readonly name: ViewName;
  /** 默认绑定的 Fixture 场景。 */
  readonly defaultScenario: FixtureScenario;
  /** 默认目标 Goal 标识。 */
  readonly defaultGoalId?: string;
  /** 选中的会话标签（Activity / Trajectory 等）。 */
  readonly sessionTab?: SessionTab;
  /** 是否需要触发设置弹窗/页面。 */
  readonly isSettingsModal?: boolean;
  /** 页面就绪选择器（必须出现才算加载完成）。 */
  readonly readySelector: string;
  /** 视觉比较时需忽略动态变动的遮罩选择器。 */
  readonly maskSelectors?: readonly string[];
  /** 页面导航后的额外准备动作。 */
  readonly preparePage?: (page: Page) => Promise<void>;
}

/** 四个核心视图的定义注册表。 */
export const VIEW_REGISTRY: Record<ViewName, ViewDefinition> = {
  board: {
    name: "board",
    defaultScenario: boardPopulatedScenario,
    readySelector: ".goal-card, .board-shell, main h1",
    maskSelectors: ["time", ".metric-coverage"],
    preparePage: async (page: Page) => {
      await page
        .waitForFunction(
          () => {
            const cards = Array.from(document.querySelectorAll(".card-metrics"));
            return cards.length === 0 || cards.every((c) => !c.textContent?.includes("Loading metrics…"));
          },
          { timeout: 5000 },
        )
        .catch(() => {});
    },
  },
  session: {
    name: "session",
    defaultScenario: sessionWaitingScenario,
    defaultGoalId: "goal-session-waiting",
    sessionTab: "Activity",
    readySelector: ".session, .session-open",
    maskSelectors: ["time", ".activity-snake-loader", ".status-dot"],
  },
  trajectory: {
    name: "trajectory",
    defaultScenario: trajectoryScenario,
    defaultGoalId: "goal-trajectory-audit",
    sessionTab: "Trajectory",
    readySelector: ".trajectory-view, .tr-runbar",
    maskSelectors: ["time", ".status-dot"],
    preparePage: async (page: Page) => {
      const loadBtn = page.locator("button:has-text('Load Trajectory')");
      if (await loadBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await loadBtn.click();
      }
    },
  },
  settings: {
    name: "settings",
    defaultScenario: settingsScenario,
    isSettingsModal: true,
    readySelector: ".settings-page, main h1:has-text('Settings')",
    preparePage: async (page: Page) => {
      const btn = page.locator("button.workspace-settings");
      await btn.waitFor({ state: "visible", timeout: 5000 });
      await btn.click();
    },
  },
};

/** 环境启动参数。 */
export interface LaunchOptions {
  /** 目标视图名称。 */
  readonly view: ViewName;
  /** 目标 Goal 标识；不指定则使用视图默认值。 */
  readonly goalId?: string;
  /** 自定义 Fixture 场景覆盖。 */
  readonly scenario?: FixtureScenario;
  /** 已启动的外部服务 URL（附带 hash token），进入 attach 模式。 */
  readonly attachUrl?: string;
  /** 是否无头启动；默认 true。 */
  readonly headless?: boolean;
  /** 就绪等待超时时间（毫秒）；默认 10000。 */
  readonly timeoutMs?: number;
  /** 静态产物目录；默认 apps/goal-board/dist。 */
  readonly distDir?: string;
  /** 模拟的固定 UTC 时间（ISO 字符串）。 */
  readonly fixedTime?: string;
  /** 允许忽略的错误消息白名单。 */
  readonly ignorePatterns?: readonly (string | RegExp)[];
}

/** 环境运行上下文。 */
export interface HarnessEnvironment {
  readonly page: Page;
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly server?: FixtureServerInstance;
  readonly view: ViewDefinition;
  readonly targetGoalId?: string;
  readonly diagnostics: DiagnosticsCollector;
  readonly cleanup: () => Promise<void>;
}

/** 注入全局无动画与固定光标样式。 */
const DISABLE_ANIMATIONS_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
}
`;

/**
 * 启动隔离且确定性的 UI 验收环境。
 *
 * @remarks
 * 严格按照视图契约初始化：
 * 1. 校验 dist 是否已构建；
 * 2. 校验目标 Goal 是否存在，不存在立即报错拒绝，绝不静默回退 Board；
 * 3. 启动 loopback 随机端口的 Fixture 独立服务器（attach 模式除外）；
 * 4. 设置独立 BrowserContext 与预设偏好 cookie；
 * 5. 导航、注入去动画样式并等待就绪选择器。
 */
export async function launchEnvironment(options: LaunchOptions): Promise<HarnessEnvironment> {
  const viewDef = VIEW_REGISTRY[options.view];
  if (!viewDef) {
    throw new Error(`unknown_view: View "${options.view}" is not registered in VIEW_REGISTRY`);
  }

  const isAttach = typeof options.attachUrl === "string" && options.attachUrl.length > 0;
  const distDir = resolve(options.distDir ?? "apps/goal-board/dist");

  if (!isAttach && !existsSync(join(distDir, "index.html"))) {
    throw new Error(
      `dist_not_built: Static assets not found at ${distDir}. Run "npm run build:web" before starting the UI harness.`,
    );
  }

  const scenario = options.scenario ?? viewDef.defaultScenario;
  const targetGoalId = options.goalId ?? viewDef.defaultGoalId;

  // 严格目标校验：如果视图需要指定目标 Goal，确认目标在当前场景中存在
  if (!isAttach && targetGoalId !== undefined && scenario.goals?.data?.goals) {
    const exists = scenario.goals.data.goals.some((g) => g.goalId === targetGoalId);
    if (!exists) {
      throw new Error(
        `goal_not_found: Goal "${targetGoalId}" does not exist in scenario "${scenario.id}". Cannot open ${viewDef.name} view without silent fallback.`,
      );
    }
  }

  let server: FixtureServerInstance | undefined;
  let targetUrl = options.attachUrl;

  if (!isAttach) {
    server = await createFixtureServer({
      scenario,
      distDir,
    });
    targetUrl = server.launchUrl;
  }

  if (!targetUrl) {
    throw new Error("target_url_missing");
  }

  const browser = await chromium.launch({
    headless: options.headless ?? true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
  });

  let cookieName = "";
  const workspaceRoot = scenario.workspace?.data?.workspaceRoot ?? "/workspace";
  if (targetGoalId !== undefined || viewDef.sessionTab !== undefined) {
    cookieName = workspacePreferenceCookieName(workspaceRoot);
    const cookieValue = encodeWorkspacePreferences({
      sidebarCollapsed: false,
      activityWidth: "standard",
      selectedGoalId: targetGoalId ?? null,
      view: viewDef.sessionTab ?? "Activity",
    });

    const parsedUrl = new URL(targetUrl);
    await context.addCookies([
      {
        name: cookieName,
        value: cookieValue,
        domain: parsedUrl.hostname,
        path: "/",
      },
    ]);
  }

  const page = await context.newPage();
  const diagnostics = createDiagnosticsCollector(page, {
    view: viewDef.name,
    ignorePatterns: options.ignorePatterns,
  });
  page.on("console", (msg) => console.log("BROWSER LOG:", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.log("BROWSER ERROR:", err));

  // 注入去动画与过渡样式（纯字符串避免 tsx __name 转译污染浏览器作用域）
  await page.addInitScript(`
    (() => {
      const applyStyle = () => {
        const style = document.createElement("style");
        style.textContent = ${JSON.stringify(DISABLE_ANIMATIONS_CSS)};
        document.head?.appendChild(style);
      };
      if (document.head) applyStyle();
      else document.addEventListener("DOMContentLoaded", applyStyle);
    })();
  `);

  const timeoutMs = options.timeoutMs ?? 10_000;

  try {
    await page.goto(targetUrl, { timeout: timeoutMs, waitUntil: "domcontentloaded" });

    // 再次注入全局样式确保 CSS 变量覆盖
    await page.addStyleTag({ content: DISABLE_ANIMATIONS_CSS });

    // 如果该视图有自定义准备动作（如打开设置面板）
    if (viewDef.preparePage) {
      await viewDef.preparePage(page);
    }

    // 等待核心就绪选择器
    await page.waitForSelector(viewDef.readySelector, {
      state: "visible",
      timeout: timeoutMs,
    });

    // 等待网页字体加载就绪
    await page.evaluate(() => document.fonts.ready);

    // 检查是否发生意外静默回退
    if (viewDef.name !== "board") {
      const isSettings = viewDef.name === "settings";
      const settingsHeadingVisible = await page.locator("main h1:has-text('Settings')").first().isVisible().catch(() => false);
      const sessionOpenVisible = await page.locator(".session").first().isVisible().catch(() => false);

      if (isSettings && !settingsHeadingVisible) {
        throw new Error(`view_fell_back_to_board: Requested settings view, but Settings page did not open.`);
      }
      if (!isSettings && !sessionOpenVisible) {
        throw new Error(
          `view_fell_back_to_board: Requested ${viewDef.name} view for goal "${targetGoalId}", but UI fell back to Board.`,
        );
      }
    }
  } catch (error) {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
    throw error;
  }

  const cleanup = async () => {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  };

  return {
    page,
    browser,
    context,
    server,
    view: viewDef,
    targetGoalId,
    diagnostics,
    cleanup,
  };
}
