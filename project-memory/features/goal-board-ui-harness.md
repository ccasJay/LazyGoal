---
feature: goal-board-ui-harness
status: active
summary: Playwright UI 验收工具在隔离 fixture 环境提供确定性截图、诊断报告与四视图像素基线比较，可 attach 真实服务且不改产品行为
source_spec: specs/goal-board-ui-harness/
distilled_at: 2026-11-16
reviewed_at: 2026-11-16
tags: [goal-board, ui-harness, playwright, visual-baseline, screenshot-determinism, fixture-contract, view-registry, attach-mode, diagnostics]
authorities: [apps/goal-board/ui-harness/src/cli.ts, apps/goal-board/ui-harness/src/view-registry.ts, apps/goal-board/ui-harness/src/fixture-server.ts, apps/goal-board/ui-harness/src/diagnostics.ts, apps/goal-board/ui-harness/src/capture.ts, apps/goal-board/ui-harness/src/playwright-fixture.ts, apps/goal-board/ui-harness/visual/visual.test.ts, packages/web-contracts/src/wire.ts]
---

# Goal Board UI 验收工具

## Purpose

- 一条命令在隔离、可重复环境打开 Board、Session、Trajectory、Settings 视图并产出截图、诊断报告与像素基线比较结果，供 UI 开发者与 AI 快速检查页面和验证交互行为。 [S1, S2, S3]

## Durable Decisions

- D1 — 隔离与确定性：shot 运行由 view registry（四视图，`--goal` 可覆盖）在 loopback 随机端口启动一次性静态页面与 fixture API，使用临时目录与独立 BrowserContext；整页截图固定 1280×900、DPR 1、浅色主题与固定 UTC 时钟，关闭动画与过渡并等待字体、图片与就绪选择器，连续两次截图 PNG 哈希一致；结束后清理且不读写真实 LazyGoal Home。 [S1, S4, S6]
- D2 — 诊断与失败路径：每次截图或诊断运行输出 Console error/warning、pageerror、requestfailed 与 HTTP≥400 的 JSON 报告；视图打开失败、Goal 不存在、就绪超时或 `dist` 未构建时以非零退出码说明具体原因，不回退 Board、不生成截图；未被视图声明忽略的错误使 `inspect` 失败，SSE 长连接与主动取消不算失败。 [S5]
- D3 — fixture 契约边界：fixture 是独立 HTTP/SSE 服务实现现有 wire 路由，响应类型复用 `@lazygoal/web-contracts` 并在发送前用对应 binding 校验，不挂载 `packages/browser` 路由；`apps/goal-board/src` 不导入 harness，`npm run check:dependencies` 门禁。 [S7]
- D4 — 工具形态：交互与视觉验收由 Playwright Test 承载（`test:ui-visual` 与共享交互样板），CLI 只提供一次性的 shot、inspect、serve 与 `--attach`；现有 `test:web-e2e` 保持不动。 [S1, S8]
- D5 — 基线与产物归属：四个桌面视觉基线入库 `apps/goal-board/ui-harness/visual/baselines/`，比较失败保留 actual、expected、diff 与 JSON 结果，更新命令后同一环境重跑通过；运行产物写入被 gitignore 的输出目录。 [S9]
- D6 — Playwright 版本锁定：固定精确版本并使用其捆绑 Chromium，本地与 CI 安装同一版本，系统 Chrome 仅用于手动调试；像素结果只对同一浏览器版本可信。 [S1]
- D7 — attach 模式：`--attach <url>#<token>` 连接已启动的真实 web 服务执行截图与诊断，不启动 fixture，并禁用视觉比较；连接真实服务必须显式提供 URL 与 token。 [S8]

## Guardrails

- 不修改 Goal Board 产品行为、运行时语义，不新增产品 URL 路由；视图经命名 registry 优先走既有工作区偏好 cookie 或现有 UI 导航打开，失败显式可见。 [S1, S2]
- fixture 与真实服务的 binding 校验只证明 wire 形状一致，不证明服务端语义等价；真实集成仍以 `test:web-e2e` 与 attach 人工检查为准。 [S3, S7]
- 基线只覆盖 Chromium 与 macOS 桌面环境，不作为其他浏览器或移动端的验收依据。 [S9]

## Revisit When

- 新增视图、fixture 场景或产品 URL 路由时。
- Playwright/Chromium 版本升级或视觉基线因字体、时钟、动画策略调整时。
- 需要覆盖移动端或跨浏览器矩阵时。

## Sources

- S1: `specs/goal-board-ui-harness/spec.md`
- S2: `apps/goal-board/ui-harness/src/view-registry.ts`
- S3: `apps/goal-board/e2e/streaming-session.test.mjs`
- S4: `.github/workflows/ci.yml`
- S5: `apps/goal-board/ui-harness/src/diagnostics.ts`
- S6: `apps/goal-board/ui-harness/src/capture.ts`
- S7: `packages/web-contracts/src/wire.ts`
- S8: `apps/goal-board/ui-harness/src/playwright-fixture.ts`
- S9: `apps/goal-board/ui-harness/visual/visual.test.ts`
