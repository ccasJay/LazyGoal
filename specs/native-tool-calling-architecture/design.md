# 原生双通道工具调用架构 设计

## 审批摘要

### 方案

将 LazyGoal 现有的顶层单一 JSON Envelope 重构为原生双通道工具调用（Dual-Channel Tool Calling）架构。单步推进内，通过一次网络调用（1 RTT）同时获取自由文本通道中的思维链（CoT）以及结构化工具通道中挂载强 Schema 校验的动作参数，消除所有人为拼装的两阶段额外请求，并在全系统废除 `structured_output_mode` 显式模式切换。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 双通道交互抽象 | `LLMResponse` 解耦为自由文本 `thought?: string` 与单一结构化动作 `toolCall?: ToolCall` | 思考自然流淌无需受限于 JSON 语法机，动作参数由底层语法机保证 100% 合规 |
| 动作即工具 (Action-as-Tool) | 将阶段完成、挂起、失败及需求提问等所有决策抽象为受控的内置系统工具（如 `task_complete`、`ask_clarification` 等） | 彻底消除顶层繁复的 union 分支清洗与启发式归一代码，统一为工具调度模型 |
| 阶段专属工具集与强制调用 | 单步由阶段组装专属工具清单，并通过 `tool_choice: "required"` 强制模型必须且仅触发 1 个动作 | 保证单步推进必定产生明确的决策跳转，同时彻底规避模型只聊天不行动的问题 |
| 原生 Function Calling 统一驱动 | OpenAI 采用原生 `tools` + `strict: true`；Gemini 采用官方 `functionDeclarations` + `toolConfig`；Pi-Ai 采用 tool-use 映射 | 充分利用各大厂商原生的约束解码能力与前缀缓存（Prompt Caching），单步耗时降为 1 RTT |
| 废除模式显式配置 | 彻底删除 `LLM_STRUCTURED_OUTPUT_MODE` 环境变量及配置字段，会话快照中移除模式枚举 | 用户开箱即用，抹平平台配置地雷，代码库移除两阶段执行器与三模式校验分支 |

### 风险与待确认

- 风险等级：high；理由：重构 Agent、Contracts、LLM 三大核心包的单步推进契约与请求管道。
- 关键操作：无
- 风险：部分不支持原生 strict 参数约束的第三方小模型网关在工具参数生成上可能偶发格式缺陷，通过 `@lazygoal/contracts` 确定性校验与错误分类拦截。
- 待确认：无

## Overview

在现代工业级 Agent（如 OpenAI Codex CLI、Claude Code）中，模型自由推演与结构化调用的矛盾是通过“双通道分离”天然解决的：文本通道无约束开放供思维链发散，而工具通道挂载参数 Schema 执行确定性收敛。

本设计重塑 LazyGoal 的模型输出与执行架构：
1. **取消顶层 JSON 封包**：不再要求模型将整个决策包在 `{"result": ...}` 中；
2. **将状态流转映射为内置函数**：执行阶段的完成、等待、失败，以及准备阶段的提问、就绪、提案，均作为带强类型入参的系统函数提供给模型；
3. **单步 1 RTT 高效交互**：单次请求同时获得流式思考与规范工具调用，思考流直通 TUI 终端渲染，工具参数由 Contract AST 严格反序列化后流向 Coordinator 执行。

## Architecture

```text
+-------------------------------------------------------------------------------+
|                                Step Execution (1 RTT)                         |
|                                                                               |
|  +---------------------+        Prompt & Tools Assembly                       |
|  | Context & Snapshot  | -------------------------------------------+         |
|  +---------------------+                                            |         |
|                                                                     v         |
|                                                          +------------------+ |
|                                                          |   LLM Request    | |
|                                                          |  (System/User +  | |
|                                                          |   System Tools)  | |
|                                                          +------------------+ |
|                                                                     |         |
|                                                                     v         |
|                                                          +------------------+ |
|                                                          | LLM (Single Call)| |
|                                                          +------------------+ |
|                                                                     |         |
|                       +---------------------------------------------+         |
|                       | (Dual-Channel Output)                                 |
|                       v                                             v         |
|            [ Channel 1: Free Text ]                     [ Channel 2: Tool Call ]
|            Thinking / Reasoning / CoT                    Action / System Function
|                       |                                             |         |
|                       v                                             v         |
|            +----------------------+                     +-------------------+ |
|            | Trajectory Event Bus |                     | Contract AST      | |
|            | & TUI Streaming Tail |                     | Parameter Decode  | |
|            +----------------------+                     +-------------------+ |
|                                                                     |         |
|                                                                     v         |
|                                                          +------------------+ |
|                                                          |  AgentDecision / | |
|                                                          |  PhaseResult     | |
|                                                          +------------------+ |
+-------------------------------------------------------------------------------+
```

## Components and Interfaces

### 1. 双通道交互类型扩展 (`packages/llm/src/core/types.ts`)

重构 `LLMRequest` 与 `LLMResponse`：

```ts
export interface LLMToolDefinition {
    readonly id: string;
    readonly description: string;
    readonly parametersSchema: Record<string, unknown>;
}

export interface LLMToolCall {
    readonly callId: string;
    readonly toolId: string;
    readonly argumentsJson: string;
}

export interface LLMRequest {
    readonly messages: readonly LLMMessage[];
    readonly tools?: readonly LLMToolDefinition[];
    readonly toolChoice?: "auto" | "required" | "none";
    readonly maxOutputTokens?: number;
}

export interface LLMResponse {
    readonly content: string; // 自然语言文本 / 思维链 / 解释
    readonly toolCalls?: readonly LLMToolCall[]; // 结构化工具调用
    readonly providerMetadata?: Record<string, unknown>;
}
```

### 2. 动作系统函数契约 (`packages/contracts/src/model-output/system-tools.ts`)

