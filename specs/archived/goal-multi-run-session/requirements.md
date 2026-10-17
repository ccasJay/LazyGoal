# Goal 计划模式与多 Run 会话需求

## 审批摘要

### 目标

让 Goal 同时承担持续会话和结构化计划容器的职责：Goal 是一个可持续恢复的会话，Runtime 通过后端 Plan Mode 控制何时启用 GoalPlan；GoalPlan 持有带稳定 ID 的 Todo，单个执行 Run 承接一个 Todo，TUI 和模型输入都从同一份已提交状态投影。

### 范围

- 包含：`/plan` Slash Command、Runtime 拥有的 Plan Mode、仅在 Plan Mode 中创建或更新 GoalPlan、稳定 Todo ID、增量状态更新、Plan Mode 下一个 Todo 对应一个 Run、普通模式的无计划多 Run 续写、完成状态持久化、完成后的新 Run、TUI 计划面板及重启恢复。
- 不包含：独立 Thread、并行 Run、多层 Phase、Todo 依赖图、跨进程事务锁、计划 Markdown 解析、普通输入触发计划、模型输出自行切换 Plan Mode、自动判断两个用户输入是否语义相关、动态扩展 Profile 权限、退出 Plan Mode 的新命令。

### 核心行为

- 普通模式不创建、不更新也不投影 GoalPlan；普通执行仍可使用现有 Working Memory 中的内部 `plan`，但它不属于 GoalPlan，也不能替代 GoalPlan。
- `/plan` 是唯一的 Plan Mode 入口。Runtime 接受无参数 `/plan` 后，在安全输入边界原子激活 Plan Mode，并初始化或恢复 GoalPlan；该命令本身是控制输入，不追加为 Goal 消息或 Run Step。
- GoalPlan 是 Runtime 的唯一计划状态源；Todo 具有 Runtime 分配的稳定 ID 和 `pending`、`in_progress`、`completed`、`cancelled` 状态。只有 Plan Mode 下的结构化计划操作可以改变这些状态。
- 模型通过专用计划操作增量创建或更新 Todo，不能把完整数组当普通消息覆盖；Runtime 校验状态转换、分配 ID、递增 plan revision 并持久化。
- 一个执行 Run 只承接一个 Todo；同一 Goal 同时最多一个 `in_progress` Todo。Run 完成且当前证据通过后，Runtime 将该 Todo 标记为 `completed`。
- Plan Mode 下的执行 Run 只承接一个 GoalPlan Todo；同一 Goal 同时最多一个 `in_progress` Todo。Run 完成且当前证据通过后，Runtime 将该 Todo 标记为 `completed`。
- Run 未完成时用户补充信息属于当前 Run；Run 完成后用户新输入直接创建新 Run，不分析自然语言是否与旧 Run 属于同一任务。普通模式的新 Run 不创建或隐式 materialize GoalPlan。
- UI 不维护第二份 Todo 状态，只在 Plan Mode 中投影 Goal Snapshot；计划更新、Run 进度和恢复都必须反映同一份已提交状态。

### 风险与待确认

- 风险等级：high；变更涉及 Goal Snapshot、Slash Command 到 Runtime 的模式边界、模型可调用的计划操作、完成证据和 TUI 状态一致性。
- 关键操作：无；本 Spec 不授权删除数据、真实外部副作用或跨进程并发写入。
- 风险：模式状态若由 UI 或模型自行维护，会导致普通执行意外产生 GoalPlan；模型也可能提出无效的 Todo 更新或错误宣称完成。Runtime 必须拒绝未进入 Plan Mode 的计划操作、未知 ID、非法转换和缺少当前 Run 证据的完成声明。计划规模增大时 Snapshot 与模型输入会增长，需要固定容量限制。
- 待确认：无；本版本采用 Cursor 风格的稳定 ID 和 `completed` 保留语义，`/plan` 只定义进入 Plan Mode，退出命令另行设计。整包需求仍待审查。

## 引言

本功能把 GoalPlan Todo 从 Working Memory 中独立出来，提升为 Goal 的一等结构化状态。Goal 保存计划和会话历史，Run 只负责执行一个被选中的 Todo，Step 继续表示 Run 内的一次执行推进。Plan Mode 是后端状态边界：没有接受 `/plan`，普通 Goal 不会 materialize GoalPlan；接受后，计划操作、计划持久化和计划面板才生效。

## 需求

### 需求 1：通过 `/plan` 激活后端 Plan Mode

**用户故事：** 作为用户，我希望只有明确进入计划模式后才生成 GoalPlan，避免普通执行意外改变 Goal 计划。

#### 验收标准

