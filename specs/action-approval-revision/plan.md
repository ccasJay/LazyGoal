# 工具审批参数修订与未知结果重执行执行计划

本计划落实已批准的 [Spec](./spec.md)，风险等级沿用其 [high 评估及否定性保证](./spec.md#风险与否定性保证)。本阶段仅完成计划；实施需要另有明确执行指令。

前置依赖是 [streaming-session](../streaming-session/spec.md) 的统一受理／收据、提交协调、执行所有权、同步、中断和恢复，以及 [human-interaction](../human-interaction/spec.md) 的新交互区域、请求／响应、宿主处理器及提交状态。实施前核对两份依赖的实际实现提交与 Feature Verification，不能从已批准文件推断功能存在；未就绪时报告缺失项，不在本计划内补做依赖 Spec、不使用旧 Browser 内存流程兜底。本计划不改写这些已批准文件，也不授权联合执行三份 Spec。

各任务先验证具体失败行为，再实现和验证；新测试标为“待实现”，命令表示实施后的入口，不是现有通过证据。依赖缺失造成的导入错误不属于有效行为 Red。每项任务同步变更公开契约的中文 TSDoc 和变化所有者说明，最后一项再核对整体一致性。任务完成只勾选复选框，保留 `//TODO` 描述。现有 Provider／模型绑定工作不在本次写集内；后续实施按适用执行流程隔离，避免混入任务提交。

## 任务清单

- [x] //TODO 1. 让审批者只读审阅同一工具的最终参数与权限范围

  落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)。
  - **先验证**：首次未执行审批中修改同一工具参数，预检返回最终 canonical 输入、实际目标／能力变化、可用期限及审阅引用；已执行／未知／失效引用、换工具、无效参数和策略拒绝均明确失败。对比预检前后 Snapshot、Grant 账本、模型／工具计数，证明无写入或执行。并行预检各自保留结果，路径／权限变化令旧审阅确认失败，无关队列写入不误使同一审批失效。
  - **实现**：在 Runtime 与现有内部 Session／窄管理 Port 接入预检，复用工具准备、执行准入、Permission 与 Sandbox 规则，通过受保护 wire 返回可审阅数据；绑定原审批基准、最终输入、期限与有效能力的审阅指纹。参数与路径元数据准备不跨越长时间 Gate，确认仍需复核；不持久化编辑候选、不暂存 Grant、不启动审批回调，不引入新授权或配置引擎。
  - **验证**：新增 `packages/runtime/test/action-approval-review.test.ts`（待实现），扩展 `packages/browser/test/browser-interactions.test.ts`、`packages/permission/test/tool-authorization.test.ts` 和 `sandbox-decision.test.ts`；运行这些文件的 `npx tsx --test`。用路径／策略可控变化探针和现有沙箱规划检查真实 scope，不只比较预检响应字段。

