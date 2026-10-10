# Goal 看板前端架构重构 执行计划

## 任务清单

- [x] //TODO 1. 子展示组件物理剥离与 DOM 样式层级保真
  - 落实标准：[2.1](./spec.md#spec-req-2-1), [2.4](./spec.md#spec-req-2-4), [5.1](./spec.md#spec-req-5-1)
  - 实施目标：在 `apps/goal-board/src/components/` 物理抽离 `GoalCard.tsx`、`ModelPicker.tsx`、`MessageComposer.tsx`、`PermissionControl.tsx` 与 `WorkspaceContext.tsx`，保持原有 DOM 层次结构与 CSS 类名严格不变，杜绝额外 wrapper 引入排版偏差。
  - 验证手段：`npm run --prefix apps/goal-board test` 单元测试通过，`node --test apps/goal-board/e2e/board.test.mjs` 验证看板布局与交互。

- [x] //TODO 2. 异步运行时状态机与网络流抽离为独立领域 Hooks
  - 落实标准：[3.1](./spec.md#spec-req-3-1), [3.2](./spec.md#spec-req-3-2), [3.3](./spec.md#spec-req-3-3), [3.4](./spec.md#spec-req-3-4), [5.1](./spec.md#spec-req-5-1)
  - 实施目标：在 `apps/goal-board/src/hooks/` 抽离并封装 `useRunStream.ts`（SSE 订阅与打字机聚合）、`useGoalSession.ts`（快照读取与轮询刷新）、`useQueue.ts`（消息排队机与原子单飞防重锁）及 `useRunCommands.ts`（Steer/Interrupt/Resume 命令分发与忙碌降级），消除异步网络时序竞态。
  - 验证手段：`node --test apps/goal-board/e2e/runtime.test.mjs` 验证实时文本追加、指令分发与排队调度。

- [x] //TODO 3. 局部双 Context 引入、主视图解耦与 App Shell 极限收敛
  - 落实标准：[1.1](./spec.md#spec-req-1-1), [1.2](./spec.md#spec-req-1-2), [1.3](./spec.md#spec-req-1-3), [1.4](./spec.md#spec-req-1-4), [2.2](./spec.md#spec-req-2-2), [2.3](./spec.md#spec-req-2-3), [4.1](./spec.md#spec-req-4-1), [4.2](./spec.md#spec-req-4-2), [5.1](./spec.md#spec-req-5-1)
  - 实施目标：在 `apps/goal-board/src/context/` 实现 `GoalSessionContext.tsx` 与 `RunControlContext.tsx`，在 `apps/goal-board/src/components/` 拆出 `GoalBoard.tsx` 与 `GoalSession.tsx` 主视图。将 `main.tsx` 收敛为纯净装配入口（严格控制在 180 行以内），零新增外部依赖。
  - 验证手段：`wc -l apps/goal-board/src/main.tsx` 核验代码行数（<= 180 行），执行全量回归 `npm run test:web-e2e` 验证端到端全绿。

- [x] //TODO 4. 模块架构文档同步更新与文档规范自动化校验
  - 落实标准：[5.2](./spec.md#spec-req-5-2)
  - 实施目标：同步更新 `apps/goal-board/README.md`、`notes/overview.md` 与 `notes/semantics.md`，准确记录拆分后的模块目录拓扑、职责划分与权威概念映射。
  - 验证手段：执行 `npm run check:docs` 自动化校验，确保无悬空链接或不一致描述。

---

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
|---|---|---|---|
| 看板基础交互与布局 | [1.1](./spec.md#spec-req-1-1), [2.4](./spec.md#spec-req-2-4) | 会话选择、过滤搜索、归档切换、新建与删除 Goal，DOM 与视觉排版无偏差 | `node --test apps/goal-board/e2e/board.test.mjs` |
| 实时流式打字与状态收敛 | [1.2](./spec.md#spec-req-1-2), [3.1](./spec.md#spec-req-3-1) | SSE 打字机字符追加、动态活动提示标签与完成态过渡流畅等价 | `node --test apps/goal-board/e2e/runtime.test.mjs` |
| 控制指令分发与排队防重 | [1.3](./spec.md#spec-req-1-3), [3.3](./spec.md#spec-req-3-3), [3.4](./spec.md#spec-req-3-4) | Steer 引导、Interrupt 中断、审批交互响应正确，排队单飞锁杜绝并发重发 | `node --test apps/goal-board/e2e/runtime.test.mjs` |
| 轨迹看板联动保真 | [1.4](./spec.md#spec-req-1.4) | Trajectory 标签切换、时间轴缩放平移与执行记录聚焦联动正常 | `node --test apps/goal-board/e2e/runtime.test.mjs` |
| 子组件物理拆分 | [2.1](./spec.md#spec-req-2-1) | GoalCard、ModelPicker 等子组件独立在 `components/` 且无内联残留 | `ls apps/goal-board/src/components/` |
| 主视图物理拆分 | [2.2](./spec.md#spec-req-2-2) | 看板与单会话视图拆分为 GoalBoard.tsx 与 GoalSession.tsx | `ls apps/goal-board/src/components/` |
| main.tsx 代码行数收敛 | [2.3](./spec.md#spec-req-2-3) | `main.tsx` 仅做顶层装配，代码行数收敛在 180 行以内 | `wc -l apps/goal-board/src/main.tsx` |
| 零外部状态库依赖 | [4.1](./spec.md#spec-req-4-1) | 仅使用 React 原生机制与双 Context，无 Redux/Zustand 外部库 | 审查 `apps/goal-board/package.json` |
| 全量测试安全网 | [5.1](./spec.md#spec-req-5-1) | 单元测试与 E2E 浏览器测试全绿通过无破坏性退化 | `npm run test:web-e2e` |
| 文档与语义表更新 | [5.2](./spec.md#spec-req-5-2) | 模块 README、overview 及 semantics 文档更新并保持一致 | `npm run check:docs` |

### Latest Result

- 状态：passed
- 验证时间：2026-10-11
- 验证指纹：`a1af2ece` (worktree: codex/goal-board-architecture-refactor)
- 验证摘要：全量回归与各项 Planned Checks 均全绿通过：
  - `wc -l apps/goal-board/src/main.tsx` 确认为 103 行（严格达成 <= 180 行指标）；
  - `apps/goal-board/package.json` 保持纯净，零新增第三方状态管理依赖；
  - `npm run --prefix apps/goal-board test` 21 项单元测试全部通过；
  - `npm run test:web-e2e`（包含 board.test.mjs 与 runtime.test.mjs）3 项全量端到端浏览器自动化测试 100% 通过；
  - `npm run check:docs` 零错误通过，模块文档与语义表保持一致。

