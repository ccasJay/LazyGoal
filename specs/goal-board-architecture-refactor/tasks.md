# Implementation Plan

- [ ] //TODO 1. 全量测试基线确认与轻量视图组件物理剥离

  - 实现目标：执行全量测试建立全绿基线，并在 `apps/goal-board/src/components/` 下物理抽离 `GoalCard.tsx`、`ModelPicker.tsx`、`MessageComposer.tsx`、`PermissionControl.tsx` 与 `WorkspaceContext.tsx`，保持 DOM 结构与 class 严格不变
  - 成功判据：被剥离的子组件无内联残留且独立编译通过；现有 DOM 层级与样式类名 100% 保持；E2E 测试与单元测试保持全绿通过
  - 验证方式：执行 `node apps/goal-board/e2e/board.test.mjs` 与 `node apps/goal-board/e2e/runtime.test.mjs`
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.4](./requirements.md#req-2-4), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 2. 异步运行时状态机与网络流抽离为独立领域 Hooks

  - 实现目标：在 `apps/goal-board/src/hooks/` 下实现 `useRunStream.ts`、`useGoalSession.ts`、`useQueue.ts` 与 `useRunCommands.ts`，将 SSE 监听、会话快照同步、命令交互与排队调度状态机彻底解耦
  - 成功判据：SSE 文本打字机流、Goal 快照只读刷新、引导/中断指令分发及排队发送完全自治，具备严密单飞防重锁机制且无时序竞态
  - 验证方式：执行 `node apps/goal-board/e2e/runtime.test.mjs` 验证实时流追加与消息排队调度
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 3. 主视图模块解耦、局部 Context 引入与 App Shell 收敛

  - 实现目标：在 `apps/goal-board/src/components/` 下创建 `GoalBoard.tsx` 与 `GoalSession.tsx`，建立 `GoalSessionContext` 与 `RunControlContext` 消除深层 Props 穿透，将 `src/main.tsx` 收敛为纯净装配入口（< 180 行），保持零外部状态库依赖
  - 成功判据：`main.tsx` 行数缩减至 180 行以内；看板切换、会话时间轴、审批交互、Trajectory 复盘及控制台交互 100% 正常，现有 E2E 测试全量通过无报错
  - 验证方式：执行 `node apps/goal-board/e2e/board.test.mjs` 与 `node apps/goal-board/e2e/runtime.test.mjs` 全量通过
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3)_

- [ ] //TODO 4. 模块架构文档更新与文档规范校验

  - 实现目标：同步更新 `apps/goal-board/README.md`、`notes/overview.md` 和 `notes/semantics.md`，准确记录重构后的模块拓扑、职责分工及权威概念映射，并执行文档校验
  - 成功判据：文档准确反映最新模块拓扑，概念语义表完整无缺失，`npm run check:docs` 零错误通过
  - 验证方式：执行 `npm run check:docs`
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) | 看板会话选择、搜索过滤、归档切换、新建 Goal 及删除行为完全等价 | `node apps/goal-board/e2e/board.test.mjs` |
| [1.2](./requirements.md#req-1-2) | 活动 Run 实时文本打字机流式追加、提示标签及完成态展示完全保真 | `node apps/goal-board/e2e/runtime.test.mjs` |
| [1.3](./requirements.md#req-1-3) | Steer 引导、Interrupt 中断、Resume 恢复及审批交互控制按钮与状态等价 | `node apps/goal-board/e2e/runtime.test.mjs` |
| [1.4](./requirements.md#req-1-4) | Trajectory 标签页切换与执行单元聚焦联动行为完全保真 | `node apps/goal-board/e2e/runtime.test.mjs` |
| [2.1](./requirements.md#req-2-1) | GoalCard、ModelPicker、MessageComposer 等子组件物理剥离至独立文件 | 源码文件结构检查 (`ls apps/goal-board/src/components/`) |
| [2.2](./requirements.md#req-2-2) | 看板视图与会话主视口物理拆分为 GoalBoard.tsx 与 GoalSession.tsx | 源码文件结构检查 |
| [2.3](./requirements.md#req-2-3) | 重构后的 main.tsx 仅保留装配入口且代码量收敛至 180 行以内 | `wc -l apps/goal-board/src/main.tsx` 代码行数核验 |
| [2.4](./requirements.md#req-2-4) | 剥离后子组件 DOM 结构与 class 严格保真，无多余包裹层导致几何偏移 | `node apps/goal-board/e2e/board.test.mjs` 间距几何断言 |
| [3.1](./requirements.md#req-3-1) | useRunStream 独立自治维护 SSE 连接、重连与打字机缓冲聚合 | `node apps/goal-board/e2e/runtime.test.mjs` |
| [3.2](./requirements.md#req-3-2) | useGoalSession 独立管理 Goal 快照拉取与只读刷新调度 | `node apps/goal-board/e2e/runtime.test.mjs` |
| [3.3](./requirements.md#req-3-3) | useQueue 独立管理客户端输入排队与单飞消费，无重复出队或死锁 | `node apps/goal-board/e2e/runtime.test.mjs` |
| [3.4](./requirements.md#req-3-4) | useRunCommands 统一封装命令调用、忙碌态与错误降级处理 | `node apps/goal-board/e2e/runtime.test.mjs` |
| [4.1](./requirements.md#req-4-1) | 状态流基于 React 自定义 Hooks、useReducer 与局部 Context 组织，零 Redux 依赖 | 依赖配置核验 (`package.json`) |
| [4.2](./requirements.md#req-4-2) | 未引入未经授权的第三方状态管理依赖 | 依赖配置核验 (`package.json`) |
| [4.3](./requirements.md#req-4-3) | 局部 Context 按 Session 与 RunControl 细粒度隔离，避免全树重复渲染 | 源码架构审查与性能验证 |
| [5.1](./requirements.md#req-5-1) | 重构启动前确认已有单元测试与 E2E 测试全绿基线 | 基线测试执行 |
| [5.2](./requirements.md#req-5-2) | 每个重构阶段完成后持续全量通过 E2E 浏览器自动化测试 | 阶段持续回归测试执行 |
| [5.3](./requirements.md#req-5-3) | 出现测试报错或几何尺寸断言误差时立即原地修复 | 异常回归阻断机制 |
| [6.1](./requirements.md#req-6-1) | apps/goal-board/README.md 准确更新模块目录拓扑说明 | 文档人工审查与文档链接检查 |
| [6.2](./requirements.md#req-6-2) | notes/overview.md 和 notes/semantics.md 同步记录职责与概念映射 | 文档审查与语义表核验 |
| [6.3](./requirements.md#req-6-3) | npm run check:docs 零错误通过 | `npm run check:docs` 自动化校验 |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。

