# TUI Controller

## 摘要

`packages/tui` 当前提供不依赖 React/Ink 的 SessionController 层。它把一次
进程内的用户交互限制为单 Goal 会话，组合 Launcher、GoalCoordinator、GoalStore
和 GoalCatalog，并通过不可变 `UiViewModel` 向未来的 Ink 组件暴露状态。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [SessionController](../../packages/tui/src/session-controller.ts) | 串行 dispatch、单 Goal 约束、Runtime 命令映射、错误和快照通知 | React/Ink 渲染、CLI 参数、领域状态转换 |
| [UiCommand/UiViewModel](../../packages/tui/src/types.ts) | 描述用户意图和可渲染状态 | 自行推断 Runtime 可用操作 |
| Runtime adapters | 启动、恢复、推进与 Catalog 查询 | UI 状态持有 |

## 当前数据流

```mermaid
flowchart LR
    I[Intent or UI input] --> C[SessionController]
    C -->|create| L[Launcher]
    C -->|restore| S[GoalStore]
    C -->|list| G[GoalCatalog]
    C -->|advance/resume| K[GoalCoordinator]
    L --> K
    S --> C
    G --> C
    K --> C
    C --> V[UiViewModel]
    V --> I
```

`create` 校验非空 intent 后只生成一个 goalId，并委托 Launcher；恢复命令先读取
完整快照，再以 `{goalId, runId}` 调用 Coordinator。消息、任务批准、Action 批准
和拒绝分别映射为 Coordinator 的 `resume` action。每次成功推进都用最新 Goal
替换 session ViewModel；业务错误保留最近已知 Goal 或当前页面，并在 `error`
中暴露稳定 code/message。

`dispatch` 在操作开始同步置 `busy`；已有操作或关闭页面会拒绝新命令。Controller
不启动后台 Worker、不创建第二个 Goal，也不在 UI 层写入快照。`subscribe` 只通知
快照替换，React/Ink 可在后续任务中通过外部 Store 适配。

## 当前限制

- 本阶段尚未接入 React/Ink、CLI、`resume` 选择页面或 Ctrl+C 关闭编排；这些由
  React Ink TUI Spec 的后续 TODO 实现。
- `SessionController` 只保证单进程内串行化；跨进程租约和历史快照仍由 Runtime
  当前限制决定。