1. <a id="req-1-1"></a> 当用户提交无参数 `/plan` 且当前没有模型或 Tool 正在执行时，Slash Command Registry 必须识别该命令，Runtime 必须在同一提交边界将 Goal 的模式设为 `plan`，并初始化或恢复 GoalPlan。
2. <a id="req-1-2"></a> 当用户提交带参数的 `/plan`、未知 Slash Command 或当前 Run 正在执行模型/Tool 时，系统必须拒绝本次命令，不得追加 Goal 消息、创建 Run、改变模式或修改 GoalPlan。
3. <a id="req-1-3"></a> 当普通模式收到用户文本、模型输出或计划工具请求时，系统不得创建、更新或持久化 GoalPlan；模型不得通过输出自行进入 Plan Mode。
4. <a id="req-1-4"></a> 当 Goal 在 Plan Mode 下重启或恢复时，Runtime 必须从 Goal Snapshot 恢复模式和 GoalPlan；未进入 Plan Mode 的 Goal 不得因恢复、TUI 打开或普通 Runner 推进而 materialize GoalPlan。

### 需求 2：Goal 持有唯一的 GoalPlan 状态

**用户故事：** 作为用户，我希望计划和执行状态被统一保存，以便 TUI、模型和恢复流程看到一致的 Todo 清单。

#### 验收标准

1. <a id="req-2-1"></a> 当 Goal 处于 Plan Mode 且计划首次生成时，系统必须在 Goal 状态中保存带稳定 ID 的 Todo 项、内容、顺序和状态；计划不得只存在于聊天消息或 TUI 内存。
2. <a id="req-2-2"></a> 当 Runtime 返回处于 Plan Mode 的 Goal Snapshot 时，系统必须包含当前 plan revision 和完整 GoalPlan；同一 Todo ID 在一个 Goal 内必须唯一且在恢复后保持不变。
3. <a id="req-2-3"></a> 如果 Snapshot 中存在重复 Todo ID、非法状态、重复顺序、非法模式或不符合当前 plan revision 契约的数据，Storage 必须拒绝恢复，不得猜测或静默修复。

### 需求 3：使用稳定 ID 的增量计划操作

**用户故事：** 作为 Agent Runtime，我希望模型按 Todo ID 修改单个计划项，以便长会话中更新计划不会意外丢失其他项。

#### 验收标准

1. <a id="req-3-1"></a> 当 Plan Mode 下的模型创建计划项时，Runtime 必须为每项分配稳定 ID，并返回或投影包含该 ID 的当前计划；模型不得自行决定持久化 ID。
2. <a id="req-3-2"></a> 当 Plan Mode 下的模型更新 Todo 时，系统必须根据 ID 应用单项增量变更，保留未被操作引用的其他 Todo；未知 ID、重复 ID 或无法匹配当前 revision 的更新必须被拒绝。
3. <a id="req-3-3"></a> 当模型请求添加、取消、重排或更新 Todo 时，Runtime 必须将变更作为结构化计划事实保存，不得把模型文本或聊天消息解析成计划状态。
4. <a id="req-3-4"></a> 当计划操作违反容量限制、状态转换规则或单个 `in_progress` 约束时，系统必须原子拒绝整次操作，原计划和 plan revision 保持不变；普通模式下的同类操作也必须拒绝。

### 需求 4：Plan Mode 下一个 Todo 对应一个执行 Run

**用户故事：** 作为用户，我希望每个计划项都有清晰的执行边界，以便知道哪个 Run 正在负责哪个 Todo。

#### 验收标准

1. <a id="req-4-1"></a> 当 Runtime 在 Plan Mode 下开始执行一个 GoalPlan Todo 时，系统必须创建或绑定一个唯一 Run，并记录该 Run 的 `todoId`；一个执行 Run 不得承接多个 Todo。
2. <a id="req-4-2"></a> 当一个 GoalPlan Todo 已由 Run 执行时，系统必须将其状态设为 `in_progress`；在当前 Run 结束前，系统不得同时将另一个 Todo 设为 `in_progress`。
3. <a id="req-4-3"></a> 当绑定 GoalPlan Todo 的 Run 等待用户回答、Action 审批或外部恢复时，当前 Todo 必须保持 `in_progress`，恢复操作必须继续同一个 Run 和 Todo。
4. <a id="req-4-4"></a> 当绑定 GoalPlan Todo 的 Run 完成且当前 Todo 的完成证据通过时，Runtime 必须在同一提交边界把 Run 置为 `completed` 并把 Todo 置为 `completed`；Run 失败或取消时不得把 Todo 伪装成 `completed`，而应保留为可重试的 `pending`、阻塞等价状态或用户指定的 `cancelled`。

### 需求 5：按状态决定同 Run 或新 Run

**用户故事：** 作为用户，我希望补充信息能够恢复当前工作，而完成后新的指令从新的执行边界开始。

