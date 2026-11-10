# 模型协议契约

本包定义模型输出协议、TS 单源、生成绑定组合与 Provider 投影。Agent 构造请求并验证决策，Runtime 决定是否接受、提交与恢复；本包不运行模型或持久化 Goal。

## 输出与投影

[公开入口](../src/index.ts) 导出决策、完成审查、工作记忆及上下文检索类型，以及请求级契约包、原生工具声明与生成决策校验。结构化 Provider Schema 由同源生成绑定投影；调用方仍需校验模型的实际响应，不把 Schema 约束当作完成证据。

## TS 单源与生成绑定

[TS 契约类型](../src/model-output/schema-types.ts) 是模型 canonical 输出与全部 system tool 输入字段、可选性和约束的单源；[绑定集合接口](../src/model-output/bindings.ts) 固定模型线从生成能力线接收的 `ContractBinding` 边界。模型根契约已按 `typescript-binding` 生成 Schema、Ajv standalone 校验器、Manifest 与绑定，产物位于 [`src/generated`](../src/generated)，并由 [generated-bindings.ts](../src/model-output/generated-bindings.ts) 装配为 `modelOutputBindings`。canonical `ToolCallAgentDecision` 的开放 `JsonValue` 输入不进入生成；`tool_call` 使用封闭的 `ToolCallDecisionEnvelope` 外壳并在组合时插入工具绑定。模型请求、原生工具声明、响应解码与 [Runtime 决策校验](../src/model-output/decision-validation.ts) 均消费这些生成绑定。

[Trigger 名称摘要契约](../src/trigger-name-summary.ts) 为包含语义正文的 work Trigger 提供封闭的模型输出结构，并通过 Catalog 生成 Schema、校验器与 binding。Goal Server 在持久化 Trigger 前校验摘要；名称只用于识别，原始 work material 仍是唯一工作来源。

[绑定组合器](../src/model-output/bound-factory.ts) 按请求阶段、Run 模式、任务批准状态与授权工具集合组合 Provider Schema、原生工具声明和解码。业务工具输入来自工具线提供的同一绑定；模型线不维护工具字段表。未知字段在分支确定后剥离，并通过可选 `onDiagnostic` 回报契约身份与有界路径；未声明键名统一替换为 `*`。已知字段、判别值、未授权工具和领域约束错误直接拒绝，不返回部分数据。原生工具参数省略可选字段时按 `null` 占位补齐，再复用同一 wire 解码；生成数组与整数注解保留在 Provider Schema 与本地解码中。

[Trigger 准入判断契约](../src/trigger-admission.ts) 定义 Supervisor 慢路径的接受或忽略结果及 shared/worktree 策略选择；模型不生成或改写 Goal 意图，原始 work material 保持唯一工作来源。模型结果不授予动作权限，生成绑定用于 Provider 结构投影与模型响应校验。

[Supervisor 权限判断契约](../src/trigger-permission-decision.ts) 只表达当前 Worker Action 的 approve/reject 决定。Wire 类型使用字符串枚举和显式 `null` 以满足可移植 Provider Schema；消费端再校验批准与拒绝的互斥字段组合。该结果不授予持续 Grant，也不改变工具输入或沙箱范围。

## 对话续接

[模型消息协议](../src/model-conversation.ts) 区分 system、user、assistant 和配对 tool 消息。原生续接身份包含 provider、端点、模型和协议；只有身份一致且响应已被 Runtime 接受并提交时，才可回放续接字段。Gemini 原始 Part 顺序和不透明签名不能改写；不支持的多模态 Part 在供应商边界拒绝。

`system_context_lookup` 仅查询 Goal 对话与执行历史，不搜索工作区文件。声明明确未命中不能证明仓库对象不存在，查询事件不能直接作为 Fact 或完成证据；需要仓库内容时使用获授权的业务工具。

## 阶段控制声明

阶段模型入口由 `createBoundRunStageToolDeclarations` 按请求快照生成：无执行中阶段时提供 `system_start_run_stage`，执行中提供 `system_revise_run_stage` 与 `system_complete_run_stage`。普通开始只接受目标和条件；获批 Plan 开始只接受空对象并复用下一待执行阶段的获批内容。三个工具不接受身份、版本或 Memory Patch；解码闭包绑定请求中的当前身份和修订，转换为 Runtime 内部命令。阶段完成必须提交证据数组，既有证据规则继续决定其有效性。

`RunPlanRouteCandidate` 生成绑定校验 Plan Run 阶段路线候选中的有序目标与验收条件。候选作为 `task_proposal` 的一部分提交，与任务范围及总体验收条件共用一次审批；候选不包含由 Runtime 管理的阶段身份、状态或恢复游标。

获批路线只在 Plan Run 的执行声明中暴露。`system_update_plan_route` 要求模型提供当前修订号、完整候选路线与具体理由；超出批准范围时一并提供用户审批请求。Runtime 保留已接受阶段并在检查点提交修订。