- [ ] //TODO 2. 把原请求与最终批准版本关联并让直接调用执行正确参数

  落实标准：[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[2.3](./spec.md#spec-req-2-3)、[3.1](./spec.md#spec-req-3-1)、[3.4](./spec.md#spec-req-3-4)、[6.4](./spec.md#spec-req-6-4)。
  - **先验证**：将原操作写入目标 A 改为 B，只在绑定最终审阅结果的确认保存后调用工具，实际输入和沙箱计划均指向 B。断言原 Action ID、原模型响应、原 `action_staged` 保留，获批版本不可再改；原样批准、拒绝／建议仍有效。修订后旧批次未执行项失效，回到模型决策；保存失败无调用，同身份重试无重复消息／批准，停止与不同决定竞争仅一个按提交顺序有效。
  - **实现**：扩展现有 Coordinator、transition、当前 Snapshot／Trajectory 契约和执行版本选择入口，保存原请求到最终版本的关联、批准来源／种类与输入收据。确认时重算审阅、在基础短提交中冻结版本，再唤醒执行；直接准备、调用、沙箱计划及结果关联统一取最终版本。修订结算后清除直接批次未开始项，不把它们记作已执行；不覆盖原暂存事实、不为版本更换逻辑 Action ID。
  - **验证**：新增 `packages/runtime/test/action-approval-revision.test.ts`（待实现），扩展 `goal-coordinator.test.ts`、`transition.test.ts`、`packages/storage/test/goal-snapshot-interaction.test.ts` 和 `action-observation-recovery.test.ts`；运行对应 `npx tsx --test`，直接检查受控工具捕获的输入、原事实及最终 Snapshot，而非只断言 approved 状态。

- [ ] //TODO 3. 让持续授权绑定最终版本并支持批准保存失败后的新决定

  落实标准：[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[3.5](./spec.md#spec-req-3-5)、[3.6](./spec.md#spec-req-3-6)。
  - **先验证**：修订参数后选择 Goal／工作区授权，检查 matcher 和实际执行版本一致；单次批准无 Grant。Grant 已暂存而批准保存失败后，换参数或期限并使用新决定身份不会被旧 pending 阻塞；旧记录不可匹配或激活，相同决定重试复用自身记录。批准保存后激活失败／重启，可恢复激活精确引用；篡改来源／最终输入／能力范围时拒绝执行。
  - **实现**：在 Tool／Sandbox 两类 Grant 的事务来源、唯一性与激活契约中关联稳定 `approvalInputId`，获批状态保存相同关联。保持 pending → 批准 Snapshot → 激活 → 调度顺序，两个账本均只激活被已提交批准引用的记录；不修改既有输入／路径 matcher、期限或撤销语义，不把残留 pending 自动删除，不用新决定绕过结果不明的已生效批准。
  - **验证**：扩展 `packages/runtime/test/permission-grant-recovery.test.ts`、`packages/storage/test/json-file-tool-grant-store.test.ts`、`sandbox-grant-store.test.ts` 和 `packages/permission/test/grant-matching.test.ts`，在新修订测试中加入保存／激活闩锁。运行上述 `npx tsx --test`，以两个真实 JSON 账本、批准快照、执行计数核对每个故障边界；路径型授权继续允许既有范围内不同正文，不误收窄为本次正文摘要。

- [ ] //TODO 4. 分开首次批准与本次未知结果的重执行授权

  落实标准：[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[4.5](./spec.md#spec-req-4-5)、[3.5](./spec.md#spec-req-3-5)。
  - **先验证**：首次批准不能消费未知等待，恢复命令不能消费首次审批。明确重执行绑定当前 `recoveryRef` 和最终参数，只执行该版本；改参、持续授权、YOLO／已有 Grant 代答均无效。再次未知形成新恢复身份，旧决定重试只返回原收据；拒绝重执行保留先前未知事实，不声称原操作未发生、已回滚或成功。排列重执行／拒绝／Interrupt／关闭先后并检查真实结果。
  - **实现**：在 Session 响应、Coordinator 和 transition 拆分首次批准、修订批准、未知重执行与拒绝重执行分支；由已提交尝试／未知结果生成稳定恢复引用。保留最终版本、真实未知来源和新的尝试关联，复用现有恢复分流、有限暂时故障重试及 PTC／中断预算；直接恢复仅重建等待，旧兼容 approve 分支不再接受未知结果，不增加人工填写成功入口。
  - **验证**：新增 `packages/runtime/test/action-reexecution.test.ts`（待实现），更新 `goal-coordinator.test.ts`、`runner.test.ts`、`run-interrupt.test.ts`、`packages/browser/test/browser-recovery.test.ts` 和 `packages/storage/test/action-observation-recovery.test.ts` 的实际消费者。运行对应 `npx tsx --test`；对同一 Action 连续制造两次未知，检查不同恢复引用、原参数／最终参数及调用次数，证明旧授权不可复用。

- [ ] //TODO 5. 让 PTC 修订子调用执行最终参数并按原请求恢复重放

  落实标准：[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5)。
  - **先验证**：固定程序在指定调用位置请求参数 A，批准修订 B 后实际 Tool 与 sandbox plan 使用 B。重建程序仍发出 A 时关联同一逻辑调用并仅返回已保存的 B 结果及修订信息；程序原调用被改变、关联缺失或结算不一致时仍报重放失配。审批后重启、写入未知和中断不使用旧参数、不跳过恢复；父 Step 单次结算，之前子结果及预算保留。
  - **实现**：PTC 准入与执行复用任务 2 的最终版本选择，重放仍对原请求身份和 canonical 输入校验；保留原唯一暂存和已结算 Observation，以关联事实解释修订／尝试。扩展结果信封的可选修订元数据和事实引用，不改变业务 Observation 输出；恢复返回一致信封，字节／帧／累计结果与执行预算包含新增内容，不修改程序代码、调用顺序或放行嵌套／系统工具。
  - **验证**：新增 `packages/runtime/test/program-approval-revision.test.ts`（待实现），扩展 `program-execution.test.ts`、`program-interruption.test.ts`、`packages/storage/test/program-recovery.test.ts` 及其真实恢复夹具、`packages/sandbox/test/program-sandbox.test.ts`。运行对应 `npx tsx --test`；使用实际 worker／IPC 与受控工具捕获最终参数、返回修订元数据、重放次数及资源边界，不以假的 callback 代替程序重建。

- [ ] //TODO 6. 让模型、历史查询和完成证据理解实际修订操作

  落实标准：[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4)、[6.5](./spec.md#spec-req-6-5)。
  - **先验证**：原请求写 A、实际修订写 B 后，下一模型请求明确解释变化，原生调用仍保留原 ID／参数且只配对真实结果；历史、Activity 和完成证据不能将 B 成功解释成 A 已写。PTC 即使不显式返回元数据，下一模型安全边界仍有有界修订说明；其余内部子事实不全量暴露。旧直接批次项不执行，模型读到说明后重新决策。
  - **实现**：将已提交修订、批准、实际结果及来源关联接入模型上下文／请求、原生历史、只读历史查询与 Browser／Activity 安全投影；Evidence 解释统一使用最终版本，不另建完成规则。保留原 Provider 响应、系统工具调用和程序源码，按现有预算／可见性提供必要参数、差异与引用，明确截断，不公开广播完整自定义输入或敏感正文。
  - **验证**：新增 `packages/model-context/test/action-revision-context.test.ts`（待实现），扩展 `native-model-history.test.ts`、Runtime 的 `evidence-gate.test.ts`、`completion-review.test.ts`、`multi-run-context-lookup.test.ts` 和 Browser 投影测试。对当前三种模型协议经过正式解码和下一请求组装检查配对、说明、计量／截断与事实引用；运行对应 `npx tsx --test`，不能只检查一条提示文案存在。

- [ ] //TODO 7. 在新 Web 审批区域完成编辑、审阅、确认和明确重执行

  落实标准：[7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)、[7.5](./spec.md#spec-req-7-5)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)。
  - **先验证**：真实浏览器中同一工具 JSON 编辑／校验 → 预检 → 对比原与最终参数／目标／范围 → 选择期限 → 明确确认；退出编辑不修改操作。再次编辑／换期限使旧预检失效，迟到响应不覆盖草稿，详情不完整不能确认。丢失确认回复按原身份核验，另一客户端结算或独立停止使旧操作失效；恢复视图只有明确 Retry action／拒绝，无编辑和持续授权。
  - **实现**：扩展 human-interaction 已交付的交互区域、响应控制器和详情 Port，增加 JSON 参数编辑、字段错误与只读差异审阅，不引入通用表单引擎或第二套提交状态机。接入只读预检与新的决定联合，说明路径型持续授权含义、扩大范围和重执行重复效果；沿用英文文案、主题 token、草稿冻结、320px 窄屏与键盘规则，不重写任务／问答流程。
  - **验证**：新增 `apps/goal-board/test/action-approval-revision.test.tsx`、`apps/goal-board/e2e/action-approval-revision.test.mjs`（均待实现），扩展 Browser 交互／恢复测试和正式服务夹具。运行 `npm --prefix apps/goal-board test`、`npm run build:web`、`node --test --test-concurrency=1 apps/goal-board/e2e/action-approval-revision.test.mjs`；检查实际 API／收据、隔离文件目标、权限范围、双客户端行为、焦点及截图，不以静态组件输出替代验收。

- [ ] //TODO 8. 让无界面宿主通过正式预检返回修订或恢复决定

  落实标准：[7.4](./spec.md#spec-req-7-4)、[1.2](./spec.md#spec-req-1-2)、[2.3](./spec.md#spec-req-2-3)、[7.3](./spec.md#spec-req-7-3)、[8.3](./spec.md#spec-req-8-3)。
  - **先验证**：从现有无界面装配注册普通审批处理器，显式预检后返回绑定最终参数与期限的修订决定，实际工具执行新参数。注册／预检不自动处理历史工作；缺少专用恢复处理器时未知等待不被普通审批函数代办。取消、真人竞争和预检后范围变化时结果失效，不能把 updatedInput 直接交给 Tool 执行。
  - **实现**：扩展现有 Session 预检／响应的类型化入口、human-interaction 处理器结果联合及组合根窄接线，为恢复函数提供当前 `recoveryRef` 和最终版本。保持宿主与 Web 同一受理／权限路径和解除／关闭语义，新增公开方法同步中文 TSDoc 与最小示例；不发布 SDK、不移动装配或重复解析可信同进程类型。
  - **验证**：新增 `apps/goal-server/test/action-approval-revision.integration.test.ts`（待实现），扩展现有 `runtime-composition.integration.test.ts`、`runtime-recovery.integration.test.ts` 与前置功能处理器测试；运行相应 `npx tsx --test` 和 `npx tsc --noEmit -p apps/goal-server/tsconfig.json`。使用真实文件存储、正式组合根、假模型与隔离工具，不启动 HTTP／信号的宿主场景也能完成同一流程。

- [ ] //TODO 9. 完成跨边界故障验收并交付当前契约与操作说明

  落实标准：[8.1](./spec.md#spec-req-8-1)、[8.2](./spec.md#spec-req-8-2)、[8.3](./spec.md#spec-req-8-3)、[8.4](./spec.md#spec-req-8-4)。
  - **先验证**：按下方组合流程在最终集成状态验证直接／PTC、原样／修订、单次／持续及范围扩大／缩小／拒绝；确定性排列批准、拒绝、Interrupt、旧恢复决定与提交重试，并在预检后、Grant 暂存、批准保存、激活和工具开始处注入故障。证据必须包含实际输入、matcher、sandbox plan、Snapshot、轨迹、收据和工具次数。
  - **实现**：补齐任务链路中暴露的同范围集成缺口，迁移全部旧首次／恢复混用命令与消费方，不保留旧 wire／Snapshot 兼容分支。同步 Runtime、Permission、Storage、Sandbox、模型上下文、Browser、Goal Board 和现有宿主中实际改变所有者的概览／语义表／TSDoc／示例；不改写未变化模块、不修改依赖 Spec／Plan、不自动写 Memory 或迁移用户数据。
  - **验证**：运行完整 Feature Verification 与现有确定性回归／应用类型／真实 Chrome 检查；复用前述有覆盖且仍匹配最终状态的证据，必要时补有界竞态用例，不降低原成功条件。记录实际提交／未提交指纹、对应契约版本、脱敏证据和未满足项；缺环境／前置能力不得记为通过，也不执行真实付费模型或危险宿主命令。

## Feature Verification

### Planned Checks

以下检查覆盖全部验收结果。每条证据须关联具体场景、观察值和最终被测状态；检查方法可以等价替换，但不得降低结果要求。

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段／证据入口 |
| --- | --- | --- | --- |
| 首次未执行资格 | [1.1](./spec.md#spec-req-1-1) | 直接／PTC 同一业务工具的首次审批可改参；换工具、改父程序／位置、已批准／启动／未知／结算不可修订。 | 预检／修订／PTC 测试，检查拒绝前后等待及工具计数。 |
| 目标身份与输入类别 | [1.2](./spec.md#spec-req-1-2) | 错 Goal／Run／审批基准不产生 Grant 或执行；普通 message、问答和 Steer 不能改参批准。 | 正式 Session／Browser 入口及 Snapshot、输入账本断言。 |
| 最终版本冻结与原事实 | [1.3](./spec.md#spec-req-1-3) | 同一 Action 关联原请求与最终版本，获批后不能编辑，原 Provider 响应／程序请求／action_staged 未改写。 | `action-approval-revision.test.ts`（待实现）、当前 Snapshot 往返与轨迹比对。 |
| 拒绝建议与准入边界 | [1.4](./spec.md#spec-req-1-4) | 拒绝并建议换工具只反馈，不执行建议；改参不绕过 Profile、发现、Plan 只读和有限收尾范围。 | Coordinator／模式／中断既有测试加修订场景，实际 Tool 次数。 |
| 预检只读 | [2.1](./spec.md#spec-req-2-1) | 预检真实准备参数并给出范围，但 Snapshot／Grant／模型／工具计数不变。 | `action-approval-review.test.ts`（待实现）、两个账本及文件／调用探针。 |
| 能力变化与明确确认 | [2.2](./spec.md#spec-req-2-2) | 扩大／缩小范围都重算；批准精确覆盖所见范围，旧 scope／matcher 不复用，策略拒绝不可覆盖。 | Permission／Sandbox 正式规划和实际沙箱计划检查；Web 差异审阅。 |
| 审阅与提交一致 | [2.3](./spec.md#spec-req-2-3) | 确认绑定原基准、canonical 输入、期限和范围；元数据／策略变化后须重新审阅，不因无关队列提交失效。 | 可控路径／策略变化和同 Goal 队列并发探针，确认结果与零执行断言。 |
| 预检失败与草稿 | [2.4](./spec.md#spec-req-2-4) | 非法／超限输入、工具不可用、详情／规划失败保留等待和草稿，无裁剪、降级或执行原操作。 | 字段／边界测试及真实浏览器错误和重试流程。 |
| 多方预检隔离 | [2.5](./spec.md#spec-req-2-5) | 多客户端独立只读审阅，预检无候选写入／回调投递；一方确认后旧确认失效。 | 双句柄／双页面和处理器计数测试。 |
| 首次确认持久化 | [3.1](./spec.md#spec-req-3-1) | 原样／修订决定与最终指针、事实、收据共提交，保存失败无执行或权限激活。 | 批准保存闩锁、Snapshot 与收据、受控 Tool 输入。 |
| 最终参数持续授权 | [3.2](./spec.md#spec-req-3-2) | Goal／workspace 的 matcher 取最终参数／范围；暂存→批准保存→激活→执行，单次无 Grant，路径型范围语义保留。 | Tool／Sandbox 账本与 matcher 测试、事件顺序和真实执行计划。 |
| 激活与恢复复核 | [3.3](./spec.md#spec-req-3-3) | 激活前复核获批来源／最终输入／能力；文件重建后只激活同一批准版本，无模型替代 Action。 | `permission-grant-recovery.test.ts` 和新修订保存故障场景，模型／工具计数。 |
| 并发决定与幂等 | [3.4](./spec.md#spec-req-3-4) | 原样／修订／拒绝／中断的不同先后只有对应提交结果有效；相同输入重试复用收据，长调用不持提交锁。 | 可控并发闩锁、重复身份和停止响应测试。 |
| 崩溃后的执行分流 | [3.5](./spec.md#spec-req-3-5) | 批准后未启动与已启动未知能区分，按现有 replayPolicy 和显式恢复处理，不因改参自动重放。 | 文件存储重建、实际开始记录、safe／manual 直接与 PTC 场景。 |
| 孤立 pending 与新决定 | [3.6](./spec.md#spec-req-3-6) | 暂存后保存失败，换参／期限的新批准可继续；旧 pending 不匹配／激活，同身份仍幂等。 | 两类真实 Grant Store、`approvalInputId` 与 Snapshot 关联断言。 |
| 首次与未知分流 | [4.1](./spec.md#spec-req-4-1) | 首次批准和重执行互不消费对方等待，恢复引用定位本次未知。 | `action-reexecution.test.ts`（待实现）、transition 与 Browser 当前联合测试。 |
| 重执行限制 | [4.2](./spec.md#spec-req-4-2) | 必须明确引用最终版本；不可改参／持续授权，YOLO 和已有 Grant 不代答。 | 实际模式／账本状态下恢复拒绝与工具输入断言。 |
| 再次未知与预算 | [4.3](./spec.md#spec-req-4-3) | 同 Action 再次未知产生新引用；旧收据不授权新尝试，PTC／中断预算不重置，有限重试规则保留。 | 连续两次未知、原决定重放和预算计数；Runtime／PTC 测试。 |
| 拒绝重执行的真实含义 | [4.4](./spec.md#spec-req-4-4) | 拒绝仅阻止再执行，历史未知效果仍可见，无人工成功、回滚或未执行声明。 | Snapshot／Trajectory／模型／PTC 结果及 Activity 对照。 |
| 恢复决定竞争 | [4.5](./spec.md#spec-req-4-5) | 重执行与拒绝／中断／关闭有序结算；旧恢复引用无效，只读恢复不授权，原任务不越过中断。 | 恢复故障／中断测试与正式宿主生命周期用例。 |
| PTC 最终输入执行 | [5.1](./spec.md#spec-req-5-1) | 原程序／调用索引／Action 保留，批准 B 后准备、授权、sandbox plan 和 Tool 都使用 B。 | `program-approval-revision.test.ts`（待实现）实际 worker／工具捕获。 |
| PTC 原请求重放 | [5.2](./spec.md#spec-req-5-2) | 原请求 A 重建后匹配修订 B 的已提交结果，仅返回不执行；原请求变更／关联不完整仍失配。 | `program-recovery.test.ts` 与文件存储重建，副作用计数和父结果。 |
| PTC 结果元数据 | [5.3](./spec.md#spec-req-5-3) | 首次及恢复都返回一致修订标记、必要实际参数和事实引用，业务 Observation 输出不换形。 | worker IPC 返回值、保存结果和重放返回比较。 |
| PTC 预算与结算 | [5.4](./spec.md#spec-req-5-4) | 新信息计入帧／结果字节，调用顺序和父 Step 只结算一次，已有时间／调用预算不重置，嵌套／系统工具仍拒绝。 | Sandbox／PTC 边界测试、资源计数和父 Step 断言。 |
| PTC 故障边界 | [5.5](./spec.md#spec-req-5-5) | 审批后重启、写入未知、中断和保存失败恢复相同版本与位置；无旧参数重放，无已提交结果丢失。 | 正式 worker、持久化恢复夹具、PTC Interrupt 场景。 |
| 修订审计来源 | [6.1](./spec.md#spec-req-6-1) | 原请求、最终参数、批准与范围可追溯，模型调用／程序／原暂存仍原文，来源不伪造。 | 轨迹、原生响应、Snapshot／Grant 关联和摘要比对。 |
| 直接调用模型理解 | [6.2](./spec.md#spec-req-6-2) | 下一请求说明真实差异，调用 ID 和原参数保留，只配对真实结果，无伪造第二次成功。 | `action-revision-context.test.ts`（待实现）和三协议正式解码／组装。 |
| PTC 模型说明与隐私 | [6.3](./spec.md#spec-req-6-3) | 程序未返回元数据时模型仍获有界修订说明；其余内部事实不全量进入上下文，公开事件无任意完整输入。 | 请求／预算／截断及公开投影白名单测试。 |
| 旧直接批次失效 | [6.4](./spec.md#spec-req-6-4) | 修订后剩余旧直接 Action 未启动且模型重新决策；已执行结果不删，PTC 冻结程序按元数据自行继续。 | 批次控制测试、真实 Tool 顺序和下一模型请求。 |
| 最终目标与完成证据 | [6.5](./spec.md#spec-req-6-5) | 改写 B 的成功在历史／Activity／Evidence 中不成为 A 已写入的证据，原完成审查规则仍生效。 | Evidence／completion review／lookup 与 Browser 展示断言。 |
| 编辑与原样决定 | [7.1](./spec.md#spec-req-7-1) | JSON 编辑可用于自定义同工具 input；字段错误可定位，退出不改操作，仍能原样批准／拒绝。 | 新 Web 测试及正式工具输入，组件无通用 Schema 表单引擎。 |
| 审阅失效与范围后果 | [7.2](./spec.md#spec-req-7-2) | 原／最终输入、目标／能力／期限对比完整，编辑／改期限失效旧预检，迟到读取不覆盖，详情不足不可确认。 | Chrome 响应延迟、详情失败和范围改变流程及截图。 |
| 提交核验与独立停止 | [7.3](./spec.md#spec-req-7-3) | 预检成功不清草稿／报完成；确认丢回复按原身份核验，其他决定／停止使旧编辑失效，Stop 不被锁住。 | Chrome 双客户端／响应丢弃与 Session 收据、实际调用计数。 |
| 宿主正式预检与分派 | [7.4](./spec.md#spec-req-7-4) | 宿主先预检再返回修订；仅专用恢复函数接收未知等待，注册／读取／预检无历史执行。 | 正式无界面装配集成及处理器调用次数。 |
| 恢复界面与可操作性 | [7.5](./spec.md#spec-req-7-5) | 独立 Retry action／拒绝说明重复效果，无改参或持续权限；英文、桌面／320px、键盘均能审阅确认。 | 实际 Chrome UI、焦点／标签／错误关联和截屏。 |
| 修订授权完整矩阵 | [8.1](./spec.md#spec-req-8-1) | 两条执行路径、两种批准、三种期限和范围变化／拒绝均有真实结果；观察参数、matcher、plan 和收据。 | 任务 1—7 的适用最终状态证据及组合流程 1／2。 |
| 重建与故障完整矩阵 | [8.2](./spec.md#spec-req-8-2) | 预检后变化、暂存／保存／激活／调用开始前后及再次未知、PTC／Interrupt 均保持同一真实批准，不复用旧决定。 | 任务 2—5 的文件存储／故障闩锁与组合流程 3／4。 |
| 正式消费链路 | [8.3](./spec.md#spec-req-8-3) | 无界面与 Web 正式装配均能修订／恢复；三协议模型历史、PTC 返回和上下文说明一致，无真实付费 Provider。 | 新宿主集成、实际 Chrome 服务及模型上下文测试。 |
| 单一当前契约与文档 | [8.4](./spec.md#spec-req-8-4) | 旧混用决定及消费方完成迁移，无旧 wire／Snapshot 回退；变化所有者文档、TSDoc 和示例符合真实实现。 | 当前消费者搜索、文档／依赖／类型检查与示例集成。 |

组合流程须在最终集成状态成立：

1. 直接操作请求 A → 编辑为 B → 展示范围变化 → 明确确认 → 保存最终版本／Grant → 工具实际作用于 B → 模型获知修订并重新决策。原请求和原生调用保留，旧批次不执行，B 的成功不能证明 A 已完成；独立覆盖原样批准、拒绝建议、单次／Goal／workspace 及策略拒绝。
2. PTC 前序子调用已提交 → 当前子调用请求 A → 修订为 B 并批准 → 执行 B → 返回真实结果和修订元数据 → 重建程序再次发出 A → 重放已提交结果而不再执行。原请求改动仍拒绝，父 Step／预算／字节统计正确，程序未回传元数据也有下一模型边界说明。
3. Grant 暂存后批准保存失败 → 查询确认尚未批准 → 用不同参数／期限和新决定重试 → 新批准成功且旧 pending 永不激活；交换故障为批准已保存／激活前退出，显式恢复只能激活该批准精确引用。审批回复丢失则原身份核验，不能误用新决定重启执行。
4. 最终版本执行后结果未知 → 首次批准命令被拒绝 → 明确重执行 → 再次未知产生新引用 → 旧授权重试不执行 → 新恢复可拒绝且保留未知事实。排列恢复与 Interrupt／关闭先后，原任务不能越过中断，队列仍依前置 Spec 的显式规则继续。

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

`npm test` 当前包含根类型、文档／依赖检查、确定性 GEPA adapter、发现的应用／包／评测 TypeScript 测试及脚本测试；应用独立类型与真实 Chrome E2E 按上方分别覆盖，执行时核对最终脚本发现范围。新测试路径是计划入口，当前不存在时不得宣称已运行。Chrome 使用现有 CDP 方式、正式服务和可控模型／隔离工具，必要帮助函数无副作用，不导入其他测试触发重复执行。macOS Seatbelt、Chrome、依赖功能或其他必需环境缺失应记录未满足；跳过平台场景不能作为 PTC／沙箱验收通过。不使用用户 Home／Goal、不运行真实危险操作或付费 Provider。

### Latest Result

- 状态：未执行；未开始本功能实现或 Feature Verification。
- 验证时间、被测实现提交与相关未提交实现指纹：未记录。
- 契约版本：执行时记录本 Spec 与获批 Plan 的内容哈希，并记录实际集成的 streaming-session／human-interaction 契约、实现提交和前置验证证据。
- 验证摘要：尚无本功能行为验收结果；旧审批实现的测试或本次文档检查不证明修订／重执行能力已交付。
- 结果记录要求：逐项填写实际检查、观察值、脱敏证据位置和未解决项，标识被测提交或明确无提交并列出相关未提交路径及 diff／内容指纹。总体结果使用 `passed / failed / blocked / pending-human`，新鲜度使用 `current / stale`；失败、缺环境或未满足人工验收不得记为通过，不改写已完成 TODO 内容来掩盖后续修复。
