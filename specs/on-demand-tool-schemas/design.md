# 按需暴露工具 Schema 设计

## 审批摘要

### 方案

把工具发现建模为 Decide 专用的 Runtime 系统控制结果。Runner 搜索当前授权工具目录，将至多 5 个匹配工具加入当前 Run 的可见集合，并在下一次模型请求中同步提供其 Prompt 描述和原生 Schema。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| Decide 系统控制 | 新增 `system_find_tools`（非空、至多 512 字符查询）和独立发现决策；不注册为普通 Tool，避免发现行为绕过 Runtime 控制流。 | 初始请求只带系统工具声明；业务 Schema 按查询结果进入后续请求。 |
| 确定性目录匹配 | 只匹配 Profile 授权且已注册工具的 ID/description；按关键词命中数排序，按 Profile 顺序稳定打破平局，最多 5 项。 | 不新增语义检索依赖；查询结果可复现且有界。 |
| Run 内累积可见集合 | 已发现 ID 并入 RunState；新 Run 初始化为空，恢复时从 Snapshot 取回。 | 同一 Run 后续请求会保留已发现 Schema；新 Run 不继承。 |
| 发现计入 Step 配额 | 每次发现作为一个已提交系统决策推进 `stepCount`，沿用现有 `maxSteps` 上限。 | 额外模型往返消耗既有 Run 执行预算，避免发现循环绕过步数限制。 |
| 可见性与执行授权分离 | Runner 再校验直接调用；PTC 仅获当前可见集合，所有调用继续经过既有执行授权链。 | 发现 Schema 不会授予 Policy、审批或沙箱权限。 |
| 当前 Snapshot 格式原位扩展 | 将 `exposedToolIds` 加入当前 Run Snapshot，不增加版本；开发期旧 Snapshot 不做迁移。 | 新旧开发数据不保证兼容，符合项目当前持久化政策。 |

### 风险与待确认

- 风险等级：medium；理由：变更跨越模型输出协议、Runtime 状态、Snapshot、Prompt 与 PTC 工具集合。
- 关键操作：无新增副作用操作；业务工具仍使用现有审批与沙箱流程。
- 风险：可见集合过滤错误可能导致 Schema 与可执行集合不一致；累积集合可能随 Run 增长而降低 token 节省幅度；通过 Runner 入口与 PTC 拒绝路径测试覆盖。
- 待确认：无；未指定额外匹配约束，采用确定性关键词默认方案。

## Overview

