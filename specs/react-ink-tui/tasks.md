# 实现计划

- [x] //TODO 1. 建立跨 Runtime、LLM 与 Tool 的可中止执行协议

  - 新增带中文契约级 TSDoc 的 `ExecutionControl`、`ExecutionAbortedError` 与中止检查，并沿 Launcher、Coordinator、Scheduler、Runner、Executor、Adapter 和 Tool 调用链传递根 `AbortSignal`
  - 在外部调用前及 await 返回后的转换和保存前检查中止，确保中止原样传播且不生成 fail Step、`execution_error`、`cancelled` 或新快照
  - 扩展 Runtime、Agent、LLM 与 Tool 单元测试，覆盖模型调用、Tool 调用及保存边界前后的 abort
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

- [x] //TODO 2. 实现项目级 GoalCatalog 与稳定恢复排序

  - 新增带中文契约级 TSDoc 和最小示例的 `GoalCatalog`、`GoalCatalogEntry`，由 `JsonFileGoalStore` 扫描并严格解码正式快照
  - 以成功原子替换后的 `mtime` 排序非终态 Goal，用 `goalId` 打破平局，并忽略 `.tmp`、拒绝损坏快照
  - 扩展 GoalStore 测试，覆盖空目录、终态过滤、更新时间、平局顺序、损坏协议和临时文件
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.4](./requirements.md#req-3-4), [7.2](./requirements.md#req-7-2)_

- [x] //TODO 3. 实现检查点写入闸门与受管关闭原语

  - 实现 `CheckpointGateGoalStore`、受管资源注册表、可注入 `ExitPort` 和幂等 `ShutdownCoordinator`，并补齐公开接口的中文契约级 TSDoc 与示例
  - 关闭时冻结新 save、允许已进入的原子 save 完成、abort 根 signal，并在 2 秒 grace period 后强制关闭剩余资源及请求退出码 130
  - 添加 fake clock、阻塞 Store 和记录型资源测试，验证不回滚、不写 `cancelled`、保留 `pendingAction`、幂等关闭及超时强制清理
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.4](./requirements.md#req-6-4), [6.5](./requirements.md#req-6-5)_

- [x] //TODO 4. 建立 SessionController、UiCommand 与 UiViewModel

  - 创建 `packages/tui` 的 Controller 层，以 `getSnapshot`、`subscribe` 和串行 `dispatch` 装配 Launcher、Coordinator、Store 与 Catalog，并补齐公开接口的中文契约级 TSDoc 与示例
  - 实现新建、恢复、消息、任务批准和 Action 批准/拒绝命令映射，保持单 Goal 会话、busy 防重、最近快照和稳定错误状态
  - 使用 fake Runtime/Store 编写 Controller 单元测试，覆盖创建、选择、等待点、无效输入、业务错误及重复 dispatch
  - _Requirements: [1.4](./requirements.md#req-1-4), [4.2](./requirements.md#req-4-2), [4.5](./requirements.md#req-4-5), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

- [x] //TODO 5. 实现 Intent 与 Preparation 的 Ink 交互界面

  - 接入 React Ink、`@inkjs/ui` 和 `useSyncExternalStore`，实现 `IntentScreen`、question 文本输入、proposal 批准与反馈控件
  - 对空白输入显示英文校验，busy 时停用控件，并保证每次合法提交只产生一个语义化 `UiCommand`
  - 使用 `ink-testing-library` 覆盖 intent、gathering_context、planning、英文 copy、键盘提交和 busy 防重
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [4.5](./requirements.md#req-4-5), [7.1](./requirements.md#req-7-1)_

- [x] //TODO 6. 实现 Goal 恢复选择与最近 Goal 快捷恢复

  - 实现 `GoalSelectScreen`，按 Catalog 顺序展示 `goalId`、intent 摘要、workflow phase、Run 状态和更新时间，并支持键盘选择
  - 为 `resume` 接入选择命令，为 `-c` 直接选择同一排序首项；空候选和 Catalog 错误使用稳定英文反馈且不创建 Goal
  - 添加 Controller、Ink 和命令路由测试，覆盖选择确认、排序展示、空列表、`-c` 首项及损坏快照
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [7.1](./requirements.md#req-7-1)_

- [x] //TODO 7. 实现 executing、Action 与终态 SessionScreen

  - 使用 Ink `Static` 和动态状态区渲染真实消息、phase、Run 状态、`stepCount`、checkpoint、Spinner、终态摘要及停止原因
  - 根据 Controller 提供的等待类型实现 blocked 输入、Action 批准/拒绝和 `outcome_unknown` 风险恢复，并在终态禁用推进输入
  - 使用 `ink-testing-library` 覆盖消息顺序、状态栏、两类 Action 等待、拒绝理由、终态和英文显示
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [5.5](./requirements.md#req-5-5)_

- [x] //TODO 8. 接入 lazygoal CLI、默认 Profile 与项目级依赖装配

  - 新增 `cli.tsx`、根 `lazygoal` bin shim、TSX 编译配置和 TUI package 依赖，使用 `parseArgs` 路由空参数、`-c` 与 `resume`
  - 启动前严格校验 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`，并装配英文默认 Profile、OpenAICompatible、ReadFileTool、项目级 Store 与单个 SessionController，同时忽略 `.lazygoal/`
  - 添加 CLI 配置和 Composition Root 测试，验证缺失变量无 Goal 副作用、默认身份、workspace 隔离、UUID 及空参数进入 intent
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3)_

- [x] //TODO 9. 集成 Ctrl+C 关闭流程并完成跨进程验证

  - 以 `exitOnCtrlC: false` 连接 raw-mode Ctrl+C 与进程级 SIGINT，依次切换 shutting_down、冻结 Store、abort 执行、卸载 Ink、关闭受管资源并调用 ExitPort
  - 使用本地 fake OpenAI-compatible server 和受管子进程编写 CLI 集成测试，覆盖模型失败、模型调用中断、快照恢复、终端退出、子进程清理、grace timeout 和退出码 130
  - 运行完整 TypeScript typecheck 与 Runtime、Agent、LLM、Tools、TUI 测试，确认三种 CLI 路径和现有 action-observation loop 无回归
  - _Requirements: [2.4](./requirements.md#req-2-4), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4), [6.5](./requirements.md#req-6-5), [7.3](./requirements.md#req-7-3)_
