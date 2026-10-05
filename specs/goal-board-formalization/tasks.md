# Implementation Plan

- [x] //TODO 1. 迁移前端源码至 apps/goal-board、正式命名并清理历史草稿与收敛样式

  - 实现目标：将 `prototypes/goal-board` 完整迁移为 `apps/goal-board`，将包名更新为 `@lazygoal/goal-board` 并废弃 `prototypes/` 目录；清理孤立的原型草稿单页与草稿组件（`delete-goal-prototype.*`、`delete-goal.html`、`trajectory-prototype.*`、`trajectory.html`、`prompt-inspector-prototype.*` 等），并将紧凑轨迹样式正名收敛进 `trajectory.css`
  - 成功判据：仓库内不再存在 `prototypes/` 目录；`package.json` 名称为 `@lazygoal/goal-board` 且无 prototype 字样；不存在孤立的草稿 HTML 或组件；前端 TypeScript 检查无报错
  - 验证方式：在 `apps/goal-board` 执行 `npx tsc --noEmit`，验证无类型与文件缺失错误
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2)_

- [x] //TODO 2. 配置 Vite 产物本地隔离并清理 Git 中历史静态 Bundle

  - 实现目标：将 `apps/goal-board/vite.config.ts` 的 `outDir` 更新为 `dist`，在根目录 `.gitignore` 中配置 `apps/goal-board/dist`；通过 Git 移除 `packages/browser/static` 下已追踪的历史混淆 Bundle 文件
  - 成功判据：Vite 打包产物仅生成在本地 `apps/goal-board/dist`；`git status` 显示 `apps/goal-board/dist` 被有效忽略；`packages/browser/static` 不再被 Git 追踪
  - 验证方式：执行 Vite 构建并检查 `apps/goal-board/dist/index.html` 存在，执行 `git status --ignored` 确认状态
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2)_

- [x] //TODO 3. 实现服务端静态资产稳健寻址与未构建拦截引导机制

  - 实现目标：在 `packages/browser` 与 `packages/tui/src/cli.tsx` 中实现静态资源稳健寻址（支持 `LAZYGOAL_STATIC_DIR` 环境变量及回退推导 `apps/goal-board/dist`）；当 `index.html` 不存在时，CLI 打印终端告警，根路由分发内置的“请先执行 npm run build:web”引导 HTML 页面；产物存在时正常服务静态页面
  - 成功判据：未构建时访问根路由返回 200 及友好的中文构建指引 HTML，CLI 输出警告；构建后访问根路由正常返回 WebUI
  - 验证方式：在 `packages/browser/test/browser-entry.test.ts` 新增或更新测试用例，覆盖产物存在与缺失场景
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

- [x] //TODO 4. 根目录代理脚本配置、E2E 测试迁移与架构文档对齐

  - 实现目标：在根目录 `package.json` 添加 `build:web`、`dev:web` 与 `test:web-e2e` 便捷脚本；更新 `apps/goal-board/e2e/` 中的服务启动路径；更新 `AGENTS.md`、`docs/architecture/browser.md` 等架构文档；执行完整端到端与全量回归验证
  - 成功判据：在根目录执行 `npm run build:web` 成功打包；执行 `npm run test:web-e2e` 真实浏览器端到端测试 100% 通过；文档中所有原 `prototypes/` 路径全部更新为 `apps/goal-board` 且无坏链；根目录 `npm test` 回归通过
  - 验证方式：执行 `npm run test:web-e2e` 与 `npm test`
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2) | 仓库中移除 `prototypes/` 目录，前端包名为 `@lazygoal/goal-board` | 目录结构与 `apps/goal-board/package.json` 检查 |
| [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2) | 前端产物输出至 `apps/goal-board/dist` 且被 Git 忽略，Git 停止追踪旧静态文件 | 执行 `npm run --prefix apps/goal-board build` 与 `git status` 检查 |
| [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3) | 静态产物缺失时分发内置引导 HTML 并在 CLI 报警；产物存在时分发 WebUI | `packages/browser/test/browser-entry.test.ts` 自动化测试 |
| [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2) | 清理孤立历史原型文件，合并有效样式，TypeScript 编译通过 | `apps/goal-board` 执行 `npx tsc --noEmit` |
| [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2) | 根目录快捷命令代理生效，浏览器端到端自动化测试全部通过 | 执行 `npm run test:web-e2e` |
| [5.3](./requirements.md#req-5-3) | 架构文档中路径全部对齐为 `apps/goal-board`，无断链 | 文档检查与全量回归 `npm test` |

### Latest Result

- **验证时间**：2026-10-05 19:50 CST
- **测试环境**：macOS (darwin), Node v22.22.2, `dev` 分支工作区
- **逐项证据**：
  1. `[1.1, 1.2]`：顶层 `prototypes/` 目录已彻底移除，前端包名已正名为 `@lazygoal/goal-board`（[apps/goal-board/package.json:2](apps/goal-board/package.json#L2)）。
  2. `[2.1, 2.2]`：Vite 输出目录配置为 `dist`，产物输出在 `apps/goal-board/dist/` 并被 `.gitignore` 忽略；`packages/browser/static` 历史 bundle 已自 Git 完全删除。
  3. `[3.1, 3.2, 3.3]`：静态寻址及未构建降级引导页面已实现，`packages/browser/test/browser-entry.test.ts` 4/4 测试通过；CLI 告警逻辑在 `packages/tui/test/cli.test.ts` 24/24 测试通过。
  4. `[4.1, 4.2]`：历史原型草稿（`delete-goal-prototype.*`、`trajectory-prototype.*` 等）已彻底清除；紧凑轨迹样式并入 `trajectory.css`；`apps/goal-board` 下 `npx tsc --noEmit` 0 错误通过。
  5. `[5.1, 5.2]`：根目录已配置 `build:web`、`dev:web`、`test:web-e2e` 便捷脚本；执行 `npm run build:web` 成功构建；执行 `npm run test:web-e2e` 真实 Headless Chrome E2E 测试 2/2 通过（耗时 9.9s）。
  6. `[5.3]`：架构文档 `AGENTS.md`、`docs/architecture/browser.md` 已全部将 `prototypes/goal-board` 对齐为 `apps/goal-board`；执行全量回归 `npm test`（含 TypeScript 类型检查、依赖边界校验、GEPA adapter 198 项测试、1743 项核心单元测试以及 14 项脚本测试）全部通过。
- **整体状态**：全部通过（ALL PASS）。
