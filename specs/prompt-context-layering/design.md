# Prompt 基础指令与动态上下文分层设计

## 审批摘要

### 方案

保留冻结的 Prompt Bundle/Profile 作为稳定 system 前缀，把当前状态投影成有身份的动态 section；Runtime 记录已提交的模型可见更新，Agent 按各阶段实际保留的历史构造请求。每个 Step 由模型在 Decide 中选择直接决策或提出带目标的 Think 请求，Think 结果先提交，再继续 Decide。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 固定指令与消息来源 | 扩充同一 Bundle v1 的固定 system 指令；动态 section 用带来源的 user 消息，Think 输出保持 assistant 来源 | 阶段内固定前缀稳定；外部文本和模型 Think 不获得 system 权限 |
| Section 更新与保留历史 | 显式注册 section 的身份、来源、顺序、投影和模板；通用 Planner 按阶段比较并整段替换，更新记录提交至 Trajectory | 首版注册五个 section；今后新增 section 无需修改 diff、历史重放或恢复流程 |
| 模型驱动的阶段链 | Decide 可返回决策或带目标的 Think 请求；按供应商内部选择 strict/prompt_only；不新增循环预算 | 一个 Step 可有多轮 Think；Runner/Agent 的单次 StepExecutor 接口改为阶段调用，只有有效 Decide 推进 Step |
| Think 检查点与恢复 | Runner 在每次 Think 后提交来源、目标、输出和 Step 归属，并在 Snapshot 保留待决指针 | Decide 失败或取消后只重试该 Decide；输入或模型身份变化时不复用旧输出 |
| 上下文与授权边界 | 逐请求重建当前 Step 输入并计算完整预算；原生工具声明每次请求照常附带，文本说明参与 section diff | 历史丢失时补齐当前状态；不改变 Runtime 授权、审批和证据校验 |

### 风险与待确认

- 风险等级：high；与 Requirements 一致，模型指令、授权信息和恢复点跨 Agent、Runtime、Storage 改变。
- 关键操作：无。
- 风险：同一 Step 的多轮 Think 不设新增次数或累计 token 预算，调用费用、延迟与持久化内容可持续增长；Trajectory 还会保存模型可见状态文本的副本，须沿用现有存储访问边界；固定指令扩充和历史更新可能触发上下文溢出。
- 待确认：无。

## Overview

