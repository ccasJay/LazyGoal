# Action/Observation Loop 需求

## 引言

本功能将执行阶段扩展为可恢复的 Action/Observation Loop，使 Agent 能调用 Profile 授权的真实 Tool、依据可信执行结果连续推进任务，并在外部副作用、风险审批和 Session 恢复之间保持明确一致的行为；首批仅提供工作区内的只读 `read_file` Tool。

## 需求

### 需求 1：结构化执行决策

**用户故事：** 作为 Agent 使用者，我希望每轮执行产生明确的 Action 或结束决策，以便系统能够可靠地区分“准备做什么”和“任务结果是什么”。

#### 验收标准

1. <a id="req-1-1"></a> 当执行中的 Agent 决定调用 Tool 时，系统必须得到包含稳定 `actionId`、`toolId`、结构化参数和非空累计 checkpoint 的单个 Action 决策。
2. <a id="req-1-2"></a> 当执行中的 Agent 不需要调用 Tool 时，系统必须只接受完成、等待或失败中的一个结构化结束决策。
3. <a id="req-1-3"></a> 如果模型输出不是合法 JSON、包含协议外字段、字段为空或分支不匹配，系统必须返回可识别的协议失败，且不得调用任何 Tool 或推进 Step。

### 需求 2：Tool 授权与首个真实能力

**用户故事：** 作为 Agent 使用者，我希望 Agent 只能执行明确授权的 Tool，以便真实能力保持最小且可控。

#### 验收标准

1. <a id="req-2-1"></a> 当 Action 指向的 `toolId` 不在冻结 Profile 的 `toolIds` 中时，系统必须在任何 Tool 调用前拒绝该 Action，并以可识别的授权失败停止当前 Run。
2. <a id="req-2-2"></a> 当已授权 Tool 不存在或 Action 参数不符合该 Tool 的输入协议时，系统必须在产生外部作用前以可识别的执行协议失败停止当前 Run。
3. <a id="req-2-3"></a> 当 `read_file` 获得工作区内的合法文件路径时，系统必须读取真实文件内容，并将读取结果作为成功 Observation 返回。
4. <a id="req-2-4"></a> 如果 `read_file` 请求绝对路径、路径穿越或工作区外目标，系统必须在读取前拒绝请求，并且不得暴露目标内容。

### 需求 3：可恢复的 Action 生命周期

**用户故事：** 作为恢复 Session 的使用者，我希望 Tool 调用前后的状态都被可靠保存，以便进程中断后不会静默遗失已经发起的 Action。

#### 验收标准

1. <a id="req-3-1"></a> 当一个 Action 通过协议、授权和参数校验后，系统必须先将其作为当前 `pendingAction` 与本次决策返回的 checkpoint 一同成功保存，再允许 Tool 执行。
2. <a id="req-3-2"></a> 如果保存 `pendingAction` 失败，系统必须传播持久化错误并停止处理，且不得调用 Tool。
3. <a id="req-3-3"></a> 当 Tool 返回 Observation 时，系统必须在同一次快照更新中保存最新 Action/Observation、保留本次决策的 checkpoint、清除对应 `pendingAction` 并完成本 Step。
4. <a id="req-3-4"></a> 如果 Observation 的快照保存失败，系统必须停止连续执行，使标准恢复仍能看到对应的 `pendingAction`，且不得假定该 Action 未执行。

### 需求 4：风险审批与用户控制

**用户故事：** 作为 Agent 使用者，我希望高风险 Action 在执行前等待明确批准，以便连续执行不会越过安全边界。

#### 验收标准

1. <a id="req-4-1"></a> 当执行策略判定 Action 可自动执行时，系统必须在保存 `pendingAction` 后继续调用 Tool，无需用户确认。
2. <a id="req-4-2"></a> 当执行策略判定 Action 需要批准时，系统必须在调用 Tool 前进入 `blocked`，保存待批准 Action，并向调用方暴露可识别的批准等待状态。
3. <a id="req-4-3"></a> 当用户批准待执行 Action 时，系统必须继续执行相同 `actionId` 的 Action，且批准操作本身不得增加 `stepCount`。
4. <a id="req-4-4"></a> 当用户拒绝待执行 Action 时，系统不得调用 Tool，必须将拒绝保存为可供下一轮 Agent 使用的 Observation，并允许 Agent 决定替代方案或结束任务。

