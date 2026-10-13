# Goal Board

React 浏览器前端，呈现已提交会话及临时活动。

阅读 [模块说明](./notes/overview.md)、[语义表](./notes/semantics.md)、[使用说明](./notes/usage.md)。

## 代码架构与目录拓扑

- `src/components/`：展示与交互子组件及业务主视图（`GoalBoard.tsx`、`GoalSession.tsx`、`GoalCard.tsx`、`ModelPicker.tsx`、`MessageComposer.tsx`、`PermissionControl.tsx`、`WorkspaceContext.tsx` 等）。
- `src/hooks/`：领域自治 Hooks，封装网络流与异步状态机（`useRunStream.ts`、`useGoalSession.ts`、`useQueue.ts`、`useRunCommands.ts`、`useGoals.ts`、`usePermissions.ts`、`useModelSelection.ts` 等）。
- `src/context/`：局部隔离的双 Context（`GoalSessionContext.tsx` 会话快照、`RunControlContext.tsx` 运行控制与排队）。
- `src/main.tsx`：应用顶层纯净装配入口与 Context Provider 嵌套（代码量收敛至 102 行）。
- `src/api.ts`：同源 HTTP/SSE 协议请求契约封装。
