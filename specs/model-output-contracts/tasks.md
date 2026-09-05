# Implementation Plan

> 前置条件：`contract-dsl-core` 与 `tool-input-contracts` 已按顺序实现并通过验证；若其公共 API 与本设计不一致，先返回 Design 阶段处理，不在本 Spec 内复制 DSL 或 Tool Input Contract。

- [x] //TODO 1. 建立 canonical 模型输出 Contract 与 Runtime 结构边界

  - 在 `@lazygoal/contracts` 声明模型输出共享结构、推导公开类型并实现无规范化的基础语义检查，覆盖 Preparation、AgentDecision、Memory Patch、Context Lookup、Tool Action 与受限 Fact value。
  - 让 Runtime 从 Contracts 重导出兼容类型，并在 Coordinator/Runner 的任何副作用前用 canonical Contract 深复制校验，保留现有阶段、Evidence、授权和完成证明 gate。
  - 添加 Contracts 与 Runtime 测试，覆盖恶意替换 Executor、额外/缺失字段、循环输入、空白语义和无副作用失败。
  - _Requirements: [1.2](./requirements.md#req-1-2), [2.5](./requirements.md#req-2-5), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

- [x] //TODO 2. 派生 required-nullable wire Contract 与确定性 decoder

  - 实现请求级 `ModelOutputContractBundle`、严格 `result` envelope 和递归 optional-to-nullable 派生，拒绝 `optional(nullable(...))` 等不可逆形状。
  - 实现只消除 optional 占位 null 的 wire-to-canonical decoder，并在解码后以请求专用 canonical Contract 复验和隔离结果。
  - 添加四类请求基础 fixture，覆盖缺失/额外字段、错误 null、业务 null、嵌套 optional、旧无 envelope 响应和稳定深复制。
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4)_

- [x] //TODO 3. 组合授权 Tool 分支并编译 Provider 共用表面

  - 从已授权 Tool 的原始 Input Contract 按稳定 Tool ID 顺序派生 `tool_call` 分支，绑定 `toolId` 与 required-nullable `action.input`；空集合不生成该分支。
  - 实现共用可移植子集检查、确定性 JSON Schema 与 minified Shape Guide，拒绝重复 Tool ID、开放 record、递归和不支持的字符串约束。
  - 添加动态 Tool、输入错配、不可移植定义、Schema/Guide 字符稳定性和原 Input Contract 复验测试。
  - _Requirements: [3.5](./requirements.md#req-3-5), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [5.1](./requirements.md#req-5-1), [7.4](./requirements.md#req-7-4)_

- [x] //TODO 4. 用请求 Bundle 替换 Agent Zod 响应解析

  - 新增 Bundle 驱动的裸 JSON/完整 fenced JSON 解析、wire 校验、decoder 与语义错误映射，使 issue 保留稳定 code/path/message。
  - 删除 `response-schema.ts` 的 Zod Schema、旧无 envelope parser 和 Agent 的 Zod 生产依赖，更新公共导出与 `LLMResponseProtocolError`。
  - 添加 Agent 协议测试，覆盖合法结果、正文夹带、非法 JSON、空白文本、结构/语义路径以及单次失败不修复、不重试、不降级。
  - _Requirements: [1.3](./requirements.md#req-1-3), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [7.2](./requirements.md#req-7-2)_

- [x] //TODO 5. 将阶段、checkpoint 与 Shape Guide 接入请求计划

  - 让 Preparation/Step 请求构建返回绑定最终 `LLMRequest` 和 Bundle 的请求计划，并按 gathering、planning、executing 或 checkpoint 选择唯一允许分支。
  - 在 prompt-only 模式把 Guide 写入最终动态控制消息并计入 TokenBudgetPlanner；预算裁剪触发 checkpoint 时单向切换 Bundle，strict 模式不注入 Guide。
  - 更新 Prompt Bundle v1 与 Executor 测试，确认缓存稳定前缀、request/parser Bundle 一致、阶段分支和 checkpoint 独占，且每轮仍只调用一次 Adapter。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [5.1](./requirements.md#req-5-1)_

- [ ] //TODO 6. 为 LLM Adapter 接入固定结构化输出模式

  - 扩展 LLM 核心请求与 Adapter 契约，使实例构造时显式固定 `strict` 或 `prompt_only`，并在模式与 structured output 字段不一致时于网络调用前失败。
  - 将共用 Schema 原样映射到 OpenAI-compatible `response_format.json_schema` 和 Gemini `responseJsonSchema`/`responseMimeType`，不做 Provider 专用改写或 fallback。
  - 更新全部直接构造调用方与 Provider mock 测试，覆盖两种模式、原生参数、SDK 拒绝、中止和无隐式重试。
  - _Requirements: [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 7. 接入 TUI 与 benchmark 模式配置

  - 在 TUI 与 benchmark 配置边界读取必填 `LLM_STRUCTURED_OUTPUT_MODE`，只接受 `strict` / `prompt_only`，并把已校验值传给 OpenAI-compatible Adapter。
  - 保持现有 Provider 装配不变，不为 Gemini 新增 CLI 路径；同步环境示例和测试 fixture 中的显式模式。
  - 添加缺失、非法和两种合法配置测试，确认失败发生在首次模型请求以及 Store/Goal 副作用之前。
  - _Requirements: [4.1](./requirements.md#req-4-1), [7.5](./requirements.md#req-7-5)_

- [ ] //TODO 8. 验证协议隔离、提交顺序与全仓回归

  - 增加端到端自动化回归，确认合法 wire 只产生既有 canonical Goal/Trajectory/Snapshot/Trace 数据，非法结果不会调用 Tool 或产生持久化副作用。
  - 原地同步 `structured@1`、Prompt Bundle v1 和受影响架构文档，确认 Storage Zod、持久化 codec、协议版本及提交/恢复顺序未改变，且不存在旧 Schema 或悬空导出。
  - 运行 TypeScript、全部 packages tests、benchmark tests、依赖边界、Memory tests/check 与 `git diff --check`。
  - _Requirements: [6.4](./requirements.md#req-6-4), [7.1](./requirements.md#req-7-1), [7.3](./requirements.md#req-7-3), [7.4](./requirements.md#req-7-4)_
