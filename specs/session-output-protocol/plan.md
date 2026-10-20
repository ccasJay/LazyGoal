# 会话输出协议与正式消息执行计划

## 任务清单

本计划落实已批准的 [spec.md](./spec.md)，沿用其 [high 风险评估](./spec.md#风险与否定性保证)。实施前须核对 streaming-session、model-output-streaming、human-interaction 的实际交付及当前接口，批准规划不等于前置能力已实现；缺少基础受理／同步、内容块或规范交互视图时，不能以旧 Browser 内存机制通过组合验收。本计划不授权实施其他 Spec 或联合编排。

action-approval-revision 是关联能力：存在时验证真实最终版本／恢复引用；尚未实现时只表达当前真实操作与恢复状态，明确记录未提供的修订能力，不捏造字段或把它当作已验收。不能因此省略当前已有的 PTC、未知结果和重执行语义。关联 Spec 接入后，受影响的集成证据须重新核验。

按编号依次执行，每项先建立失败断言／受控探针再实现。先落地稳定消息和去重能力，再保存混合正文，避免中间状态重复喂入模型；之后接入输出、候选、查询、同步和 Web。所有新增测试均标为待实现，前置 Spec 新增的测试在执行时按实际路径发现。任务内同步公开中文 TSDoc、最小示例及所属模块概览／语义表，完成时只勾选复选框，保留 `//TODO` 原文。

主工作区已有 model-catalog／模型绑定修复、其他 Spec／Plan 不在本次实现写集。保持当前 Snapshot 版本原位更新，不增加旧数据迁移、旧 wire 双解析、SDK 包或额外事件数据库；只清理本次测试数据，不改写已批准的上游文件。

- [x] //TODO 1. 让所有正式消息在原提交中获得稳定身份、用途和来源

  落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[8.4](./spec.md#spec-req-8-4)。
  - **先验证**：创建、普通输入应用、Steer、问答／审批反馈、零工具正文、等待／失败／完成通知均有稳定 messageId、runId 和实际来源；纯控制与未应用队列没有伪消息。同源重试返回原消息，不同来源相同正文保留两条，来源冲突明确失败。保存前失败、保存成功后抛错及文件重建不重复消息或改写正文，messageRange／原始索引仍正确。
  - **实现**：扩展 GoalMessage、全部消息写入／克隆、当前 Snapshot 编解码和边界不变量；助手用途区分 process／answer／notice。将来源核对、身份分配和消息保存纳入基础 Goal 短提交，同相关 Run／输入事实共同提交，通知在保存后产生。宿主结果只使用实际执行来源，不虚构模型调用；迁移当前 fixture 和消费者，不按正文 hash 或数组位置生成身份。
  - **验证**：新增 `packages/runtime/test/message-identity.test.ts`、`packages/storage/test/goal-message-snapshot.test.ts`（待实现），扩展现有 `domain.test.ts`、`goal-multi-run-session.test.ts`、`goal-coordinator-task-interaction.test.ts`、`packages/storage/test/goal-snapshot-current.test.ts`、`goal-snapshot-interaction.test.ts`；运行对应 `npx tsx --test`、`npx tsc --noEmit` 和应用构建。真实 JsonFileGoalStore 重建后比对身份、来源、修订和消息数量，不以纯 codec 往返代替提交故障验证。

- [x] //TODO 2. 在最终请求选择与预算中按来源去重过程正文和原生交换

  落实标准：[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[4.5](./spec.md#spec-req-4-5)、[8.2](./spec.md#spec-req-8-2)。
  - **先验证**：准备带持久化来源的过程消息和同源原生交换，已结算且实际选入请求时正文只出现一次，调用与结果相邻。交换未结算、被预算淘汰、协议／模型身份切换或不存在时，保留仍在 Conversation 预算内的正文；用户消息、另一调用及独立答案即使同文也不删除。压缩／预算选择前后及存储重建得到同样的最终请求，不从 Trace 或未提交 tail 补来源。
  - **实现**：传递消息／调用／块来源到 model-view、model-context 的已提交交换和 model-request；让覆盖判定参与现有选择、预算及渲染，只有本次真正入选的同身份交换可覆盖。保留 conversationPosition、sourceMessageIndex、签名和结果配对，不另建历史或全局文本去重；本任务建立受测能力，TODO 3 才新增混合正文的生产提交。
  - **验证**：新增 `packages/model-request/test/process-message-dedup.test.ts`（待实现），扩展 `packages/model-context/test/native-model-history.test.ts`、`model-inference-projector.test.ts`、`packages/model-request/test/render.test.ts`、`prompt.test.ts`、`section-context-recovery.test.ts` 及 `packages/context-budget/test/model-context-budget.test.ts`；运行对应 `npx tsx --test`。捕获实际 LLMRequest、已选预算单元和最终输入估算，不能只测试一个去重函数或字符串出现次数而忽略配对。

- [x] //TODO 3. 在接受完整响应后保存混合工具响应的公开过程正文

  落实标准：[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.5](./spec.md#spec-req-4-5)、[8.2](./spec.md#spec-req-8-2)。
  - **先验证**：真实阶段执行器返回正文／工具／正文混合块，每个公开正文块只在响应及现有阶段校验接受后成为一条有序 process 消息；工具仍等待整体成功及原有准入／审批。响应失败、无效参数或完成候选被审查拒绝时无提前正式正文；审批等待或后续工具失败保留已提交过程说明，不能变成成功证据。零工具正文、Think、直接调用和 PTC 父程序保持原 Step／模型／工具计数及可见性。
  - **实现**：在 model-execution 的完整结果中携带公开正文来源，Runner 将正文与已接受的 frame／决策边界共同保存，接入 TODO 1 身份及 TODO 2 覆盖规则。保留每块顺序，不保存 reasoning、协议 JSON 或工具参数；不为每段正文增一次模型请求、Step 或 Observation。模型调用和父程序来源不可套到 PTC 子操作。
  - **验证**：新增 `packages/runtime/test/process-message.test.ts`（待实现），扩展 `packages/model-execution/test/native-step-executor.test.ts`、`packages/runtime/test/completion-review.test.ts`、`think-decision-loop.test.ts`、`program-execution.test.ts`、`packages/storage/test/program-recovery.test.ts`；运行对应 `npx tsx --test`。捕获实际下一模型请求、Snapshot／轨迹、审批等待和工具计数，覆盖正文保存与工具执行之间的屏障及重建。

- [x] //TODO 4. 通过 Session 类型化输出区分输入、正式消息、工具、交互和 Run 结果

  落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[2.3](./spec.md#spec-req-2-3)、[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5)。
  - **先验证**：同一 Goal 依次出现受理／应用、生成、消息保存、工具审批／执行／返回／Observation 提交、交互结算、waiting 和终态；每项类型、来源及提交关联准确。工具生成不发可响应审批，waiting 不发 completed，Run 终态重发以 runId 归并且 Session 保持开放。PTC、未知结果和实际已接入的参数修订保留领域身份；退出观察不取消执行，Interrupt／收尾／连接关闭分别表达。
  - **实现**：在 Runtime Session 明确输出联合及同步／实时／提交来源，复用既有受理、提交通知、交互视图和运行状态；类型不依赖 web-contracts。消息通知关联来源／预览，不将模型完成当成正式提交；工具区分实时返回与已提交事实，私有原始结果不进入公共信封。保留单消息封装的等待返回和既有资源所有权，不增加调度、回调或状态账本。
  - **验证**：新增 `packages/runtime/test/session-output.test.ts`（待实现），扩展 `execution-stream-runtime.test.ts`、`goal-coordinator-task-interaction.test.ts`、`run-interrupt.test.ts`、`program-interruption.test.ts` 和前置 Spec 已交付的 Session／交互测试；运行对应 `npx tsx --test`。核对真正写入／执行顺序与类型化消费结果，关联修订能力的验证范围按计划开头的实际交付条件记录，不伪造实现证据。

- [x] //TODO 5. 从受信请求与内容块中安全提取候选 summary 预览

  落实标准：[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.6](./spec.md#spec-req-3-6)、[7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[8.1](./spec.md#spec-req-8-1)。
  - **先验证**：实际 Decide 声明匹配、工具身份可靠时，跨分片 summary 产生有位置和来源的解码文本；测试引号／反斜线、换行、Unicode 代理对、字段顺序、嵌套同名字段及歧义重复键。未声明工具、私有审查、任意 JSON 路径和身份不可靠时不泄漏；晚到身份、Gemini whole／strict 完整决定及无模型来源宿主结果只在可用时给完整候选。64,000 code unit 边界明确截断，原完整响应不受影响。
  - **实现**：在理解本次声明的模型执行／响应协调层接入调用级受信观察，投影固定允许字段，不修改 llm-core／Adapter 的业务职责，不读取全局诊断或 Trace。使用能够处理字符串状态的提取方式，不能用正则／eval／补字符解析；错误隔离为对应预览停止或作废，不修改完整候选。复用调用／块来源创建预览引用、位置和阶段／Run 归属，whole 不模拟逐字。
  - **验证**：新增 `packages/model-execution/test/summary-preview.test.ts`（待实现），扩展 `completion-review.test.ts`、前置模型输出 Spec 的真实 SDK／SSE fixture 及 `packages/model-response/test/stage-response.test.ts`；运行对应 `npx tsx --test`。检查所有公开序列化事件而非只某个 text delta，保留 Evidence、Memory Patch、签名、reasoning 和 metadata 的不同敏感标记，确认正式响应及调用次数未被预览错误改变。

- [x] //TODO 6. 让候选只在真实提交后成为正式消息，并正确作废或核对不确定结果

  落实标准：[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[3.5](./spec.md#spec-req-3-5)、[3.6](./spec.md#spec-req-3-6)、[8.1](./spec.md#spec-req-8-1)。
  - **先验证**：用模型、完成审查、Steer 和文件保存屏障控制 generating → 完整候选／待确认 → 提交，只有保存成功才出现 answer／message_committed。协议拒绝、审查拒绝、取消、Runtime 弃用或替代只作废对应预览，下一候选使用独立身份，Run 不因此自动 failed。保存成功后抛错／读取故障时保持待核对，读到原消息才确认；预览歧义或与最终 summary 不同的旧预览不复活，正式内容以规范结果明确替换。阶段接受不是 Run 最终答复。
  - **实现**：将候选接受／拒绝关联接入现有 Runner 完成、阶段、修复和控制边界，正式消息走 TODO 1 的同源提交，输出走 TODO 4。只维护临时预览观察状态，正式来源由 Snapshot／已提交事实保存；不持久化未确认正文、不绕过完成审查，不增加重试预算或“观察失败即执行失败”的反馈。
  - **验证**：新增 `packages/runtime/test/candidate-message-commit.test.ts`（待实现），扩展 `completion-review.test.ts`、`run-stage-review.test.ts`、`run-steer.test.ts`、`trajectory-checkpoint-committer.test.ts`、`trajectory-failure.test.ts` 和 `packages/storage/test/goal-message-snapshot.test.ts`（TODO 1 新增）；运行对应 `npx tsx --test`。核对正式文件、消息来源、候选终态和真实工具／模型计数，不能用只抛错但从未落盘的 Store 代表提交结果不明。

- [x] //TODO 7. 按稳定消息身份提供有界列表和正文只读查询

  落实标准：[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)。
  - **先验证**：分页首批固定 throughMessageId，翻页期间追加消息不会混入既定范围，afterMessageId 保持顺序；默认 50、最大 100 条，正文每次最多 64,000 UTF-16 code unit，跨代理对调整后不丢字／重复。空集合、末页、正文截断、未知／跨 Goal ID、反向范围、非法分页与读取故障各有明确结果；无令牌、错误 Host／Origin 不读取详情，所有合法只读查询零模型／工具／状态写入。
  - **实现**：在 Session 读 Port 中查询当前 Snapshot 的正式消息和稳定范围，返回截断、实际位置及后续位置；Browser 映射两个获批 GET 入口并验证 wire 参数。公开消息 DTO 保留身份和来源摘要，不从预览补正文、不建立第二套账本或磁盘分页索引，不把消息缺失与读取错误混为一谈。
  - **验证**：新增 `packages/runtime/test/session-message-query.test.ts`（待实现），扩展 `packages/browser/test/browser-messages.test.ts`、`browser-projection.test.ts`、`packages/web-contracts/test/web-contracts.test.ts`；运行对应 `npx tsx --test`。通过真实 HTTP 读列表／正文，并在每页之间提交新消息、重建文件 Store，再比对读取拼接与已保存原文；访问控制不能只测试 DTO 守卫。

- [x] //TODO 8. 在同步竞争、断线和通知缺失后恢复正式结果而不拼接残缺预览

  落实标准：[1.1](./spec.md#spec-req-1-1)、[1.5](./spec.md#spec-req-1-5)、[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4)、[6.5](./spec.md#spec-req-6-5)。
  - **先验证**：分别在注册订阅、读取 Snapshot、缓冲交接及保存后发布处设置屏障，先见 state_sync 再接有效活动，不重放旧候选。重连首次仅见非零位置增量时不展示为从头完整文本；完整候选／正式消息可重建基准，作废或已覆盖的旧增量不能复活。丢弃最后一条消息／waiting／终态通知且不再发 token，基础只读核对仍发现真实提交；重复／迟到、快速后继 Run、多客户端、Publisher 重建、背压和读取故障不伪造结果或重复输入。
  - **实现**：扩展基础 Session 同步投影，携带消息范围、来源及预览位置，复用已有缓冲／修订核对和故障类型，不再起一套每连接轮询。按持久化身份归并正式消息／交互／Run 结果，按实时来源处理增量；读取失败保留待核对状态，重新连接只读、不自动 resume 或 Interrupt。
  - **验证**：新增 `packages/runtime/test/session-output-recovery.test.ts`（待实现），扩展 `packages/execution-stream/test/execution-stream.test.ts`、`packages/browser/test/browser-recovery.test.ts` 及基础 Session 订阅测试；运行对应 `npx tsx --test`。使用文件重建、独立观察者和受控时钟证明末次通知核对确实运行且只读，无观察者时不遗留任务；不能用持续发 token 掩盖最后通知丢失。

- [ ] //TODO 9. 将真实 HTTP／SSE 和当前 Web 消费入口切换到单一安全会话协议

  落实标准：[1.4](./spec.md#spec-req-1-4)、[2.3](./spec.md#spec-req-2-3)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5)、[7.1](./spec.md#spec-req-7-1)、[7.3](./spec.md#spec-req-7-3)、[7.4](./spec.md#spec-req-7-4)。
  - **先验证**：内部句柄和真实 HTTP／SSE 对同一受控会话输出相同公开语义；页面生成预览、待确认、正式替换、候选作废、等待和终态各可消费，正式通知和重复同步不追加两份正文。跨 Goal 切换的迟到响应无效；断线／流 EOF 不显示 Run cancelled，等待不显示 completed。公开整个序列无参数、reasoning、签名、原始 Observation／metadata 或私有提示词。
  - **实现**：迁移 web-contracts 联合／守卫、Browser 单一 Goal SSE 投影，以及 Goal Board API／useRunStream 和必要状态消费；消息使用稳定身份／来源，现有临时区域继续表达未保存状态。删除被取代的旧 wire 类型和解析路径，不保留第二条 SSE、不做内容块布局或表单重做；输出不能驱动自动审批或调度，详情继续授权读取。
  - **验证**：新增 `packages/browser/test/browser-session-output.test.ts`、`apps/goal-board/test/session-output-api.test.ts`、`apps/goal-board/test/session-output-consumer.test.ts`（待实现），扩展 `packages/web-contracts/test/web-contracts.test.ts`、`packages/browser/test/browser-stream.test.ts` 和当前活动投影测试；运行对应 `npx tsx --test`、`npm --prefix apps/goal-board test`、`npm run build:web`。正式页面的提交替换／作废行为由 TODO 10 的 Chrome 场景确认，静态 markup 不替代。

- [ ] //TODO 10. 从正式装配贯通候选、过程历史、消息查询和 Web 恢复，并完成全功能验证

  落实标准：[8.1](./spec.md#spec-req-8-1)、[8.2](./spec.md#spec-req-8-2)、[8.3](./spec.md#spec-req-8-3)、[8.4](./spec.md#spec-req-8-4)。
  - **先验证**：正式 createRuntimeComposition／Session 使用真实 SDK 加本地协议 fixture，走混合正文＋工具、必要审批、完成候选预览、接受／拒绝、后继 Run、关闭和文件重建；通过实际下一请求确认正文无重复。同步运行宿主和 HTTP／SSE，Chrome 检查候选转正式只显示一份、拒绝后旧候选作废、断线后正式消息恢复及分页原文；查询和重连不调用模型／工具。分别验证支持真实参数增量的来源和 whole 参数来源，不声称所有供应商逐字输出。
  - **实现**：新增装配和浏览器端到端场景，修复本次协议／身份／来源接线遗漏；同步 Runtime、Storage、模型执行／响应／视图／上下文／请求、Execution Stream、Browser、Web Contracts 及实际应用说明。核对所有消息写入与克隆／编码、实际输入和 wire 入口都切换，不新增 SDK、Outbox 或旧协议回退，不重写前置功能。
  - **验证**：新增 `apps/goal-server/test/session-output.integration.test.ts`、`apps/goal-board/e2e/session-output.test.mjs`（待实现），扩展现有 `runtime-composition.integration.test.ts`、`runtime-recovery.integration.test.ts`、`browser-session.integration.test.ts` 及实际受影响的 e2e fixture。执行下方 Feature Verification 的组合流程和最终检查；缺少前置能力、真实 Chrome 或必要环境应报告未满足，不能改为仅测 DTO 后标记完成。

## Feature Verification

### Planned Checks

新增测试在所属 TODO 中创建，现有测试需补齐对应断言。表中每条验收均须有可归属当前代码和契约的证据；规划检查、类型导出、先前功能绿灯或测试数量不能代替行为证明。

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
| --- | --- | --- | --- |
| 跨 Run 长期输出 | [1.1](./spec.md#spec-req-1-1) | 同步后覆盖各类输出与后继 Run，Run 结束不关闭 Session。 | TODO 4／8，Session 输出和快速续跑屏障。 |
| 类型及来源 | [1.2](./spec.md#spec-req-1-2) | 输入、消息、预览、Action 和交互按明确联合与身份消费，无未知 payload 猜测。 | TODO 4，类型入口、实际序列和来源断言。 |
| 受理／生成／提交分离 | [1.3](./spec.md#spec-req-1-3) | 受理不冒充应用，模型结束不冒充消息／Run 完成，工具返回不冒充已提交结果。 | TODO 4，真实保存和工具返回屏障。 |
| 宿主与 Web 一致 | [1.4](./spec.md#spec-req-1-4) | 同一调用源在内部句柄和真实 SSE 中具有一致的公开语义、身份及修订。 | TODO 4／9，双消费者与序列化结果。 |
| 观察不控制执行 | [1.5](./spec.md#spec-req-1-5) | 单消息等待返回、解除订阅和读取故障不审批、调度或取消其他执行。 | TODO 4／8，调用计数与独立句柄。 |
| 稳定消息身份 | [2.1](./spec.md#spec-req-2-1) | 所有真实写入携带 messageId／runId／来源与正确用途，角色保持。 | TODO 1，写入矩阵与 Snapshot／codec。 |
| 同源提交幂等 | [2.2](./spec.md#spec-req-2-2) | 同源重试复用身份，冲突拒绝，保存不明先核对而非创建新消息。 | TODO 1／6，文件落盘后抛错及再读。 |
| 正式通知归并 | [2.3](./spec.md#spec-req-2-3) | 保存后才通知，关联预览且重复不增正文，同文不同源不误合并。 | TODO 1／4／6／9，通知顺序和消费结果。 |
| 身份和 Run 恢复 | [2.4](./spec.md#spec-req-2-4) | 跨 Run／重建／分页保持身份和范围，未应用队列／控制没有伪消息。 | TODO 1／7，messageRange、文件恢复和列表。 |
| 有界正文可继续读 | [2.5](./spec.md#spec-req-2-5) | 最近范围和正文明确截断，可按 ID 读原文，不存在不同于读取失败。 | TODO 7，真实 GET、全文拼接和故障状态。 |
| 受限字段预览 | [3.1](./spec.md#spec-req-3-1) | 仅实际声明允许的 summary 形成未确认候选，其他参数／审查正文不可见。 | TODO 5，声明与字段投影矩阵。 |
| 分片字符串解析 | [3.2](./spec.md#spec-req-3-2) | 转义、Unicode、嵌套／同名字段正确，身份未知则等待整块，不猜补字符。 | TODO 5，分片位置和完整值比对。 |
| 接受并保存才正式 | [3.3](./spec.md#spec-req-3-3) | 生成后待确认，审查接受且 Snapshot 成功才正式；阶段接受不是最终答复。 | TODO 6，阶段／审查／保存三组屏障。 |
| 候选作废 | [3.4](./spec.md#spec-req-3-4) | 拒绝、取消、Steer 弃用或替代使对应预览作废，新候选不续写旧内容。 | TODO 6，控制竞争、修复及独立身份。 |
| 保存不明和不一致 | [3.5](./spec.md#spec-req-3-5) | 不明先核对；歧义／不一致预览不复活，正式规范内容显式替换来源。 | TODO 6，真实落盘故障、读取故障及不一致 fixture。 |
| whole 和宿主结果 | [3.6](./spec.md#spec-req-3-6) | 只在可用时提供完整候选，无假增量／假模型来源，投影异常不改业务结果。 | TODO 5／6，whole、非模型 Executor 和投影故障。 |
| 混合响应正式正文 | [4.1](./spec.md#spec-req-4-1) | 完整接受后逐公开块保存 process，失败只有预览，无 reasoning／JSON／参数。 | TODO 3，真实阶段与 Runner 提交。 |
| 过程消息不执行 | [4.2](./spec.md#spec-req-4-2) | 与来源共同提交，不增 Step／调用，审批等待或工具失败不伪装成功。 | TODO 3，计数、等待、工具失败和零工具正文。 |
| 按入选来源去重 | [4.3](./spec.md#spec-req-4-3) | 入选已结算交换覆盖同源正文，同文其他消息保留，调用／结果仍配对。 | TODO 2，实际 LLMRequest 和来源集合。 |
| 预算及身份变化 | [4.4](./spec.md#spec-req-4-4) | 交换缺席／淘汰／身份变化时保留预算内正文，最终输入与估算一致。 | TODO 2，紧预算与模型切换矩阵。 |
| 重建来源判定 | [4.5](./spec.md#spec-req-4-5) | 文件重建后按已提交来源去重，不依赖 Trace／旧配置／未提交 tail。 | TODO 2／3，来源持久化和恢复后的下一请求。 |
| 工具活动真实性 | [5.1](./spec.md#spec-req-5-1) | 生成、审批、尝试、返回、提交、未知各来自实际阶段／事实。 | TODO 4，模型及工具／保存时序屏障。 |
| 实际版本和 PTC 来源 | [5.2](./spec.md#spec-req-5-2) | 输出采用当前真实执行／恢复身份，PTC 有父子归属；修订存在时关联实际最终版本。 | TODO 4，真实领域输出；按关联能力条件记录集成证据。 |
| 已提交交互 | [5.3](./spec.md#spec-req-5-3) | 等待保存后输出规范请求，结算／新等待准确关联，正文不代答。 | TODO 4／9，交互竞争及 HTTP／SSE。 |
| 等待与终态 | [5.4](./spec.md#spec-req-5-4) | waiting 无 completed，真实终态按 Run ID 归并，关联正式结果消息。 | TODO 4／9，Session 和页面消费。 |
| 中断与连接分离 | [5.5](./spec.md#spec-req-5-5) | 受理、收尾、cancelled、EOF、重启各有真实状态，无隐式 resume。 | TODO 4／9，Interrupt 与连接关闭场景。 |
| 一致初始同步 | [6.1](./spec.md#spec-req-6-1) | 注册／读取／缓冲竞争下先同步再交接，不重放旧候选或触发执行。 | TODO 8，三处屏障与状态修订。 |
| 缺失前缀 | [6.2](./spec.md#spec-req-6-2) | 非零首位置明确不完整，完整候选／正式消息可替换，旧分片不复活。 | TODO 8，断线重连和来源位置。 |
| 最后通知丢失 | [6.3](./spec.md#spec-req-6-3) | 保存后无通知且无新 token，基础只读核对仍发现消息／等待／终态。 | TODO 8，丢通知、受控时钟和文件真值。 |
| 背压与同步故障 | [6.4](./spec.md#spec-req-6-4) | 溢出／读取失败／Publisher 重建要求核对，不撤销提交或重发输入。 | TODO 8，独立订阅和进程／发布器重建。 |
| 多客户端跨 Run | [6.5](./spec.md#spec-req-6-5) | 后继 Run 来源正确，旧 Run 迟到事件不覆盖当前，业务身份跨连接稳定。 | TODO 8，多句柄、快续跑和乱于提交到达的通知。 |
| 白名单公开 | [7.1](./spec.md#spec-req-7-1) | 全序列只含允许字段，任意路径、reasoning、签名、参数／Observation 不越界。 | TODO 5／9，敏感标记排查和访问边界。 |
| 大小和截断 | [7.2](./spec.md#spec-req-7-2) | 预览 64,000 边界、列表页限及正文位置明确，原文保存／执行不变。 | TODO 5／7，边界数据和实际原文。 |
| HTTP／SSE 边界 | [7.3](./spec.md#spec-req-7-3) | Host／Origin／Bearer、身份和页参数校验，错误脱敏，无旧事件双解析。 | TODO 7／9，真实 HTTP 及 wire 校验。 |
| 当前 Web 单协议 | [7.4](./spec.md#spec-req-7-4) | API／Hook 能消费未确认／正式／等待／结果，不重复追加，不保留旧流。 | TODO 9，客户端测试及 TODO 10 Chrome 场景。 |
| 候选故障矩阵 | [8.1](./spec.md#spec-req-8-1) | 合法提升、拒绝、歧义、保存不明和通知缺失均有真实提交证据。 | TODO 5／6／10，屏障、文件和输出比对。 |
| 正文与上下文矩阵 | [8.2](./spec.md#spec-req-8-2) | 直接／PTC、零工具、审批、预算／身份变化和重建不重复历史或改变 Step 规则。 | TODO 2／3／10，真实下一请求及调用／证据计数。 |
| 正式装配链路 | [8.3](./spec.md#spec-req-8-3) | SDK／本地协议 → Session → HTTP／SSE → 页面，覆盖重连、分页、多客户端和背压。 | TODO 10，装配集成测试与 Chrome e2e。 |
| 全部入口与文档 | [8.4](./spec.md#spec-req-8-4) | 写入／克隆／codec／视图／wire 全迁移，说明及 TSDoc 同步，无 SDK／迁移分支。 | TODO 1／10，调用点核对、类型／构建／依赖／文档及回归。 |

以下组合流程需从正式入口贯通，不能仅汇总单元测试通过数量：

1. **过程与最终答复**：正式 Session 受理 → 真实 SDK／本地 SSE 输出混合正文和工具 → 完整接受后保存过程消息 → 必要审批与工具执行 → 下一请求仅含一份同源正文 → summary 预览 → 审查及保存 → 一条正式答复与真实 Run 结果。
2. **拒绝、竞争与不确定保存**：首候选预览 → 审查拒绝或 Steer 弃用 → 旧预览作废且无正式答复 → 新候选 → Snapshot 已落盘但调用报错／通知丢失 → 同源查询恢复原 messageId；不重复模型／工具效果，不将候选作废等同于 Run failed。
3. **多客户端与恢复**：两个句柄／页面跨快速后继 Run 观察 → 断线缺失前缀 → 重连 state_sync → 查询历史和分段正文 → Publisher／进程重建 → 已提交消息身份和等待保持，未确认预览不回放，连接不自动 resume。
4. **预算、协议和隐私**：同源原生交换入选／淘汰／未结算与模型切换分别捕获实际请求；参数 whole 和可安全增量投影两条路径都通过。默认输出与真实 SSE 全序列仅含允许内容，私有阶段及其他工具参数不因候选提取而外泄。

最终命令在新增测试实际存在后执行，不能在规划阶段宣称其通过：

```sh
npx tsx --test packages/runtime/test/message-identity.test.ts packages/storage/test/goal-message-snapshot.test.ts packages/model-request/test/process-message-dedup.test.ts packages/runtime/test/process-message.test.ts packages/runtime/test/session-output.test.ts packages/model-execution/test/summary-preview.test.ts packages/runtime/test/candidate-message-commit.test.ts packages/runtime/test/session-message-query.test.ts packages/runtime/test/session-output-recovery.test.ts packages/browser/test/browser-session-output.test.ts apps/goal-server/test/session-output.integration.test.ts
npm test
npm --prefix apps/goal-server run build
npm --prefix apps/goal-board test
npm run build:web
node --test --test-concurrency=1 apps/goal-board/e2e/session-output.test.mjs apps/goal-board/e2e/runtime.test.mjs
npm run check:dependencies
npm run check:docs
git diff --check
```

按当前回归脚本运行包／应用／Benchmark 与脚本检查，独立应用构建和 Chrome 场景补足其覆盖之外的入口。必要依赖或环境缺失记为 blocked，断言失败记为 failed；不移除、缩短或弱化必需检查。产品文案保持英文，本计划与公开契约 TSDoc 使用中文。

### Latest Result

- 状态：未执行。
- 验证时间：-。
- 测试提交：无，尚未开始实现。
- 契约基线：已批准的 `spec.md`，SHA-256 `f8bab8720b7657d85fcb306d33b9bd06f3659cb600fc75311d1daa649139cbf1`。
- 验证摘要：本阶段仅创建计划；前置 Spec 批准及规划文档检查不证明功能已实现。执行后逐项记录实际检查、结果、证据位置、关联能力范围、未解决项、Git／工作树和契约指纹；全部适用必需结果满足后才可标记 passed／current。
