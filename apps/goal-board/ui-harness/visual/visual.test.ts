import { expect, test } from "../src/playwright-fixture";

test.describe("UI Visual Regression Baselines", () => {
  test("visual: board view", async ({ openView }) => {
    const env = await openView("board");
    const masks = env.view.maskSelectors?.map((sel) => env.page.locator(sel)) ?? [];
    await expect(env.page).toHaveScreenshot("board.png", { mask: masks });
  });

  test("visual: session view", async ({ openView }) => {
    const env = await openView("session");
    const masks = env.view.maskSelectors?.map((sel) => env.page.locator(sel)) ?? [];
    await expect(env.page).toHaveScreenshot("session.png", { mask: masks });
  });

  test("visual: trajectory view", async ({ openView }) => {
    const env = await openView("trajectory");
    const masks = env.view.maskSelectors?.map((sel) => env.page.locator(sel)) ?? [];
    await expect(env.page).toHaveScreenshot("trajectory.png", { mask: masks });
  });

  test("visual: settings view", async ({ openView }) => {
    const env = await openView("settings");
    const masks = env.view.maskSelectors?.map((sel) => env.page.locator(sel)) ?? [];
    await expect(env.page).toHaveScreenshot("settings.png", { mask: masks });
  });
});
