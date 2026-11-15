---
feature: runtime-create-answer-execution-ownership
status: proposed
risk: high
created_at: 2026-11-12
delivered_at: null
supersedes: []
superseded_by: null
---

# Runtime 会话创建、回答受理与执行所有权

## 目标与范围

落实 RC12、RC02：同一 Goal 的首次创建只有一个持久结果，交互回答和 blocked 恢复在解除等待时即可按原输入身份查询收据，后续推进占用实例的单一会话执行名额。
范围限于内部 Runtime Session API、Coordinator 的提交与推进交接、以及相关生命周期装配。Supervisor Trigger、Worker IPC 和浏览器协议沿用现有契约。

## 用户故事

- **S1** 作为创建会话的调用方，我希望首次创建与在途重试得到稳定的 Run 和收据，以便丢失响应后安全重连。
- **S2** 作为回答交互或恢复 blocked Run 的调用方，我希望在决定已保存时收到收据，以便独立跟踪后续执行。
- **S3** 作为嵌入 Runtime 的宿主，我希望创建和恢复共用执行名额，以便避免并行推进并能定位关闭时的未结算工作。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | 同一 Goal 的首次创建与同 inputId、同正文的请求并发，或创建响应丢失后按原身份重试 | 只成功创建一个首 Run、首条消息和首收据。正常创建者返回 `existing: false`，重复请求返回原收据和 `existing: true`。已存在 Goal 的重连仅打开句柄，重建 Runtime 后也须显式恢复才能重新推进。 | 挂起首次保存，使第二次创建并发进入。核对有效创建事实、Run ID、收据和推进次数。丢弃响应后在新实例中重试，检查无隐式推进。 |
| R1.2 | S1 | 异常 | 同 Goal 的创建请求使用不同 inputId、原 inputId 配不同正文，或用该 Goal 后续普通消息冒充首条输入 | 返回 `INPUT_CONFLICT`，保留首次提交的内容、Run 与收据。原 inputId 和正文重试沿用首次已冻结的创建配置。 | 并发不同输入与不同正文，再以已受理的后续消息调用 create。检查冲突、原快照及执行次数；同身份重试带不同配置时检查原配置。 |
| R1.3 | S1 | 异常 | 首次 Snapshot 确认前失败，或写入后抛错、提交 marker 失败 | 传播原创建故障并释放本次占用。保存前失败无执行，可按原身份重试创建。若 Snapshot 已保存，重试连接同一首 Run 并返回原收据，后续推进走显式恢复。 | 用文件 Snapshot 和 Trajectory 分别注入写入前失败、写入后抛错和 marker 失败。重开存储核对原身份、有效事实及零次未确认推进。 |
| R2.1 | S2 | 事件 | 有效 `respond` 或携带正文、匹配当前修订的 blocked `resume` 被受理 | 在一次 Snapshot 提交中应用决定或正文、推进当前等待并写入原 inputId、摘要、受理修订及目标 Run 的 `applied` 收据。`send` 和输入结果反馈以这次受理为准，下一轮模型或工具挂起时仍可取得收据。 | 用真实 Session 与 Coordinator，挂起下一模型或已批准工具，检查 `send` 返回、`getInput`、实时输入结果与该修订的状态及消息。覆盖问答、任务、工具、未知效果与 blocked 分支。 |
| R2.2 | S2 | 异常 | 重复原输入、同 ID 载荷冲突、不同输入竞争同一等待、等待身份失效，或 blocked 恢复修订已过期 | 原身份同载荷可返回已存收据，即使等待已解除或另一 Goal 占用名额。同 ID 异载荷返回 `INPUT_CONFLICT`。新输入只按最新 Goal／Run／等待或修订裁决。Interrupt 先受理时旧决定无效，后受理时保留已存收据并按原规则结算。 | 双回答和双恢复并发，覆盖同 ID、异载荷、不同 ID、改模型导致修订变化、两种 Interrupt 顺序以及另一 Goal 忙时的重复。核对唯一收据和有效决定。 |
| R2.3 | S2 | 异常 | 回答或 blocked 恢复提交失败、结果不明、受理后响应丢失，或后续执行失败 | 受理异常保留原故障及 inputId，按原身份查询权威 Snapshot。保存前失败保留原等待且无收据。已保存后抛错或 marker 失败时，状态与收据同在，传播异常，本次输入不触发新的推进。成功提交后即使响应丢失或执行失败，收据仍可查询，重复提交只返回原结果，后台按既有渠道报告执行故障。 | 以受控文件存储和故障注入验证三种持久化故障。另断开调用方、注入下一模型或工具失败，重开后按原 ID 查询／重试，检查无重复正文、审批、处理函数调用或工具副作用。 |
| R2.4 | S2 | 状态 | 显式 `resume` 面对仍待回答的历史交互、需明确恢复的 Run 或暂停队列 | 保留既有解锁、Run／修订核验与显式队列继续语义。历史交互可按既有规则解锁，仍需匹配回答。已受理未结算的 Interrupt 可被显式唤醒结算，暂停队列继续保持暂停。 | 运行 Session 恢复与交互处理器回归，检查历史等待、无正文 blocked、陈旧修订、队列暂停与未结算 Interrupt。 |
| R3.1 | S3 | 状态 | 创建、回答、显式恢复或既有队列唤醒需要推进，或回答与同 Goal 的旧执行退出交错 | 实例只有一个会话执行名额。新的推进受理在提交前取得该名额或由同 Goal 的执行所有者接手，另一 Goal 的新工作返回 `BUSY` 且无部分受理。成功交接后恰好推进目标 Run，运行期间状态投影不会误报 `needsRecovery`。失败或结算只释放本次拥有的名额。 | 用两个 Goal 控制名额取得、提交、等待与退出，覆盖回答恰好到达旧执行退出、跨 Goal create／resume 竞争及失败释放。核对执行峰值、快照和状态投影。 |
| R3.2 | S3 | 事件 | 已受理回答或恢复随后进入下一等待、终态或队列后继 Run，或者直接调用 Coordinator `resume` | 后台推进沿用当前 Run、模型绑定、已核对的 Action／Grant 授权、未知效果门禁和 FIFO。等待释放名额，终态按现有暂停和继续规则处理队列。重建后显式恢复沿用现有批准恢复规则，收据不能重建瞬时执行授权。直接调用 Coordinator 仍返回原有推进结果。 | 检查受理后实际工具参数及权限、重建后批准恢复、暂停与 FIFO 后继、后继 Run ID、模型绑定，并运行直接 Coordinator 的交互和 RC01／RC06 回归。 |
| R3.3 | S3 | 异常 | 实例关闭与创建、回答或恢复的受理／推进交接竞争，或已启动的推进超过关闭期限 | 关闭开始后拒绝新推进。在途写入与后台执行纳入结算，交接期间无漏登记；期限到达仍未结算时报告可定位的 Goal，必要时可按持久收据关联 Run。保留已提交收据及真实恢复状态，宿主关闭不产生用户 Interrupt。 | 在正式 Runtime 装配中分别挂起首次保存、回答提交与后台推进，验证关闭拒绝、等待或超时诊断。释放受控阻塞并重开，检查未提交和已提交两种状态、可查收据、无伪造取消。 |

