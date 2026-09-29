# Runtime 错误恢复与 Tool 授权审批设计

## 审批摘要

### 方案

Runner 继续拥有 Action、阶段循环和提交顺序；在现有 Tool Policy 之后增加按操作匹配的授权查询，并将可纠正错误归一化为 `RuntimeFeedback`。Goal/Run 的恢复事实与项目授权分别持久化，只有可靠提交的审批和恢复状态可以驱动后续模型或 Tool 调用。

### 关键决策

| 决策 | 选择与理由 | 影响 |
| --- | --- | --- |
| 授权匹配与期限 | 单次绑定 Action；会话绑定 Goal；项目绑定 workspace。`bash` 匹配完整命令及执行参数，`write_file`/`edit_file` 匹配同一规范化目标路径，其他需审批 Tool 匹配完整规范化输入 | 用户批准同一路径后，不同写入内容也会自动放行；不同命令、路径或项目重新审批 |
| 审批提交与恢复 | 工作区私有授权账本使用待生效、有效、已撤销状态；持久授权与当前 Action 的批准按可恢复顺序提交，执行前确认两者有效 | 崩溃不会凭未完成授权放行；撤销影响后续 Action；YOLO 与结果不确定的人工重放不生成持续授权 |
| 错误分类与次数 | 按明确错误类别选择系统重试、模型纠错、人工等待或失败；每条重试链最多三次调用，默认拒绝未知错误 | 避免无限费用和重复副作用；正常的多轮 `request_think` 不受此上限影响 |
| RuntimeFeedback 与阶段重试 | 用独立反馈对象保存可定位、有限且无原始敏感输出的修复信息；按 Decide/Think 原阶段重试并提交恢复指针 | 已提交 Think 得以复用，无效响应不会进入真实消息、有效决策或 Tool 执行 |
| Tool 重试与人工等待 | 只有 `safe` Tool 的临时故障自动重试同一 Action；已知业务失败仍形成 Observation，`manual` 结果不确定仍等待用户 | 授权不等于重放许可，已完成 Tool 不会因模型纠错再次执行 |
| 前端投影与撤销 | 浏览器与 TUI 展示本次输入、授权后果和恢复状态，提供授权列表与撤销；原始无效模型输出仅留在受限诊断通道 | 用户可分辨自动处理与等待，并能收回未来操作权限 |
| 当前协议更新 | 更新开发期当前 Snapshot/Trajectory/交互协议，不叠加旧版本迁移；不改变既有 YOLO 和只读默认策略 | 旧开发期数据按仓库策略拒绝或重建，实施时需同步当前架构文档 |

### 风险与待确认

- 风险等级：high；项目级权限、写入副作用与恢复状态跨 Runtime、Storage、Browser、TUI 和 Agent。
- 关键操作：Design 阶段无外部执行操作。
- 风险：同一路径的写入授权允许不同内容，审批界面必须显式说明；项目授权与 Goal 快照跨两个持久化边界，任一步失败都不能提前执行 Tool；多次模型调用增加费用。
- 待确认的设计决策：无。

## Overview

