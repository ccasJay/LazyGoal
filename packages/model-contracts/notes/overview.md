# 模型协议契约

本包在通用 [Contracts](../../contracts/README.md) 的 AST 与解析器之上定义模型输出协议。Agent 构造请求并验证决策，Runtime 决定是否接受、提交与恢复；本包不运行模型或持久化 Goal。

## 输出与投影

[公开入口](../src/index.ts) 导出决策、完成审查、工作记忆及上下文检索的结构契约，以及 Wire 与 Canonical 输出之间的投影。结构化 Provider Schema 由这些契约编译；调用方仍需校验模型的实际响应，不把 Schema 约束当作完成证据。

## TS 单源与生成绑定（迁移准备）

[TS 契约类型](../src/model-output/schema-types.ts) 是模型 canonical 输出与全部 system tool 输入字段、可选性和约束的迁移目标单源；[绑定集合接口](../src/model-output/bindings.ts) 固定模型线从生成能力线接收的 `ContractBinding` 边界。Catalog 已登记这些声明，但真实生成尚未启用：生成能力线仍需支持判别联合、可递归 JSON、整数区分、数组长度与元素约束，之后才能以 `typescript-binding` 生成根绑定与模型投影。启用前生产仍消费现有 Contract AST，组合能力以隔离替身验证，不构成联合切换。

[绑定组合器](../src/model-output/bound-factory.ts) 按请求阶段、Run 模式、任务批准状态与授权工具集合组合 Provider Schema、原生工具声明和解码。业务工具输入来自工具线提供的同一绑定；模型线不维护工具字段表。未知字段在分支确定后剥离，并通过可选 `onDiagnostic` 回报契约身份与有界路径；已知字段、判别值、未授权工具和领域约束错误直接拒绝，不返回部分数据。

真实生成启用与生产联合切换的剩余条件见[联合切换前置条件](./pending-generation.md)。

## 对话续接

[模型消息协议](../src/model-conversation.ts) 区分 system、user、assistant 和配对 tool 消息。原生续接身份包含 provider、端点、模型和协议；只有身份一致且响应已被 Runtime 接受并提交时，才可回放续接字段。Gemini 原始 Part 顺序和不透明签名不能改写；不支持的多模态 Part 在供应商边界拒绝。

`system_context_lookup` 仅查询 Goal 对话与执行历史，不搜索工作区文件。声明明确未命中不能证明仓库对象不存在，查询事件不能直接作为 Fact 或完成证据；需要仓库内容时使用获授权的业务工具。

## 阶段控制声明

阶段模型入口由 `createRunStageToolDeclarations` 按请求快照生成：无执行中阶段时提供 `system_start_run_stage`，执行中提供 `system_revise_run_stage` 与 `system_complete_run_stage`。普通开始只接受目标和条件；获批 Plan 开始只接受空对象并复用下一待执行阶段的获批内容。三个工具不接受身份、版本或 Memory Patch；解码闭包绑定请求中的当前身份和修订，转换为 Runtime 内部命令。阶段完成必须提交证据数组，既有证据规则继续决定其有效性。

`RunPlanRouteCandidateContract` 校验 Plan Run 阶段路线候选中的有序目标与验收条件。候选作为 `task_proposal` 的一部分提交，与任务范围及总体验收条件共用一次审批；候选不包含由 Runtime 管理的阶段身份、状态或恢复游标。

获批路线只在 Plan Run 的执行声明中暴露。`system_update_plan_route` 要求模型提供当前修订号、完整候选路线与具体理由；超出批准范围时一并提供用户审批请求。Runtime 保留已接受阶段并在检查点提交修订。
