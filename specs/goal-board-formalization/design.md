# Goal 看板工程去原型化与生产化 设计

## 审批摘要

### 方案

将 Web 看板前端从试验性 `prototypes/goal-board` 完整迁移至独立生产应用 `apps/goal-board`，将 Vite 构建产物内聚输出至 `apps/goal-board/dist` 并加入 Git 忽略；服务端静态托管适配稳健寻址与未构建拦截引导；全面清理孤立历史原型草稿并收敛样式；在根目录提供标准便捷脚本并对齐所有自动化测试与架构文档。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 应用工程目录与命名 | 采用 `apps/goal-board` 并命名为 `@lazygoal/goal-board`，彻底移除 `prototypes/` 目录 | 符合 Monorepo 库与应用分层规范，避免污染 Node 端 TS 配置，消除“原型/试验”语义误解 |
| 构建产物隔离与 Git 纯净 | 构建输出至本地 `apps/goal-board/dist` 并由 `.gitignore` 忽略，从 Git 移除旧静态 bundle | 杜绝长行混淆代码污染 Git 历史与合并冲突，实现前端源码与发布产物的严格解耦 |
| 未构建静态资源拦截与降级 | 服务端探测 `dist/index.html`，缺失时终端输出警告并分发内置友好引导 HTML | 消除未构建时白屏或 404 故障，明确引导开发者与使用者在根目录执行 `npm run build:web` |
| 历史草稿清理与样式收敛 | 删除孤立原型单页及草稿组件，将仍生效的紧凑轨迹样式并入 `trajectory.css` | 保证代码库 100% 生产化，消除遗留的 `-prototype` 命名与无用依赖 |
| 根命令代理与测试对齐 | 根目录提供 `build:web`、`dev:web`、`test:web-e2e` 便捷脚本，更新 E2E 与文档链接 | 提升日常研发体验，保障浏览器端到端测试链路与架构文档无坏链 |

### 风险与待确认

- 风险等级：medium；理由：跨目录移动与构建产物重定向涉及 CLI 静态托管与 E2E 路径调整，但未修改底层状态机或数据协议。
- 关键操作：从 Git 中删除 `packages/browser/static` 下已追踪的 bundle 文件。
- 风险：初次 clone 代码后直接启动 `lazygoal web` 将看到内置构建引导页而非看板，需依赖未构建拦截页准确引导。
- 待确认：无

## Overview

LazyGoal 的 Web 看板此前作为原型存放在 `prototypes/goal-board`，并通过 Vite 打包输出到被 Git 追踪的 `packages/browser/static` 目录中。随着 Web 会话与轨迹查看器成为正式生产功能，本设计实现以下工程目标：
1. **去原型化与目录正名**：移除 `prototypes/`，建立顶级应用目录 `apps/goal-board`，确立正式包名 `@lazygoal/goal-board`；
2. **构建产物隔离**：构建输出重定向至 `apps/goal-board/dist`，Git 忽略打包文件，实现纯净源码仓库；
3. **服务端静态托管与引导**：CLI 与 `@lazygoal/browser` 从新路径加载静态资产，在未构建时优雅引导；
4. **清理孤立原型**：删除历史探索期残留的单页与草稿组件，统一生产样式；
5. **开发者体验与全链路对齐**：根目录提供快捷代理脚本，对齐 E2E 测试与架构文档。

## Architecture

```text
+-------------------------------------------------------------------------+
|                                LazyGoal Monorepo                        |
|                                                                         |
|   +---------------------+               +---------------------------+   |
|   |  apps/goal-board/   |               |    packages/browser/      |   |
|   |  (React 19 + Vite)  |               |  (@lazygoal/browser)      |   |
|   |                     |               |                           |   |
|   |  src/main.tsx       |               |  browser-session-access   |   |
|   |  src/trajectory.tsx |               |         |                 |   |
|   +----------+----------+               +---------+-----------------+   |
|              | vite build                         | serves static       |
|              v                                    v                     |
|   +---------------------+               +---------------------------+   |
|   | apps/goal-board/    | <-----------  | packages/tui/src/cli.tsx  |   |
|   | dist/ (git-ignored) | read assets   | (lazygoal web)            |   |
|   +---------------------+               +---------------------------+   |
|                                                                         |
|   +-----------------------------------------------------------------+   |
|   | Root package.json: build:web / dev:web / test:web-e2e            |   |
|   +-----------------------------------------------------------------+   |
+-------------------------------------------------------------------------+
```

## Key Design Decisions

