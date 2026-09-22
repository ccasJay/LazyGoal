---
feature: native-tool-calling-architecture
status: active
summary: "原生双通道工具调用架构，在单次网络往返（1 RTT）内实现自然语言思考推演与强 Schema 约束工具调用，废除结构化输出模式显式配置"
source_spec: specs/native-tool-calling-architecture/
distilled_at: 2026-09-21
reviewed_at: 2026-09-21
tags: [agent, llm, tool-calling, dual-channel, 1-rtt, system-tools, function-calling]
authorities: [docs/architecture/llm.md, docs/architecture/agent.md, packages/llm/src/core/types.ts, packages/contracts/src/model-output/system-tools.ts, packages/agent/src/llm-step-executor.ts]
supersedes: [project-memory/features/two-stage-decision-pipeline.md]
---

# Native Tool Calling Architecture

## Purpose

- 将模型交互机制从顶层单一 JSON 封包重构为原生双通道（Dual-Channel）工具调用体系，单步 1 RTT 内同时获取自由思维链与强类型工具调用，彻底消除 2 RTT 延迟惩罚与结构化输出模式配置地雷。 [S1, S2, S3, S4, S5]

## Durable Decisions

- D1 — 双通道交互抽象：`LLMResponse` 解耦为自由文本通道 `content`（承载思考链与分析）与结构化通道 `toolCalls`（承载动作参数），思维流不再受语法机死锁，参数合规由底层强约束保证。 [S1, S2, S6, S8]
- D2 — 动作即系统函数 (Action-as-Tool)：将任务完成（`system_complete_task`）、用户等待（`system_wait_for_input`）、目标失败（`system_fail_goal`）及上下文查找等所有非业务工具操作抽象为规范内置系统工具，统一模型调度范式。 [S1, S2, S7, S8]
- D3 — 阶段专属工具集与强制调用：单步由当前阶段组装专属工具清单，并通过 `toolChoice: "required"` 强制模型触发且仅触发 1 个动作，杜绝单步只聊不动的死循环。 [S1, S2, S6, S8]
- D4 — 原生 Function Calling 统一驱动：OpenAI 采用原生 `tools` + `strict: true`，Gemini 采用官方 `functionDeclarations` + `toolConfig`，充分利用厂商原生约束解码与 Prompt 缓存。 [S1, S2, S4, S6]
- D5 — 废除模式显式配置：彻底删除 `LLM_STRUCTURED_OUTPUT_MODE` 环境变量与配置字段，系统自适应开箱即用。 [S1, S2, S4, S8]

## Guardrails

- 强制单步必须返回且仅返回 1 个工具调用，缺失工具调用时抛出 `MISSING_TOOL_CALL` 协议异常，严禁隐式猜测。 [S1, S2, S6, S8]
- 系统函数与业务工具入参必须严格经由 `@lazygoal/contracts` 静态 AST 进行类型解码与 Schema 校验。 [S1, S2, S7, S8]

## Revisit When

- 大模型 Provider 推出支持多工具并发/异步流式调用的原生协议且 LazyGoal 状态机支持并发 Action 时。
- 引入端到端纯文本无函数调用的实验性 Agent 架构时。

## Sources

- S1: `specs/native-tool-calling-architecture/requirements.md`
- S2: `specs/native-tool-calling-architecture/design.md`
- S3: `specs/native-tool-calling-architecture/tasks.md`
- S4: `docs/architecture/llm.md`
- S5: `docs/architecture/agent.md`
- S6: `packages/llm/src/core/types.ts`
- S7: `packages/contracts/src/model-output/system-tools.ts`
- S8: `packages/agent/src/llm-step-executor.ts`
