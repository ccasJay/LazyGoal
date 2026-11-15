import { test as base, expect } from "@playwright/test";
import {
  launchEnvironment,
  type HarnessEnvironment,
  type LaunchOptions,
  type ViewName,
} from "./view-registry";

/** Playwright 自定义测试 Fixtures 扩展接口。 */
export interface HarnessTestFixtures {
  /**
   * 启动指定视图的隔离环境并在测试结束时自动回收。
   */
  openView: (view: ViewName, options?: Partial<LaunchOptions>) => Promise<HarnessEnvironment>;
}

/**
 * 扩展后的 Playwright 测试运行器。
 *
 * @example
 * ```ts
 * import { test, expect } from "./playwright-fixture";
 *
 * test("interact with board", async ({ openView }) => {
 *   const env = await openView("board");
 *   await env.page.locator(".workspace-search").click();
 *   await expect(env.page.locator("input")).toBeVisible();
 * });
 * ```
 */
export const test = base.extend<HarnessTestFixtures>({
  openView: async ({}, use) => {
    const environments: HarnessEnvironment[] = [];

    const opener = async (view: ViewName, options?: Partial<LaunchOptions>) => {
      const env = await launchEnvironment({ view, ...options });
      environments.push(env);
      return env;
    };

    await use(opener);

    for (const env of environments) {
      await env.cleanup().catch(() => {});
    }
  },
});

export { expect };
