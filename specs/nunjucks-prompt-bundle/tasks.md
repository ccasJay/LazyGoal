# Implementation Plan

- [x] //TODO 1. 建立版本化 Prompt Bundle Registry

  - 在 `@lazygoal/agent` 中加入 Nunjucks 依赖，以及带中文契约 TSDoc 的 Bundle、模板、Renderer 和错误类型
  - 实现以内存模板 ID 和 Bundle 版本为索引的 Registry，并在构造期校验 section 顺序、引用、Phase 映射、重复项和非法版本
  - 添加 Registry 单元测试，覆盖输入顺序置换、非法 Manifest、未知版本与可信模板边界
  - _Requirements: [1.5](./requirements.md#req-1-5), [3.1](./requirements.md#req-3-1), [4.3](./requirements.md#req-4-3), [6.3](./requirements.md#req-6-3)_

- [x] //TODO 2. 实现确定性的 Nunjucks Renderer

  - 创建封闭的 Nunjucks Environment、内存 Loader、`stableJson` Filter、fragment 换行规范化和脱敏错误封装
  - 保证动态值只进行一次变量插入，并为 Instructions、Tools 空值提供固定表示
  - 添加字符级 Renderer 测试，覆盖重复渲染、Nunjucks 文本隔离、稳定 JSON、CRLF/LF 和无结尾换行
  - _Requirements: [3.2](./requirements.md#req-3-2), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.5](./requirements.md#req-4-5)_

- [x] //TODO 3. 定义内置业务模板和默认 Bundle

  - 将 Global Overview、Preparation Protocol 和 AgentDecision Protocol 分别迁入业务模块附近的版本化 `.njk` 资产，并保留通用 Profile 与 Authorized Tools 模板
  - 用显式有序 Manifest 定义当前 Bundle，提供按固定 URL 加载、规范化并 eager compile 全部资产的默认 Renderer 工厂
  - 添加三个 Phase 的 fixture 测试，验证固定 section 顺序、共享 Global Overview、Phase 映射和注册顺序无关性
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.5](./requirements.md#req-1-5), [3.1](./requirements.md#req-3-1), [6.3](./requirements.md#req-6-3)_

- [x] //TODO 4. 投影不可变 PromptContext

  - 调整 `ModelInferenceView`，把 Bundle 版本、Phase、Profile 和 Authorized Tools 收敛到独立 `PromptContext`
  - 更新 Projector，使其逐字段深复制并递归冻结 DTO、排除非确定性字段，并按 Tool ID 的代码单元顺序排序且拒绝重复 ID
  - 扩展 Projector 测试，验证隔离、冻结、排序、禁止字段、重复 ID 和不修改 Runtime Goal
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2)_

- [x] //TODO 5. 冻结、持久化并注入 Prompt Bundle 版本

  - 将 Runtime Goal 字段改为通用正整数 `promptBundleVersion`，由 Goal 创建输入显式接收，并通过 Launcher 与 TUI Composition Root 注入 Agent 当前版本
  - 将 Storage Snapshot 升级到 v5 并往返该字段，拒绝 v1–v4，且不把具体 Bundle 版本编码进 Snapshot Schema
  - 更新 Runtime、Storage 与 TUI 自动化测试，覆盖创建、保存恢复、冻结旧版本、任意正整数和新增 Bundle 不升级 Schema
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4)_

- [x] //TODO 6. 将 Prompt Bundle 接入模型请求与 Executor

  - 让 `renderRequest` 使用注入的 Renderer 生成唯一 system 消息，再追加原始 Conversation 与 Working Context
  - 为 Preparation 和 Step Executor 注入由 TUI Composition Root 单次创建并共享的默认 Renderer，保证任何配置或渲染错误都发生在 Adapter 调用前
  - 扩展 Executor 与回归测试，验证消息顺序、动态文本不执行、Adapter 零调用失败路径，以及现有 Tool 授权和响应 Schema 边界
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.4](./requirements.md#req-1-4), [3.3](./requirements.md#req-3-3), [4.4](./requirements.md#req-4-4), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4)_
