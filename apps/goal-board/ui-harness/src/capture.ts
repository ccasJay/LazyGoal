import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Locator, Page } from "@playwright/test";

/** 截图配置选项。 */
export interface CaptureOptions {
  /** 目标页面实例。 */
  readonly page: Page;
  /** 截图输出保存路径。 */
  readonly outPath: string;
  /** 可选元素选择器；传入则截取该元素边界，否则截取整页视口。 */
  readonly selector?: string;
  /** 截图时需要动态遮罩的选择器列表。 */
  readonly maskSelectors?: readonly string[];
  /** 是否截取整页完整滚动高度；默认 false（截取视口 1280x900）。 */
  readonly fullPage?: boolean;
}

/** 截图结果数据。 */
export interface CaptureResult {
  /** 保存的文件路径。 */
  readonly outPath: string;
  /** 截图宽度。 */
  readonly width: number;
  /** 截图高度。 */
  readonly height: number;
}

/**
 * 等待字体、图片与渲染稳定，为确定性截图做准备。
 */
export async function prepareForCapture(page: Page): Promise<void> {
  // 1. 等待全部字体加载完毕
  await page.evaluate(() => document.fonts.ready);

  // 2. 等待全部图片资源下载与解码完成
  await page.evaluate(async () => {
    const images = Array.from(document.querySelectorAll("img"));
    await Promise.all(
      images.map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.onload = img.onerror = resolve;
              }),
      ),
    );
  });

  // 3. 等待卡片指标等异步数据完成加载，防止 Loading 与就绪状态的像素竞态
  await page
    .waitForFunction(
      () => {
        const loadingNodes = Array.from(document.querySelectorAll(".card-metrics"));
        return loadingNodes.every((node) => !node.textContent?.includes("Loading metrics…"));
      },
      { timeout: 3000 },
    )
    .catch(() => {});

  // 4. 连续等待两帧 requestAnimationFrame 确保布局重排与绘制彻底结算
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/**
 * 执行确定性截图（整页或指定元素）。
 *
 * @remarks
 * 严格执行负向检查：
 * - 若指定选择器不存在，抛出 `selector_not_found`；
 * - 若指定选择器不可见，抛出 `selector_not_visible`；
 * - 若指定选择器尺寸为零，抛出 `selector_zero_size`；
 * 确保永远不会写出空白或错误图片。
 *
 * @param options - 截图选项。
 * @returns 截图元数据。
 */
export async function captureScreenshot(options: CaptureOptions): Promise<CaptureResult> {
  await prepareForCapture(options.page);

  await mkdir(dirname(options.outPath), { recursive: true });

  const maskLocators: Locator[] = (options.maskSelectors ?? []).map((sel) =>
    options.page.locator(sel),
  );

  if (options.selector) {
    const locator = options.page.locator(options.selector);
    const count = await locator.count();
    if (count === 0) {
      throw new Error(
        `selector_not_found: Element with selector "${options.selector}" was not found on page.`,
      );
    }

    const first = locator.first();
    const isVisible = await first.isVisible();
    if (!isVisible) {
      throw new Error(
        `selector_not_visible: Element with selector "${options.selector}" exists but is not visible.`,
      );
    }

    const box = await first.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) {
      throw new Error(
        `selector_zero_size: Element with selector "${options.selector}" has zero or invalid dimensions (${box?.width}x${box?.height}).`,
      );
    }

    await first.screenshot({
      path: options.outPath,
      animations: "disabled",
      mask: maskLocators,
    });

    return {
      outPath: options.outPath,
      width: Math.round(box.width),
      height: Math.round(box.height),
    };
  }

  await options.page.screenshot({
    path: options.outPath,
    fullPage: options.fullPage ?? false,
    animations: "disabled",
    mask: maskLocators,
  });

  const viewport = options.page.viewportSize() ?? { width: 1280, height: 900 };
  return {
    outPath: options.outPath,
    width: viewport.width,
    height: viewport.height,
  };
}
