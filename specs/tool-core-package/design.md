# Tool Core 拆包设计

## Overview

新增 `@lazygoal/tool-core`，迁入通用 Tool 数据契约、注册表、输入准备与单次执行绑定。Runtime 引用它完成现有授权和 Action 生命周期，Agent 与具体工具直接消费共享契约。设计覆盖 [需求 1–4](./requirements.md)，通过调整定义归属和调用点完成拆包。

## Key Design Decisions

1. **复用共享取消协议作为前置。** 按本次设计交流确认，实施前须具备独立的 `@lazygoal/execution-control`；Tool Core 从中取得现有 `ExecutionControl` 与 `throwIfAborted`，并共享其错误身份。当前 checkout 尚无该包，本 Spec 不重复实现取消拆分。新包的 LazyGoal 依赖限定为 `contracts`、`execution-control`、`sandbox`。
2. **核心执行协议与 Runtime 决策分开归属。** 通用 Tool 定义、注册、准备闭包、Registry 和 `TransientToolExecutionFailure` 进入新包。`ToolPolicy`、`ToolPolicyContext`、`resolveAuthorizedToolDefinitions` 与 Runner 内部的授权调度结果留在 Runtime。`createProgramToolRegistration` 包含 Runner 专用调度和代码预算，继续由 Runtime 提供；Core 保留现有 `ToolRegistration.kind` 表示，但不解释程序执行流程。
3. **解除结果和诊断对 Runtime 的类型引用。** Core 使用 `contracts.JsonValue`，自行定义保持原字段的成功／领域失败 `ToolObservation`；Runtime 的 `Observation` 组合该联合与自身的 `rejected` 分支。Core 的 `ToolValidationIssue` 表达 `code/path/message`，替代 `ToolValidationResult` 对 `RuntimeFeedbackIssue` 的引用。完整模型纠错反馈仍属于 Runtime，既有 issue 表示与 Core 结构相容，直接按类型传递，不增加转换器。
4. **迁移公开入口，保持唯一实现。** 新包以 `src/index.ts` 提供迁出符号，现有生产入口、测试和 smoke 同步改用新包；删除 Runtime 对迁出符号的旧转发。Runtime 的 Policy、程序注册和领域 Observation 仍从 Runtime 导出。不复制错误类、注册器或 Parser，也不提供旧路径兼容层。
5. **迁移保留行为，不重构执行流程。** 保留注册期 Contract 编译、现有 Registry 检查、单次 `safeParse`、语义校验、输入隔离、准备闭包及当前结果检查。沙箱能力派生与 execute/stream 继续复用同一 parsed input。批准和恢复后的重新准备、授权、尝试计数、结果提交和故障结算由 Runtime 继续执行；模型 Schema 与持久化表示不变。

## 风险与待确认

- 风险等级：medium；与 Requirements 一致。公开类型和导入路径影响 Runtime、Tools、Agent 与 Benchmark，但不改变授权策略或协议格式。
- 关键操作：无。
- 已知风险：旧类型、重复错误类或遗漏导入会导致边界失效；注册与执行衔接变化可能重复解析或错传可信上下文；Observation 归属调整必须保持模型和存储的结构相容。
- 实施前置：`execution-control` 的共享接口和唯一错误定义已可被 Runtime 与 Tool Core 同时引用；缺失时报告依赖尚未就绪，不把取消实现复制到 Core。
- 待确认：无；前置方案已确定，完整设计仍需审核。

## Architecture

```text
runtime ---+
tools -----+--> tool-core ---> contracts
agent -----+        |
                    +-------> execution-control
                    +-------> sandbox
```

箭头表示源码导入。依赖检查注册 `tool-core: ["contracts", "execution-control", "sandbox"]`，禁止新包导入 Runtime，仅为实际调用方增加允许边。Tools 的进程服务和 Runner 专用程序注册仍可能依赖 Runtime；本次目标是通用 Core 的独立性。

## Components and Interfaces