所有原本在顶层 JSON 封包中的状态操作均抽象为规范系统工具，参数依然由 Contract AST 严格定义：

- `system_complete_task`: 参数 `{ summary: string, completionEvidence: CompletionEvidence }`
- `system_wait_for_input`: 参数 `{ reason: string }`
- `system_fail_goal`: 参数 `{ error: string }`
- `system_context_lookup`: 参数 `{ need: string, question: string, filters?: ContextFilters }`
- `system_ask_clarification`: 参数 `{ question: string, memoryPatch?: WorkingMemoryPatch }`
- `system_context_ready`: 参数 `{ memoryPatch?: WorkingMemoryPatch }`
- `system_propose_task_plan`: 参数 `{ proposal: TaskProposal, memoryPatch?: WorkingMemoryPatch }`
- `system_probe_action`: 参数 `{ toolId: string, input: Record<string, unknown>, memoryPatch?: WorkingMemoryPatch }`

### 3. Agent 单步执行器归一 (`packages/agent/src/llm-step-executor.ts`)

彻底删除 `TwoStageStepExecutor` 与 `TwoStagePreparationExecutor`：
- 在单步内装配当前阶段允许调用的“业务工具 + 系统工具”；
- 调用 `adapter.generate(request)`，传入 `toolChoice: "required"`；
- 收到响应后，若包含 `content`，首先发射思考事件至 Trajectory 与 TUI Transcript；
- 从 `toolCalls[0]` 中提取工具名称与入参，经由 `@lazygoal/contracts` 的 Tool Input Contract 进行类型安全解码；
- 直接转换为领域模型 `AgentDecision` 或 `PreparationResult` 并返回。

## Key Design Decisions

### D1：双通道交互抽象 (Dual-Channel LLM Abstraction)
- **方案**：将模型响应彻底解耦为 `content`（自由文本通道）与 `toolCalls`（工具调用通道）。
- **理由**：消除了全量 JSON 约束对思维链的语法机锁死。文本通道允许模型进行充分分析、代码走查与假设推演；工具通道由底层约束保证参数 100% 格式合规。

### D2：动作即工具 (Action-as-Tool)
- **方案**：取消 `{"result": {"kind": ...}}` 顶层封包，将非工具操作（如完成、挂起提问）统一建模为系统函数。
- **理由**：统一了模型调度的概念范式。模型不需要在“我是直接回答 JSON 还是调函数”之间产生混淆，所有的动作均体现为统一的工具调用。

### D3：阶段专属工具集与强制调用 (Phase-Scoped Tools & Forced Choice)
- **方案**：运行时在不同阶段组装严格互斥的工具集合（例如 Gathering 阶段绝不提供业务写工具，只提供探测工具与系统澄清函数），并设置 `toolChoice: "required"`。
- **理由**：阶段安全由系统工具暴露边界硬隔离；强制调用保证单步一定能收敛为结构化动作，彻底杜绝模型只输出聊天文本而不行动的死循环。

### D4：厂商原生 Function Calling 统一驱动 (Native Function Calling Adapters)
- **方案**：各适配器对齐厂商官方最优实现：
  - `OpenAICompatible`: 映射到 `tools` 数组，开启 `strict: true` 与 `tool_choice: "required"`；
  - `Gemini`: 映射到 `functionDeclarations` 与 `toolConfig: { functionCallingConfig: { mode: "ANY" } }`；
  - `PiAi`: 映射到 pi-ai 原生 tool 抽象。
- **理由**：彻底摆脱自研的 Schema 扁平化模拟与复杂的哨兵值（如 `__lazygoal_null__`）逆向清洗，大幅提升响应可靠性与执行速度。

### D5：废除模式显式配置 (Removal of Explicit Structured Output Mode)
- **方案**：彻底移除 `LLM_STRUCTURED_OUTPUT_MODE`。用户配置与 Goal 快照中不再记录该字段。
- **理由**：系统底层已通过原生双通道统一了推理自由度与结构合规性，用户不再需要理解任何模式差异，实现完全零配置门槛。

## Error Handling

1. **缺失工具调用 (Missing Tool Call)**：若模型在 `toolChoice: "required"` 约束下仍未返回任何工具调用，适配器抛出 `LLMResponseProtocolError("MISSING_TOOL_CALL")`，拒绝静默推断。
2. **工具参数契约违规 (Invalid Tool Arguments)**：若参数无法通过目标 Tool/System Contract 的 AST 校验，抛出带精确定位路径的 `ContractValidationError`。
3. **未知工具调用 (Unknown Tool ID)**：若模型调用了未授权或非当前阶段开放的工具，立即抛出 `LLMResponseProtocolError("UNAUTHORIZED_TOOL")`。

## Testing Strategy

- **契约与定义测试 (`packages/contracts/test/system-tools.test.ts`)**：
  - 验证所有阶段系统工具的 AST 定义、确定性 JSON Schema 导出与入参安全解码；
  - 验证必填与可选参数校验边界。
- **适配器原生调用测试 (`packages/llm/test/`)**：
  - 验证 OpenAI、Gemini 在原生 Tool Calling 机制下的请求参数投影与响应双通道解析；
  - 验证工具调用参数与文本通道的隔离性。
- **Agent 单步执行测试 (`packages/agent/test/`)**：
  - 验证单步推进只发起 1 次模型调用（1 RTT）；
  - 验证文本思考内容正确写入 Trajectory 并无缝送入 TUI Transcript 流；
  - 验证系统函数被无损映射为领域 `AgentDecision` 和 `PreparationResult`。
- **全量回归与 Benchmark 兼容**：
  - 运行全量回归，确保 SWE-bench 和 ALFWorld 评测套件在 1 RTT 下正确调度并提升吞吐量。