#### 验收标准

1. <a id="req-5-1"></a> 当当前 Run 处于可交互的 `waiting` 状态时，用户回答、补充信息、审批或反馈必须恢复当前 Run，不得创建新的 Run 或改变其 `todoId`。
2. <a id="req-5-2"></a> 当当前 Run 处于 `completed` 状态且用户提交非空新指令时，系统必须在同一 Goal 内创建新的 Run；如果 Goal 处于 Plan Mode，该 Run 必须承接一个待执行 GoalPlan Todo；如果 Goal 处于普通模式，该 Run 不得创建或隐式 materialize GoalPlan。两种模式都不得进行自然语言语义判断来决定是否复用旧 Run。
3. <a id="req-5-3"></a> 当模型或 Tool 正在执行时，用户输入不得直接并发注入当前执行；受控中断必须先到达安全检查点并进入等待状态，之后的补充信息才属于同一 Run。
4. <a id="req-5-4"></a> 当输入为空、当前 Run 非 `waiting`/`completed`，或 Goal 处于 Plan Mode 且没有可承接的合法 Todo 时，继续请求必须失败且不得追加消息、改变计划或调用模型/Tool。

### 需求 6：Todo 更新、完成证据与历史恢复

**用户故事：** 作为用户，我希望计划勾选反映真实执行结果，并在重启后恢复相同的计划和 Run 关系。

#### 验收标准

1. <a id="req-6-1"></a> 当 Todo 从 `pending` 进入 `in_progress`、`completed` 或 `cancelled` 时，系统必须保存对应的结构化计划事实和当前 Snapshot；聊天消息不得替代这些事实。
2. <a id="req-6-2"></a> 当模型请求将 Todo 置为 `completed` 时，Runtime 必须确认该 Todo 当前绑定的 Run 存在、Run 处于完成路径且已有允许的当前 Run Evidence；否则必须拒绝完成状态。
3. <a id="req-6-3"></a> 当进程在 Run 完成、计划更新或 Snapshot 提交后退出时，重新打开 Goal 必须恢复 Todo 状态、plan revision、Run/todo 关联和已提交步骤，不得重复执行或丢失勾选结果。
4. <a id="req-6-4"></a> 当计划事实、Run 归属、提交边界或 Evidence 来源缺失、损坏或跨 Goal 不匹配时，恢复必须 fail closed，不得从未提交尾部推断 Todo 已完成。

### 需求 7：TUI 和模型共享计划投影

**用户故事：** 作为用户，我希望看到的 Todo 清单与 Agent 实际使用的计划完全一致。

#### 验收标准

1. <a id="req-7-1"></a> 当 GoalPlan 发生已提交更新且 Goal 处于 Plan Mode 时，TUI 必须从最新 Goal Snapshot 投影 Todo 的 ID、内容、顺序和状态，并显示当前 Run 负责的 Todo；普通模式不得显示一个由猜测生成的 GoalPlan 面板。
2. <a id="req-7-2"></a> 当 Todo 状态为 `pending`、`in_progress`、`completed` 或 `cancelled` 时，TUI 必须分别显示稳定且可区分的状态，不得通过解析 assistant 文本推断勾选。
3. <a id="req-7-3"></a> 当 TUI 恢复或收到迟到的旧 Run 通知时，系统必须按 Goal/Run/plan revision 丢弃过期投影，不得回退当前计划或覆盖新 Run 的低序号 Step；用户在 TUI 提交新指令或计划反馈时，Controller 必须先通过 Runtime 保存真实输入和结构化计划变更，再刷新面板。

### 需求 8：保持现有执行与权限边界

**用户故事：** 作为 Runtime 调用方，我希望 Todo 计划增强可见性，但不绕过现有 Runner、Evidence 和 Tool Policy。

#### 验收标准

1. <a id="req-8-1"></a> 当 Headless 或 Benchmark 推进一个 Run 时，调用必须继续在该 Run 的等待点或终态返回，不得因为 Plan Mode 下的 GoalPlan 仍有 `pending` Todo 而自动执行下一个 Run；普通模式也不得因没有 GoalPlan 而自动创建计划。
2. <a id="req-8-2"></a> 当 Todo 更新请求到达时，Runtime 必须继续执行现有 Tool Registry、Profile 权限、Action approval 和瞬时授权规则；计划状态不能授予 Tool 权限。
3. <a id="req-8-3"></a> 当旧 Run 的历史 Lookup 命中一个已完成 Todo 时，历史结果不得直接成为当前 Run 的完成 Evidence 或当前外部事实。
4. <a id="req-8-4"></a> 当 Goal、Run、Todo 或计划协议版本不受支持时，系统必须拒绝模型/Tool 推进，并保持现有安全关闭和 fail-closed 行为。
