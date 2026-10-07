# 执行控制协议拆包设计

## Overview

新增无 LazyGoal 出站依赖的 `@lazygoal/execution-control`，作为进程内取消与暂时性模型请求故障的唯一类型来源。`runtime`、`agent`、`llm`、`tools` 及其他现有调用方改用该包；`llm` 的 JSON 类型改用 `contracts`。此设计覆盖 [需求 1–3](./requirements.md)，不增加 Subagent、重试策略或持久化能力。

## Key Design Decisions

1. **一个共享包，两类跨层信号。** 包名采用 `@lazygoal/execution-control`，包含取消原语和适配器发出、Runner 识别的暂时性模型请求故障。它不依赖 Runtime、LLM 或其他 LazyGoal 包；取消与故障分类是跨层协议，决策与执行仍由调用方拥有。相较将故障塞入狭义的 `cancellation` 包，这个名称覆盖两类现有信号；相较放入 `contracts`，它不扩张 Contract AST 的职责。
2. **按信号产生方与决策方划分所有权。** 将 `ExecutionControl`、`EXECUTION_ABORTED_ERROR_CODE`、`ExecutionAbortedError`、`isExecutionAbortedError`、`throwIfAborted`、`TransientModelFailureReason` 和 `TransientModelRequestFailure` 移入新包，保持现有字段与行为，并让迁移后的调用方取得同一类定义。`ModelRequestAttemptFailure`、`ModelRequestRetriesExhaustedError`、重试次数、退避和事实提交留在 Runtime。`llm` 的 `JsonValue` 使用 `contracts` 现有定义，Runtime 领域类型不为这次拆包改写。
3. **单一公开入口，无旧路径转发。** 迁移现有生产代码、测试与 smoke 入口后，从 Runtime 和 Agent 的索引移除已迁出符号的转发导出，并删除旧实现文件；不添加兼容别名或第二份错误类。此选择改变导入路径，但避免多个长期公开入口，符合仓库开发期兼容策略。Runtime 仍按自身需要导出留在 Runtime 的重试耗尽错误和尝试记录类型。
4. **依赖规则作为长期约束。** 在 `scripts/check-dependencies.mjs` 注册新包及实际调用方允许的依赖边，并从 `llm` 白名单移除 `runtime`。新包的允许出站列表为空；负向边界测试确保未来的 `llm → runtime` 导入失败。

## 风险与待确认

- 风险等级：medium；与 Requirements 一致。跨包公开导入路径和错误类身份变化影响现有调用方，但不变更 Snapshot、Trajectory 或用户可见执行语义。
- 关键操作：无。
- 已知风险：遗漏测试、benchmark、smoke 或索引导出会造成类型错误；并存的旧类定义会使 `instanceof` 重试判断失效；中止错误的识别与传播不能因移动文件而改变。
- 待确认：无；公开导入路径的取舍已在本设计中确定，供完整 Design 审核。

## Architecture

```text
@lazygoal/llm -----> @lazygoal/execution-control
       |
       +------------> @lazygoal/contracts
@lazygoal/runtime --> @lazygoal/execution-control
@lazygoal/agent ----> @lazygoal/execution-control
@lazygoal/tools ----> @lazygoal/execution-control
```

箭头表示源码导入。`llm` 不导入 `runtime`；`agent` 与 `tools` 原有的 Runtime 领域依赖仍存在。新包只定义进程内控制信号，不管理 Goal、Run、子任务、跨进程消息或可恢复状态。

## Components and Interfaces

| 位置 | 设计归属 |
| --- | --- |
| `packages/execution-control/src/execution-control.ts` | 移入取消接口、错误代码、错误类和检查函数；保留 `AbortSignal` 与可选 `ExecutionControl` 的现有调用形式。公共 TSDoc 改为与 Goal 无关的跨层契约，并保留最小示例。 |
| `packages/execution-control/src/model-request-failure.ts` | 移入暂时故障原因与错误类；保留 `kind`、`reason`、`status`、`retryAfterMs` 和构造行为。 |
| `packages/execution-control/src/index.ts` | 统一导出上述公共协议；所有调用方从同一实现取得错误类。 |
| `packages/runtime/src/model-request-failure.ts` | 只保留 Runtime 的尝试摘要与重试耗尽错误，引用新包的故障原因类型。 |
| `packages/llm/src/core/types.ts` | 从 `contracts` 导入 `JsonValue`；保持 `LLMResponse.providerMetadata` 的现有结构。 |

迁移所有现有导入点，包括 Runtime 内部、Agent、Tools、Browser、Benchmark 及相关测试和 smoke；保留各模块不属于本协议的领域类型导入。实施时同步更新仓库布局说明与相关当前架构文档，文档只描述已实现的结果。

## Error Handling

各层使用同一类定义产生和识别 `ExecutionAbortedError`，并保持现有传播规则；`isExecutionAbortedError` 的现有代码与名称识别规则、`throwIfAborted` 的检查时机不变。适配器只对已识别的 Provider 暂时故障构造同一个 `TransientModelRequestFailure` 类；Runner 继续通过 `instanceof` 识别该类。模型输出纠错反馈、原始异常不进入模型输入、重试记录与耗尽后的终态映射均留在现有所有者，满足 [需求 2–3](./requirements.md)。

## Testing Strategy

- 对 [需求 1](./requirements.md) 验证 `llm/src` 无 Runtime 导入、新包无出站依赖、依赖规则对反向导入的负向用例，以及 TypeScript 对所有迁移入口的检查。
- 对 [需求 2](./requirements.md) 复用取消单元与跨层集成测试，重点检查错误类身份、异步调用返回后的中止、Runner 不新增失败提交，以及进程退出语义。
- 对 [需求 3](./requirements.md) 使用现有 fake adapter／本地 fake server 测试故障分类、三次调用上限、退避中止、稳定失败记录、非暂时错误不重试和结构化纠错反馈；运行仓库确定性回归。不使用会触发真实模型请求的 smoke 命令作为自动化验证。