组合：用 `packages/runtime/test` 的 Session 执行、恢复、交互竞态及队列测试验证上述时序，以显式闸门控制交错。用 `apps/goal-server/test/runtime-composition.integration.test.ts` 验证正式装配下的重连与关闭。运行 `npm test` 和 `npm run check:docs`。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| [SessionManager](../../packages/runtime/src/session-manager.ts) 在现有按 Store／Goal 的 [Mutation Gate](../../packages/runtime/src/goal-mutation-gate.ts) 内读取最新存在性、核对首条输入并执行首次检查点提交。会话创建身份沿用 Goal ID、首个 inputId 及规范化正文摘要，以首条持久输入为凭据。 | 同一进程内只有真正的创建者可分配并提交首 Run；持久化重连使用原收据。 | 无 |
| [Coordinator](../../packages/runtime/src/goal-coordinator.ts) 提供内部短提交路径，复用 [RC01／RC06](../runtime-stop-and-approved-action-handoff/spec.md) 的最新状态裁决和执行身份。Session 输入核验和账本条目随等待转换经 [共享提交器](../../packages/runtime/src/trajectory-checkpoint-committer.ts) 同时保存。Coordinator 的公开 `resume` 复用相同提交路径并继续等待原有推进结果。 | 等待转换只有一处规则，Session 可在执行结果返回前确认受理。 | 无 |
| SessionManager 沿用既有执行任务、单名额及 Runtime 生命周期登记。先取得推进权，再提交，释放 Goal Gate 后将已提交的目标 Run 和必要执行身份交给后台。旧执行的退出和新推进的接手由同一 owner 协调，队列后继仍用原执行循环。 | 从在途提交到后台推进都可追踪，模型、工具和人工等待留在短 Gate 外。 | 无 |
| 按权威 Snapshot 的输入账本核对提交结果。Trajectory marker 故障保留原错误与诊断。短提交异常后按原身份核验，已受理而尚未推进的 Run 由调用方显式恢复。 | 受理收据确认决定已保存，Run 状态表示执行进度；两者可分别核验。 | 无 |

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| high | 提交与调度交接可能重复启动获批工具，或在关闭时遗漏仍有外部效果的执行。 | 验收使用临时文件存储、可控模型和隔离工具。 |

按单 Runtime 实例保证执行名额，沿用当前 Snapshot、输入账本和协议格式。跨进程互斥及未知副作用自动重试均不在本规范范围内。

## 任务

- [x] //TODO 1. 将首次创建与原身份重连归入同一按 Goal 的提交裁决 → R1.1、R1.2、R1.3；检查：Session 创建并发与保存故障定向测试。
- [x] //TODO 2. 将交互回答和 blocked 恢复的收据写入等待转换，并保留 Coordinator 直接推进能力 → R2.1、R2.2、R2.3、R2.4、R3.2；检查：Session 收据与 Coordinator 交互定向测试。
- [x] //TODO 3. 完成会话推进名额、后台任务和关闭结算的交接，更新所属模块文档与公开 TSDoc → R2.1、R3.1、R3.2、R3.3；检查：Session 名额与关闭定向测试及 `npm run check:docs`。

## 执行记录

- 状态：passed
- 验证：提交 `1162804a`。`npx tsc --noEmit`；`npx tsx --test packages/runtime/test/*.test.ts`（645 通过，含新增 12 项定向用例）；`TMPDIR=/tmp/lgtest npm test`（2940 + 99 通过）；`npm run check:docs`；`npm run check:dependencies`
- 结果：全部通过。沙箱默认 TMPDIR 路径过长会让 Supervisor/Worker 的 Unix socket 绑定用例失败，与本次改动无关；使用短 TMPDIR 后全量通过。
- 未决：无
