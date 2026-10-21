# Goal Board 流式会话体验执行计划

本计划执行已批准的 [Spec](./spec.md)，风险等级及关键操作沿用其[风险评估](./spec.md#风险与否定性保证)。本次只创建计划；Spec／Plan 批准不等于实施授权，不自动编排或实施其他 Spec。

实施前核对 [streaming-session](../streaming-session/plan.md)、[model-output-streaming](../model-output-streaming/plan.md)、[human-interaction](../human-interaction/plan.md)、[action-approval-revision](../action-approval-revision/plan.md) 和 [session-output-protocol](../session-output-protocol/plan.md) 的真实交付状态：统一受理／收据、规范输出／消息、重设计表单、参数修订与恢复引用必须已经可用，并有对应证据。仅有文件、批准或类型导出不能通过依赖门；缺失时报告具体前置，不用旧队列／表单兜底。本计划不修改这些文件，也不把它们的实现混入下列 TODO。

任务按消息位置 → 安全历史读取 → 交错呈现 → 候选、活动、控制与恢复 → 阅读体验 → 正式链路验收推进。每项先建立针对行为的失败断言再实现，不把测试文件不存在当作 Red；新增测试均标为待实现，前置交付后按其实际入口接入。每项同步变化所有者的说明、语义表及公开中文契约 TSDoc；完成时只勾选复选框，保留 TODO 原文。既有 Provider／模型绑定修改不属于本功能，不混入提交或验收结论。

## 任务清单

- [x] //TODO 1. 为所有正式消息保存可重建的 Run 内位置，并贯通提交、恢复与公开投影

  落实标准：[1.2](./spec.md#spec-req-1-2)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[8.4](./spec.md#spec-req-8-4)。
  - **先验证**：从真实创建、后继 Run、Steer 应用、问答／审批反馈、混合响应正文、零工具正文和完成／等待／失败通知写入消息，检查 afterSequence、锚点内次序、messageId 与 Run 归属。首事实前使用 0，同锚点多消息保持 Snapshot 次序，未应用队列／控制没有伪消息。覆盖本次新事实与消息共同提交、无新事实提交、保存后抛错及原身份核对；重建后位置不变，超出所属边界／错误 Run 的持久化位置明确拒绝。
  - **实现**：在消息原提交路径赋值 position，并扩展克隆、Snapshot schema／codec、公开消息投影和所有当前 fixture。新增事实的序列在同一提交中确定后再保存消息；重试复用已存来源和位置，不靠成功通知补写、不新增展示日志。当前文件／wire 边界校验，不对同进程已类型化值重复套解析器，也不从 Trace 或旧开发数据猜位置。
  - **验证**：新增 `packages/runtime/test/message-timeline-position.test.ts`、`packages/storage/test/message-timeline-position.test.ts`（待实现）；扩展现有 [提交器测试](../../packages/runtime/test/trajectory-checkpoint-committer.test.ts)、[多 Run 测试](../../packages/runtime/test/goal-multi-run-session.test.ts)、[交互测试](../../packages/runtime/test/goal-coordinator-task-interaction.test.ts) 和 [当前 Snapshot 测试](../../packages/storage/test/goal-snapshot-current.test.ts)，运行对应 `npx tsx --test`。同时断言普通查询／重建不增加模型、工具或 Step，核对已保存文件、原 messageRange 和公开消息位置。

- [x] //TODO 2. 从真实保存边界提供双向有界 Activity 历史和窄 Session 状态读取

  落实标准：[1.2](./spec.md#spec-req-1-2)、[1.5](./spec.md#spec-req-1-5)、[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3)。
  - **先验证**：以一个超过 100 项的 Run、多个归档 Run 和跨页阶段／工具组读取最近、before、after 页；默认 50、最多 100 项，正序与反向再读结果一致。翻页间追加正文、Observation 和后继 Run，固定 throughMessageId／轨迹上界的旧页不混入新事实。正文 4,000 UTF-16 边界不拆代理项，可按 messageId 分段读取原文；非法／跨 Goal／错筛选 cursor、不存在、底层读取失败及未提交 tail 分别处理。真实 HTTP 的 Host／Origin／Bearer 校验先于读取，敏感标记不进入响应。
  - **实现**：复用位置、已提交轨迹和安全摘要构建 `GET /api/goals/:goalId/activity` 及显式 `?view=state` DTO／路由，返回范围、双向 cursor、缺口和必要 Run／阶段上下文。状态视图明确未内嵌历史，仍有当前等待、收据、队列、控制与既有管理引用。只读投影无调度／写入；不将原始轨迹发给浏览器，不另建消息账本、数据库或完整历史下载再裁剪路径。
  - **验证**：新增 `packages/browser/test/browser-activity.test.ts`（待实现），扩展 [Browser 投影测试](../../packages/browser/test/browser-projection.test.ts)、[消息测试](../../packages/browser/test/browser-messages.test.ts)、[wire 测试](../../packages/web-contracts/test/web-contracts.test.ts)；通过正式路由真实 HTTP 和文件 Store 重建验证页界与正文拼接，运行对应 `npx tsx --test`。记录读取／写入及调用计数，响应有界不宣称磁盘随机访问有界。

- [x] //TODO 3. 将当前会话切换为按稳定来源交错排列的正文、活动与 Run／阶段边界

  落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[2.6](./spec.md#spec-req-2-6)、[7.5](./spec.md#spec-req-7-5)。
  - **先验证**：用实际保存的“用户 → 正文 → 工具 → Steer 应用 → 新正文 → 最终答复”数据，在初始页、通知先到／后到、重复同步和刷新后得到相同顺序、身份和 Run 归属；同文不同源保留两条。单次多正文／工具块保持正文相对次序，但生成工具请求不出现执行中／可审批状态；阶段接受和 process 保存不出现 Run completed，普通 Run 不造阶段，Plan 路线与指标／轨迹入口保留。
  - **实现**：在现有 [API](../../apps/goal-board/src/api.ts)、[会话 Hook](../../apps/goal-board/src/hooks/useGoalSession.ts)、[流 Hook](../../apps/goal-board/src/hooks/useRunStream.ts)、局部 Context 与 [GoalSession](../../apps/goal-board/src/components/GoalSession.tsx) 接入 state-only／Activity 和单一 SessionOutput。展示投影协调持久化位置、来源、修订与当前临时项，改用稳定身份；移除角色分区排列及单条 liveText 的消费职责，不另开 SSE、全局状态框架或执行循环。
  - **验证**：新增 `apps/goal-board/test/session-timeline.test.ts`（待实现），扩展 [活动收集测试](../../apps/goal-board/test/collect-activity-projections.test.ts) 和 [现有页面断言](../../apps/goal-board/test/p2-improvements.test.tsx)，运行 `npm --prefix apps/goal-board test`、`npm run build:web`。纯投影断言覆盖乱序输入与来源，实际 DOM 顺序、Run／阶段边界及页面入口在 TODO 10 的 Chrome 场景核对，不以静态 markup 代替。

- [x] //TODO 4. 在原位置结算候选预览，保留有界的作废旧稿而不重复正式消息

  落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)、[2.6](./spec.md#spec-req-2-6)、[6.5](./spec.md#spec-req-6-5)。
  - **先验证**：逐个控制生成、待确认、保存不明、正式提交和确定作废，检查来源独立、有效预览原位转正及重复通知只一份正文；保存不明不作废，已作废旧稿不会因迟到 delta 或正式替换复活。缺失前缀、截断与规范正文不一致明确提示；whole／宿主完整结果直接显示。九份以上旧稿最多暂存八份正文，同时只展开一份且不淘汰该份；释放／移出窗口明确不可恢复，刷新、切 Goal 和连接重建清除临时旧稿。
  - **实现**：将协议中的预览／提交／作废关联投影为正文和候选状态，保留有效转正项的展示实例、正式规范正文及用途；作废项为只读折叠临时内容，缓存按已批准上限管理。正文只使用公开投影，不在页面重新提取 summary、修改 Runtime 候选或保存未确认消息，不把生成／阶段结束显示为 Run 终态。
  - **验证**：新增 `apps/goal-board/test/candidate-presentation.test.ts`（待实现），与真实 Session／保存屏障联合驱动消费状态，运行对应 `npx tsx --test`。TODO 10 的 Chrome 验证展开旧稿、转正仅一份、实际节点连续性／文本选择及重连清除；断言 Snapshot 无候选旧稿和额外消息，而不是只检查状态字符串。

- [x] //TODO 5. 将真实工具状态、可折叠活动组和唯一交互区域嵌入交错时间线

  落实标准：[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[3.5](./spec.md#spec-req-3-5)。
  - **先验证**：相邻同类别／同阶段活动可合并，夹入正文、交互、未知来源、阶段或未加载缺口就断组；过滤步骤不能使原先不相邻的操作合并。真实 Action 的尝试、未提交返回和已提交 Observation 更新同一成员；PTC 父子、实际修订版本与本次恢复引用可查且不改 Step 数。当前等待只有一个可提交区域，历史请求只读；新增活动、阶段接受、刷新和另一客户端结算不挪用旧草稿／展开状态。
  - **实现**：调整 [ActivityProjector](../../apps/goal-board/src/activity-projector.ts) 以完整交错来源确定断组，按 Action／尝试身份协调实时覆盖和保存事实，保留局部展开、当前状态与 Trajectory 定位。接入前置交互与参数修订区域，不复制表单、授权校验或未知结果决策；关闭 Execution steps 仍保留正文、边界、当前请求和控制。
  - **验证**：扩展 [活动投影测试](../../apps/goal-board/test/activity-projector.test.ts)、[页面断言](../../apps/goal-board/test/p2-improvements.test.tsx) 和前置交互消费测试，运行对应 `npx tsx --test`／Goal Board 测试。TODO 10 的真实页面执行问答、批准／拒绝、修改后批准和未知结果恢复，检查实际等待、工具入参／次数、父子身份与详情定位；不以虚构 DTO 测完便声称已集成。

- [x] //TODO 6. 提供默认排队、显式 Steer 与不受草稿占用的独立 Stop，并核验不确定提交

  落实标准：[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[4.5](./spec.md#spec-req-4-5)、[4.6](./spec.md#spec-req-4-6)。
  - **先验证**：首条普通消息创建一次 Goal；运行／等待中 Enter 直接排队，Shift+Enter 换行，输入法确认不发送；显式 Steer 指向原 Run，拒绝不改为 Queue。保有草稿、队列提交或问答编辑时 Stop 仍可达，受理／收尾／必要审批／cancelled 不混淆。模拟响应丢失，原 inputId／载荷核验后仅受理一次；其他客户端推进、切 Goal、设置返回及迟到响应不清空新草稿。清空先确认目标范围，暂停队列继续与重启 resume 分开，连接不消费队列。
  - **实现**：调整 [MessageComposer](../../apps/goal-board/src/components/MessageComposer.tsx)、[命令 Hook](../../apps/goal-board/src/hooks/useRunCommands.ts) 和局部控制状态，普通发送、Steer、Stop、resume／queue_control 分别走前置统一 inputs。提交中冻结目标与载荷，明确拒绝再编辑，不明只核验／原身份重试；独立 Stop 不被普通输入单飞锁住。队列和待应用 Steer 仅显示 Runtime 状态，不恢复旧 localStorage 镜像或自动出队 effect，不改变既有模型／模式／权限安全点。
  - **验证**：新增 `apps/goal-board/test/session-controls.test.ts`（待实现），使用受控网络结果测试身份与草稿归属；真实按键、独立按钮、输入法、响应丢失、多客户端和收尾审批由 TODO 10 的 Chrome 验证。扩展／迁移现有 [输入控制 e2e](../../apps/goal-board/e2e/run-input-control.test.mjs)，核对真实收据、队列顺序与工具计数，不只看按钮文案；运行对应测试和构建。

- [x] //TODO 7. 在断线、缺口、快速跨 Run 和重启后同步同一会话，并清理旧观察资源

  落实标准：[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)、[4.6](./spec.md#spec-req-4-6)、[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5)。
  - **先验证**：state_sync 后才交接有效事件，快速后继 Run 不重建独立执行订阅，旧 Run／Goal 响应不覆盖当前。断线／读取失败保留正式内容和草稿并限制依赖最新状态的新决定，EOF 不伪造失败或取消；重连不拼缺前缀、不回放旧候选。丢最后一条消息／等待／终态通知且不再发 token，基础核对仍更新页面；进程重建只展示显式恢复需求，打开／分页不产生调用。卸载与切 Goal 后旧请求、帧、延迟回调均不可写入新视图，也不发送 Interrupt。
  - **实现**：在既有流／会话 Hook 消费基础修订与故障协议，将连接、历史读取和执行状态分离；复用统一 Goal SSE 及基础末次核对，不增加浏览器领域轮询或重发策略。同步时按正式身份合并并清理临时来源，保留可核验的原输入尝试和有效交互草稿；AbortController、合并帧和回调归属随视图释放，宿主执行不受观察者关闭影响。
  - **验证**：新增 `apps/goal-board/test/session-stream-recovery.test.ts`（待实现），扩展 [Browser 恢复测试](../../packages/browser/test/browser-recovery.test.ts)、[流测试](../../packages/browser/test/browser-stream.test.ts)；在正式服务／Chrome 注入断线、读取故障、最后通知丢失及 Publisher／服务重建，结合受控时钟、订阅计数和实际调用计数核对。前置核对实现缺失则报告依赖，不在本 TODO 重写它。

- [x] //TODO 8. 在同一 Run 内切换有界历史窗口，保持阅读锚点、当前请求和详情可达

  落实标准：[3.5](./spec.md#spec-req-3-5)、[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4)、[6.5](./spec.md#spec-req-6-5)。
  - **先验证**：一个长 Run 分成多个页，读前／后页和跨 Run 页时标题、缺口、阶段与不完整组可辨，无重复／遗漏；失败重试不丢现有窗口。缓存最多三页，正文详情最多三段，移出窗口可按原身份再读；阅读旧页时只更新最新水位与未读提示，连续新消息不挤掉锚点页。加载、展开及候选转正保持可见项和偏移；用户上滑暂停跟随，60px 内的跟随状态及 Jump to latest 按 Spec 区分，后继 Run 不强行滚动或切页。
  - **实现**：用 Activity 双向窗口取代 [完整 Run 窗口](../../apps/goal-board/src/session-window.ts)，保持真实 cursor／上界与稳定项定位，复用消息正文分段读取，局部错误明确区分截断、未加载和不存在。以稳定可见项恢复滚动，固定当前交互／Stop 的可达入口而不遮挡正文；分页与缓存淘汰不重置仍有效草稿／决定，跳到最新只读且不提交输入。
  - **验证**：新增 `apps/goal-board/test/activity-page-window.test.ts`（待实现），将 [session-window 测试](../../apps/goal-board/test/session-window.test.ts) 改为新窗口行为，运行对应 `npx tsx --test`。Chrome 实测翻页前后锚点几何位置、长内容展开、旧页阅读期间持续生成、详情重读与固定入口遮挡情况；仅纯函数状态不能证明滚动体验。

- [x] //TODO 9. 在安全 Markdown 和有界帧合并下保持焦点、可访问状态与窄屏阅读

  落实标准：[7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)、[7.4](./spec.md#spec-req-7-4)、[7.5](./spec.md#spec-req-7-5)。
  - **先验证**：对正文、代码围栏、GFM 表格、链接、转义和 Unicode 使用不同分片方式，最终原文及正式内容相同，未闭合格式不补改源文本；HTML／脚本不执行，模型图片／嵌入不产生网络请求，私有敏感标记不进入公开 UI。手动帧调度下大量 delta 只更新当前来源，结束／作废／换源时尾部不丢字、旧帧不复活；未变化历史不重解析，侧栏不随 token 全树更新。新请求／状态不抢焦点、不逐 token 播报全文。
  - **实现**：复用 [AssistantMarkdown](../../apps/goal-board/src/components/AssistantMarkdown.tsx) 与 [帧缓冲](../../apps/goal-board/src/live-text-batch.ts) 的有效职责，按来源合并并在控制边界及时结算；不缓存无限原始 token 事件或让隐藏标签页积压无界。使用既有 token／字体／Logo，区分正文、紧凑活动、未确认内容与正式结果，补齐键盘焦点／状态播报及 reduced-motion；局部代码／表格滚动，保留 Plan、指标、模型和 Trajectory 入口。
  - **验证**：新增 `apps/goal-board/test/streaming-markdown.test.tsx`、`apps/goal-board/test/streaming-render-schedule.test.ts`（待实现），扩展 [帧合并测试](../../apps/goal-board/test/live-text-batch.test.ts)，运行 Goal Board 测试及构建。TODO 10 的 Chrome 在桌面、320px、200% 文本放大和 reduced-motion 下验证实际焦点、文本选择、横向溢出、网络请求与可访问属性，记录桌面／窄屏截图并核对正文和操作不被遮挡；静态 HTML 只辅助安全格式断言。

- [x] //TODO 10. 从正式 Runtime、HTTP／SSE 到 Chrome 贯通全部行为，并完成交付验证

  落实标准：[8.1](./spec.md#spec-req-8-1)、[8.2](./spec.md#spec-req-8-2)、[8.3](./spec.md#spec-req-8-3)、[8.4](./spec.md#spec-req-8-4)。
  - **先验证**：使用正式 createRuntimeComposition、隔离文件存储、确定性工具及前置实际 Adapter／本地协议 fixture，贯通“多轮正文＋工具 → 问答／审批 → 过程提交 → 候选拒绝／替换 → 正式答复 → 快速后继 Run”；另测 whole 来源、保存后报错、响应／末次通知丢失、双客户端、Interrupt 收尾和服务重启。Chrome 操作真实表单／输入及有界分页；将 DOM 顺序、消息／位置／事实、实际参数和模型／工具调用次数对应，刷新重建仍一致，不注入伪造最终 Session DTO 作为后端替身。
  - **实现**：新增正式装配与浏览器场景，扩展 [现有 e2e 服务](../../apps/goal-board/e2e/test-service.ts) 的确定性注入，修复本功能接线遗漏。对接前置已交付的文本、交互、参数修订与恢复能力，不在本任务补做缺失前置；同步 Runtime／Storage／Browser／Web Contracts／Goal Board 的实际变化说明和 TSDoc，移除被替代的分区、liveText 和仅完整 Run 的窗口实现及失效断言，不删除仍有效的安全与恢复场景。
  - **验证**：新增 `apps/goal-server/test/goal-board-streaming.integration.test.ts`、`apps/goal-board/e2e/goal-board-streaming.test.mjs`（待实现），扩展 [Runtime 装配测试](../../apps/goal-server/test/runtime-composition.integration.test.ts)、[存储重建测试](../../apps/goal-server/test/runtime-recovery.integration.test.ts) 和受影响的现有 Chrome 用例。完成下方 Feature Verification 与最终命令；必要前置、真实 Chrome 或环境缺失应报告未满足，不跳过、缩短或替换为只测静态页面。

## Feature Verification

### Planned Checks

下表覆盖全部 41 条验收标准。新增测试在其所属 TODO 创建；每项证据须绑定当前代码、契约、真实输入及可观察结果，不能用文件存在、批准、类型通过或测试数量代替行为验证。

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
| --- | --- | --- | --- |
| 交错顺序与分界 | [1.1](./spec.md#spec-req-1-1) | 多轮正文与工具交错，Run／阶段及 Plan 路线正确，普通 Run 无虚构阶段。 | TODO 3／10，正式页、DOM 次序及重建比对。 |
| 稳定来源排序 | [1.2](./spec.md#spec-req-1-2) | 重复同步、页和消息通知按身份归并，同文异源保留，位置不取客户端时间。 | TODO 1／2／3，文件位置、HTTP 页及协调投影。 |
| 生成与执行分开 | [1.3](./spec.md#spec-req-1-3) | 多正文块顺序保留，生成工具块不成为执行／可审批状态。 | TODO 3，模型／Runtime 屏障与实际调用计数。 |
| 输入真实应用位置 | [1.4](./spec.md#spec-req-1-4) | Steer、交互及后继消息归属真实 Run，未应用队列不进入正式正文。 | TODO 1／3，输入收据、位置和 DOM。 |
| 重建及损坏边界 | [1.5](./spec.md#spec-req-1-5) | 重建顺序一致，越界／错来源拒绝，不使用 Trace 或未提交 tail 补历史。 | TODO 1／2，文件 codec、来源故障和历史查询。 |
| 独立预览与 whole | [2.1](./spec.md#spec-req-2-1) | 各调用／块不串文，生成／确认／核对明确，whole 直接显示。 | TODO 4，来源序列及 Chrome 中间态。 |
| 转正只有一份 | [2.2](./spec.md#spec-req-2-2) | 同步／通知两种先后与重复不增正式项，有效转正保持展示节点。 | TODO 4／10，真实提交和 DOM 节点连续性。 |
| 作废旧稿 | [2.3](./spec.md#spec-req-2-3) | 旧稿折叠可展开且明确未采纳，不进入 Snapshot／证据，下一候选独立。 | TODO 4，Chrome 操作及保存文件核对。 |
| 临时清理与待核对 | [2.4](./spec.md#spec-req-2-4) | 刷新／换 Goal／重连清除临时项，保存不明不自行作废。 | TODO 4／7，重连、页面重开与保存屏障。 |
| 缺片／截断／替换 | [2.5](./spec.md#spec-req-2-5) | 非零起点和超限可辨，正式规范正文替换，旧分片不能复活内容。 | TODO 4／7，缺片来源、边界数据与最终消息读取。 |
| 非终态不报完成 | [2.6](./spec.md#spec-req-2-6) | 模型结束、process 保存、阶段接受不显示 Run completed。 | TODO 3／4，阶段／保存屏障和真实 Run 状态。 |
| 真实邻接分组 | [3.1](./spec.md#spec-req-3-1) | 正文／交互／缺口／阶段断组，隐藏步骤不改变完整来源邻接。 | TODO 5，活动投影矩阵及页面筛选。 |
| 工具返回与提交 | [3.2](./spec.md#spec-req-3-2) | 同一 Action 更新尝试及结果，未提交返回不显示已保存成功。 | TODO 5，返回／Observation 保存屏障与详情来源。 |
| PTC 与实际版本 | [3.3](./spec.md#spec-req-3-3) | 父子、参数修订和重执行引用准确，无额外 Step 或原始参数广播。 | TODO 5／10，真实批准事务和工具入参／计数。 |
| 唯一当前交互 | [3.4](./spec.md#spec-req-3-4) | 当前区域可提交，历史只读，刷新／分页不丢同一请求草稿。 | TODO 5／10，真实问答／审批及重复等待。 |
| 展开与详情定位 | [3.5](./spec.md#spec-req-3-5) | 追加／结束保持展开和定位，筛选不隐藏当前请求与控制。 | TODO 5／8，Chrome 组、阶段及 Trajectory 入口。 |
| 默认发送和输入法 | [4.1](./spec.md#spec-req-4-1) | Enter 普通排队、换行及组合输入正确，首条创建一次 Goal。 | TODO 6，浏览器键盘、网络输入和收据。 |
| 显式 Steer | [4.2](./spec.md#spec-req-4-2) | 明确修正当前 Run，待应用与 Queue 分开，拒绝保草稿不降为排队。 | TODO 6，控制结果和模型输入应用位置。 |
| 带草稿仍可停止 | [4.3](./spec.md#spec-req-4-3) | 草稿／提交／问答不阻塞独立 Stop，受理、收尾、审批及 cancelled 分开。 | TODO 6／10，Chrome 控制与 Runtime／工具结算。 |
| 队列唯一权威 | [4.4](./spec.md#spec-req-4-4) | 显示服务端队列，清空范围确认，继续／恢复分开，无页面自动出队。 | TODO 6，实际收据、暂停与重启调用计数。 |
| 提交不明核验 | [4.5](./spec.md#spec-req-4-5) | 原身份／载荷核验，不重发新输入，明确拒绝可编辑，Stop 独立。 | TODO 6，受理响应丢失及双输入竞争。 |
| 草稿与目标隔离 | [4.6](./spec.md#spec-req-4-6) | 切 Goal／设置返回／他方结算与迟到响应不挪用草稿或放行操作。 | TODO 6／7，双客户端及目标切换屏障。 |
| 单一跨 Run 同步 | [5.1](./spec.md#spec-req-5-1) | state_sync 在先，快速后继不中断 Goal 观察，旧 Run 不盖当前状态。 | TODO 7，真实 SSE、修订与订阅计数。 |
| 断线保留真实内容 | [5.2](./spec.md#spec-req-5-2) | 保留正式内容／草稿并标记过期、限制新决定，EOF 不伪造终态。 | TODO 7，读取失败和连接关闭后的 DOM。 |
| 最后通知缺失 | [5.3](./spec.md#spec-req-5-3) | 无后续 token 时仍由基础核对发现消息／等待／终态，无额外浏览器轮询。 | TODO 7／10，丢通知、受控时钟和请求记录。 |
| 只读不恢复 | [5.4](./spec.md#spec-req-5-4) | 重启状态可见，连接／展开／跳最新零模型／工具调用，显式 resume 才推进。 | TODO 7，服务重建及实际调用计数。 |
| 观察资源释放 | [5.5](./spec.md#spec-req-5-5) | 卸载取消本地请求／帧，迟到无效，已受理工作继续且无 Interrupt。 | TODO 7，受控回调、订阅清理与执行状态。 |
| 首屏有界 | [6.1](./spec.md#spec-req-6-1) | 单个长 Run 初始只读取最近窗口，不先下载全部步骤／消息。 | TODO 2／8，真实请求和响应项数／窗口。 |
| 固定上界双向分页 | [6.2](./spec.md#spec-req-6-2) | 并发追加不混旧页，正反读取无重漏，跨页阶段／组标不完整。 | TODO 2／8，固定水位比对与 Chrome 翻页。 |
| 局部读取错误 | [6.3](./spec.md#spec-req-6-3) | 缺口、截断、404 和读取失败可辨，可按消息／来源只读重试。 | TODO 2／8，真实详情 HTTP 与页面错误恢复。 |
| 阅读位置和跟随 | [6.4](./spec.md#spec-req-6-4) | 加载／展开／转正保持锚点；上滑暂停，跳最新才主动恢复跟随。 | TODO 8，Chrome 实际 scrollTop、项内偏移及后继 Run。 |
| 缓存及背压有界 | [6.5](./spec.md#spec-req-6-5) | 三页／三详情段／八份旧稿上限，阅读页不被新内容挤出，释放如实提示。 | TODO 4／8，长流、翻页、缓存状态和缺口恢复。 |
| 安全 Markdown | [7.1](./spec.md#spec-req-7-1) | 不补改原文、不执行 HTML／脚本、不自动取图／嵌入，公开无私有载荷。 | TODO 9，分片矩阵、实际 DOM／请求及敏感标记。 |
| 局部帧合并 | [7.2](./spec.md#spec-req-7-2) | 高频同源增量合并且结算不丢尾，whole 不动画，旧历史／外壳不全量重算。 | TODO 9，手动帧、渲染／解析计数和 Chrome 记录。 |
| 焦点与状态播报 | [7.3](./spec.md#spec-req-7-3) | 新请求／转正不抢编辑焦点，选择保持，关键状态播报有界。 | TODO 9／10，实际 activeElement、Selection 及可访问属性。 |
| 窄屏及减少动态 | [7.4](./spec.md#spec-req-7-4) | 320px、文本放大、reduced-motion 下正文／操作可达，代码表格局部溢出。 | TODO 9，Chrome 视口／媒体模拟、截图和几何断言。 |
| 品牌与既有入口 | [7.5](./spec.md#spec-req-7-5) | 既有主题／字体／Logo、Plan 路线／指标／Trajectory 保留，状态英文且可辨。 | TODO 3／9，真实页面截图、入口和 computed style。 |
| 正式顺序与候选链路 | [8.1](./spec.md#spec-req-8-1) | 正式服务贯通混合响应、接受／拒绝、whole、保存不明及刷新，文件和 DOM 一致。 | TODO 10，装配测试、真实 Chrome、Snapshot 和调用计数。 |
| 控制与恢复全链路 | [8.2](./spec.md#spec-req-8-2) | Queue／Steer／Stop、问答、修订／恢复、双客户端及重启无重复执行或隐式批准。 | TODO 10，真实 inputs、授权／工具与文件恢复。 |
| 长历史与交互体验 | [8.3](./spec.md#spec-req-8-3) | 同 Run／多 Run 长历史、滚动、焦点、输入法、安全及帧合并均有确定性证据。 | TODO 8／9／10，浏览器操作及受控调度。 |
| 入口迁移与说明 | [8.4](./spec.md#spec-req-8-4) | 写入／codec／wire／页面迁移完整，旧展示路径移除，TSDoc／说明与边界检查通过。 | TODO 1／10，调用点核对、构建、回归、文档和依赖检查。 |

以下组合流程必须通过正式入口验证，不能仅汇总单元测试结果：

1. **生成到保存**：首条输入 → 多正文块／工具 → 当前审批与实际执行 → 新正文 → 候选拒绝折叠 → 新候选审查／保存 → 同位置一条正式答复 → Run 终态 → 普通队列后继 Run；刷新后位置一致且无临时旧稿。另走 whole 来源，确认没有伪造打字。
2. **控制与竞争**：运行时普通消息排队 → 显式 Steer → 保持草稿并 Stop → 有限收尾／必要审批／未知结果 → cancelled 和队列暂停；用明确继续／resume 推进。加入问答三种响应、参数修订最终授权与 PTC／重执行两条来源，检查输入身份、实际入参、调用次数和他方结算后的旧决定失效。
3. **断线与不确定提交**：保存／受理成功后丢响应／末次通知 → 无新 token → 基础核对恢复同一消息／收据 → 重连缺前缀 → 正式替换 → 双客户端与快速后继 Run → 服务重启只展示恢复需求。整个过程没有新身份重复发送、候选复活、自动恢复或连接取消执行。
4. **长历史与可用性**：同一 Run 跨多页及跨 Run 阅读 → 并发生成时上下翻页／展开 → 保持锚点且缓存有界 → 明确局部错误、截断和释放 → Jump to latest。桌面／320px／文本放大／reduced-motion 下实测输入法、焦点、文本选择、停止和当前交互可达；检查网络和公开内容无越界载荷。

新增测试实际存在后，按任务运行靶向检查；所有 TODO 完成后运行最终检查，不在规划阶段声称其通过：

```sh
npx tsx --test packages/runtime/test/message-timeline-position.test.ts packages/storage/test/message-timeline-position.test.ts packages/browser/test/browser-activity.test.ts apps/goal-server/test/goal-board-streaming.integration.test.ts
npm test
npm --prefix apps/goal-server run build
npm run build:web
node --test --test-concurrency=1 apps/goal-board/e2e/*.test.mjs
git diff --check
```

按当前 [回归入口](../../scripts/run-regression.mjs)，`npm test` 包含根类型、依赖、文档、GEPA 及包／应用／Benchmark／脚本确定性回归；独立应用构建与真实 Chrome 补足其覆盖之外的路径。需要 Chrome 时沿当前 e2e 约定发现浏览器，不以 `dev:web` 布局预览替代正式服务。必要环境缺失记为 blocked，断言失败记为 failed；检查被跳过不算成功。已有旧断言只按获批新契约迁移，不能删除安全、恢复或实际执行次数的验证来取得绿灯。

### Latest Result

- 状态：passed（功能实现、修复轮与完整 Feature Verification 全部通过）。
- 验证时间：2026-10-21（本工作树 `codex/goal-board-streaming`，基线 `1145f823`，接续 HEAD `79063533`）。
- 契约基线：已批准的 `spec.md`，SHA-256 `8573444de38feb37fec0d5bfe799efe74cd1dd114249226729581d6fe64350ab`（与批准版本一致，本轮未修改）；本次更新前的 `plan.md` SHA-256 `26ec5feacaf9800d4f54dea31b2b2c33d305a152afe3b6326d0253dafe1b4c6d`。
- 功能提交：`f0fb75b1`…`757b58f6`（TODO 1–10），`f0e4082c`（上一轮 FV 记录）。
- 修复轮提交：`81a4ec16`（TODO 1 快照不变量与共享夹具）、`72009c7c`（集成测试工具策略取值）、`135715ee`（新增集成用例停止原因类型）、`b1616022`（活动投影裸 NUL 分隔符）、`491ed382`（显式 Think 摘要与详情入口）、`10a976e6`（既有 Chrome 用例与 mock 端点迁移）、`79063533`（语义表说明）。

#### 逐项检查结果

| 检查入口 | 结果 | 证据 |
| --- | --- | --- |
| `npx tsx --test packages/runtime/test/message-timeline-position.test.ts packages/storage/test/message-timeline-position.test.ts packages/browser/test/browser-activity.test.ts apps/goal-server/test/goal-board-streaming.integration.test.ts` | passed | `# tests 15 / # pass 15 / # fail 0` |
| `npm --prefix apps/goal-server run build` | passed | `tsc --noEmit` 退出码 0；上一轮 `session-output-approval.integration.test.ts` 的 `toolPolicy` 类型错误已由 `72009c7c` 收窄 |
| `npm run build:web` | passed | `vite build` 输出 `✓ built in 1.12s` |
| `npm --prefix apps/goal-board test` | passed | `# tests 151 / # pass 151 / # fail 0` |
| `node --test --test-concurrency=1 apps/goal-board/e2e/*.test.mjs` | passed | `# tests 12 / # pass 12 / # fail 0`（真实 Chrome `--headless=new` + CDP + 显式 `Emulation.setDeviceMetricsOverride`） |
| `npm run check:docs` | passed | `文档检查通过：45 个模块，161 份当前说明。` |
| `npm run check:dependencies` | passed | `依赖边界验证通过：274 个源文件` |
| `git diff --check` | passed | 无输出（工作区与 `HEAD` 均无空白错误） |
| 全量回归（串行，`npx tsx --test --test-concurrency=1` + `node --test --test-concurrency=1`） | passed | 确定性测试 `# tests 2409 / # pass 2409 / # fail 0`；scripts 测试 `# tests 70 / # pass 70 / # fail 0` |
| `npm test`（仓库标准并行回归） | passed | 确定性测试 `# tests 2409 / # pass 2409 / # fail 0`；scripts 测试 `# tests 70 / # pass 70 / # fail 0` |

#### 上一轮 43 项失败的复核结论

根因仍是 TODO 1 的快照不变量与共享夹具不一致：快照要求同一 Run、同一锚点（`afterSequence`）内的消息 `order` 从 0 连续递增，而 `packages/runtime/test/current-fixtures.ts` 的 `testUserMessage`／`testAssistantMessage` 默认一律给出 `{ afterSequence: 0, order: 0 }`；同一快照内出现两条消息时违反不变量，`encodeSnapshot` 以 `INVALID_GOAL_SNAPSHOT` 拒绝。

`81a4ec16` 在 TODO 1 域内修复，未放宽校验、未删除断言：创建路径统一把初始消息集归属创建 Run 并分配 `afterSequence: 0` 的连续 `order`（调用方不能在创建时指定 Run 归属或位置），共享夹具新增 Run 绑定与 Goal 绑定辅助，恢复输入改按最近一次恢复事实锚定。

复核证据：受影响包的定向回归 `npx tsx --test --test-concurrency=1 packages/runtime/test/*.test.ts packages/storage/test/*.test.ts packages/model-request/test/*.test.ts packages/model-execution/test/*.test.ts packages/browser/test/*.test.ts apps/goal-server/test/*.test.ts` 为 `# tests 1052 / # pass 1052 / # fail 0`，`INVALID_GOAL_SNAPSHOT` 类失败全部消失且无新增失败；全量串行与并行回归均为 2409/2409。

#### 浏览器验收（真实 Chrome）

5 项既有 Chrome 用例已按新契约迁移断言与 mock，全部通过，未删除任何场景：

- `board.test.mjs`“Goal board uses saved state…”：mock 补齐应用实际调用的 `GET /api/goals/goal-1?view=state` 与 `GET /api/goals/goal-1/activity`，正式消息补上稳定身份与 Run 内位置；断言改用 `.timeline-activity`、`.timeline-activity-member-label`、`.timeline-activity-member-status`、`.session .timeline > *` 与 `.timeline-terminal.failed`，并保留 Execution steps 筛选只隐藏活动主体、正文与 Run 边界仍可见的验证意图。
- `run-stages.test.mjs`“Web goal session presents run stages…”：被替代的 `.run-stages-container`／`.run-stage-group` 改为 `.timeline-run-boundary`（Run 分界与当前 Run）、`.plan-route-stage`（获批 Plan 路线阶段、状态、路线修订号与修订理由）与 `.timeline-fact.run_stage_declared .timeline-stage-target`（阶段标题）；步骤按阶段与类别归组为默认折叠的活动组并可展开核对成员身份与状态；显式 Think 的获准摘要、进行状态与 Trajectory 详情入口逐项保留。
- `runtime.test.mjs`：“real local service restores and completes…”：`.activity-group`／`.tool-activity-label` 改为 `.timeline-activity` 与 `.timeline-activity-member-label`；`.run-stages-container` 之外的旧 Stop 入口改为新契约的独立 `Stop run` 按钮，Steer 改为独立 `Steer the current Run with this message` 按钮；队列顺序、跨 Run、恢复与工具调用次数的验证未削弱。
- `session-output.test.mjs`“real service and browser share one session output protocol”：期望项清单按新实现区分消息／事实与 `activity:` 活动组条目，额外断言同一 Action 只贡献一个活动组条目，DOM 次序仍与服务端 Activity 顺序逐项对应。
- `streaming-session.test.mjs`“streaming session keeps one runtime queue across Steer, Interrupt, tabs and restart”：移除已不存在的 `.run-send-options` 弹出菜单，改为 Enter 直接排队、显式 Steer 走独立按钮、Stop 走独立 `Stop run`；队列顺序、待应用 Steer、暂停原因与重启恢复的验证保留。

#### 显式 Think 可见性的证据判定

判定结论：属可见能力回退，本轮已恢复。

证据（基线 `1145f823` 确实展示过）：

- `apps/goal-board/src/components/GoalSession.tsx`（基线 545–552）在活动组成员内渲染 `Think goal`、已提交分析正文（安全 Markdown）与 `Some Think content is omitted. View the complete event in trajectory.`。
- 同文件基线 588–601 为每个带 `executionUnitId` 的成员渲染 `View in trajectory` 入口；基线 `apps/goal-board/src/activity-projector.ts:176-190` 把 Think 成员记入 `executionUnitId`，因此 Think 成员同样具备该入口。
- `packages/browser/src/browser-projection.ts`（基线 350–395）按 `think_requested`／`think_completed` 投影 Think 步骤；`packages/browser/src/browser-trajectory.ts:175-183` 提供完整事件读取。

回退根因与处理：

1. `packages/web-contracts/src/validation.ts` 的 `isActivityThinkItem` 把未知字段白名单取反（`if (!Object.keys(value).some(...)) return false`），导致合法的 Think 项被整体拒绝，客户端 `isBrowserActivityPage` 随之拒绝整页，Think 摘要与详情入口完全不可见。该守卫由本分支 `d68273fa` 引入，非基线问题。`491ed382` 修正取值。
2. Activity 的 Think 项不带 `executionUnitId`，页面无法为 Think 成员提供 Trajectory 详情定位引用。`491ed382` 在 `BrowserActivityThinkItem` 增加可选 `executionUnitId`，由 Browser 投影与 Goal Board 活动投影逐层传递，页面据此渲染 `View trajectory`。
3. 安全边界不变：只投影获准的思考目标、已提交输出与截断标记；未提交输出、供应商隐藏推理、私有阶段与审查内部内容都不进入公开 DTO。证据见 `packages/browser/test/browser-activity.test.ts`（未提交 Think 输出不进入页面）、`packages/web-contracts/test/web-contracts.test.ts`（未知字段与私有载荷被 wire guard 拒绝）、`apps/goal-board/test/activity-projector.test.ts`、`apps/goal-board/test/p2-improvements.test.tsx`（摘要、输出与详情入口渲染）、`apps/goal-board/test/session-timeline.test.ts`（端到端时间线投影）。

#### 已落实的验收标准

- [1.1][1.2][1.3][1.4][1.5]、[2.1]–[2.6]、[3.1]–[3.5]、[4.1]–[4.6]、[5.1]–[5.5]、[6.1]–[6.5]、[7.1]–[7.5]、[8.1]–[8.4]：对应 TODO 1–10 的定向测试与本文件表格中的命令。
- [7.4] 的“200% 文本放大”使用 Chrome `Page.setFontSizes`（Chrome 文本缩放本身只放大默认字号文本，px 字号按浏览器规则不放大），已在 e2e 中注明实现方式。
- [1.1] 的“阶段标题”由 `.timeline-fact.run_stage_declared .timeline-stage-target` 与获批 Plan 路线共同承担；[8.1][8.4] 的入口迁移由 `?view=state`、Activity 页与 `build:web`／`check:docs` 覆盖。

#### 未解决项与观察

1. 阶段逐项修订号与审查拒绝问题清单不再单独渲染。基线的 `.run-stage-group` 容器按验收标准 8.4“旧展示路径移除”被整体替换；新契约保留阶段标题、获批 Plan 路线（目标、状态、路线修订号与修订理由），但 Activity 与 Plan 路线 DTO 不携带逐阶段修订号，也不携带 `run_stage_rejected` 的问题正文。`run-stages.test.mjs` 因此以路线修订号与修订理由承载审查反馈的可见性，未伪造逐阶段修订展示。恢复逐阶段修订与问题清单需要扩展公开 wire 契约，超出本轮范围。
2. `apps/goal-board/src/style.css` 与 `workspace.css` 仍保留 `.run-stages-container`、`.run-stage-group`、`.stage-rejection-feedback` 等已无组件引用的规则，`apps/goal-board/test/run-stage-styles.test.ts` 仍以这些选择器断言样式存在。属于本分支移除旧阶段分组视图后遗留的死样式，不影响行为验收，但应在后续简化轮次一并清理。
3. `packages/runtime/test/git-sandbox-authorization.test.ts` 的“真实 Runtime 与 Seatbelt”用例在一次全量串行回归中因受管进程 stderr 为空而失败一次，同一提交重跑即通过，单独连续 6 次运行均通过；该文件自基线 `1145f823` 起逐字未变，属 macOS Seatbelt 沙箱在高负载下的环境抖动，不是本功能引入的失败。
