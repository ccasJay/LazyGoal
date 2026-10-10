# Goal 看板前端架构重构 设计

## Overview

本设计针对 [requirements.md](./requirements.md) 中的全部需求，对 `@lazygoal/goal-board` 的巨型入口 `main.tsx`（2,000 行）进行模块化解耦。通过将纯展现与交互子组件物理剥离至 `src/components/`，将异步 SSE 流、会话快照与排队状态机抽取至 `src/hooks/`，并引入按职责切分的轻量局部 Context，消除属性穿透（Prop Drilling）与根级重复渲染，最终使 `main.tsx` 收敛为纯净的顶层页面装配 Shell（< 180 行），同时确保现有 DOM 结构与 E2E 测试 100% 保真（[req-1-1](#req-1-1) - [req-6-3](#req-6-3)）。

## Key Design Decisions

1. **目录结构分层与子模块物理剥离**：
   - 决策：在 `apps/goal-board/src/` 下建立 `components/` 与 `hooks/` 子目录。
   - 理由：将杂糅在 `main.tsx` 底部的近 10 个子组件物理独立，看板（GoalBoard）与单会话（GoalSession）视口物理分离，建立清晰的前端工程拓扑，便于独立阅读与维护。

2. **双 Context 局部隔离与零外部状态库**：
   - 决策：在前端领域内建立 `GoalSessionContext`（承载会话快照、实时流活动与指标）与 `RunControlContext`（承载 Steer/Interrupt/Resume 命令与排队调度），优先使用 React 原生能力治理状态，不引入 Redux/Zustand。
   - 理由：彻底消除跨组件 Props 穿透；同时将会话只读/流数据与交互控制动作解耦，避免高频流式输出触发控制台重渲染。

3. **DOM 结构与 CSS 样式 1:1 等价保真**：
   - 决策：在组件物理搬迁过程中，严格使用 `<>...</>`（React Fragment）或保留原始父级标签，严禁增删任何 `className` 或多余 `div` 包装。
   - 理由：`apps/goal-board/e2e/` 中的自动化测试（如 `board.test.mjs`）强依赖特定类名选择器与尺寸几何断言（`getBoundingClientRect`），1:1 保真可杜绝任何样式断裂与测试回归。

4. **渐进式分阶段迁移策略**：
   - 决策：分四个独立验证阶段实施：组件物理迁移 -> 领域 Hooks 提取 -> 上下文聚合与视图装配 -> 文档更新。
   - 理由：降低大范围重构的认知负荷与回归排查难度，每一步均以全量 E2E 绿灯为验收把手。

## 风险与待确认

- 风险等级：medium；理由：前端核心主文件 2000 行整体重组，需严格防御 SSE 事件时序竞争与 E2E DOM 选择器断裂。
- 关键操作：无
- 风险：
  - 子组件剥离时遗漏特定的样式类或辅助属性可能导致 E2E 测试选择器失效。
  - 队列消费状态机从主组件脱离时需保持单飞锁（In-flight lock）的一致性。
- 待确认：无

## Architecture

重构后的前端模块拓扑与数据流如下：

```text
                  +-----------------------------------+
                  |      src/main.tsx (App Shell)     |
                  +-----------------+-----------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
  +---------v-----------+                       +-----------v-----------+
  |     GoalBoard       |                       |      GoalSession      |
  | (看板、搜索、归档)    |                       | (会话视口、Timeline)   |
  +---------------------+                       +-----------+-----------+
                                                            |
                       +------------------------------------+------------------------------------+
                       |                                                                         |
          +------------v------------+                                               +------------v------------+
          |   GoalSessionProvider   |                                               |   RunControlProvider    |
          |  (useGoalSession.ts)    |                                               |    (useRunCommands.ts)  |
          |   (useRunStream.ts)     |                                               |       (useQueue.ts)     |
          +------------+------------+                                               +------------+------------+
                       |                                                                         |
            +----------+----------+                                                   +----------+----------+
            |                     |                                                   |                     |
  +---------v-------+   +---------v-------+                                 +---------v-------+   +---------v-------+
  |   ActivityTab   |   |   Trajectory    |                                 | MessageComposer |   | PermissionMenu  |
  |  (Timeline/Msg) |   | (trajectory.tsx)|                                 | (Steer/Queue)   |   | (ToolGrants)    |
  +-----------------+   +-----------------+                                 +-----------------+   +-----------------+
```

## Components and Interfaces

### 1. 组件划分 (`src/components/`)
- `GoalBoard.tsx`：承载看板视图、列状态过滤、搜索与新建 Goal 触发（[req-2-2](#req-2-2)）。
- `GoalCard.tsx`：从 `main.tsx` 提取的看板单个 Goal 卡片与指标摘要展示（[req-2-1](#req-2-1)）。
- `GoalSession.tsx`：承载单 Goal 详情视口，包含 Topbar 面板、Tab 切换（Activity / Plan / Trajectory）及侧栏（[req-2-2](#req-2-2)）。
- `MessageComposer.tsx`：输入框、Steer / Queue 触发、快捷 Slash 命令及模型选择按钮（[req-2-1](#req-2-1)）。
- `ModelPicker.tsx` / `PermissionControl.tsx` / `WorkspaceContext.tsx`：独立设置与环境组件（[req-2-1](#req-2-1)）。

### 2. 领域 Hooks (`src/hooks/`)
- `useRunStream.ts`：管理指定 Goal/Run 的 SSE 连接、打字机文本聚合（`liveText`）、实时状态提示（`liveActivity`）及重连调度（[req-3-1](#req-3-1)）。
- `useGoalSession.ts`：管理当前选中 Goal 的只读快照拉取、`refreshLatest` 触发机制及草稿会话态（[req-3-2](#req-3-2)）。
- `useQueue.ts`：管理客户端输入排队队列（`queuedByGoal`）、暂停态及 Run 结束时的自动消费单飞调度（[req-3-3](#req-3-3)）。
- `useRunCommands.ts`：封装 `steer`、`interrupt`、`resume`、`interact` 的异步调用、忙碌态与错误捕获（[req-3-4](#req-3-4)）。

## Error Handling

- **网络与 SSE 错误降级**：`useRunStream` 遇到网络中断时自动退避重连，并在检测到服务端变更标记（`refresh: true`）时安全通知 `useGoalSession` 重拉最新快照，错误信息统一向消费层输出可恢复的提示。
- **并发与防重保护**：`useQueue` 严格保留基于 `Set<string>` 的 `in-flight` 锁，确保在 Run 状态快速切换时单条排队消息有且仅有一次出队发送，网络失败时自动暂停队列。

## Testing Strategy

- **基线确认与持续全绿**：在实施任何代码变更前，必须运行现有的单元测试与 E2E 浏览器测试建立全绿基线（[req-5-1](#req-5-1)）。
- **组件级与集成回归验证**：
  - 运行 `apps/goal-board/e2e/board.test.mjs`：重点验证看板列、卡片点击、归档过滤、Timeline 间距对齐几何与工具折叠交互。
  - 运行 `apps/goal-board/e2e/runtime.test.mjs`：重点验证全流程实时运行流、审批交互、排队消费与 Trajectory 审查联动。
- **文档一致性检查**：运行 `npm run check:docs`，确保 `apps/goal-board/notes/overview.md` 和 `notes/semantics.md` 的更新符合仓库文档规范（[req-6-1](#req-6-1) - [req-6-3](#req-6-3)）。

