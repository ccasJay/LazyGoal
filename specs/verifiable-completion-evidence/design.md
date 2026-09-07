# 可验证完成证据 设计

## 审批摘要

### 方案

`completionCriteria` 从纯字符串演进为结构化条件(文本 + 可选验收声明);Evidence Gate 新增纯函数把证据序列解析为 (toolId, 结果);Runner 在现有引用合法性校验之后追加声明匹配校验，不匹配即拒绝 complete 并给出具体缺口。Benchmark descriptor 层解析并注入声明。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 完成条件结构 | `CompletionCriterion { text, acceptance? { expectToolId, expectOutcome } }` 就地替换 `string[]`;Snapshot codec 同步就地更新,旧快照 fail-fast | 领域类型、codec、descriptor、prompt 渲染处同步改;开发期数据可弃,无多版本路径 |
| 声明匹配规则 | 携带声明的条件,其 `evidenceSequences` 中至少一条须解析为 (expectToolId, expectOutcome) 的工具观察;`tool_finished` 直接携带 toolId,`observation_recorded` 经 actionId 与携带 toolId 的事件配对解析 | 匹配是工具级结果语义,不解析输出内容;未声明条件零行为变化 |
| 校验归属 | 解析函数放 Evidence Gate(纯函数、可单测),匹配判定在 Runner `validateCompletionEvidence` 追加分支 | 与现有引用校验同层演进,不动 Evidence Gate 既有 scope 规则 |
| 拒绝语义 | 拒绝抛 `INVALID_AGENT_DECISION`,消息含条件序号、预期工具与结果、实际缺口;Run 不终止,Agent 可继续 | 模型一轮自纠;失败 Observation 不被禁止作证据(expect failure 声明需要它) |
| Prompt 可见性 | prompt 仍只渲染条件文本,不渲染声明;模型经拒绝消息获知缺口 | 最小改动;声明是 Runtime 校验元数据,不是模型指令 |

### 风险与待确认

- 风险等级:medium;理由:触碰 Task 领域结构与 Runner 校验核心,涉及 Snapshot codec 就地演进。
- 关键操作:无。
- 风险:声明粒度为工具级结果(不校验命令内容与输出断言),模型可运行任意该工具命令产生匹配 Observation——声明质量由任务创建方负责;`observation_recorded` 的 toolId 解析依赖同一 actionId 的 `tool_started`/`tool_finished` 事件存在于 committed 边界内(正常执行路径保证)。
- 待确认:无。

## Overview

```text
BenchmarkTaskDescriptor(含声明)
        │ benchmarks root 解析注入
        ▼
Goal Task.completionCriteria: CompletionCriterion[]
        │ 模型 complete 决策引用 sequence(不变)
        ▼
Runner.validateCompletionEvidence
  ├─ 现有:覆盖/重复/引用合法性(session.validateEvidence)
  └─ 新增:声明匹配
        ▼
Evidence Gate: resolveEvidenceObservation(sequence, index)
  ├─ tool_finished ──► (payload.toolId, observation.kind)
  └─ observation_recorded ──actionId 配对──► (toolId, observation.kind)
```

## Key Design Decisions

### 完成条件结构与就地演进

```ts
interface CompletionCriterion {
    readonly text: string;
    readonly acceptance?: {
        readonly expectToolId: string;
        readonly expectOutcome: "success" | "failure";
    };
}
```

`GoalTask.completionCriteria: readonly CompletionCriterion[]`。Snapshot codec 就地更新序列化形态(旧快照 criteria 为 `string[]`,新 codec 解析时结构校验失败、报清晰的 unsupported 错误——符合开发期兼容策略,旧开发数据可删)。Agent decision 的 `criterionIndex` 语义不变；prompt 渲染处改读 `criterion.text`,不渲染 `acceptance`。

### 声明匹配与 toolId 解析

Evidence Gate 新增纯函数:

```ts
function resolveEvidenceObservation(
    sequence: number,
    index: CommittedEvidenceIndex,
): { toolId: string; outcome: "success" | "failure" } | undefined;
```

解析规则:`tool_finished` 事件直接取 `payload.toolId` 与 `payload.observation.kind`;`observation_recorded` 事件在索引内按 `actionId` 查找同 Goal/Run 的 `tool_started`/`tool_finished` 事件取得 toolId(两者 payload 均携带);其余事件类型返回 `undefined`。`rejected` 观察已被现有 Evidence Gate 排除,不会进入匹配。

Runner 匹配判定：对携带 `acceptance` 的条件,检查其 `evidenceSequences` 中存在 `sequence` 使 `resolveEvidenceObservation` 返回 `(expectToolId, expectOutcome)`;不存在则抛 `INVALID_AGENT_DECISION`,消息形如 `completion criterion 2 requires <toolId> <outcome> observation, referenced evidence does not match`。多条声明之间独立校验,无组合逻辑。

### Descriptor 注入与边界校验

`BenchmarkTaskDescriptor.completionCriteria` 演进为 `readonly (string | CompletionCriterion)[]`(字符串视为无声明条件的便捷形态);benchmarks root 解析时:结构校验(acceptance 形态、expectOutcome 取值)并校验 `expectToolId ∈ profile.toolIds`,不满足即抛 TypeError——避免声明引用未授权工具导致条件永不可满足的静默陷阱。Runtime 侧信任同进程类型边界,不重复校验。

## Testing Strategy

- Evidence Gate 单测(待实现):`tool_finished` 直接解析;`observation_recorded` 经 actionId 配对解析;配对事件缺失/越界返回 `undefined`;非工具事件返回 `undefined`。
- Runner 单测(待实现):声明 success 且引用匹配 Observation → complete 通过(现有后续流程不变);引用不匹配 Tool/不匹配结果 → `INVALID_AGENT_DECISION` 且消息含缺口;expect failure 引用 success 被拒、引用 failure 通过;无声明条件行为与现状一致(回归)。
- Codec 单测(待实现):新结构 roundtrip;旧 `string[]` 快照解析报清晰错误。
- Descriptor 解析单测(待实现):字符串简写归一为 `{text}`;声明引用未授权工具抛 TypeError。
- 现有 runner/evidence-gate/agent 测试回归:未使用声明的路径全部不受影响。
