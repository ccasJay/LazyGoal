# two-stage-decision-pipeline 设计

## 审批摘要

### 方案

在 `packages/agent` 中实现同模型两阶段执行流水线，单步决策内首先通过 prompt_only 提示词引导当前模型进行无约束推理生成思考链（CoT）并写入 Trajectory；随后将思考结论作为 Step-dynamic 上下文注入，挂载原生 strict JSON Schema 强制提取合规的 `AgentDecision`，兼顾深度推理与 100% 格式确定性。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 同模型双阶段串联 | 同一配置模型在单步内串行发起 Think 与 Decide 两次调用，避免配置多模型异构的复杂性 | 决策耗时变为 2 次网络往返，但推理自由度与结构合规均达到最优 |
| 思考链独立入轨 | 第一阶段捕获的思考文本记录为 Trajectory 事件属性，不修改底层不可变状态机 | TUI Inspector 可直观查阅完整 CoT，复盘体验完整且状态机零污染 |
| 思考文本预算防护 | 将第一阶段思考链纳入 `TokenBudgetPlanner` 计算，超过阈值进行有界安全截断 | 杜绝超长思考链挤占第二阶段决策提取的上下文窗口 |
| 显式两阶段模式配置 | 新增 `LLM_STRUCTURED_OUTPUT_MODE=two_stage`，保留既有 strict 与 prompt_only 单阶段行为 | 确保基准评测脚本与历史用例完全向后兼容 |

### 风险与待确认

- 风险等级：medium；理由：修改 Agent 决策主循环执行器与 Trajectory 记录流，影响跨包协作，但保留了既有单阶段回退路径。
- 关键操作：无
- 风险：API 往返翻倍带来单步耗时增加；超长思考文本截断需保留清晰标识。
- 待确认：无

## Overview

两阶段决策流水线将 Agent 的单步决策（包含 preparation 与 executing 阶段）从单次请求重构为“思考（Think）”与“决策（Decide）”两步串联：
1. **阶段 1 (Think)**：使用提示词引导模型对当前目标、上下文、证据账本和工具进行深度推演，返回自由文本思考链。系统捕获思考链并写入 Trajectory。
2. **阶段 2 (Decide)**：将思考链作为推理依据附加在动态消息尾部，挂载原生 JSON Schema（`strict: true`），要求模型只输出标准的 `{ result: ... }` 决策结构，完成无损解析。

## Architecture

```text
+-------------------------------------------------------------------------+
|                              Step Execution                             |
|                                                                         |
|  +--------------------+        Stage 1: Think (Prompt-only)             |
|  | Context & Snapshot | ----------------------------------------+       |
|  +--------------------+                                         |       |
|                                                                 v       |
|                                                      +----------------+ |
|                                                      |  LLM (Think)   | |
|                                                      +----------------+ |
|                                                                 |       |
|                                  +------------------------------+       |
|                                  | Raw Thinking / CoT                   |
|                                  v                                      |
|                       +----------------------+                          |
|                       | Trajectory Event Bus | (Persist CoT for audit)  |
|                       +----------------------+                          |
|                                  |                                      |
|                                  v                                      |
|  +--------------------+        Stage 2: Decide (Strict Schema)          |
|  | Context + Thinking | ----------------------------------------+       |
|  +--------------------+                                         |       |
|                                                                 v       |
|                                                      +----------------+ |
|                                                      |  LLM (Decide)  | |
|                                                      +----------------+ |
|                                                                 |       |
|                                                                 v       |
|                                                      +----------------+ |
|                                                      | AgentDecision  | |
|                                                      +----------------+ |
+-------------------------------------------------------------------------+
```

## Components and Interfaces

### 1. 两阶段执行器 (`TwoStageStepExecutor`)

在 `packages/agent/src/step-executor.ts` 中引入两阶段协调逻辑：
- `executeStep(context, control)`:
  - 检查 `structuredOutputMode` 是否为 `"two_stage"`；若是则调度两阶段流程，否则走既有单阶段流程。
  - **Stage 1 (Think)**:
    - 构建思考专用的 `LLMRequest`（`buildThinkingRequest`，包含当前目标、记忆、工具清单以及引导思考的 System/Dynamic Prompt）。
    - 确保请求不携带 `structuredOutput`。
    - 调用 `adapter.generate(thinkingReq, control)`。
    - 校验并提取思考文本，通知 Trajectory 记录事件。
  - **Stage 2 (Decide)**:
    - 将阶段 1 的思考文本经过 `TokenBudgetPlanner` 安全截断后，组装入决策上下文。
    - 构建严格结构化请求（挂载 `bundle.jsonSchema` 与 `strict: true`）。
    - 调用 `adapter.generate(decideReq, control)`。
    - 解码 `AgentDecision` 并返回。

### 2. 轨迹事件扩展 (`packages/runtime/src/trajectory.ts`)

在 `decision_received` 事件载荷中增加可选的 `thought?: string` 字段，或发射 `thought_recorded` 事件：
```ts
export type TrajectoryEventPayload =
    | ...
    | {
        readonly type: "decision_received";
        readonly decision: AgentDecision;
        readonly thought?: string;
    }
```
保持对历史无思考链轨迹的向下兼容读取。

## Key Design Decisions

### D1：同模型双阶段串联 (Same-Model Two-Stage Pipeline)
- **方案**：单个 Step 内使用当前配置的同一个 LLM 实例连续调用两次。
- **理由**：既不引入异构模型的繁琐配置，又能彻底拆解“自由发散思考”与“严格结构化语法机约束”之间的固有冲突。

### D2：思考链独立入轨与审计 (CoT Trajectory Persistence)
- **方案**：Stage 1 产生的思维链作为事实审计事件记录在 Goal Trajectory 中，供 TUI 检查器回放。
- **理由**：思考链属于可观测轨迹，不直接修改 Goal 快照或核心状态机，确保领域状态的纯洁性与可恢复性。

### D3：思考文本预算防护与截断 (Thinking Token Budgeting)
- **方案**：进入 Stage 2 前，检查思考文本 Token 量。若超出保留预算，实施确定性尾部截断并追加 `[...thinking truncated...]` 提示。
- **理由**：防止模型在 Stage 1 产生失控的超长 CoT 导致 Stage 2 提示词超出模型的上下文窗口。

### D4：配置显式化与向后兼容 (Explicit Mode Configuration)
- **方案**：`LLM_STRUCTURED_OUTPUT_MODE` 新增接受 `"two_stage"`（或 `"hybrid"`），其余 `"strict"` 和 `"prompt_only"` 保持既有单阶段行为。
- **理由**：保证无头基准测试（如 SWE-bench 评测）和现有测试套件零破坏。

## Testing Strategy

- **单元测试 (`packages/agent/test/two-stage-executor.test.ts`)**：
  - 验证两阶段顺序调用：Stage 1 产出 CoT，Stage 2 成功接收到 CoT 并输出 `AgentDecision`。
  - 验证取消信号（`control.signal`）在两阶段任一阶段触发时都能立即中止。
  - 验证超长思考文本的安全截断与注入。
  - 验证 Stage 1 或 Stage 2 单独失败时的异常传播。
- **轨迹测试 (`packages/runtime/test/trajectory.test.ts`)**：
  - 验证 `decision_received` 携带 `thought` 的序列化与反序列化兼容性。
- **集成回归测试**：
  - 验证 `prompt_only` 与 `strict` 既有测试保持 100% 绿灯通过。
