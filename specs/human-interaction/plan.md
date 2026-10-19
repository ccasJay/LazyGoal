# 人机交互协议与 Web 表单重设计执行计划

本计划落实已批准的 [Spec](./spec.md)，风险等级沿用其 [high 评估与否定性保证](./spec.md#风险与否定性保证)。本阶段只完成计划；Plan 批准不单独构成实施授权。

执行前置条件是 [streaming-session](../streaming-session/spec.md) 的统一 `send`／`respond`、持久化收据、Goal 提交协调、执行所有权、订阅同步、Interrupt 和显式恢复契约已经可用并有对应验证证据。实施开始时核对实际依赖提交及 [依赖计划](../streaming-session/plan.md) 的 Feature Verification；只有文件和批准记录、缺失导出或导入报错均不能证明前置能力完成，也不能作为本功能有效的 Red 行为断言。依赖未就绪时报告缺失项，不在本计划内偷偷实施另一份 Spec 或恢复 Browser 的第二套推进逻辑。

按下列顺序执行，各任务先验证具体失败行为，再实现并运行对应检查。新测试文件均标为“待实现”；命令说明的是实现后的验证入口，不代表当前已通过。保持 Spec 的任务描述，完成时只勾选复选框。当前工作树已有 Provider／模型绑定改动不属于本计划；实施按适用执行工作流隔离，不能混入任务提交。

## 任务清单

- [x] //TODO 1. 提供可核验身份和完整审阅内容的当前交互读取

  落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5)。
  - **先验证**：分别提交问答、带路线修订的问答、任务审批、工具／沙箱审批和未知结果等待；断言视图区分类别、保留原始请求引用与必要 PTC／能力信息，未提交尾部不产生操作请求。详情查询遇到旧 Goal／Run／请求、无授权、截断和读取失败时明确拒绝或报告限制，不能返回其他 Action 的参数或触发执行。
  - **实现**：由 Runtime 的现有等待派生类型化交互视图，复用基础 Session 的同步身份；经现有 Browser 访问边界提供有界摘要及当前请求的完整问题／任务范围／Action 详情。扩展必要 wire 和读取 Port，保留字段级截断信息及可用操作，不增加持久化请求副本。新公开契约随变更补中文 TSDoc，来源由真实接入边界赋值。
  - **验证**：扩展 `packages/browser/test/browser-projection.test.ts`、`browser-interactions.test.ts` 和 `packages/web-contracts/test/web-contracts.test.ts`，新增 `packages/runtime/test/session-interaction-view.test.ts`（待实现）。运行 `npx tsx --test packages/runtime/test/session-interaction-view.test.ts packages/browser/test/browser-projection.test.ts packages/browser/test/browser-interactions.test.ts packages/web-contracts/test/web-contracts.test.ts`；检查查询前后 Snapshot 与模型／工具调用数不变。

