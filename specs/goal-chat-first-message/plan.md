# Goal 首条消息创建会话 Fast Plan

## Objective

用户从 Goal Board 的空白会话直接开始对话；第一条普通消息创建真实 Goal 并启动 Run。用户仍可显式调用 `/plan`，使用原有任务提案与审批流程。

## Constraints

- 仅修改浏览器 Goal Board 链路；TUI/CLI 的新 Goal 入口保持不变。
- 实现依赖 `feature/goal-board-backend-validation` worktree 中已完成的 Browser 后端；从该分支叠加隔离实现分支，不在缺少 `packages/browser` 的 `dev` 上重做接入或修改已完成分支。
- 空白草稿只保存在页面状态中；Goal 仍要求非空 `intent`，草稿刷新后可以丢弃。
- 新 Goal 默认 Normal Mode；只有用户调用 `/plan` 才进入 Plan Mode。不得把 slash 命令写进会话历史。
- 保持现有 `ask_user`、任务提案审批、Action 审批、Tool Policy 和 Runtime 模式状态限制。
- 风险等级：high；浏览器命令可启动模型并推进获授权工具。验证必须使用隔离工作区、确定性模型与受控工具；不得触碰真实项目文件或外部副作用。

## Approach

- New Goal 打开未持久化的聊天草稿；第一条非空普通消息通过现有创建流程传入 Goal `intent`，由 Runtime 持久化首条消息并启动 Run。
- 复用现有 Slash Command 解析器。草稿中的 `/plan` 设置该草稿的首次 Run 模式；创建 API 在 Plan Mode 时携带可选 `mode: "plan"`，普通模式省略该字段。
- 已有会话中的 `/plan` 调用 `POST /api/goals/:goalId/plan-mode`，携带当前 `runId` 并由服务端调用 `GoalCoordinator.enterPlanMode`；复用现有浏览器授权、串行边界与 Runtime 状态规则。同步更新浏览器架构文档中受影响的命令与状态流。
- 创建请求保留稳定身份用于安全重试去重；模式不同的同 ID 重试必须被视为冲突，不得复用已有创建结果。
- 在已完成 Browser 后端之上叠加独立分支实现，保留其当前提交与验收记录。

## Tasks

- [x] //TODO 1. 将 Goal Board 新建入口改为临时会话草稿
  - 实现目标：移除单独目标表单，New Goal 直接打开空白会话输入区；首条普通消息创建并选中真实 Goal，空草稿不持久化。
  - 场景与成功判据：空输入不触发创建或模型调用；首条消息只产生一个 Goal，内容同时成为 Goal 意图和首条用户消息；刷新可丢弃空草稿，宽窄屏仍可返回看板。
  - 验证入口：`npm run build --prefix prototypes/goal-board` 与 `npm run test:e2e --prefix prototypes/goal-board`。
- [x] //TODO 2. 将 `/plan` 接入新草稿与已有会话
  - 实现目标：草稿调用 `/plan` 后，首条普通消息以 Plan Mode 创建；已有会话的命令携带当前 Goal/Run 身份调用 Coordinator；不将命令文本写入历史，并同步浏览器架构文档。
  - 场景与成功判据：草稿中的 `/plan` 不创建 Goal；Plan Run 仍停在原有任务提案审批点；已有会话按 Runtime 允许的状态切换，过期身份或无效参数不改变快照。
  - 验证入口：扩展 `packages/browser/test/browser-commands.test.ts`、`packages/browser/test/browser-interactions.test.ts` 与 `prototypes/goal-board/e2e/runtime.test.mjs`。
- [x] //TODO 3. 验证普通对话与显式计划的完整浏览器链路
  - 实现目标：通过隔离工作区和受控 Runtime 场景核对普通创建、Plan 创建、任务审批及页面恢复，并覆盖既有 Browser/TUI/Runtime 回归。
  - 场景与成功判据：Normal 首条消息直接进入会话；Plan 首条消息进入任务提案等待，明确批准后按既有行为推进；非法或重复命令不创建重复 Goal、不写入 transcript、不触发工具。
  - 验证命令：`npm run test:e2e --prefix prototypes/goal-board`、`npm test`、`npm run check:dependencies`、`git diff --check`。

## Feature Verification

### Planned Checks

- **Objective / 新建草稿：** 浏览器点击 New Goal 后出现空白会话；在提交非空消息前，Goal 列表、Snapshot 与模型/工具调用均无新增；首条普通消息持久化为 `intent` 和首条 user message，并启动唯一一个 Normal Run。
- **Normal 与 Plan 对照：** 无 `/plan` 时直接按 Normal Run 行为推进；草稿调用 `/plan` 不创建 Goal、不生成消息，后续首条普通消息启动 Plan Run 并到达现有任务提案审批等待点。
- **已有会话 Plan 命令：** 当前 Goal/Run 身份调用 `/plan` 时由 Coordinator 按 Runtime 状态处理；过期 Run、错误参数和不适用状态不改变持久化事实；命令不进入消息历史。
- **交互与风险边界：** 任务提案批准/反馈、`ask_user` 和 Action 审批保持原行为；验证请求沿用本机页面授权，工具只在隔离工作区由受控测试工具执行。
- **恢复与布局：** 空白草稿刷新后可丢弃；已创建会话刷新后从 Snapshot 恢复；宽屏和窄屏保留原型主要布局及返回路径。
- **回归：** 执行 Browser 端到端场景、全量 `npm test`、依赖检查和差异空白检查；任何测试不得连接真实模型或执行真实外部副作用。

### Latest Result

- `npm run test:e2e --prefix prototypes/goal-board`：构建通过，2 项浏览器 E2E 通过；真实本机服务链路覆盖空草稿、Normal 会话、Plan 提案与 Action 审批、持久化读取和刷新恢复。
- `npm test`：全量回归通过；198 项 GEPA 测试、1387 项 TypeScript/MJS 测试与 14 项脚本测试均通过。首次全量运行中两个 TUI 输入测试发生时序失败，单独重跑通过，随后完整回归通过。
- `npm run check:dependencies`：通过，验证 173 个源文件。
- `git diff --check`：通过。
- 隔离的可见 Web UI 手动验证：空草稿时没有 Goal 或模型/工具调用；普通消息创建 Normal Run，经结构化提问和 Action 审批后完成，刷新后历史恢复。Plan 草稿 `/plan` 不创建 Goal；首条普通消息创建 Plan Run，任务提案与 Action 均经 UI 批准后完成；刷新恢复 Plan Mode，已有会话 `/plan` 将下一 Run 设为 Plan 且不进入消息历史。受控工具写入仅落在临时 workspace。
- 第一次手动 Plan 输入未包含确定性测试适配器识别的 `Plan flow:` 标签，导致隔离测试 Goal 失败；使用全新临时环境和该测试输入约定重跑后流程通过。该限制仅属于验收适配器的输入分支。
- 用户截图中的 `127.0.0.1:49936` 经进程检查确认仍由 `LazyGoal-goal-board-backend-validation` worktree 启动；当前实现位于 `codex/goal-chat-first-message` 隔离 worktree。新版空白聊天草稿已在当前分支实例中验证展示。
- worktree 中安装 `benchmarks` 声明的 `smol-toml` 后 GEPA 子进程测试通过；同步修复该包锁文件缺项，保证锁文件与既有 `package.json` 依赖一致。
