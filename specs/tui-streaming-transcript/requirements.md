# Session 流式 Transcript 渲染需求

## 审批摘要

### 目标

将执行阶段的 Assistant 消息拆分为不可变历史与可变尾部，使已经稳定的 Markdown 内容进入终端原生 scrollback，尚未稳定的内容继续在底部动态更新。

### 范围

- 包含：Session 页的 transcript 状态控制、Markdown 稳定边界、按节奏提交、现有完整 Assistant 消息的合成流输入、完整消息恢复和文本合并能力。
- 不包含：Preparation 页改造、真实 LLM/Runtime delta、reasoning 或结构化 JSON 展示、未完成 tail 持久化、resize 历史重建、自定义 scroll region、复制快捷键和 transcript overlay。

### 核心行为

- 严格按单个流的开始、增量和完成顺序累积原始文本；协议乱序、错误标识或并发流必须明确失败。
- 只有结构稳定的 Markdown block 才能按自适应节奏转入不可变历史；pending 与未稳定内容共同组成可变尾部。
- 新出现的完整 Assistant 消息通过相同管道渐进展示；恢复得到的完整消息直接进入历史，不回放动画。
- 用户消息和执行步骤保持原子提交，且不能越过尚未提交完成的 Assistant 内容。
- 最终文本必须直接来自原始 transcript，并与 canonical Assistant 消息逐字符一致。

### 风险与待确认

- 风险等级：medium；理由：修改 TUI 公共 ViewModel、Controller 生命周期和核心渲染树，但不改变 Runtime、LLM 或持久化协议。
- 关键操作：无
- 风险：Ink `Static` 内容提交后无法回写，错误的稳定边界会造成永久排版错误；timer 或 Goal 隔离不完整会引入迟到更新。
- 待确认：无

## 引言

当前 Session 只能把完整消息一次性写入 `Static`。本功能在 TUI 内引入可注入的流式 transcript 管道，使完整消息和未来 delta 共享同一套稳定边界、提交节奏与渲染路径，同时保留现有 Goal Snapshot 恢复语义。

## 需求

### 需求 1：严格的流式 Transcript 状态

**用户故事：** 作为 TUI 集成者，我希望流事件按明确生命周期更新 transcript，以便未来数据源可以安全接入而不会污染其他消息或 Goal。

#### 验收标准

1. <a id="req-1-1"></a> 当系统按 `started`、零个或多个 `delta`、`completed` 的顺序接收同一 `streamId` 的事件时，系统必须按到达顺序累积每个增量，并产生确定性的 transcript 快照。
2. <a id="req-1-2"></a> 当事件乱序、引用非活动 `streamId` 或在已有活动流时启动另一条流时，系统必须抛出稳定的协议错误，且不得把无效内容并入 transcript。
3. <a id="req-1-3"></a> 当 Goal 切换、Session 关闭或 controller 被释放时，系统必须取消提交 timer 并丢弃未完成流，且迟到事件不得更新新 Goal。
4. <a id="req-1-4"></a> 当调用方读取最终文本时，系统必须直接返回按事件累积的原始文本，不得从 Markdown 渲染块反向拼接。

### 需求 2：保守的 Markdown 稳定提交

**用户故事：** 作为终端用户，我希望只有不会再改变结构的 Markdown 内容进入历史，以便表格、代码块和段落在生成过程中保持正确排版。

#### 验收标准

1. <a id="req-2-1"></a> 当文本仍包含未结束行、未闭合围栏代码、未结束表格、段落、列表或引用时，系统必须把可能改变结构的内容保留在动态尾部。
2. <a id="req-2-2"></a> 当 collector 需要识别 Setext 标题或表格分隔行时，系统必须保留足够的前瞻内容，不能提前提交候选行。
3. <a id="req-2-3"></a> 当一个 Markdown block 已经稳定时，系统必须把它放入 pending queue；动态尾部必须同时显示 pending queue 与仍不稳定的文本，确保内容在等待提交时不消失。
4. <a id="req-2-4"></a> 当流完成时，系统必须把剩余内容作为最终 block 收束，并保证任意 delta 分块方式都得到相同的原始全文和等价 block 顺序。

### 需求 3：有节奏的不可变历史迁移

**用户故事：** 作为终端用户，我希望稳定内容平滑地从活动区域转入 scrollback，以便长回复既能立即阅读，又不会反复重绘既有历史。

#### 验收标准

1. <a id="req-3-1"></a> 当 pending queue 非空时，系统必须约每 40ms 提交一批 block，并依据积压量在每批 1 至 8 个之间自适应调整。
2. <a id="req-3-2"></a> 当 block 被提交时，系统必须在同一快照中把它加入 committed history 并从动态尾部移除，不得出现重复、丢失或空白闪烁。
3. <a id="req-3-3"></a> 当终端宽度变化时，系统只能按新宽度渲染动态尾部和后续内容，不得清除或重建已经进入原生 scrollback 的历史。

### 需求 4：Session 时间线集成

**用户故事：** 作为 LazyGoal 用户，我希望消息、步骤、活动尾部和输入区保持稳定顺序，以便在生成期间仍能理解完整执行上下文。

#### 验收标准

1. <a id="req-4-1"></a> 当当前 Session 新增完整 Assistant 消息时，系统必须把该消息转换为合成流，并通过稳定 block 与 commit tick 渐进提交。
2. <a id="req-4-2"></a> 当 Session 初次进入 executing 或恢复已有 Goal 时，系统必须把 Snapshot 中的完整消息直接初始化为 committed history，不得回放历史动画。
3. <a id="req-4-3"></a> 当新的用户消息或已完成步骤需要进入时间线且已有 Assistant 流尚未提交完时，系统必须先同步完成该流，再追加后续项目，以保持可观察顺序。
4. <a id="req-4-4"></a> 当 Session 渲染时，系统必须用 `Static` 承载有序 committed timeline，并在其下方依次渲染活动 tail、状态和 composer；Preparation 页行为必须保持不变。

### 需求 5：一致的 Markdown 表现

**用户故事：** 作为终端用户，我希望历史块与活动尾部使用相同的 Markdown 规则，以便内容迁移时不会发生语义或样式突变。

#### 验收标准

1. <a id="req-5-1"></a> 当渲染标题、段落、强调、行内代码、链接、列表、引用、围栏代码、分隔线或 GFM 表格时，历史与尾部必须使用同一渲染器。
2. <a id="req-5-2"></a> 当解析器遇到渲染器未专门支持的 token 时，系统必须保留其原始文本，不得静默丢弃用户内容。
3. <a id="req-5-3"></a> 当现有完整 Assistant 消息完成渐进提交后，导出的 transcript 文本必须与对应 canonical `GoalMessage.content` 逐字符一致。
