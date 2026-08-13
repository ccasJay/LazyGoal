# Implementation Plan

- [x] //TODO 1. 建立 `packages/agent` 包并实现确定性的 Run 请求构造

  - 新增包清单与 Zod 直接依赖，添加 `prompt.ts`，实现 `buildStepRequest(state)` 及严格 JSON 协议文本。
  - 用纯函数测试 Profile、Goal、`stepCount`、可选 `lastResult` 的消息内容及输入状态不变性。
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4)_

- [x] //TODO 2. 实现 Zod 严格响应 Schema 与合法结果解析

  - 在 `response-schema.ts` 定义四个严格对象分支、`StepResultSchema` 和 `parseStepResult`。
  - 覆盖四类合法 `StepResult`，并确认解析结果保持 Runtime 既有类型。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [2.5](./requirements.md#req-2-5)_

- [x] //TODO 3. 定义并验证 LLM 响应协议错误

  - 在 `errors.ts` 增加带稳定 `code` 的 `LLMResponseProtocolError`，使 JSON 解析和 Zod 校验失败统一进入该错误边界。
  - 测试非法 JSON、未知 `kind`、缺失字段、错误字段类型、空白载荷和额外字段均被拒绝。
  - _Requirements: [4.1](./requirements.md#req-4-1)_

- [x] //TODO 4. 实现 `LLMStepExecutor` 的单步调用与结果返回

  - 新增 `llm-step-executor.ts`，注入现有 `LLMAdapter`，完成一次请求、一次生成调用和一次 `StepResult` 返回。
  - 保持适配器契约为供应商无关的 `LLMAdapter`，执行器不保存 Store、不调用状态转换、不启动下一步。
  - 用 fake adapter 验证调用次数、返回值和请求边界。
  - _Requirements: [1.1](./requirements.md#req-1-1), [5.1](./requirements.md#req-5-1), [5.3](./requirements.md#req-5-3)_

- [x] //TODO 5. 增加 Tool 前置失败与适配器错误传播

  - 实现 `ToolsNotSupportedError` 及 `toolIds` 非空的前置检查，确保模型调用不会发生。
  - 保持适配器原始异常对象，协议错误不修复、不重试，并补充调用次数与错误码测试。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [x] //TODO 6. 导出 Agent 包并接入现有 Runner 回归验证

  - 在 `index.ts` 导出执行器、请求构造器、Schema、解析器、错误类和必要类型，完成包的可用边界及依赖锁定。
  - 使用 `InMemoryRunStore`、现有 `Runner` 与 fake adapter 验证 `continue` → `complete`、Tool 错误、协议错误和适配器错误的持久化结果。
  - 执行 TypeScript 检查、Agent 测试和全部 Runtime 回归测试，确保不访问真实 LLM、网络、Tool 或文件系统。
  - _Requirements: [3.3](./requirements.md#req-3-3), [4.4](./requirements.md#req-4-4), [5.2](./requirements.md#req-5-2), [5.4](./requirements.md#req-5-4)_
