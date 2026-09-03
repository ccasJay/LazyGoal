# Prompt Cache Alignment 设计

## Overview

本设计实现“Goal-stable → Epoch-stable → Step-dynamic”三层上下文拓扑，优化向大语言模型发送决策请求时的消息结构与数据编码。设计将生命周期较长且不随步骤波动的任务契约与 Epoch 边界元数据提升固定为确定性前缀，将微观 Token 水位监控收敛在 Runtime 内部，尾部控制消息仅发送纯动态推进增量。

该设计保持 `renderRequest` 的纯函数无状态特性，不引入任何有状态会话连接，不升级 Snapshot 协议版本，确保系统随时可从任意 Snapshot 完全恢复。（对应需求 1、3、5）

## Architecture

```text
LLMRequest.messages
┌────────────────────────────────────────────────────────┐
│ [1] System Message (Goal-stable 根前缀)                │
│     - Global Overview & Agent Profile                  │
│     - Executing Phase Protocol                         │
│     - Authorized Tool Definitions (JSON Schemas)       │
│     - Approved GoalTask (Objective & Criteria)         │
├────────────────────────────────────────────────────────┤
│ [2..N-1] Conversation Messages (Epoch-stable 中间前缀)  │
│     - 当前 Epoch 可见会话历史基线                      │
│     - Epoch 静态边界标识 (epochNumber, openedSequence) │
├────────────────────────────────────────────────────────┤
│ [N] Working Context Message (Step-dynamic 尾部增量)    │
│     - stepCount                                        │
│     - previousStep (最新 Observation 与候选动作空间)    │
│     - trajectoryContext.hot (最近热执行单元)           │
│     - workingMemory (仅在发生变更时携带)               │
│     - checkpointRequired (仅在越界时呈现的离散信号)    │
└────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. GoalTask 契约固化进 Goal-stable 根前缀（需求 1.1, 1.2, 2.1, 2.2）

* **现状：** `task.objective` 与 `completionCriteria` 包含在每轮尾部 Working Context JSON 中，每次都重复反序列化与传输；System 消息中仅有泛化的阶段说明，缺少精确的任务契约绑定。
* **决策：** 将经过审批的 `GoalTask` 提取为 `Goal-stable` 根前缀的一部分，由 System 模板或固定首条任务消息在执行期声明。尾部 Working Context JSON 彻底移除 `intent` 与 `task` 对象。
* **权衡与收益：** 根前缀在整个 Goal 的数十步生命周期内 100% 逐字固定，天然命中 LLM 供应商的公共前缀缓存；尾部单步 JSON 物理减少约 300~500 字符。

### 2. Epoch 边界静态化与微观水位隔离（需求 1.2, 3.1, 3.2, 3.3, 4.2）

* **现状：** `contextEpoch.control` 实时暴露了每步都在波动的 `inputTokens` 与 `remainingTokens`，导致每走一步，前缀中的数字都会变动，彻底击穿大语言模型厂商的前缀缓存。
* **决策：**
  1. 将浮点/整数的微观 Token 监控保留在 Runtime 内部状态机，不输出给模型；
  2. `Epoch-stable` 层仅包含 `epochNumber` 与当前 Epoch 截断后的对话历史；在同一个 Epoch 的数十步执行中，该层 100% 逐字不变；
  3. 当且仅当 Runtime 判定 Token 逼近硬限制时，在尾部 `Step-dynamic` 消息中呈现离散标志 `checkpointRequired: true`，平时完全省略该字段。
* **权衡与收益：** 既让模型在需要检查点时准确感知控制信号，又保证了正常执行期数十步的前缀缓存 100% 连续命中。

### 3. Step-dynamic 尾部消息纯增量收敛（需求 2.1, 2.2, 4.1, 4.3）

* **现状：** `createWorkingContextPayload` 混合了静态配置（`hardInputLimit`、`phase`）和动态状态。
* **决策：** 尾部 JSON 仅保留推动当前步决策的四个最小要素：
  1. `stepCount`: 当前步数；
  2. `previousStep`: 上一步动作反馈（包含环境最新 Observation 与可用 `admissibleCommands`）；
  3. `trajectoryContext.hot`: 最近执行单元的事件流水；
  4. `workingMemory`: 结构化记忆。
* **权衡与收益：** 动态消息体积缩减 40%~60%，使模型的注意力直接聚焦在最新的外部环境反馈上。

### 4. 纯函数组装与无状态快照恢复（需求 5.1, 5.2, 5.3, 6.1, 6.2）

* **决策：** 维持 `renderRequest` 的纯函数属性，不引入服务端 Session 会话或连接状态维护。从已持久化的 Snapshot 恢复时，直接依据恢复的 `GoalTask`、`ContextEpoch` 及已提交 Trajectory 事件生成标准三层消息。
* **权衡与收益：** 系统具备完全的确定性与断点可恢复性（Crash-Resilience），即使模型供应商不支持 Caching 或发生网络重试，也能保证完全幂等。

## Components and Interfaces

### 1. `renderRequest` 拓扑调整

```ts
/**
 * 组装符合 Goal-stable -> Epoch-stable -> Step-dynamic 拓扑的 LLM 请求。
 */
export function renderRequest(
    view: ModelInferenceView,
    renderer: PromptBundleRenderer,
): LLMRequest;
```

* **消息 0 (System)**: 渲染包含 `task` 契约的完整稳定 System Prompt；
* **消息 1..N-1 (Conversation)**: 经过 Compactor 裁剪后的当前 Epoch 会话历史；
* **消息 N (User)**: 纯动态的 `StepDynamicPayload`。

### 2. 动态负载精简结构

```ts
export interface StepDynamicPayload {
    readonly phase: "executing";
    readonly stepCount: number;
    readonly previousStep?: ModelPreviousStep;
    readonly trajectoryContext?: ModelTrajectoryContext;
    readonly workingMemory?: ModelWorkingMemory;
    readonly contextLookupResult?: ModelContextLookupResult;
    readonly checkpointRequired?: true;
}
```

## Testing Strategy

### 单元测试与确定性验证
1. **前缀不变性测试**：连续生成 10 步 Executing 请求，断言 `messages[0]`（Goal-stable）及 `messages[1..N-1]`（Epoch-stable）的序列化文本在各步间的 SHA-256 哈希完全一致；
2. **动态负载瘦身测试**：断言末尾 User 消息 JSON 中不存在 `intent`、`task`、`hardInputLimit`、`remainingTokens` 等静态重复字段；
3. **检查点离散信号测试**：模拟 Token 预算临界状态，断言仅在越界时尾部注入 `checkpointRequired: true`，且不破坏前缀稳定性；
4. **幂等与恢复测试**：模拟从 Snapshot 恢复，断言恢复后组装的请求与恢复前中断时的请求完全逐字节一致。

### 集成回归
* 运行全量 ALFWorld 回归套件（`benchmarks/alfworld/manifests/regression.json`，共 5 题），验证端到端 100% 成功率与决策协议闭环无漂移；
* 执行 `npm run check:dependencies` 与 `npx tsc --noEmit`，确保无架构越权与编译错误。
