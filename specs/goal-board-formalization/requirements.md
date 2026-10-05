# Goal 看板工程去原型化与生产化 需求

## 审批摘要

### 目标

将 Web 看板前端从试验性 `prototypes` 目录全面迁移并正名为生产应用 `apps/goal-board`，构建产物规范化隔离至本地 `dist/` 并不入 Git，清理历史草稿页面，建立健全的服务端静态资源校验与根目录便捷脚本。

### 范围

- 包含：
  - 源码目录由 `prototypes/goal-board` 完整迁移为 `apps/goal-board`，package.json 正式命名为 `@lazygoal/goal-board`，彻底废除 `prototypes/` 目录；
  - 前端构建输出由 `packages/browser/static` 改为 `apps/goal-board/dist`，并配置 `.gitignore` 忽略，从 Git 追踪中移除历史静态 bundle；
  - CLI `lazygoal web` 与静态路由从 `apps/goal-board/dist` 读取资源；产物不存在时在终端打印警告并在浏览器返回明确构建引导页面；
  - 清理早期探索期未被引用的历史原型单页与草稿文件，收敛并正名有效样式与生产组件；
  - 在根目录 `package.json` 提供快捷脚本（`build:web`、`test:web-e2e`、`dev:web`），对齐所有 E2E 测试与架构文档中的路径。
- 不包含：
  - Web 看板现有核心业务逻辑、REST API 接口和 SSE 流通信协议的变更；
  - TUI 终端界面逻辑与底层 Goal 执行引擎/状态机修改。

### 核心行为

- 开发者在根目录可通过 `npm run build:web` 快速构建 Web 前端，通过 `npm run test:web-e2e` 运行浏览器端到端测试；
- 前端构建产物仅生成在本地 `apps/goal-board/dist`，不产生任何被 Git 追踪的混淆代码；
- 当静态资源未构建时访问 `lazygoal web`，系统在终端打印友好告警并在浏览器展示指引页面，提示执行 `npm run build:web`；
- 仓库根目录完全移除 `prototypes/`，所有文档与引用路径统一更新为 `apps/goal-board`。

### 风险与待确认

- 风险等级：medium；理由：涉及跨目录文件重组、Git 追踪清理、CLI 静态托管路径对齐及 E2E 测试迁移，但未改变底层协议与持久化数据结构。
- 关键操作：从 Git 中删除 `packages/browser/static` 下已追踪的混淆 bundle 文件。
- 风险：本地克隆仓库后若未先构建前端直接运行 `lazygoal web`，需依赖未构建拦截引导页引导用户构建。
- 待确认：无

## 引言

LazyGoal 的 Web 看板（Goal Board）此前存放于 `prototypes/goal-board`，并在构建时将混淆 bundle 提交至 `packages/browser/static`。随着 Web 界面成为 `lazygoal web` 的官方生产能力，原有的“原型（prototype）”命名、未忽略的构建产物以及探索期草稿页面已成为工程维护包袱。本需求旨在将看板正名为独立生产应用 `apps/goal-board`，实现构建产物规范化隔离，清理历史草稿，并对齐构建、测试与文档链路。

## 需求

### 需求 1：源码目录迁移与包正式命名

**用户故事：** 作为开发者，我希望前端应用位于独立的正式工程目录并在 package.json 中明确命名，以便消除原型试验带来的语义混淆。

#### 验收标准

1. <a id="req-1-1"></a> 当查看仓库根目录布局时，系统必须在 `apps/goal-board` 目录下组织 Web 看板源码，且不再存在 `prototypes/` 目录。
2. <a id="req-1-2"></a> 当查看前端 `package.json` 时，包名必须为 `@lazygoal/goal-board`，且不再包含 `prototype` 临时试验性命名。

### 需求 2：生产级构建产物隔离与 Git 纯净性

**用户故事：** 作为仓库维护者，我希望构建产物输出至本地忽略目录且不提交至 Git，以便杜绝长行混淆代码污染 Git 历史和潜在的合并冲突。

#### 验收标准

1. <a id="req-2-1"></a> 当执行前端构建时，Vite 必须将构建产物输出到 `apps/goal-board/dist` 目录下。
2. <a id="req-2-2"></a> 当检查 Git 状态时，`apps/goal-board/dist` 必须被 `.gitignore` 规则有效忽略，且仓库历史中不再追踪 `packages/browser/static` 下的历史 bundle 文件。

### 需求 3：服务端静态托管与未构建拦截引导

**用户故事：** 作为使用者，我希望在未构建静态资源时启动 `lazygoal web` 能收到明确引导，以便快速知道如何补齐前端资源。

#### 验收标准

1. <a id="req-3-1"></a> 当构建产物存在于 `apps/goal-board/dist` 且启动 `lazygoal web` 时，系统必须正常分发静态 HTML 与前端资源。
2. <a id="req-3-2"></a> 当 `apps/goal-board/dist/index.html` 不存在且用户通过浏览器访问服务时，系统必须返回明确提示页面，指导用户在项目根目录运行 `npm run build:web`。
3. <a id="req-3-3"></a> 当 `apps/goal-board/dist` 不存在且 CLI 执行 `lazygoal web` 时，终端必须打印友好的警告信息，提示 WebUI 尚未构建及构建命令。

### 需求 4：历史原型草稿清理与有效生产代码收敛

**用户故事：** 作为前端维护者，我希望清理早期原型遗留的孤立草稿文件，以便代码库保持纯净可读。

#### 验收标准

1. <a id="req-4-1"></a> 当审查迁移后的应用目录时，系统必须移除未被生产页面引用的独立原型草稿文件（包括 `delete-goal-prototype.*`、`delete-goal.html`、`trajectory-prototype.*`、`trajectory.html`、`compact-trajectory-prototype.tsx`、`prompt-inspector-prototype.*` 等）。
2. <a id="req-4-2"></a> 当生产主入口 `src/main.tsx` 与轨迹页面 `src/trajectory.tsx` 依赖相关样式或组件时，系统必须将仍在使用的样式正名收敛，确保构建与页面展示无缺失。

### 需求 5：根目录便捷命令与自动化测试、文档对齐

**用户故事：** 作为开发者，我希望在根目录能够直接调用前端构建和 E2E 测试，并且所有文档链接正确无坏链，以便高效日常研发与回归验证。

#### 验收标准

1. <a id="req-5-1"></a> 当在项目根目录执行 `npm run build:web`、`npm run test:web-e2e` 或 `npm run dev:web` 时，系统必须准确代理执行 `apps/goal-board` 对应的构建、E2E 测试或本地预览服务。
2. <a id="req-5-2"></a> 当执行端到端浏览器自动化验证时，所有测试用例必须在新目录结构下全部通过。
3. <a id="req-5-3"></a> 当查阅 `AGENTS.md` 和 `docs/architecture/browser.md` 等架构文档时，所有涉及前端源码与构建命令的说明与链接必须准确指向 `apps/goal-board`。