- [x] //TODO 2. 在原 Run 中结算逐题回答、整体回复和跳过并恢复真实模型输入

  落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)、[7.1](./spec.md#spec-req-7-1)。
  - **先验证**：同一问卷分别接受完整答案、非空整体回复和跳过；观察同一 Run、一次消息／事实提交、等待解除与下一模型输入。缺题、选项失配、空正文、重复身份载荷冲突应保留等待；普通 message 只入队。对路线扩展输入整体回复“批准”或跳过，断言候选未获批；显式批准选项仍按原规则生效。
  - **实现**：在现有 Session `respond` 和 Coordinator 领域分支中加入互斥响应，统一提交收据、请求关联、响应事实、消息和等待结算；保持当前问卷数量、单选／多选和 Other 契约。同步当前 Snapshot／Trajectory 编解码、已提交历史投影和模型请求组装；保存失败不调用下一阶段，不增加问答业务 Step、不伪造 Tool Observation、不丢失用户原文或混淆宿主来源。
  - **验证**：扩展 `packages/model-contracts/test/ask-user.test.ts`、`packages/runtime/test/goal-coordinator-task-interaction.test.ts`、`run-plan-route-approval.test.ts`、`packages/storage/test/goal-snapshot-interaction.test.ts`、`packages/model-context/test/native-model-history.test.ts`，新增 `packages/runtime/test/session-question-responses.test.ts`（待实现）。对当前三种模型协议使用确定性响应经过正式解码与请求组装，重建文件存储后复核实际请求和已提交消息；运行上述文件的 `npx tsx --test` 靶向检查，不以静态消息模板替代链路断言。

- [x] //TODO 3. 让等待中的停止与回答／批准按提交顺序竞争

  落实标准：[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[7.2](./spec.md#spec-req-7-2)。
  - **先验证**：用受控提交闩锁安排回答／批准和 Interrupt 的两种先后。Interrupt 先提交时旧响应不能推进，回答先提交时后续停止按实际状态生效；问答／任务／工具等待均覆盖，且队列仍暂停。对未知结果和必要收尾审批验证真实阶段、剩余预算及新请求，不把收尾误报为已取消。
  - **实现**：复用基础 Spec 的短提交边界与中断入口，统一失效旧交互引用、发布实际等待／停止状态。保留原有限收尾、必要授权与未知效果处理，不新增强制终止算法；独立 Interrupt 不被问答响应的在途状态或局部表单锁阻塞。
  - **验证**：新增 `packages/runtime/test/session-interaction-races.test.ts`（待实现），扩展现有 `run-interrupt.test.ts`、`program-interruption.test.ts` 和 `run-plan-route-approval.test.ts`；运行对应 `npx tsx --test`。复核收据、最终 Snapshot、已提交中断／响应事实、队列暂停及工具调用次数；读取、断线和解除处理器不得出现用户 Interrupt 事实。

- [x] //TODO 4. 让内部宿主按交互种类程序化决定或交给真人

  落实标准：[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[1.4](./spec.md#spec-req-1-4)。
  - **先验证**：通过 Session 注册处理器，分别触发问答、任务审批、工具／沙箱审批和恢复等待；仅匹配函数被调用，`unhandled` 或缺少函数时仍等待，自动放行工具不触发审批。重复同步／事件只调用一次；第二个自动所有者明确冲突，真人和其他只读观察仍可工作；恢复请求不能落入普通工具批准函数。
  - **实现**：在 Runtime 会话边界提供 `attachInteractionHandlers` 与可解除句柄，按稳定引用去重并维持同 Goal 单自动所有者。调用在 Gate 外运行，传递取消信号、请求和显式详情读取能力；类型化结果通过统一 `send` 受理，不能直接执行工具、保存 Goal 或写 Grant。仅复用现有应用装配接线，不新增 SDK 包或通用 Hook 平台。
  - **验证**：新增 `packages/runtime/test/session-interaction-handlers.test.ts`（待实现），覆盖程序化答案／批准／拒绝、真人 Promise、同步重复、所有者冲突与并发只读／停止。运行 `npx tsx --test packages/runtime/test/session-interaction-handlers.test.ts`；检查合法授权仍走既有协调器路径，公开订阅不因处理器存在而泄露完整参数。

- [x] //TODO 5. 结算宿主处理器的迟到、故障、解除连接和重启恢复

  落实标准：[4.4](./spec.md#spec-req-4-4)、[4.5](./spec.md#spec-req-4-5)、[4.6](./spec.md#spec-req-4-6)、[7.2](./spec.md#spec-req-7-2)。
  - **先验证**：真人／Interrupt 先提交后再释放回调 Promise，断言迟到结果不提交；决定先进入受理再解除时按实际收据结算。抛错、业务拒绝、响应丢失和永不完成的 Promise 均不默认决定或拖住关闭。重建实例并注册处理器只展示历史等待，显式恢复成功后才投递；busy／恢复失败不解锁，直接真人响应仍只推进目标等待。
  - **实现**：追踪调用取消和每次已产生决定的稳定输入身份；提交不明时核验收据，不重新调用函数产生第二决定。隔离函数故障、停止重复调用和晚到结果；解除时释放自动所有者、停止自己订阅且不取消 Goal。复用基础恢复资格和生命周期，不持久化函数或增加第二套恢复标记；显式重连可重新投递未结算请求，文档不承诺回调跨重启 exactly-once。
  - **验证**：新增 `packages/runtime/test/session-interaction-handler-recovery.test.ts`（待实现），扩展 `runtime-lifecycle.test.ts` 和 `apps/goal-server/test/runtime-recovery.integration.test.ts`。运行对应 `npx tsx --test`，注入真实文件存储重建、提交前后故障与受控信号；核验中止原因、处理器故障可定位性、收据去重、调用次数及关闭期限。

- [x] //TODO 6. 用全新问题导航、答案审阅和整体回复替换旧问答表单

  落实标准：[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.6](./spec.md#spec-req-5-6)、[5.7](./spec.md#spec-req-5-7)、[7.3](./spec.md#spec-req-7-3)。
  - **先验证**：浏览器中编辑多题问卷，导航回看与审阅不提交；单选 Other 与选项互斥、多选组合有效。切换整体回复保留两种草稿且只提交当前模式；跳过需明确确认后果，独立 Stop run 可达，普通队列输入有不同用途。对 320px、桌面、长内容、键盘操作和焦点验证全过程，文本框 Enter／Escape 不隐式批准、跳过或停止。
  - **实现**：建立与 Activity 正文对齐的新交互区域及具体请求视图，整体移除旧 AskUserForm 的单页问卷流程；沿用白色薄荷绿 token 和字体，重新组织导航、问题正文、选项、Other、审阅、整体回复与独立停止，不新增模态弹出平台或新品牌依赖。通过类型化响应控制器接入 Session，组件不从整个 BrowserGoalSession 猜测种类；原有外壳与 Goal info 保持各自职责。
  - **验证**：新增 `apps/goal-board/test/human-interaction.test.tsx` 和 `apps/goal-board/e2e/human-interaction.test.mjs`（均待实现）；在 Chrome／CDP 的真实服务链路断言正式输入、收据和真实 Run 不变，检查截屏、焦点、字段标签／错误关联和状态播报。运行 `npm --prefix apps/goal-board test`、`npm run build:web` 与 `node --test --test-concurrency=1 apps/goal-board/e2e/human-interaction.test.mjs`；静态渲染只辅助检查语义结构，不替代交互验证。

- [ ] //TODO 7. 整体替换任务与工具审批布局并准确展示操作恢复

  落实标准：[1.2](./spec.md#spec-req-1-2)、[5.1](./spec.md#spec-req-5-1)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5)、[5.7](./spec.md#spec-req-5-7)、[7.3](./spec.md#spec-req-7-3)。
  - **先验证**：新任务／路线审批在决定前可完整审阅目标、验收与有序阶段，反馈使提案失效而非批准。工具审批默认单次，展示能力、参数和期限；截断详情未读取／读取失败时不能授予持续权限，拒绝需非空理由。未知结果显示可能已执行与重复效果警示，恢复按钮明确为 Retry action，不出现持续授权和参数编辑。
  - **实现**：分别建立范围审阅／任务决定区、操作能力／权限期限／工具决定区及明确的恢复视图，替换旧 TaskApprovalForm 和 ActionApprovalForm。接入任务 1 的完整详情与共享响应控制器，保留 PTC 来源、沙箱范围、所有原有合法授权路径；实际决定和授权事务沿用原规则，不在本任务修改工具输入或拆分恢复命令。移除失效旧布局、分支和测试断言。
  - **验证**：扩展新 `human-interaction.test.tsx`／`human-interaction.test.mjs`（任务 6 建立），更新 `apps/goal-board/test/p2-improvements.test.tsx` 与现有 `e2e/runtime.test.mjs` 的实际交互断言，保留完整路线检查。运行上述前端检查及 `npx tsx --test packages/runtime/test/goal-coordinator.test.ts packages/runtime/test/permission-grant-recovery.test.ts packages/runtime/test/sandbox-permission-action.test.ts`；观察批准先保存、Grant 后激活及原工具真实调用结果。

- [ ] //TODO 8. 让新交互在提交不明、多客户端结算和重连后保持可信状态

  落实标准：[1.3](./spec.md#spec-req-1-3)、[5.6](./spec.md#spec-req-5-6)、[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)。
  - **先验证**：提交后丢失响应，界面保持冻结身份和载荷，原身份核验／重试只应用一次；字段拒绝保留草稿，新决定使用新身份。另一客户端先结算、请求切换或新 Run 出现时旧草稿／详情不能串入新请求；相同请求快照更新和暂时断线保留编辑。页面刷新从真实等待／收据重建，不从 localStorage 自动提交；已受理不等于工具完成，末次通知丢失也能同步实际状态。
  - **实现**：补齐共用交互提交状态机与 API 适配，区分编辑、提交中、待核验、已受理及失效，冻结结果不明的载荷而保留独立 Interrupt。按完整请求引用隔离页面草稿和详情、处理迟到网络读取、响应竞争与刷新错误，已提交请求／决定在 Activity 中留可查摘要。移除被替换的旧 interaction 分发，不重新引入 Browser 去重或前端权威队列。
  - **验证**：新增 `apps/goal-board/test/interaction-submit-state.test.ts`（待实现），扩展真实浏览器用例及 `packages/browser/test/browser-interactions.test.ts`、`browser-stream.test.ts`；通过双页面／显式宿主、响应丢弃和提交通知故障注入核验。运行对应前端、Browser 靶向检查与新 Chrome E2E，直接检查收据、消息数、作用 Run、实际工具次数及 localStorage 没有答案／完整参数镜像。

- [ ] //TODO 9. 通过正式装配交付无界面示例、全链路验收与职责文档

  落实标准：[4.2](./spec.md#spec-req-4-2)、[4.6](./spec.md#spec-req-4-6)、[7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)、[7.4](./spec.md#spec-req-7-4)。
  - **先验证**：由现有 `apps/goal-server/src/runtime/index.ts` 装配真实文件存储与确定性模型／工具，在不启动 HTTP 或绑定信号的宿主中完成处理器决定、真人接手、解除连接及重建显式恢复；Web 使用同一执行和权限路径。检查仅导出类型、替换为假的 HTTP 后端、或保留旧表单推进路径不能满足验收。
  - **实现**：补齐现有装配的窄交互接线和可运行仓库内使用示例，完成模型协议解码→保存→重建→模型输入与 Web→正式服务→工具授权的组合链路。同步实际变化所有者的 README／overview／semantics、公开中文 TSDoc 和用户操作说明，删除被替换路径与开发期兼容分支；不提炼 SDK、不移动组合根、不改动无关 Provider 工作。
  - **验证**：扩展 `apps/goal-server/test/runtime-composition.integration.test.ts`、`runtime-recovery.integration.test.ts`、`process-lifecycle.integration.test.ts` 和 `execution-composition.test.ts`；按下方 Feature Verification 运行完整检查并记录证据。文档与示例对照实际代码，不宣称未运行的浏览器、恢复或跨协议场景通过，不自动写入 Memory。

## Feature Verification

### Planned Checks

以下是整份功能的验收契约。每条通过证据须能定位场景、真实输出和被测代码；任务中的靶向测试可以复用到这里，但只有仍适用于最终被测状态的证据有效。

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段／证据入口 |
| --- | --- | --- | --- |
| 真实等待与稳定身份 | [1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3) | 四种等待只来自已提交 Snapshot；重复同步不创建新交互，跨请求／Goal／Run 不串草稿与详情。 | 任务 1 的交互读取与 Browser 投影测试；任务 8 请求切换浏览器测试。 |
| 审批语义与明确选择 | [1.2](./spec.md#spec-req-1-2)、[2.4](./spec.md#spec-req-2-4) | 路线扩展完整展示审批性质；整体回复“批准”和跳过均保留原路线，只有匹配批准选项才能改变范围。 | `run-plan-route-approval.test.ts`、响应链路测试及新审批 Chrome 用例；对比路线 revision。 |
| 安全投影和详情授权 | [1.4](./spec.md#spec-req-1-4) | 无授权／旧引用不返回完整详情；公开事件无凭据、任意工具参数和隐藏推理，详情读取不推进。 | Browser／wire 测试，正式路由响应白名单及调用计数。 |
| 完整逐题回答 | [2.1](./spec.md#spec-req-2-1) | 单选、多选、Other 正确；缺题、空白和重复／未知身份明确拒绝，等待未变化。 | `ask-user.test.ts`、`session-question-responses.test.ts`（待实现）及实际新问卷流程。 |
| 整体回复替代问卷 | [2.2](./spec.md#spec-req-2-2) | 部分逐题草稿存在时发送整体回复，只保存整体原文；原 Run 继续，不产生后继 Run 或默认选项。 | 文件存储重建、消息／收据／请求断言和 Chrome 模式切换流程。 |
| 跳过与已提交事实 | [2.3](./spec.md#spec-req-2-3)、[2.5](./spec.md#spec-req-2-5) | 跳过整份问卷并继续，模型收到明确未答语义；三类响应均恰好结算一次，无虚构业务 Step／Observation。 | Coordinator／Snapshot／模型上下文测试；比较提交前后 Step、事实和用户消息。 |
| 等待时停止与提交竞争 | [3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2) | 三种等待中可独立停止；受控排列响应与 Interrupt 先后，旧响应不能越过已受理中断。 | `session-interaction-races.test.ts`（待实现），检查收据、当前 Run 和工具计数。 |
| 有限收尾与队列暂停 | [3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4) | 未知效果、收尾审批与最终取消按真实阶段展示；旧等待与新收尾请求区分，重复停止不重置预算，队列仍需独立继续。 | 既有 Interrupt／PTC 测试加新等待视图，Chrome 检查停止状态；关闭页面无 Interrupt 事实。 |
| 宿主合法决定与 Gate 边界 | [4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2) | 匹配函数可程序化决定或等待真人，缺失／unhandled 不解锁，恢复无通用审批兜底，函数等待期间仍能读取及停止。 | `session-interaction-handlers.test.ts`（待实现），正式 Session 收据和实际权限路径。 |
| 自动所有者和重复通知 | [4.3](./spec.md#spec-req-4-3) | 第二个自动处理器被拒绝；同一连接同一请求仅调用一次，其他显式响应与观察不受影响。 | 任务 4 的同步／事件重放与多句柄测试。 |
| 迟到函数与有界释放 | [4.4](./spec.md#spec-req-4-4) | 真人、中断、终态、解除和关闭使本地信号取消；迟到结果无新提交，已进入受理的结果真实结算，永不结束的 Promise 不拖住关闭。 | `session-interaction-handler-recovery.test.ts`（待实现）、生命周期集成测试；信号、时间界限和收据证据。 |
| 回调故障与受理不明 | [4.5](./spec.md#spec-req-4-5) | 抛错／业务拒绝不自动批准或拒绝，提交响应丢失先核验原身份；不重调函数，不覆盖其他客户端结果。 | 任务 5 保存前后故障注入和回调计数。 |
| 历史等待恢复门禁 | [4.6](./spec.md#spec-req-4-6) | 打开／注册不投递历史请求；显式 resume 成功仍等待时才投递，busy 不开启；真人决定不代替继续队列。 | 文件存储重建与正式无界面装配用例，比较恢复前后模型／工具／函数计数。 |
| 全新问答流程 | [5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2) | 新交互区域替换旧表单，支持问题导航、回看及完整答案审阅；导航不提交、提交只发生一次。 | 实际新组件及路由消费方检查，Chrome 操作和桌面截屏；不凭组件改名判定完成。 |
| 并列响应模式与独立停止 | [5.3](./spec.md#spec-req-5-3) | 两份草稿保留但响应互斥，跳过后果明确且须确认，独立停止不被响应在途状态锁住。 | Chrome 输入／切换／确认与响应延迟测试，检查输入种类及身份。 |
| 完整范围审阅与反馈 | [5.4](./spec.md#spec-req-5-4) | 长目标／验收／路线完整可读；详情不足时不可批准，非空反馈使提案失效后重新规划。 | 任务 7 长内容／详情失败用例、任务路线状态和新请求身份断言。 |
| 工具与恢复审批体验 | [5.5](./spec.md#spec-req-5-5) | 操作、能力、期限和 PTC 来源准确；默认单次，持续授权需完整审阅；未知结果有重复效果警示及明确 Retry action，不能改参或持续授权。 | Chrome 审批／拒绝／恢复场景，Coordinator／Grant／沙箱回归及实际调用次数。 |
| 队列用途与决定历史 | [5.6](./spec.md#spec-req-5-6) | Queue next task 不回答当前请求或丢草稿；已提交决定在 Activity 可查且不显示虚假执行成功。 | 新浏览器流程、对应输入账本、Activity 请求与决定摘要。 |
| 窄屏、键盘与可访问语义 | [5.7](./spec.md#spec-req-5-7) | 320px／桌面长内容可操作、焦点可见、控件有名称／错误关联／状态播报；Enter／Escape 无隐式批准、跳过或停止，英文文案与现有主题一致。 | 真实 Chrome 视口、键盘、DOM／可访问语义检查与截屏；需要辅助技术人工验收而环境不可用时如实记录缺口。 |
| 身份冻结和拒绝保留草稿 | [6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2) | 编辑／提交／核验／受理／失效区分；丢回复复用原 ID，明确拒绝保留草稿，新载荷使用新 ID，受理不误报完成。 | `interaction-submit-state.test.ts`（待实现）加真实浏览器响应丢弃与原收据查询。 |
| 其他来源结算与重连 | [6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4) | 同一请求刷新保留编辑，其他客户端结算后禁用旧决定；页面刷新按 Snapshot／收据恢复，无 localStorage 答案镜像；末次通知丢失仍同步。 | 双页面／宿主测试、存储检查和流故障注入；区分同步故障与业务结果。 |
| 协议解码到恢复后请求 | [7.1](./spec.md#spec-req-7-1) | 三种响应经过真实模型协议解码、Runtime 和文件存储重建进入模型请求，来源／原文／引用一致，路线不越权。 | 任务 2 的跨协议与上下文测试，保存公开脱敏请求摘要和事实关联。 |
| 确定性竞态与故障组合 | [7.2](./spec.md#spec-req-7-2) | 覆盖人工／回调、中断先后、迟到／永不结束、提交后崩溃和显式恢复／busy；同一决定无重复效果。 | 任务 3／5／8 测试及实际 Snapshot、轨迹、收据和调用计数。 |
| 正式 Web 全链路 | [7.3](./spec.md#spec-req-7-3) | 正式服务上完成问卷、整体回复、跳过、等待停止、任务批准／反馈、持续授权／拒绝／恢复提示及断线／失效，移动和键盘可用。 | 新 `human-interaction.test.mjs`（待实现）及迁移后的现有 Chrome E2E，使用假模型／工具而非假 HTTP 业务后端。 |
| 单一实现与消费文档 | [7.4](./spec.md#spec-req-7-4) | 旧表单／分发退出，内部示例使用正式装配，变化所有者文档和 TSDoc 对应真实行为，类型与依赖检查通过。 | 真实消费方搜索、示例集成、`check:docs`／`check:dependencies` 和应用类型检查。 |

组合流程必须在最终集成状态成立：

1. 创建 Goal → 模型提出多题问卷 → 编辑并审阅答案 → 切换整体回复再切回保留草稿 → 提交选定方式 → 同一 Run 收到真实输入；对独立 Goal 分别验证三种响应。带路线审批问卷额外验证整体回复／跳过不授权；后续普通任务始终只排队。
2. 宿主等待真人 Promise → Web 先回答或停止 → 回调迟到 → 原输入不得再次应用；交换提交顺序再验证。解除处理器而 Run／队列不被取消，重连未结算请求可再次投递且不宣称回调 exactly-once。
3. 任务提案完整审阅 → 非空反馈生成新提案 → 批准 → 工具／沙箱审批完整详情与期限 → 保存批准和 Grant → 真实隔离工具执行；另行构造未知结果，明确展示重试后果并继续沿用既有规则。
4. 决定提交后丢响应／进程退出 → 只读打开和注册处理器均无执行 → 查询原收据或显式恢复 → 无重复消息／批准；多客户端结算、末次通知丢失和 busy 不形成隐式推进。

实施完成后的完整检查入口：

```sh
npm test
npx tsc --noEmit -p apps/goal-server/tsconfig.json
npm --prefix apps/goal-server test
npm --prefix apps/goal-board test
npm run build:web
node --test --test-concurrency=1 apps/goal-board/e2e/*.test.mjs
git diff --check
```

`npm test` 当前包含根类型检查、文档与依赖检查、确定性 GEPA adapter 测试以及发现的 TypeScript／脚本测试；真实 Chrome E2E 另行运行。按最终脚本确认发现范围，避免漏掉应用类型与新测试。新 E2E 复用现有 Chrome／CDP 方式和正式 Composition Root，必要时抽取无副作用测试帮助函数，不导入另一份测试来触发其执行。缺少 Chrome／前置能力／其他必需环境应记录未满足，不跳过后记为通过；不调用真实 Provider、不使用用户 Home／Goal 数据、不在本计划中执行删除用户状态或付费验收。

### Latest Result

- 状态：未执行；未开始本功能实现或 Feature Verification。
- 验证时间、实现提交与相关未提交实现指纹：未记录。
- 契约版本：以用户批准后的 `human-interaction/spec.md` 与本 Plan 内容为准；执行时记录两者哈希，以及实际集成的 `streaming-session` 契约／实现提交与验证证据。
- 验证摘要：尚无行为验收结果；此前对旧问答／授权实现的测试和本次文档检查不能替代新功能验证。
- 后续记录要求：逐项记录实际检查、观察结果、脱敏证据位置与未解决问题；标识被测提交，或明确无提交并列出相关未提交路径和 diff／内容指纹。总体结果使用 `passed / failed / blocked / pending-human`，并记录 `current / stale`；必需环境缺失、失败或待人工结果不得计为通过。