### 需求 5：可信 Observation 与失败分层

**用户故事：** 作为 Agent 使用者，我希望 Agent 根据真实 Tool 结果自行修正可恢复错误，同时让系统故障保持可见，以便连续性不会掩盖基础设施问题。

#### 验收标准

1. <a id="req-5-1"></a> 当 Tool 正常完成时，系统必须生成由执行环境提供的成功 Observation，模型不得自行声明该 Action 的执行结果。
2. <a id="req-5-2"></a> 当 Tool 正常返回文件不存在或其他领域失败时，系统必须将其保存为失败 Observation，并在下一轮交给 Agent 判断后续 Action，而不是立即终止 Run。
3. <a id="req-5-3"></a> 当发生 Tool 越权、协议损坏或执行基础设施异常时，系统必须停止当前 Run 并保存可识别的失败，不得把该错误伪装成普通 Observation。

### 需求 6：有界 Working Context

**用户故事：** 作为长时间运行任务的使用者，我希望 Agent 保留足够的累计执行状态且不会无限扩张快照，以便 `maxSteps = 0` 时仍能长期运行。

#### 验收标准

1. <a id="req-6-1"></a> 当系统构造下一轮执行请求时，必须包含当前累计 checkpoint、最近一个已完成 Action/Observation，以及存在时的 `pendingAction`，且不得把这些控制数据追加为真实会话消息。
2. <a id="req-6-2"></a> 当 Agent 产生下一次结构化决策时，必须同时返回已吸收上一轮 Observation 的非空累计 checkpoint。
3. <a id="req-6-3"></a> 当 Step 持续增长时，Goal 最新快照必须只保留累计 checkpoint、最近 Step 和当前 `pendingAction`，不得在本功能中累积完整 Action/Observation 轨迹。

### 需求 7：Step 与执行预算

**用户故事：** 作为 Agent 使用者，我希望 Action/Observation 的引入不破坏现有 Step 预算语义，以便执行限制仍然可预测。

#### 验收标准

1. <a id="req-7-1"></a> 当一个 Action 获得 Observation 并成功保存时，系统必须将整个“Agent 决策、Action、Observation”周期计为一个 Step。
2. <a id="req-7-2"></a> 当 Agent 的完成、等待或失败决策成功保存时，系统必须将该决策周期计为一个 Step。
3. <a id="req-7-3"></a> 当 Action 等待批准、恢复执行或重放同一 `actionId` 时，系统不得为同一决策重复增加 `stepCount`。
4. <a id="req-7-4"></a> 当 `maxSteps` 为正数并已达到上限时，系统必须在产生下一次 Agent 决策前停止；当 `maxSteps` 为 `0` 时，系统不得因 Step 数量停止执行。

### 需求 8：中断恢复与快照兼容

**用户故事：** 作为已有 Goal 的使用者，我希望升级后仍能恢复旧 Session 和中断中的 Action，以便引入真实 Tool 不会破坏持久化连续性。

#### 验收标准

1. <a id="req-8-1"></a> 当恢复到没有 Observation 的 `pendingAction` 时，系统必须保留原 `actionId`；只有 Tool 声明可安全重放时才能自动重试，否则必须保持阻塞并等待用户决定。
2. <a id="req-8-2"></a> 当可安全重放的 `read_file` Action 被恢复时，系统必须使用相同 `actionId` 重新执行，并且最终只完成一个 Step。
3. <a id="req-8-3"></a> 当系统恢复升级前的合法 Goal 快照时，必须确定性补齐新的执行状态，使原工作流、消息、Run 状态、`stepCount` 和最近结果保持等价。
4. <a id="req-8-4"></a> 当旧快照被转换时，恢复操作本身不得改写持久化数据；只有后续正常业务保存成功后才能写入新协议版本。