本设计覆盖 [需求 1](./requirements.md#req-1-1) 至 [需求 4](./requirements.md#req-4-1)。工具发现是 Decide 中间控制结果，不产生业务 Action 或 Observation，但作为已提交决策计入 Step 与现有 `maxSteps` 配额。发现结果只改变本 Run 的 Schema 可见集合；实际 Tool 调用仍由 Runner 使用当前 Profile、Registry、Policy、审批与沙箱规则裁决。

每次模型请求使用同一个可见工具集合构造 Prompt 说明、结构化 Wire Contract 和原生函数声明。`think` 请求不携带系统工具声明，也不执行工具发现。

## Key Design Decisions

### Decide 系统控制

在 Contracts 的系统工具声明中新增 `system_find_tools`，输入仅包含非空 `query` 字符串，最多 512 个字符。声明解码为新的 `AgentDecision` 分支 `tool_discovery`，而不是业务 `tool_call`。该分支加入 Canonical、Wire Contract 和各供应商 Schema 投影，以便 native-tool 与 prompt-only 协议统一解析。

Runner 在处理该决策时使用当前 Profile 与 Registry 的交集搜索目录，不调用 Tool Policy，也不创建 pending Action。匹配完成后通过纯 Transition 将结果并入可见集合、推进一次 Step 并保存该发现决策；随后继续 Decide 循环。下一次请求携带查询结果，同时按更新后的集合生成工具 Schema。连续发现受现有 `maxSteps` 限制，不另设发现次数上限或新错误码。

### 确定性目录匹配

查询文本按空白拆分为关键词并统一小写；候选文本是工具 ID 与 description 的拼接。每个关键词在候选文本中以不区分大小写的子串匹配，按命中关键词数降序排列，平局保持 Profile 的原始工具顺序，取前 5 项。重复关键词只计一次；空白查询由输入契约拒绝。没有匹配项是成功的空结果，不是协议错误。

目录查询始终使用完整的 Profile/Registry 授权交集，不依赖当前已暴露集合，因此模型可逐次发现不同类别工具。发现的 ID 与简短描述通过当前调用的 `toolDiscoveryResult` 反馈给下一次 Decide；对应 Schema 同时出现在同一次下一请求中。该反馈是临时上下文，不持久化；中断后 Run 恢复其已暴露 Schema，若需要原查询结果，模型可以安全重查。

### Run 内累积可见集合

在 Runtime `RunState` 增加 `exposedToolIds: readonly string[]`，由 `createRun` 初始化为空数组。Runner 对每次发现结果按稳定顺序与现有集合求并集，并通过纯状态转换更新 Run。Runtime 在组装下一次 `StepExecutionInput` 时仍能解析全量授权工具，但额外传递已暴露 ID 集合；Agent 只把集合交集内的工具投影到模型请求与 PTC。

在 `GoalSnapshotRunStateV1`、Zod Snapshot Schema 及双向 Codec 中保存该字段，作为当前 Snapshot 格式的必需数组。不递增 Snapshot 版本，也不为旧开发数据增加兼容分支；缺字段的历史开发 Snapshot 按现有严格解析规则拒绝，由用户重新创建 Goal。

### 可见性与执行授权分离

Runner 在收到 `tool_call` 后，必须先确认 ID 同时属于 `RunState.exposedToolIds` 和当前 Profile/Registry 交集，再进入既有输入解析、Tool Policy、审批和沙箱流程。失败时按越权/无效决策处理，不调用工具实现。

`execute_program` 的内部 Tool 注册集合从相同可见交集中构造；其每个子调用仍由 Runner 的 Tool 执行边界检查 Profile、Policy、审批和沙箱要求。系统发现控制不通过 PTC 暴露。即使模型直接构造未暴露 Tool 调用，也不能凭发现请求或伪造 ID 绕过 Runner 校验。

### Prompt 与原生 Schema 一致

Agent 的投影层按 `exposedToolIds` 过滤 `authorizedTools`，过滤结果作为唯一的业务 Tool 输入传给 Prompt 渲染、Wire Contract 工厂和 native `SystemToolDeclaration` 组装器。系统控制工具独立添加，所以空可见集合时模型仍可查询目录。`think` 阶段保持不声明任何 Tool。

`StepExecutionInput` 增加已暴露 ID 和可选的上次发现结果字段；更新其中文 TSDoc 与最小示例。模型请求本身不增加模型可写的工具 ID 白名单字段，RunState 是可见集合的唯一可信来源。

## Architecture

```text
Decide request
  -> system_find_tools(query)
  -> AgentDecision: tool_discovery
  -> Runner searches Profile ∩ Registry
  -> RunState.exposedToolIds union matches
  -> commit decision + Snapshot
  -> next Decide request
       Prompt descriptions = exposed tools
       Wire/native schemas = exposed tools + system controls
       PTC tools = exposed tools
  -> tool_call
       Runner exposure gate
       existing Profile/Registry/Policy/approval/sandbox gates
```

Runner 持有目录搜索、可见集合更新和实际执行门控；Agent 负责把 Runtime 提供的集合一致地投影到模型输入。Snapshot 是恢复可见集合的持久化权威，模型响应和临时发现反馈都不能直接修改该集合。

## Components and Interfaces

- `packages/contracts`：新增 `SystemFindToolsInputContract`、系统声明与 `tool_discovery` AgentDecision 分支，并更新 native/JSON Schema 生成及解码。
- `packages/runtime`：扩展 `RunState` 和纯 Transition；Runner 执行有界搜索、提交发现结果、筛选工具输入并拒绝未暴露 Tool Action。
- `packages/agent`：按 Run 暴露 ID 过滤 Prompt、Wire Contract、原生声明及 PTC；将最近发现结果加入下一次 Decide 上下文；Think 不暴露 discovery。
- `packages/storage`：在当前 Run Snapshot 的类型、严格 Schema 和 Codec 中写入/恢复暴露 ID。

## Data Models

```ts
interface RunState {
  readonly exposedToolIds: readonly string[];
}

type ToolDiscoveryDecision = {
  readonly kind: "tool_discovery";
  readonly query: string;
};

interface ToolDiscoveryResult {
  readonly query: string;
  readonly matches: readonly {
    readonly id: string;
    readonly description: string;
  }[]; // 最多 5 项
}
```

`ToolDiscoveryResult` 是 Runtime 到 Agent 的临时请求上下文，不作为用户 Tool Observation 或持久化状态。持久化仅包含去重后的 `exposedToolIds`。暴露 ID 在每次请求前重新与当前 Profile/Registry 交集核对，过期或未注册 ID 会被过滤，不进入模型 Schema 或 PTC。

## Error Handling

- 查询契约错误（空白或超长）按现有模型输出验证与 Runtime 修复反馈处理，不执行搜索。
- 目录搜索是同步纯计算；没有匹配时返回 `matches: []` 并继续 Decide，不改变可见集合。
- 发现决策按一次 Step 计入 `maxSteps`；耗尽配额时沿用现有 `MAX_STEPS_EXCEEDED` 终止流程。
- Tool Action ID 未暴露或不再授权时，在执行前拒绝；既有 Tool 领域错误、审批和恢复策略保持不变。
- Snapshot 严格校验失败时沿用存储解析错误，不尝试从轨迹或 Registry 猜测并补齐缺失集合。

## Testing Strategy

| 验收范围 | 必须验证的行为 |
|---|---|
| [需求 1](./requirements.md#req-1-1) | native 与 prompt-only 两种 Decide 输出均能调用发现；只从授权且已注册工具中检索；关键词排序稳定、最多 5 项、零匹配成功；Think 与 PTC 不出现发现控制。 |
| [需求 2](./requirements.md#req-2-1) | 空集合初始请求不含业务 Schema 但含系统发现工具；发现后 Prompt、Wire Contract、native declarations 同步出现匹配 Schema；多次发现累积，未匹配 Schema 缺席。 |
| [需求 3](./requirements.md#req-3-1) | 直接伪造未暴露 Tool Action 在执行前拒绝；PTC 看不到未暴露工具且不能子调用；已暴露调用仍触发已有 Policy、审批和沙箱测试。 |
| [需求 4](./requirements.md#req-4-1) | Run 创建为空；Snapshot encode/decode 保留集合；恢复后下一请求 Schema 一致；Profile 移除或 Registry 缺失的 ID 被过滤；缺少必需字段按严格协议失败。 |
| 组合与步数预算 | 发现后无需业务 Action 即可继续 Decide；每次发现推进 Step；达到 `maxSteps` 后不再发起模型请求；完成发现后下一轮能成功调用已暴露 Tool。 |

Token 效果通过同一工具目录下比较初始请求业务 Schema 数为 0、发现后仅含匹配集合，以及全量 Schema 基准请求的模型输入统计确认；测试使用确定性模型和真实 Runner/Snapshot 组合，不依赖在线模型服务。