设计覆盖 [需求 1–6](requirements.md#需求)：固定指令只随冻结 Bundle/Profile 和推理阶段变化；首版五个动态 section 经显式注册生成，模型请求从已提交的历史和当前 Step 输入重建。保留当前开发期单一 Snapshot/Event 协议版本，更新其现行结构，不增加旧数据迁移路径。

## Architecture

```text
Runtime Runner       Agent StageExecutor       Prompt/Context Planner       LLM Adapter
     | decide/think input --> |                         |                    |
     |                       | -- project + plan ----> | -- request ------> |
     | <-- result + frame --- | <----------------------- | <--- response ---- |
     | -- committed facts + Snapshot --> TrajectoryCheckpointCommitter      |
     | -- next stage only after commit ------------------------------------> |
```

Runner 拥有阶段循环、Step 身份和提交顺序；Agent 只投影、组装、调用模型并解析阶段输出。Context Planner 从当前 Epoch 内各阶段保留的已提交 frame 重建模型可见历史，返回本次请求和待提交 frame；未经成功提交的 frame 不成为后续比较基线。

## Key Design Decisions

### 固定指令与消息来源

将当前 `global_overview` 和 `phase_protocol` 拆成不读取 Run 状态的固定规则与阶段说明；Profile 的 systemPrompt/instructions 仍由冻结 Profile 提供，Bundle v1 仍由 Registry 严格匹配。把 Run 模式、已批准任务、GoalPlan、授权工具和 Working Memory 从 system 模板移出；同一阶段的固定文本按字符保持一致。Think 与 Decide 各有固定说明，并用 `o200k_base` 测量默认参考场景的固定文本，使每阶段达到需求 1.5 的 2,000–3,000 tokens，同时按需求 1.6 检查规则冲突和重复。

供应商消息角色保持 `system`、`user`、`assistant`：固定 Bundle/Profile 为前置 system；Runtime 的 section 更新及本轮控制输入为带 `source`、`sectionId` 的 user 消息；真实 Conversation 沿用原角色和用户意图语义；已提交 Think 输出作为带模型来源标识的 assistant 内容交给后续 Decide。来源身份是消息元数据和可见标签，不新增供应商 `developer` 角色。Tool/Lookup 原文只作为带来源的数据引用；这些内容与真实 Conversation 都不进入固定模板，也不二次执行 Nunjucks。

### Section 更新与保留历史

Agent 的 `DynamicSectionRegistry` 显式注册 `run_mode`、`approved_task`、`goal_plan`、`authorized_tools`、`working_memory`。每条定义声明稳定 ID、来源、消息角色、确定顺序、纯投影函数和版本化渲染模板；模板与 Bundle v1 资产一起在启动期加载和编译，拒绝重复 ID/顺序、缺失模板或不支持的角色。Projector 只遍历注册表并输出通用 section 投影，不按 ID 分支；Context Planner 对投影作确定性规范化，只比较同阶段保留 frame 中各 ID 最近的有效投影，不认识五个具体 ID。没有基线时发完整内容，相等时不发更新，变化时发带替换语义的完整内容，消失时发通用 tombstone。首版五个 section 都整段替换，尤其 Working Memory 不建立条目级模型消息；其 Runtime Patch/revision 仍按原机制提交。

今后增加 section 时，只增加一条定义及其投影/模板，并把它注册到固定顺序中；通用 diff、frame 编解码、裁剪和恢复按 ID 工作。历史 frame 中不存在的新 ID 在首次请求完整注入；持久化 frame 若引用当前注册表不认识的 ID，则在恢复边界失败，不把未知内容默认为当前有效。已发布 ID 不复用于不同语义；不通过目录扫描或用户配置动态加载 section。

每次成功响应的模型可见更新以 `model_context_frame` 事实进入 Trajectory：记录阶段、Epoch、Conversation 插入位置、section 身份/来源/角色、规范化投影和实际更新文本。比较使用结构化投影，重放使用已提交文本，不反解析自然语言；Snapshot 的 `committedThroughSequence` 限定可用 frame。frame 是模型请求历史，不替代 Goal.messages 或 Tool/Observation 事实。当前 `execution`、上一 Step、pending Action、checkpoint、Hot/Warm 和 Lookup 结果仍作为每次请求的尾部输入，Working Memory 不再重复置于该尾部。

每阶段从实际保留的 frame 恢复自己的基线，不把另一阶段的请求视为隐式共享历史。Context Epoch 切换或预算裁剪淘汰 frame 后，Planner 从剩余 frame 重新比较并补发缺失 section；固定指令、当前状态、最新真实 Conversation 和本轮必需输入不得被裁剪。原生 `tools` 声明属于每次 LLM 请求的协议参数，继续完整附带；只有授权工具的文本 section 参与 diff，Runtime 仍按冻结授权集合复核 Tool 调用。

### 模型驱动的阶段链

Runner 先调用 `StageExecutor.decide`。Decide 的请求契约把 `request_think { goal }` 加为独立控制分支：非空目标经本地解析后交给 `StageExecutor.think`，不解码为 `AgentDecision`，不执行 Tool，也不增加 `stepCount`。Think 是同模型的自由文本 `prompt_only` 调用，不附业务或系统 Tool；它获得当前有效 section、本轮输入、模型提出的目标及已提交的本 Step Think 链。Think 完成并提交后，再次 Decide；后续 Decide 可以继续请求 Think，直至提交有效决策或现有失败/中止边界生效，不设置额外次数或累计 token 上限。

`ModelExecutionBinding` 按同一 provider/model 预备 Think 和 Decide 两个 Adapter，模型切换时作为同一代绑定一起发布；OpenAI、Google、OpenAI-compatible 的 Decide 用原生 `strict`，Anthropic、OpenRouter、DeepSeek 的 Decide 用带 Shape Guide 的 `prompt_only`。Think 始终用该 provider/model 的 `prompt_only` Adapter。Runtime 的阶段选择自动完成，不要求用户为每次调用选择输出模式；Decide 两条供应商路径共用 Wire→Canonical 本地校验。当前单次 `StepExecutor.execute` 契约改为阶段结果边界，由 Runner 管理循环，现有业务决策仍只在最终 `AgentDecision` 后进入转换器。

### Think 检查点与恢复

每次 Think 成功后，Runner 将触发它的 `request_think`、Think 目标/输出、两次请求的 frame 作为事实，连同 `pendingThink` 指针提交到当前 Goal Snapshot；提交顺序仍为事实 → Snapshot → marker。`pendingThink` 固定 Goal/Run、待完成 Step 的序号与执行单元 ID、起始输入边界和最新 Think 事件，Think 事实按前驱关系形成有序链。Runner 只读取 Snapshot 边界内、身份及前驱关系匹配的事实；Think 文本不是 Tool Observation、完成证据或新的用户要求。

如果 Think 调用或本次提交失败，当前轮的初始/后续 Decide 与 Think 响应均不进入恢复基线；恢复从最近已提交的边界重发对应 Decide。提交成功后若 Decide 失败或取消，保留 `pendingThink` 与 running Step，恢复时重建全部已提交 Think 链并只重试该 Decide；最终决策提交时同步清除 `pendingThink`。若 Goal/Run/Step 输入身份或链不匹配，先失败，绝不复用旧输出。此中间检查点不增加 `stepCount`、不生成完成 Step，也不触发 Tool。

### 上下文与授权边界

Context Planner 在固定前缀、保留 frame、真实 Conversation、当前 section 更新、本轮输入、Think 链和原生工具 schema 组装完成后执行现有 TokenBudgetPlanner 的硬预算检查；必要状态放不下时明确失败，不删除有效状态来适配预算。相同已提交边界、阶段和阶段输入以同一冻结 Bundle/模型绑定重建相同请求；随机调用 ID、时间及诊断记录不进入模型正文。

初次 Decide、Think 与后续 Decide 均只读取 Runtime 提供的授权 Tool 集合；是否可执行 Action、GoalPlan Patch 或完成声明仍由 Runner 和当前 Contracts 校验。Plan Run 未批准时的先提案顺序只写入固定行为要求，不新增业务工具硬门控。`request_think` 只允许表达思考目标，不能携带 Runtime 状态更新或授权指令。

## Data Models

```ts
type SectionId = string; // 仅接受当前 DynamicSectionRegistry 已注册的稳定 ID
type InferenceStage = "decide" | "think";
type SectionProjectionInput = Readonly<{
    goal: Goal;
    authorizedTools: readonly ToolDefinition[];
    workingMemory: WorkingMemory;
}>;
type DynamicSectionDefinition = {
    id: SectionId;
    order: number;
    source: string;
    role: "user";
    templateId: string;
    project(input: SectionProjectionInput): ModelJsonValue | undefined;
};
type SectionUpdate = {
    sectionId: SectionId;
    source: string;
    role: "user";
    projection?: ModelJsonValue; // 省略表示失效
    renderedMessage: string;
};
type ModelContextFrame = {
    stage: InferenceStage;
    epoch: number;
    conversationIndex: number;
    updates: readonly SectionUpdate[];
};
type PendingThink = {
    goalId: string;
    runId: string;
    stepOrdinal: number;
    executionUnitId: string;
    inputBoundary: string;
    latestThinkEventId: string;
};
```

`inputBoundary` 是对本 Step 起始已提交输入与模型选择的确定性摘要；不包含随后增加的 frame、Think 事实或诊断数据。`ModelContextFrame` 的无更新情况也要记录阶段/位置，使重放能区分“请求已发送且无变化”和“没有该阶段历史”。完整字段及序列化形式在实现时与当前 Snapshot/Trajectory 校验边界对齐，不创建仅为旧开发数据服务的版本。

## Error Handling

- `request_think` 缺少有效目标、Think 输出为空或 Decide 输出不符契约时，拒绝该阶段结果；不转换为成功决策或 Tool 调用。
- Trajectory 事实追加或 Snapshot 保存失败时，不进入下一阶段；未提交 tail 不参与恢复。Snapshot 已成功而 marker 失败时，以 Snapshot 边界为准。
- 已有 `pendingThink` 时的 Decide 失败/取消保持可恢复；恢复缺失、越界或身份不符的 Think 链时明确失败。其他模型错误沿现有稳定错误边界处理，不能伪造已完成的阶段链。
- 阶段历史被裁剪、动态投影无法可靠比较、固定指令或必需本轮输入超出预算时，在供应商调用前失败。

## Testing Strategy

- 分别验证五个 section 的首次完整注入、未变省略、变化整段替换与移除失效；用测试注册的第六个 section 验证新增时无需修改通用 diff/恢复流程，并拒绝重复或未知 ID；覆盖真实 Conversation/Trajectory 不被改写（需求 1–3）。
- 在相同已提交边界下比较重启前后请求字节；覆盖裁剪、Epoch 切换、跨阶段基线、Think 链和模型来源角色，以及超预算明确失败（需求 2、4）。
- 用可控 Adapter 验证直接 Decide、多轮带目标 Think、strict 与 prompt_only Decide、本地协议拒绝，以及 Think 不计 Step、不执行 Tool（需求 5–6）。
- 注入 Think 调用、事实追加、Snapshot 保存、Decide 调用和取消故障；验证已提交输出只重试 Decide，未提交输出不复用，Tool/证据边界保持不变（需求 4–6）。
- 对默认参考场景逐阶段测量固定指令的 `o200k_base` token 数，并复核目标理解、工具、证据、恢复、沟通、等待和完成规则；不通过动态状态或 Shape Guide 凑目标（需求 1）。
