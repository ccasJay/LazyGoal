# Implementation Plan

- [x] //TODO 1. 删除 `fatal` 屏幕与 `openGoalSelect` 命令面

  - 修改 `types.ts`、`app.tsx`、`session-controller.ts`、`index.ts`，按设计决策 1 移除对应变体、分支与导出
  - 同一变更内同步 `docs/architecture/tui.md` 的 UiScreen 与命令面描述
  - 运行 `npx tsc --noEmit` 与 `rg "fatal|openGoalSelect" packages/` 确认无残留
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [5.3](./requirements.md#req-5-3)_

- [ ] //TODO 2. ViewModel 派生改为单次克隆

  - 修改 `session-controller.ts` 的 `toSessionView`、`deriveProposal`、`setGoalSelectError`，按设计决策 2 移除 3 处冗余 `structuredClone`
  - 运行 `npx tsx --test packages/tui/test/session-controller.test.ts` 确认快照隔离语义不变
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3)_

- [ ] //TODO 3. 合并 `continueLatest` 与 `openGoalSelect` 的 Catalog 读取流程

  - 修改 `session-controller.ts`，按设计决策 5 提取共享私有方法并改造两个调用方
  - 运行 `npx tsx --test packages/tui/test/session-controller.test.ts` 确认 `goal_select` 与空列表行为不变
  - _Requirements: [3.1](./requirements.md#req-3-1)_

- [ ] //TODO 4. SIGINT 清理改为单机制

  - 修改 `cli.tsx` 的 `runCli` finally 块，按设计决策 6 只保留 `unregisterSigint?.()`
  - 运行 `npx tsx --test packages/tui/test/cli.test.ts` 确认 SIGINT 单路径与退出码 130 不变
  - _Requirements: [3.2](./requirements.md#req-3-2)_

- [ ] //TODO 5. 第一批全量验证

  - 运行 `npx tsc --noEmit` 与 `npx tsx --test packages/tui/test/*.test.ts*`
  - 复跑 `rg "fatal|openGoalSelect" packages/`，预期仅命中本 Spec 目录
  - _Requirements: [1.3](./requirements.md#req-1-3), [3.3](./requirements.md#req-3-3), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 6. 新增 `useSubmitGate` 并迁移 5 处交互面板

  - 新建 `src/use-submit-gate.ts`（包内私有，含中文契约级 TSDoc），按设计决策 3/4 迁移 `intent-screen.tsx`、`goal-select-screen.tsx`、`preparation-screen.tsx`、`session-screen.tsx` 的 5 处闸门逻辑
  - 运行 4 个屏幕测试文件确认 exactly-once、busy 禁用与空白校验行为不变；若有未覆盖分支，在 `screens.test.tsx` 补充用例
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [ ] //TODO 7. 修正文档漂移并完成第二批全量验证

  - 修正 `docs/architecture/tui.md` 职责表中 Ctrl+C 回调归属（`TuiApp`）与 `cli.tsx` 的 `runCli` 过期 TSDoc
  - 运行 `npx tsc --noEmit` 与 `npx tsx --test packages/tui/test/*.test.ts*`
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3)_