### 应用工程目录与命名
- 将 `prototypes/goal-board` 整体移动至 `apps/goal-board`，彻底删除 `prototypes/` 顶层目录；
- `package.json` 中的包名由 `"lazygoal-ui-prototype"` 修改为 `"@lazygoal/goal-board"`，版本号初始为 `"0.1.0"`，保持 `"private": true`；
- 保留独立 `tsconfig.json`（含 DOM 库支持），与根目录 Node 环境隔离，不进入 `scripts/check-dependencies.mjs` 的库依赖检查。

### 构建产物隔离与 Git 纯净
- `apps/goal-board/vite.config.ts` 的 `outDir` 配置为 `"dist"`，不再跨级输出至 `packages/browser/static`；
- 根目录 `.gitignore` 添加 `apps/goal-board/dist` 规则；
- 通过 `git rm -r` 清除 `packages/browser/static` 下已追踪的静态 bundle；
- 保留 `packages/browser/static/` 目录或由路由统一从 `apps/goal-board/dist` 读取。

### 未构建静态资源拦截与降级
- 静态文件寻址函数 `resolveStaticDirectory()` 优先级：
  1. `process.env.LAZYGOAL_STATIC_DIR`；
  2. 仓库默认路径 `resolve(repoRoot, "apps/goal-board/dist")`；
- 在 `packages/browser/src/browser-session-access.ts` 中：
  当 `dist/index.html` 不存在时，`GET /` 不返回 404，而是分发轻量内置 HTML，提示开发者：
  `"LazyGoal WebUI 尚未构建。请在项目根目录运行: npm run build:web"`；
- 在 `packages/tui/src/cli.tsx` 中：
  当执行 `lazygoal web` 且检测到 `dist/index.html` 缺失时，在终端打印清晰警告信息。

### 历史草稿清理与样式收敛
- 移除以下未被引用的历史原型草稿文件：
  - `delete-goal.html`
  - `delete-goal-prototype.css`
  - `delete-goal-prototype.tsx`
  - `trajectory.html`
  - `trajectory-prototype.css`
  - `trajectory-prototype.tsx`
  - `compact-trajectory-prototype.tsx`
  - `prompt-inspector-prototype.css`
  - `prompt-inspector-prototype.tsx`
- 将 `compact-trajectory-prototype.css` 中的有效样式整合进 `src/trajectory.css`；
- `src/trajectory.tsx` 中移除对 `compact-trajectory-prototype.css` 的 import。

### 根命令代理与测试对齐
- 根目录 `package.json` 新增以下 scripts：
  - `"build:web": "npm run build --prefix apps/goal-board"`
  - `"dev:web": "npm run dev --prefix apps/goal-board"`
  - `"test:web-e2e": "npm run test:e2e --prefix apps/goal-board"`
- 更新 E2E 测试脚本（`apps/goal-board/e2e/test-service.ts` 与 `apps/goal-board/e2e/runtime.test.mjs`）中的路径常量为 `apps/goal-board/dist`；
- 同步更新 `AGENTS.md`、`docs/architecture/browser.md` 等架构文档。

## Error Handling

- **构建产物缺失**：
  若静态资源目录不存在或 `index.html` 缺失，HTTP 根路由分发内置的轻量 HTML 提示页（状态码 200，说明需运行 `npm run build:web`），阻止白屏或 404；API 路由（`/api/*`、`/goals/*`）不受影响，正常鉴权与处理。
- **非法路径越界**：
  `createBrowserStaticRoutes` 已有的安全沙箱边界（`isOutsideRoot`）保持生效，禁止通过 `..` 读取 `dist/` 之外的任何文件。

## Testing Strategy

1. **类型与构建检查**：
   在 `apps/goal-board` 目录执行 `npm run build`，验证 TypeScript 无类型错误且 Vite 成功打包输出至 `dist/`；
2. **端到端浏览器验证**：
   执行 `npm run test:web-e2e`，验证 headless 浏览器在新的 `apps/goal-board/dist` 产物下顺利完成真实 Composition Root 会话、Action 审批、断线重连等完整 E2E 场景；
3. **未构建降级验证**：
   在清空 `apps/goal-board/dist` 的情况下启动服务，请求 `http://127.0.0.1:<port>/`，验证能够正常返回内置的“尚未构建，请运行 npm run build:web”引导页；
4. **全量回归验证**：
   在根目录运行 `npm test`（TypeScript 编译、依赖边界检查、GEPA adapter、项目单元测试），确保未破坏现有任何 Node 端契约。
