# Global System Prompt Fast Plan

## Objective

为所有新 Goal 绑定一个可版本化的 Global System Prompt，在每个 LLM 阶段请求中先说明 LazyGoal 的功能目的、生命周期和 Prompt 分工，再由当前 Phase Protocol 与冻结 Profile 提供具体职责和工作细节。Goal 恢复后继续使用创建时冻结的 Prompt 版本。

## Constraints

- Global System Prompt 高于 Profile，并明确要求在不冲突时遵循 Profile 的角色、领域与工作方式；具体阶段职责和输出格式仍由 Phase Protocol 规定。
- v1 只提供简洁产品导览，不重复 checkpoint、Snapshot、Action/Observation 或 Runtime 已强制校验的细节。
- 不兼容现有 Goal Snapshot；用户会删除旧 Goal，因此新协议不提供迁移或缺省版本。
- 保持 Runtime、Storage 与 LLM Input View 的分层：Runtime 只冻结版本标识，Agent 拥有 Prompt 文本和渲染，Storage 只持久化版本。

## Approach

- 在冻结的 `GoalDefinition` 中增加 Global System Prompt 版本，并由新 Goal 固定使用当前 v1；Storage 协议升级为严格 v4，完整往返该字段并拒绝旧版本。
- Agent 为每个受支持版本维护不可变 Prompt 文本；v1 简述 LazyGoal 是目标驱动、可恢复的 Agent Runtime，说明 `gathering_context → planning → executing` 生命周期，以及 Global、Phase、Profile 和动态上下文的职责关系。
- Projector 把冻结版本投影到 `ModelInferenceView`，Renderer 按 Global Overview → Profile → Phase Protocol → Authorized Tools 的固定结构生成唯一 system 消息；所有阶段共享同一个 Global Overview。
- Runtime 的 Tool 授权、状态转换和响应 Schema 继续作为实际强制边界，Prompt 不承担安全校验。

## Tasks

- [x] //TODO 1. 在 Runtime 与 Storage 中建立冻结的 Global System Prompt 版本契约
  - 扩展 `GoalDefinition`、Goal 创建逻辑及中文契约级 TSDoc，使新 Goal 固定使用当前 v1。
  - 将 Goal Snapshot 升级为严格 v4，编码、解码和跨字段校验必须完整保留版本，并明确拒绝旧 Snapshot。
  - 更新 Runtime/Storage 自动化测试，覆盖创建、持久化往返、非法版本和跨进程恢复。

- [x] //TODO 2. 在 Agent 请求入口渲染版本化 Global System Prompt
  - 增加 v1 Prompt 注册与解析，在 Projector/View 中传递冻结版本，并保持三视图依赖边界。
  - 调整 system 消息结构，使三个阶段都先获得 Global Overview，再读取 Profile、Phase Protocol 与 Authorized Tools。
  - 增加字符级 Renderer、Projector 和 Executor 测试，覆盖优先级说明、阶段共享、版本选择及未知版本失败。

- [x] //TODO 3. 对齐架构说明并完成全量自动化验证
  - 更新 Runtime、Storage、Agent 与 TUI 架构文档中的 Snapshot 版本、Prompt 所有权、渲染顺序和恢复语义。
  - 运行 Runtime、Storage、Agent、TUI 测试以及 `npx tsc --noEmit`、`npm run check:dependencies`。
  - 运行 `git diff --check` 并复核最终差异，确认未修改 fast plan 与本功能之外的内容。