本设计覆盖[需求 1–7](requirements.md#需求)。保留冻结 Profile、Tool 输入 Contract、现有 Policy、`pendingAction` 和 Action ID 边界；授权只消除匹配操作的人工等待。恢复路由位于 Runner 与阶段执行器之间，模型只收到修复所需反馈，不能据此授予自己权限。

## Architecture

```text
Browser / TUI -- approve(scope) / revoke --> GoalCoordinator
                                            |-- Goal Snapshot + Trajectory
                                            `-- ToolGrantStore (workspace)
Runner -- prepare + Policy + Grant lookup --> approved Action / approval wait
       |-- RecoveryRouter --> system retry / RuntimeFeedback / user wait / fail
       |-- StepExecutor(Decide / Think) --> LLM Adapter
       `-- ToolRegistry --> Observation
```

`ToolGrantStore` 只保存用户授权，不修改 Goal；Runner 在每个新 Action 执行前重新评估 Profile、输入 Contract、Tool Policy 和授权。`RecoveryRouter` 是 Runner 内的纯分类与预算决策，不执行模型、Tool 或持久化；Runner 按其结果提交检查点并调用相应边界。

## Key Design Decisions

### 授权匹配与期限

默认 Policy 继续自动放行 `read_file`、`grep`。其余 Tool 先完成 Profile/Registry 解析、输入 Contract 与 Tool 语义校验，再评估 Policy；Policy 要求审批时，Runner 查询有效 Grant。Grant 不覆盖拒绝、未知 Tool、无效输入或 Profile 越权。Grant 的 `scope` 为 `action`、`goal`、`workspace`：`action` 沿用当前瞬时 `authorizedActionId`，后两者保存在工作区授权账本并分别限定 `goalId` 或 `workspaceId`，跨 Run/进程有效。

匹配器按 Tool ID 和当前版本化规则生成：`bash` 对规范化 `command` 及 `timeoutMs` 的完整输入取等值；`write_file`、`edit_file` 对工作区内同一规范化目标路径取等值，忽略新旧文本和写入内容；其他需审批 Tool 对完整规范化输入取等值。路径先按 Tool 自身的工作区规则校验，再绑定到解析后的目标身份；新文件使用已解析父目录加文件名，符号链接改指其他目标时不匹配原 Grant，执行时仍重新检查工作区边界。匹配规则版本变化时旧 Grant 不匹配，避免 Tool 语义改变后扩大权限。首版不支持任意命令通配符、目录范围或用户手写规则。

审批预览对写入 Tool 明示“允许今后在此路径写入不同内容”，对 `bash` 明示完整命令及执行参数；初始预览被截断时，界面提供受同一 Action 身份保护的完整详情，查看前不允许提交持续授权。授权账本只保存匹配所需字段、来源身份和有界显示信息，不复制 `write_file` 内容或 `edit_file` 新旧文本；工作区数据保持在 LazyGoal Home 的私有目录。YOLO 控制器仍按 Action 自动批准，不创建 Grant；`outcome_unknown` 的人工重放也只批准该 Action，不扩大期限。

### 审批提交与恢复

`ToolGrantStore` 是工作区级 Port；Storage 使用现有 `workspaceId` 对应的 LazyGoal Home 目录、当前版本 JSON 与原子替换写入。Grant 以 `(goalId, runId, actionId)` 作为创建幂等来源，拥有 `pending`、`active`、`revoked` 状态。Coordinator 在校验当前等待身份后：

```text
需要持续授权：stage Grant(pending) -> commit action_approved + pendingAction.approved
             -> activate Grant -> schedule(authorizedActionId)
仅本次授权： commit action_approved + pendingAction.approved
             -> schedule(authorizedActionId)
```

待生效 Grant 从不参与权限匹配。`pendingAction` 记录 `grantId` 与审批期限；如果在 Goal 提交前中断，孤立的待生效 Grant 不授权。提交后若激活失败，Coordinator 不调度 Tool；恢复时先校验当前 Goal/Run/Action 与 Grant 来源并完成激活，再沿现有 `safe`/`manual` 恢复规则处理 Action。所有写入和激活按来源幂等；身份冲突或损坏一律失败封闭。单次 Action 批准及已开始执行的 Action 不因日后撤销而回滚；撤销写入成功后，新 Action 查询立即排除该 Grant。当前单进程 Goal 串行边界保持不变，不声称跨进程分布式事务保证。

浏览器命令与 TUI Controller 只传 `actionId`、期限及当前 Run 身份；授权匹配器由 Runtime 从已准备的 Action 派生，客户端不能自报匹配范围。撤销命令带 `grantId` 和作用域身份，重复撤销幂等，过期或跨 workspace 请求拒绝。Grant 列表仅按当前 Goal/workspace 投影，不暴露其他项目。

### 错误分类与次数

`RecoveryRouter` 只接受显式类型化的失败，默认 `fatal`。模型边界将 429、可用的 `Retry-After`、暂时性 5xx、连接断开和超时归为 `transient_model`；401/403、配置、请求 Schema 拒绝与未知异常不重试。Agent/Runner 在副作用前产生的解析、Contract、Tool 选择/输入、Run 能力与 Evidence 错误归为 `model_repair`；Tool Policy 的 `require_approval` 是 `wait_approval`，不是模型修复。已知 Tool 业务失败仍按 Observation 路径。分类发生在具体校验调用点，不通过宽泛的错误码把存储故障或不变量异常误判为可修复。

系统模型请求、同一安全 Tool Action、同一阶段的无效模型输出分别有独立的三次调用上限，包含首次调用；每次失败和下一次调用前保存类型、阶段、次数、稳定原因和输入边界。暂时性请求按指数退避并对 `Retry-After` 设上界，中止可打断等待；适配器若已有内部重试，必须关闭它或将其作为唯一有界重试层，不能叠加到应用层三次上限之外。有效 `request_think` 结束当前 Decide 纠错链，新的 Think/Decide 链各自重新计数，不给正常 Think 循环增加总次数或 token 上限。

### RuntimeFeedback 与阶段重试

在 Runtime 定义不可变 `RuntimeFeedback`，承载 `origin`、`stage`、`code`、有界 `issues(path/message)`、可用选项或证据序号、`attempt` 与所属 Step 身份；Agent 的解析失败通过类型化阶段错误带出相同结构。Runner 将 Tool 输入、决策语义和 Evidence 错误映射为同一反馈，过滤敏感原文并限制长度。反馈作为标明 `source: runtime_feedback` 的阶段输入消息发送，不写入真实 Goal Conversation、动态 section 或已接受的决策；原始无效响应仅可进入现有受限诊断 Trace。

Runner 在反馈提交后才重试原阶段：Decide 保留已提交 `thinkHistory`，Think 保留先前 `think_requested` 的明确目标，均不重新执行已完成阶段。Run 保留指向当前 Step、阶段、输入边界、次数和最新反馈事实的恢复指针；Trajectory 保存每次开始/失败事实，Snapshot `committedThroughSequence` 决定可重放范围。启动调用先计入次数，崩溃中的调用视为已用一次；未提交的响应、反馈或模型可见 frame 不进入恢复历史。重建身份或阶段输入不匹配时失败，不用旧反馈污染新 Step。纠错再次经过原 Contract、Tool 和 Evidence 校验；三次仍无效则以稳定原因结束 Run。

### Tool 重试与人工等待

Tool 执行前仍先提交 `pendingAction`。仅当失败被识别为临时故障、注册 Tool 的 `replayPolicy` 为 `safe` 且同一 Action 已获准时，Runner 使用原 `actionId` 自动重试；`Observation.retryable` 不能单独授权重放。每次开始先提交次数，再调用 Tool；失败后提交原因，崩溃恢复只从 Snapshot 边界继续剩余次数。三次耗尽或不可判定的异常明确停止自动执行并保留诊断，不把未知成功伪装成普通业务失败。

Tool 返回已知业务 `failure` 时按现有路径提交 Observation，后续模型可提出替代 Action；新 Action 再次走完整授权匹配。`manual` Tool 执行结果未知时保持 `outcome_unknown` 等待，即使已有会话/项目 Grant 或处于 YOLO；用户必须对原 Action 明确作出恢复选择。缺资料仍走 `ask_user`，等待点不触发模型或 Tool。已提交 Observation 和 Think 不因后续错误被撤销或重做。

### 前端投影与撤销

Browser 的当前 `pendingAction` 投影新增有界 Tool 输入预览与授权范围说明；当前待审批 Action 的完整输入通过单独的受令牌、Goal/Run/Action 身份限制的详情查询按需读取，不返回完整 Goal、Profile 或通用 Tool 输出。审批提交扩展期限枚举，服务端复核身份；新增当前会话/项目 Grant 的列举与撤销命令。TUI 的 Confirm 面板显示同样的三档选择并允许查看完整当前输入，YOLO 快捷切换及自动批准保持原行为；恢复结果未知的面板维持单次确认。两端对写入路径授权都显式提示后续内容可能不同。

执行流增加尝试开始、反馈已提交和等待原因的安全摘要；Snapshot/Trajectory 仍是刷新后的权威。每次模型纠错有独立尝试身份，浏览器/TUI 清理前一次无效响应的临时文本，只把有效提交结果放入完成时间线；失败时展示稳定原因与可查看的有界尝试记录，不把原始 JSON 或秘密输出放进公开投影。

### 当前协议更新

更新当前 Goal Snapshot/Trajectory 的授权引用、恢复指针和尝试事实，以及 Browser 命令协议和 TUI ViewModel；不为旧开发期数据增加迁移分支或新版本并存。旧数据若无法按当前协议读取则明确拒绝。实施同一变更时更新 `docs/architecture/` 的当前行为描述；旧 Spec 的禁止模型纠错条款仅在本 Spec 的可修复范围内被取代，原生严格输出失败不得静默切换模式。

## Data Models

```ts
type GrantScope = "action" | "goal" | "workspace";
type GrantMatcher =
    | { kind: "exact_input"; toolId: string; version: number; digest: string }
    | { kind: "target_path"; toolId: "write_file" | "edit_file"; version: number; path: string };
type ToolGrant = {
    id: string;
    scope: "goal" | "workspace";
    workspaceId: string;
    goalId?: string;
    source: { goalId: string; runId: string; actionId: string };
    matcher: GrantMatcher;
    status: "pending" | "active" | "revoked";
};
type RecoveryRoute = "retry_model" | "retry_tool" | "repair_model"
    | "wait_approval" | "wait_user" | "fatal";
type RuntimeFeedbackData = {
    origin: "agent" | "runtime";
    stage: "decide" | "think";
    code: string;
    issues: readonly { path: string; message: string }[];
    attempt: number;
};
type PendingRecoveryBase = {
    executionUnitId: string;
    stepOrdinal: number;
    inputBoundary: string;
    attemptsStarted: number;
    latestEventId: string;
};
type PendingRecovery = PendingRecoveryBase & (
    | { kind: "model_call" | "model_feedback"; stage: "decide" | "think" }
    | { kind: "tool_call"; actionId: string }
);
```

`action` 不生成 `ToolGrant`，只使用现有 Action 批准；完整输入的 digest 由确定性 JSON 规范化与 Tool ID/匹配规则版本计算。`target_path` 不包含内容。恢复指针和 Grant 的全部持久字段在现行 Storage 边界严格解码；代码草图不替代完整协议校验。

## Testing Strategy

- 授权：覆盖默认只读放行、三种期限、跨 Run/Goal/工作区隔离、`bash` 不同命令、写入同路径不同内容、Profile/Policy 再检查、撤销和 YOLO 不生成 Grant（需求 1–2）。
- 提交与恢复：在 Grant 待生效、Action 批准、Grant 激活、Tool 开始、Observation 提交及撤销各边界注入失败；断言没有未获准执行、重复 Step、跨项目授权或 `manual` 自动重放（需求 2、5–6）。
- 故障路由：逐类验证 429/5xx/超时、鉴权/配置、输出解析、Tool 输入、Evidence、已知业务失败、结果未知及中止；核对三次上限、重启后剩余次数和正常多轮 Think 不受限制（需求 3–6）。
- 前端：Browser/TUI 验证审批预览、路径授权警示、授权列表和撤销、自动纠错活动、失败记录、过期命令拒绝及无效原文不成为最终答复（需求 2、7）。
- 集成验证覆盖持久化协议与受影响的 Run 恢复测试、Agent 阶段请求、Browser 命令和 TUI 控制器；不以真实收费模型调用作为默认测试门槛。