| 位置 | 设计归属 |
| --- | --- |
| `packages/tool-core/src/types.ts` | `ToolInputContract`、`ToolDefinition`、`Tool`、`ToolExecutionContext`、`ToolExecutionRequest`、`ToolObservation`、`ToolStreamEvent`、`ToolValidationIssue`、`ToolValidationResult`、`PreparedToolAction`、`ToolRegistration`、`ToolRegistry`。除决策 3 的类型来源外，保持现有调用形式和字段。 |
| `packages/tool-core/src/registration.ts` | `createToolRegistration` 及其现有私有结果检查；通过准备闭包保留单次解析后的 canonical 输入。 |
| `packages/tool-core/src/registry.ts` | `InMemoryToolRegistry`；保留构造检查、注册项引用和 get 语义，Tool 生命周期继续由调用方管理。 |
| `packages/tool-core/src/errors.ts` | `TransientToolExecutionFailure`；保留 reason、retryAfterMs、名称、截断和边界化规则。 |
| `packages/tool-core/src/index.ts` | 统一公开入口；沿用仓库 private ESM 包与相对源码导入约定。 |
| `packages/runtime/src/tool.ts` | 保留决策 2 的 Goal 相关 Policy、授权过滤与专用程序注册，引用 Core 类型与函数。 |
| `packages/runtime/src/domain.ts` | `Observation = ToolObservation \| { kind: "rejected"; reason: string }`，其他领域契约与 JSON 类型不借本次拆包更改。 |

Runner 内部同名 `PreparedToolAction` 还持有 Action、Policy 和沙箱计划，它属于授权调度结果，不迁出。Core 的准备结果只绑定 parsed input 与一次调用能力；它不保存批准状态，也不证明工具已获授权。

共享接口仍携带可信的 `goalId/runId/actionId` 字符串，由 Runtime 从当前实例注入；Core 不接收完整 Goal，也不从模型 input 推导身份。ModelInferenceProjector、默认工具装配与远程 Registry 改用新类型，Storage DTO/Schema 与模型输出 Contract 保留现有所有者。

迁入及新增的公共接口补齐中文契约级 TSDoc 和最小示例。实施时同步更新仓库布局、Runtime/Agent/Contracts 架构说明及新包职责入口。

## Error Handling

Core 按现有方式返回 `INVALID_TOOL_INPUT` 或传播构造、校验、Tool 调用与中止异常；Runtime 继续生成有界阶段反馈并决定 Action/Run 结算。`TransientToolExecutionFailure` 是工具报告的故障信号，重试仍须由 Runtime 核对 safe 声明和有效批准；`failure.retryable` 不触发 Core 或 Runtime 自动重放。

Core 不增加重复的结构解析或现有执行流程之外的重试。execute 与 stream 的选择由调用方负责；流式失败不能通过额外 execute 调用补偿。准备闭包不可持久化，Runtime 仍从持久化 canonical Action 重新准备后执行。

## Testing Strategy

- [需求 1](./requirements.md#req-1-1)：通过新包公开入口注册、查找、准备并调用 fake Tool，不创建 Goal/Runner/Store；校验类型推导、共享字段与依赖方向，负向用例拒绝 Core 导入 Runtime。
- [需求 2](./requirements.md#req-2-1)：覆盖注册错误、重复 ID、结构和语义输入失败；观察 validate/execute 次数及 canonical 输入隔离与复用。复用 Runner 单次准备和批准后重新准备测试，保留现有覆盖，缺失失败场景针对输入 JSON 与注册配置边界补充。
- [需求 3](./requirements.md#req-3-1)：使用 fake Tool 验证身份、plan、结果与流式结算，检查每次入口只有一次底层调用；复用取消、暂时故障与未知异常测试，核对 Core、Runtime 和 execution-control 的错误身份。
- [需求 4](./requirements.md#req-4-1)：运行 Runtime 授权、Grant、重放、沙箱和程序调用的集成测试；Agent Projector/模型输出及 Storage 恢复测试确认 Schema、Observation 与持久化内容一致。Benchmark 远程 Registry/RPC 测试确认共享请求契约。
- 实施验证使用现有类型检查、依赖边界检查、受影响的确定性测试及全量 `npm test`；不需要真实模型请求。具体检查入口和运行证据由 Tasks 记录。
