# 文本流式会话完整接入执行计划

依据已批准的 [Spec](./spec.md) 实施；风险等级沿用其[风险与否定性保证](./spec.md#风险与否定性保证)中的 high，重点验证持久化、授权、竞态与恢复。不新增 SDK 包，不迁移现有默认装配，不接入图片或 MCP。

任务按编号依次落实，每项先建立能够证明预期行为的失败断言或受控探针，再实现并运行对应检查。下文标为“待实现”的测试文件尚不存在；现有测试应按新的已批准契约更新，不能降低断言强度。各任务同步更新其实际影响模块的中文契约 TSDoc、示例与模块说明，保持 Spec 的验收锚点和本计划的 TODO 描述不变。

## 任务清单

- [x] //TODO 1. 持久化受理文本输入，并通过稳定收据核验重复和不确定结果
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[3.6](./spec.md#spec-req-3-6)、[8.3](./spec.md#spec-req-8-3)、[9.6](./spec.md#spec-req-9-6)。
  - 先验证：在待实现的 `packages/runtime/test/session-input.test.ts` 和 `packages/storage/test/session-input-snapshot.test.ts` 中，以已有 Goal 受理消息后重建 Store；核对同 ID／同载荷返回原收据，改载荷冲突，恢复后身份仍有效。控制保存失败、保存结果不明及容量边界，验证未受理不产生执行，原身份可核验；满队列仍允许中断、回答、恢复和清空。
  - 实施目标：在 Runtime 会话模块定义内部输入、收据与查询契约，扩展 Goal／Snapshot／Trajectory 当前协议、受理序号、队列修订和 Goal 提交修订。复用并扩展现有短 mutation Gate，将 Launcher、Runner、Coordinator、模型选择及管理写入纳入一致的读取／提交边界，防止旧快照覆盖新受理；校验放在 queued、durable 和 wire 等真实边界，不引入旧数据兼容或独立 inbox 文件。
  - 验证手段：`npx tsx --test packages/runtime/test/session-input.test.ts packages/storage/test/session-input-snapshot.test.ts packages/runtime/test/trajectory-checkpoint-committer.test.ts packages/runtime/test/trajectory-failure.test.ts packages/storage/test/goal-store.test.ts`；断言快照、轨迹提交边界、修订和实际调用数，不以收据对象存在代替落盘证据。

- [x] //TODO 2. 创建长期 Session 并在受理返回后由唯一所有者推进 Run
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.5](./spec.md#spec-req-1-5)、[8.1](./spec.md#spec-req-8-1)、[8.3](./spec.md#spec-req-8-3)、[8.4](./spec.md#spec-req-8-4)。
  - 先验证：在待实现的 `packages/runtime/test/session-execution.test.ts` 中阻塞模型，验证创建 Promise 已在首次保存后返回、执行仍在进行；两个句柄连接同 Goal 不产生两个执行器，另一 Goal 的推进和新输入明确 busy。重建实例后只读连接和原创建身份重试均不调用模型；缺失／损坏 Goal 明确失败，四类 Run 结果均不销毁 Session。
  - 实施目标：接入 `sessions.create`／`sessions.open`、被生命周期追踪的后台任务、单活动 Goal 名额及只读状态；拆开受理与执行 Promise，复用 Launcher／Coordinator／Runner，不复制执行循环。实例级执行名额和 Goal 短 Gate 职责分开，外部模型／工具等待不持有短 Gate；观察后台异常并释放或保留真实恢复状态，不产生未处理 rejection。
  - 验证手段：`npx tsx --test packages/runtime/test/session-execution.test.ts packages/runtime/test/launcher.test.ts packages/runtime/test/goal-coordinator.test.ts packages/runtime/test/inline-scheduler.test.ts`；检查先保存、再受理、后调用的顺序及不同 Goal 的 Binding 隔离，不能用等待 Run 完成的旧同步入口冒充受理 API。

- [x] //TODO 3. 按 FIFO 持续执行持久化队列，并支持暂停、继续和清空
  - 落实标准：[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[3.5](./spec.md#spec-req-3-5)、[8.1](./spec.md#spec-req-8-1)、[8.6](./spec.md#spec-req-8-6)。
  - 先验证：在待实现的 `packages/runtime/test/session-queue.test.ts` 中阻塞首个 Run 并受理两条消息，释放后观察两个不同后继 Run 按序启动；分别在“保存后未唤醒”和“创建后继 Run 后未调用模型”处模拟进程退出并重建，显式恢复后每项只应用一次。覆盖等待不出队、失败暂停、新消息不解除暂停、继续从原队首启动，以及清空只影响未应用普通消息。
  - 实施目标：在单个 Snapshot 中完成旧 Run 归档、队首应用关联、真实用户消息追加与新 Run 创建；正常完成可在同一执行所有权内续跑，等待和无消息时释放名额。持久化暂停原因及队列修订，清空保留去重收据；终态管理拒绝仍有未处理输入或未完成收尾的 Goal，不删除用户数据，也不建立跨 Goal 调度队列。
  - 验证手段：`npx tsx --test packages/runtime/test/session-queue.test.ts packages/runtime/test/goal-multi-run-session.test.ts packages/runtime/test/goal-multi-run-recovery.test.ts packages/storage/test/session-input-snapshot.test.ts`；核对逐项的输入序号、消息位置、唯一 Run、暂停原因和提交边界，并验证新 Run 不继承旧 Evidence。

- [x] //TODO 4. 显式 Steer 在同一 Run 生效，并与决策和完成提交正确竞争
  - 落实标准：[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[2.3](./spec.md#spec-req-2-3)、[8.3](./spec.md#spec-req-8-3)。
  - 先验证：扩展 `packages/runtime/test/run-steer.test.ts`，在模型、工具、Think 和完成审查被阻塞时受理 Steer，观察不触发原调用 abort、消息在后续安全点按序应用；用可控提交屏障分别验证 Steer 先受理与完成先提交。保存后重建同一 Run，重复身份不重复追加正文；旧输入的未执行 Action 和旧完成候选不得继续生效。
  - 实施目标：将既有 Steer 受理与应用接入统一账本及修订，保持目标 Run 校验、待应用顺序、模型 frame 身份及失效指针清理；先完成已启动工具的真实结算，再重建模型输入。终态转换在同一 Gate 检查新输入，拒绝时不自动降级成普通队列消息，提供可供 Web 核验的收据与拒绝结果。
  - 验证手段：`npx tsx --test packages/runtime/test/run-steer.test.ts packages/runtime/test/model-context-frame.test.ts packages/runtime/test/think-decision-recovery.test.ts packages/runtime/test/completion-review.test.ts`；断言同一 goalId／runId、受理与应用事件、实际请求正文、Action 次数及重建后的消息位置。

- [x] //TODO 5. 显式 Interrupt 原子暂停队列，并保留有限收尾与取消的真实状态
  - 落实标准：[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5)、[3.3](./spec.md#spec-req-3-3)、[8.5](./spec.md#spec-req-8-5)。
  - 先验证：扩展 `packages/runtime/test/run-interrupt.test.ts` 和 `program-interruption.test.ts`，在模型、普通工具及 PTC 执行中请求中断，确认受理不等待停止完成，队列已暂停且原任务不再准入。覆盖未知效果核查、必要审批、收尾预算耗尽、重复中断，以及中断／Steer／完成／关闭的不同提交顺序；重建实例只读不收尾，显式恢复继续原预算。
  - 实施目标：在同一提交中保存中断意图、输入收据与暂停状态，再委派现有 Abort 和有限修复路径；公开状态区分已受理、停止／收尾、待审批和 cancelled。保留已有授权、沙箱、预算、未知效果记录和工具真实返回规则，不重写收尾算法、不把断线或宿主关闭转成用户 Interrupt。
  - 验证手段：`npx tsx --test packages/runtime/test/run-interrupt.test.ts packages/runtime/test/program-interruption.test.ts packages/runtime/test/execution-control.test.ts packages/storage/test/run-input-control-snapshot.test.ts`；检查取消传播范围、资源停止／实际调用数、剩余预算与持久化未知结果，收尾未结算时不得报告已取消或启动队首。

- [x] //TODO 6. 通过匹配交互与显式恢复继续执行，并保持模型和权限边界
  - 落实标准：[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4)、[8.1](./spec.md#spec-req-8-1)、[8.2](./spec.md#spec-req-8-2)、[8.3](./spec.md#spec-req-8-3)、[8.4](./spec.md#spec-req-8-4)。
  - 先验证：在待实现的 `packages/runtime/test/session-recovery.test.ts` 中，保存 ask_user、Plan 提案、Action／沙箱审批或既有恢复等待后重建；只读、重复创建和普通消息均不代答或推进，匹配回答只恢复同一 Run，错请求或旧修订拒绝。验证 `resume` 不自动解除失败／Interrupt 队列暂停；两个 Goal 交替执行时各自重新对齐模型 Binding，安全点之外的切换不改快照。
  - 实施目标：把 `respond`／`resume` 和队列继续接入统一收据、目标身份与后台执行所有权，委派现有 Coordinator、模型选择及权限服务。默认恢复保持只读，匹配回答作为显式操作推进对应等待；关联自定义工具仍经过发现、授权和审批，不通过会话接口暴露直接执行 Action 的捷径。
  - 验证手段：`npx tsx --test packages/runtime/test/session-recovery.test.ts packages/runtime/test/goal-coordinator-task-interaction.test.ts packages/runtime/test/permission-grant-recovery.test.ts packages/runtime/test/sandbox-plan-recovery.test.ts packages/runtime/test/goal-model-selection-coordinator.test.ts apps/goal-server/test/composition-root-model-switching.test.ts`；核对错误身份零执行、同 Run 续跑、Grant 范围、Binding 和冻结 Profile。

- [x] //TODO 7. 持续订阅整个 Goal，并通过状态同步处理重连、缺口与背压
  - 落实标准：[7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)、[7.4](./spec.md#spec-req-7-4)、[7.5](./spec.md#spec-req-7-5)、[7.6](./spec.md#spec-req-7-6)、[6.1](./spec.md#spec-req-6-1)、[9.6](./spec.md#spec-req-9-6)。
  - 先验证：在待实现的 `packages/runtime/test/session-stream.test.ts` 和既有 `packages/execution-stream/test/execution-stream.test.ts` 中控制注册订阅、读取快照和连续创建后继 Run 的先后关系；首项是 `state_sync`，切换 Run 不丢开始事件，旧调用增量不进入当前回复。注入最后一次提交通知丢失并推进 fake clock，验证不超过 Spec 约定的一秒核对间隔就能观察终态；读取失败报告同步故障。
  - 实施目标：在原 Core 增加 Goal 范围订阅与来源身份，在 Runtime 会话模块完成快照修订、缓冲交接、类型化安全投影、缺口重同步及按 Goal 合并的只读核对任务。沿用相邻增量合并和有界背压，控制事件无法保留时关闭慢订阅；无观察者停止核对，不持久化或重放每个分片，不将发布失败转为业务回滚。
  - 验证手段：`npx tsx --test packages/runtime/test/session-stream.test.ts packages/runtime/test/execution-stream-runtime.test.ts packages/execution-stream/test/execution-stream.test.ts`；验证 eager 订阅、多 Run 来源、修订去重、backpressure、原始敏感字段不泄露以及一个订阅退出不影响其他订阅或执行。

- [ ] //TODO 8. 用异步输入流驱动 Session，并安全结束来源、句柄和单消息等待
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)、[1.3](./spec.md#spec-req-1-3)、[7.5](./spec.md#spec-req-7-5)、[7.6](./spec.md#spec-req-7-6)、[8.5](./spec.md#spec-req-8-5)、[8.6](./spec.md#spec-req-8-6)、[9.3](./spec.md#spec-req-9-3)。
  - 先验证：在待实现的 `packages/runtime/test/session.test.ts` 中使用可计数、可阻塞的异步生成器，证明每次只等待持久化受理而非 Run 完成；业务拒绝继续消费，保存失败停止预取。覆盖 EOF、来源异常、卡住的 `next()`／`return()`、detach 后迟到消息、两个输入来源和两个订阅；单消息调用在等待与各终态返回真实身份，通知丢失不挂起。
  - 实施目标：落实 `send`／`consume`／`events`／`read`／`getInput`／`detach` 及内部 `sessions.query`，所有操作委派同一 Runtime 状态所有者。停止消费后拒绝迟到项，来源资源归宿主；只释放封装自己的订阅，不关闭借用实例。把自有消费者、核对任务和后台执行纳入现有生命周期，有界关闭未结算时保留类型化错误，不伪造 Run 取消。
  - 验证手段：`npx tsx --test packages/runtime/test/session.test.ts packages/runtime/test/session-stream.test.ts packages/runtime/test/runtime-lifecycle.test.ts packages/runtime/test/execution-control.test.ts`；使用 fake clock 和受控 Promise 断言零越界预取、零重复应用、无消费者驱动的执行取消、宿主仍可继续运行。

- [ ] //TODO 9. Web 服务统一受理会话输入，并移除重复预约和旧控制路由
  - 落实标准：[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[3.5](./spec.md#spec-req-3-5)、[6.2](./spec.md#spec-req-6-2)、[7.1](./spec.md#spec-req-7-1)、[7.3](./spec.md#spec-req-7-3)、[7.5](./spec.md#spec-req-7-5)、[8.3](./spec.md#spec-req-8-3)、[8.4](./spec.md#spec-req-8-4)、[8.6](./spec.md#spec-req-8-6)、[9.6](./spec.md#spec-req-9-6)。
  - 先验证：在待实现的 `packages/browser/test/browser-session-inputs.test.ts` 中通过真实路由验证统一 inputs、收据查询和 Goal SSE；新受理 202、重复收据 200，错误正文明确且脱敏。扩展现有访问控制、投影和管理测试，验证错误 Host／Origin／令牌无调用，缺失收据与读取失败不同，断连不取消，多客户端不重复创建 Run，待处理输入阻止终态删除。
  - 实施目标：在 `web-contracts` 定义新的严格 wire 联合与安全投影；Browser 通过窄 Port 委派 Session，现有 `apps/goal-server/src/runtime/` 增加接线并共用 Binding 和生命周期。迁移创建、消息、回答、Steer、Interrupt、恢复与 Goal 事件路由，删除被替代的 DTO／控制路由、Browser 去重／执行预约和后台推进算法；保留模型、权限、Provider、指标与历史接口，通过相同提交边界管理。
  - 验证手段：`npx tsx --test packages/browser/test/*.test.ts`、`npm --prefix apps/goal-server test`、`npx tsc --noEmit -p apps/goal-server/tsconfig.json`；受影响旧测试改用新契约并保留安全、拒绝、模型绑定和持久化断言，不能用第二套兼容路由通过测试。

- [ ] //TODO 10. Web 默认发送到持久化队列，并清楚展示 Steer、Interrupt 和恢复状态
  - 落实标准：[3.4](./spec.md#spec-req-3-4)、[3.5](./spec.md#spec-req-3-5)、[4.4](./spec.md#spec-req-4-4)、[5.3](./spec.md#spec-req-5-3)、[7.3](./spec.md#spec-req-7-3)、[9.1](./spec.md#spec-req-9-1)、[9.2](./spec.md#spec-req-9-2)。
  - 先验证：扩展真实浏览器 `apps/goal-board/e2e/runtime.test.mjs`，并在待实现的 `e2e/streaming-session.test.mjs` 中用受控服务覆盖运行中默认 Queue、显式 Steer、停止／收尾／审批／cancelled、队列继续和清空。刷新、多标签与断线后核对服务端顺序；请求拒绝保留草稿，丢响应重试复用原身份；重启页面只显示待恢复而不发起模型调用。
  - 实施目标：改造 API 与输入 Hooks，使 Session 状态成为已受理队列和调度的唯一来源；删除 `useQueue` 的自动发送、`queue-persistence` 的任务镜像及不再有效的测试，不把旧 localStorage 任务导入 Runtime。界面区分草稿、提交中、已受理、待应用与当前消息，提供明确的 Steer／Interrupt／恢复／继续操作；保留本地草稿，切换会话不让迟到响应覆盖新选择，产品文案使用英文。
  - 验证手段：`npm --prefix apps/goal-board test`、`npm run build:web`，然后 `node --test --test-concurrency=1 apps/goal-board/e2e/streaming-session.test.mjs apps/goal-board/e2e/runtime.test.mjs apps/goal-board/e2e/run-input-control.test.mjs`；真实 Chrome 检查按钮行为与页面状态，HTTP 测试不能代替 UI 断言。

- [ ] //TODO 11. 从现有无界面入口贯通会话调用，并保持 CLI 和 Headless 执行语义
  - 落实标准：[1.4](./spec.md#spec-req-1-4)、[6.4](./spec.md#spec-req-6-4)、[9.4](./spec.md#spec-req-9-4)、[9.5](./spec.md#spec-req-9-5)、[9.6](./spec.md#spec-req-9-6)。
  - 先验证：扩展现有 `apps/goal-server/test/execution-composition.test.ts`、`runtime-composition.integration.test.ts`、`runtime-recovery.integration.test.ts` 和 `benchmarks/test/headless-composition-root.test.ts`，通过真实入口运行文本生成器、工具、问答／审批、关闭与重建；CLI 启动／信号与退出测试保持，不产生额外模型调用、端口绑定或第二条执行链。
  - 实施目标：在现有 runtime 目录入口暴露 `sessions`，补齐仓库内最小调用示例并由组合根消费；Headless 的单次运行与观察复用 Runtime 会话能力，保持原装配位置、环境、工具、预算和评分边界，不迁包或重写 Benchmark。更新 Runtime、Storage、Execution Stream、Browser、Goal Server、Goal Board 及实际受影响 Headless 说明与语义表；按现有脚本增量约束新目录／入口，示例不得依赖未导出的 Runner 或构建产物。
  - 验证手段：`npx tsx --test apps/goal-server/test/execution-composition.test.ts apps/goal-server/test/runtime-composition.integration.test.ts apps/goal-server/test/runtime-recovery.integration.test.ts apps/goal-server/test/process-lifecycle.integration.test.ts apps/goal-server/test/cli-xdg.integration.test.ts benchmarks/test/headless-composition-root.test.ts`；运行 `npm run check:dependencies` 和 `npm run check:docs`。只使用临时数据与确定性模型／工具，不为示例启动真实 Provider。

## Feature Verification

### Planned Checks

各测试的新增场景由相应 TODO 实现。下表规定完整交付的可观察判据，不能以部分任务完成或单元测试数量替代。路径、命令和断言必须在实际执行时存在；缺失浏览器或依赖记为未满足，不自动跳过。

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
| --- | --- | --- | --- |
| 创建后及时返回 | [1.1](./spec.md#spec-req-1-1) | 首次保存失败时零调用；保存成功后收据返回，模型仍被屏障阻塞；释放后才推进。 | TODO 1／2 测试，保存与模型调用时序、磁盘收据。 |
| 连接与创建重试不恢复执行 | [1.2](./spec.md#spec-req-1-2)、[1.5](./spec.md#spec-req-1-5) | 重建后 open、重复 create 均保留原身份且零模型／工具调用；缺失或损坏数据明确失败。 | TODO 2／6，文件 Store 重建与调用计数。 |
| 长期会话与内部无界面入口 | [1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4) | Run 四类状态不关闭 Session；从现有目录入口运行输入生成器、工具、审批和重建，不创建 SDK 包、HTTP 或信号监听。 | TODO 2／8／11，目录入口消费测试与装配副作用断言。 |
| 持久化受理与幂等身份 | [2.1](./spec.md#spec-req-2-1)、[2.3](./spec.md#spec-req-2-3) | 受理／应用／完成不同；保存后重试和响应丢失只返回同一收据，载荷冲突不改旧记录，重复控制不重复批准或建 Run。 | TODO 1／4／5／6／9，核对收据、应用关联与实际执行次数。 |
| 输入流继续读取与失败界限 | [2.2](./spec.md#spec-req-2-2)、[2.4](./spec.md#spec-req-2-4) | 阻塞业务执行仍读取后续合法控制；业务拒绝后继续消费，保存失败不再预取，原身份可查，不报虚假成功。 | TODO 8 的计数生成器、deferred 保存及输入结果事件。 |
| 来源结束和失败不取消任务 | [2.5](./spec.md#spec-req-2-5) | EOF、异常、主动停止只影响对应来源；已受理队列、另一来源和输出继续，保留原始异常。 | TODO 8，来源结果、后继 Run 数量和另一订阅事件。 |
| 普通消息的 FIFO 与原子后继 | [3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2) | 执行／等待中不注入普通消息；正常完成按两项 FIFO 各创建一次新 Run；后继提交前后崩溃均不重复建 Run。 | TODO 3，磁盘 Snapshot、Run 历史、消息区间和输入应用关联。 |
| 等待、暂停、继续与清空 | [3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4) | 审批等待不出队；失败或中断暂停，新消息不解暂停；继续从原队首启动，清空不影响当前 Run、已应用消息或收据。 | TODO 3／5／6／10，状态及调用计数，并在 Web 操作后读取正式快照。 |
| 持久化队列与容量 | [3.5](./spec.md#spec-req-3-5)、[3.6](./spec.md#spec-req-3-6) | 关闭页面／进程后顺序仍在；单条 64,000、128 项和累计 1,048,576 code unit 边界有明确允许／拒绝结果；满额不妨碍控制；重试不重复占额。 | TODO 1／3／9／10，文件重建、边界数据和浏览器刷新。 |
| Steer 应用与完成竞争 | [4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3) | 同 Run 受理不 abort；安全边界按序应用；两种提交先后均返回明确结果，旧 Action／终态不能越过已受理 Steer。 | TODO 4，可控模型／工具屏障及轨迹、实际请求断言。 |
| Steer 拒绝、重试与重启 | [4.4](./spec.md#spec-req-4-4) | 旧 Run 或停止中拒绝不转 Queue，草稿／原身份保留；重启显式恢复不重复追加用户消息。 | TODO 4／10，Runtime 重建和真实页面拒绝场景。 |
| Interrupt 受理与真实取消 | [5.1](./spec.md#spec-req-5-1)、[5.3](./spec.md#spec-req-5-3) | 中断意图和队列暂停共同落盘；受理及时返回，观察停止、收尾、必要审批后才 cancelled，其他 Goal／宿主不被中止。 | TODO 5／10，模型、工具、PTC 计数及真实页面状态。 |
| 有限收尾与恢复预算 | [5.2](./spec.md#spec-req-5-2)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5) | 未知效果不重复原操作或伪造回滚；重建仅在显式恢复后继续原收尾预算；重复与并发控制不重置预算，不正常完成未结算中断。 | TODO 5／6，既有 run-interrupt、program-interruption 与文件恢复测试。 |
| 问答、任务与工具审批可恢复 | [6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2) | 先保存等待再输出；关闭／重建后匹配回答继续原 Run，旧请求、普通文本或不同回答重试不能放行。 | TODO 6／7／9／10，问答、Plan、Action、沙箱和既有恢复选择的明确用例。 |
| 模型与权限的唯一规则 | [6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4) | Goal 交替运行不串 Binding；队列应用使用最新合法选择；模式选择、撤销、工具发现和自定义工具保持授权范围，无直接执行捷径。 | TODO 6／11，模型选择集成测试及权限／工具实际调用断言。 |
| 首次同步与跨 Run 交接 | [7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2) | 注册／读快照／提交各顺序下首项均为一致同步，后继 Run 开始可观察，来源明确；旧分片不污染当前回复。 | TODO 7／9，deferred 同步屏障和连续短 Run，不依赖真实网络时序猜测。 |
| 重连与末次通知丢失 | [7.3](./spec.md#spec-req-7-3)、[7.6](./spec.md#spec-req-7-6) | 重连用 Snapshot／收据恢复，清除临时片段；丢失最后通知也在一秒核对周期内发现终态，读取失败报告同步错误。 | TODO 7／8／10，fake clock、丢通知注入及真实服务断线／重连。 |
| 背压、可见性与观察隔离 | [7.4](./spec.md#spec-req-7-4)、[7.5](./spec.md#spec-req-7-5) | 有界合并，控制结果放不下时明确 backpressure；退出／监听异常不改变执行；公开输出不带密钥、隐藏推理或任意完整 Tool 数据。 | TODO 7／8／9，Core 背压测试、安全投影和多订阅计数。 |
| 显式恢复与暂停约束 | [8.1](./spec.md#spec-req-8-1)、[8.2](./spec.md#spec-req-8-2) | 重启、只读连接、新普通消息不恢复旧工作；匹配修订才能 resume，等待仍需匹配回答，队列暂停另行显式继续。 | TODO 2／3／6／10，重建后的零调用和逐步授权／队首启动断言。 |
| 多客户端与单活动 Goal | [8.3](./spec.md#spec-req-8-3)、[8.4](./spec.md#spec-req-8-4) | 同 Goal 多客户端受理有序且不覆盖，只有一个执行器；其他 Goal busy 无隐式排队，当前 Goal 的控制及读取不被长调用阻塞。 | TODO 1／2／4／6／9，提交屏障、实际执行器计数及 Binding 断言。 |
| 句柄释放与有界关闭 | [8.5](./spec.md#spec-req-8-5)、[8.6](./spec.md#spec-req-8-6) | detach 释放自身来源／订阅，迟到 next 不受理，执行继续；Runtime 关闭结算在途写入和自有资源，超时不报成功；未处理输入阻止删除／归档。 | TODO 3／5／8／9／11，fake clock、资源计数、磁盘边界和管理拒绝。 |
| Web 发送与队列唯一真源 | [9.1](./spec.md#spec-req-9-1)、[9.2](./spec.md#spec-req-9-2) | 默认 Queue，Steer／Interrupt 明确；拒绝保留草稿，未知结果复用身份；刷新／多标签重建队列，旧本地任务不导入、不由前端 effect 启动后继 Run。 | TODO 9／10，真实 Chrome + 正式 HTTP／SSE 服务，并检查快照和工具调用。 |
| 单消息调用与宿主入口 | [9.3](./spec.md#spec-req-9-3)、[9.4](./spec.md#spec-req-9-4) | query 返回指定 Run 的四类真实结果，释放自己的订阅且不关闭借用实例；CLI／Headless 的信号、预算、环境及评分行为保持，默认装配位置不迁移。 | TODO 8／11，query 测试、现有进程／Headless 回归与调用示例。 |
| 完整消费证据与模块边界 | [9.5](./spec.md#spec-req-9-5)、[9.6](./spec.md#spec-req-9-6) | 无界面及 Web 两条路径均完成组合流程；源码接口和文档一致，新源码／测试被实际检查，无反向应用依赖、新 SDK 包或测试外数据清理。 | 全部 TODO，根回归、类型／依赖／文档检查、真实浏览器结果和下面的状态指纹。 |

组合流程必须覆盖：

1. 创建 Session → 阻塞首轮 → 默认排入两条消息 → 显式 Steer → 首轮完成 → 两个后继 Run 顺序完成；期间关闭页面，后台仍消费已受理项，重连后身份与顺序一致。
2. 活动工具／PTC → Interrupt 受理并暂停队列 → 停止与必要收尾审批 → cancelled → 新消息保持暂停 → 显式继续队列；另在收尾中重建实例，先确认零自动调用，再显式恢复并核对剩余预算。
3. 问答／Plan／Action／沙箱等待 → 关闭实例 → 重建并读取 → 旧修订或错身份拒绝 → 匹配回答继续同一 Run；普通队列消息始终不能代答。
4. 初始保存失败、提交后崩溃、响应丢失、完成竞争、末次通知丢失、慢订阅、输入源异常及不合作迭代器分别注入；结果必须能由收据、Snapshot 和已提交事实核验，不能依赖 UI 文本猜测是否执行。

完成全部 TODO 后执行的综合检查：

```sh
npm test
npx tsc --noEmit -p apps/goal-server/tsconfig.json
npm --prefix apps/goal-server test
npm --prefix apps/goal-board test
npm run build:web
node --test --test-concurrency=1 apps/goal-board/e2e/*.test.mjs
git diff --check
```

`npm test` 当前已包含根类型检查、文档门、依赖门、GEPA adapter 的确定性测试以及自动发现的 TS／脚本测试；浏览器 E2E 单独执行并使用新构建。执行时核验新增测试实际进入发现范围，不把不存在的测试或缺失环境记为通过。针对性检查通过后只按本计划完成剩余必要覆盖，不无理由重复全量回归；若集成修改影响已有结果，则更新受影响证据。

### Latest Result

- 状态：未执行。
- 验证时间：未执行。
- 实测 Git 提交：无；当前仅完成计划编写，未实施本功能。
- 契约版本／指纹：执行前记录本次获批 `spec.md`／`plan.md` 的内容 SHA-256；本阶段尚无功能验收证据。
- 未提交实现及指纹：无本功能实现；执行时按实际路径和 diff／内容指纹记录，不混入其他工作。
- 结果与证据：未运行上述功能检查；执行时逐项记录实际命令、观察结果、证据位置和未解决问题。
- 汇总状态／新鲜度：未执行，不宣称 passed／current。后续按 `passed / failed / blocked / pending-human` 与 `current / stale` 记录；失败、缺失条件和未确认人工项均不得算成功。
