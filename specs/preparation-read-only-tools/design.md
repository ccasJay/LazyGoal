# Feature Design: 准备阶段声明式只读工具与流式瀑布

## 审批摘要

### 方案
在工具定义层为所有工具引入声明式 `isReadOnly` 元数据，准备阶段（`gathering_context` 与 `planning`）通过该元数据动态筛选并向模型注入只读工具集（支持本地检索与 WebSearch）；在 `PreparationExecutor` 与 `Runtime Coordinator` 中扩展只读探查协议，支持最多 5 轮的自主环境探查循环，执行前严格执行只读校验与沙箱防护；同时重构 `PreparationScreen`，复用 Ink `<Static>` 瀑布流输出准备阶段的调查步骤，形成全生命周期一致的终端交互体验。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| **只读工具声明机制** | 在 Tool 定义与 Registration 契约中引入 `isReadOnly: boolean` 属性；通过属性动态过滤而非硬编码工具名 | 新增只读工具（如 `web_search`）无需修改核心代码即可自动对准备阶段生效 |
| **准备协议契约扩展** | 在 `GatheringPreparationResultContract` 与 `PlanningPreparationResultContract` 中扩展 `probe_action` 决策分支 | 保持阶段协议类型安全，明确区分准备阶段只读探查与执行阶段正式动作 |
| **准备循环与步数熔断** | Runtime Coordinator 内部驱动多轮只读探查循环，设置单次准备最大 5 步硬上限；超限强制收敛 | 防止模型无休止探查消耗 Token，保障会话确定性收敛 |
| **TUI 准备瀑布流复用** | 准备阶段步骤统一推入 Ink `<Static>` 瀑布流渲染，下方收敛为紧凑的提问/提案活动抽屉 | 终端用户全流程清晰可见 Agent 的调研步骤，彻底告别准备阶段视觉黑盒 |

### 风险与待确认
- **已知风险**：涉及 `@lazygoal/contracts`、`@lazygoal/runtime`、`@lazygoal/agent` 与 `@lazygoal/tui` 的跨包协议改动，通过分层单测与全量回归保障无破损；
- **待确认项**：无未决重大决策。方案已明确采用声明式元数据、只读探查循环与 TUI Static 瀑布流。

## Overview

本设计在保持“任务方案经用户批准前绝不修改环境”核心安全不变量的前提下，赋予 Agent 在需求收集（`gathering_context`）与方案规划（`planning`）阶段的自主只读探查能力。系统根据工具声明的 `isReadOnly` 属性动态构建准备阶段工具集，支持本地代码检索与网络搜索；并通过受控的探查循环与 Ink `<Static>` 瀑布流，将 Agent 的调查过程实时透明地呈现在终端中。

## Key Design Decisions

### 只读工具声明机制
- 在 `@lazygoal/contracts` 的 Tool 契约中，所有工具显式声明其是否具备只读性质（如 `read_file` 为 `true`，`grep` 为 `true`，`web_search` 为 `true`，`write_file` 为 `false`，`edit_file` 为 `false`）；
- `buildPreparationRequest` 在组装模型提示词时，仅传入 `authorizedTools.filter(tool => tool.isReadOnly === true)`；
- 彻底移除任何基于工具字符串名称（如 `if (name === "read_file")`）的硬编码过滤，实现高度可扩展的插件式工具体系。

### 准备协议契约扩展
- 扩展 `PreparationResult` 契约，新增 `probe_action` 分支：
  ```ts
  export interface ProbeActionPreparationResult {
      readonly kind: "probe_action";
      readonly action: {
          readonly toolId: string;
          readonly input: JsonValue;
      };
  }
  ```
- 模型在准备阶段可返回 `probe_action`，Runtime 执行工具并将观察结果作为下一轮准备上下文继续提供给模型。

### 准备循环与步数熔断
- `Runtime Coordinator` 在调用 `PreparationExecutor` 时支持内部多轮推进：
  ```text
  User Intent -> Prompt -> probe_action (Step 1) -> Tool Execution -> Observation
                         -> probe_action (Step 2) -> Tool Execution -> Observation
                         -> question / task_proposal (Final Result)
  ```
- 设置最大连续探查步数 `MAX_PREPARATION_PROBES = 5`，超过后 Prompt 强制要求模型输出最终提问或任务方案。

### TUI 准备瀑布流复用
- `PreparationScreen` 引入与 `SessionScreen` 相同的 `useTimelineItems` 与 `StepWaterfallItem`；
- 准备阶段产生的所有已完成探查步骤自动追加至 `<Static>` 历史中并向下滚动；
- 底部活动抽屉仅展示当前 Spinner 或待用户交互的面板（`QuestionPanel` / `ProposalPanel`）。

## Architecture

```text
[Goal Intent / User Reply]
           │
           ▼
[ToolRegistry] ──── (filter isReadOnly: true) ───► [Available Read-Only Tools]
                                                             │
                                                             ▼
┌─────────────────────── Preparation Loop ───────────────────────────────────┐
│                                                                            │
│  [Preparation Executor] ───► Model Inference (gathering / planning)        │
│          ▲                              │                                  │
│          │ (Observation)                ├─► probe_action ──► [Safe Sandbox]│
│          │                              │                         │        │
│          └──────────────────────────────┴◄── Tool Observation ────┘        │
│                                         │                                  │
│                                         └─► question / task_proposal       │
└─────────────────────────────────────────────────────┬──────────────────────┘
                                                      ▼
                                           [TUI Static Waterfall]
                                           ✔ [read_file] package.json
                                           ✔ [web_search] react ink ui
                                           [Dynamic Question / Proposal Panel]
```

## Testing Strategy

1. **工具元数据与动态过滤单元测试**：
   - 验证 `isReadOnly` 属性正确标注在现有工具中；
   - 验证 `buildPreparationRequest` 能够根据当前工具列表动态筛选，新增模拟只读工具能被自动识别，写工具被严格排除。
2. **安全拦截单元测试**：
   - 模拟模型在准备阶段尝试调用非只读工具（如 `write_file`），断言被 Runtime 立即拒绝并抛出安全违规，工作区零写入。
3. **准备阶段探查循环与熔断测试**：
   - 测试模型发起连续 2 轮探查后收敛为 proposal 的正常执行流；
   - 测试达到 5 步上限时强制熔断并要求输出结果的保护机制。
4. **TUI 准备界面瀑布流渲染测试**：
   - 使用 `ink-testing-library` 测试多步只读探查在 `PreparationScreen` 中通过 `<Static>` 累积留存，先前步骤不被覆盖。
