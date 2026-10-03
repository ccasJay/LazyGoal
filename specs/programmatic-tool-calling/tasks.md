# PTC 实施计划

Requirements 与 Design 已在当前会话批准；本计划待单独审批。任务批准只完成规划，不自动启动实现。

## 任务

- [x] //TODO 1. 接通默认 PTC Tool 与受限 JavaScript 计算

  - 实现目标：贯通程序注册项、默认本机装配、Prompt、Runner 父程序结算及 sandbox 专用 Seatbelt/worker；实现确定性计算环境、管道校验、显式返回、基础资源限制与进程清理，并同步新增持久化状态和接口契约。
  - 成功判据：`execute_program` 执行 `return { total: 1 + 2 }` 得到唯一父结果；普通文本不执行，直接工具仍可用；新程序无旧内存，错误返回有界；真实策略阻止未授予的宿主访问，隔离或必要依赖缺失不启动。
  - 验证方式：新增 `packages/sandbox/test/program-sandbox.test.ts`、`packages/runtime/test/program-execution.test.ts`（待实现），并扩展既有入口/Prompt 测试；运行 `npx tsx --test packages/sandbox/test/program-sandbox.test.ts packages/runtime/test/program-execution.test.ts packages/tui/test/cli.test.ts packages/agent/test/prompting-default-bundles.test.ts`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [4.1](./requirements.md#req-4-1), [4.3](./requirements.md#req-4-3), [7.1](./requirements.md#req-7-1)_

- [x] //TODO 2. 接通业务工具编排、逐调用审批与模型结果投影

  - 实现目标：依赖 TODO 1，将内部工具请求接入 Runner 共用授权/执行/检查点路径；贯通串行工具交付、ProgramToolResult、子 Action 审批后程序重建与拒绝反馈；同步原生历史、Hot/Warm、检索、证据引用及既有审计/审批界面的父程序关联。
  - 成功判据：读取、检索、修改与 Bash 按程序分支执行，不增加内部模型推理；待审子调用不执行，批准续跑、拒绝可辨别、撤销约束后续操作；批量原始结果可审计但不自动进入模型历史或检索，父 Step 只结算一次，系统工具和嵌套 PTC 被拒绝。
  - 验证方式：扩展 TODO 1 的程序入口测试和既有审批/轨迹测试，新增 `packages/agent/test/program-model-context.test.ts`（待实现）；运行 `npx tsx --test packages/runtime/test/program-execution.test.ts packages/agent/test/program-model-context.test.ts packages/runtime/test/permission-grant-recovery.test.ts packages/browser/test/browser-trajectory.test.ts packages/tui/test/trajectory-projector.test.ts`。
  - _Requirements: [1.2](./requirements.md#req-1-2), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.5](./requirements.md#req-6-5)_

- [x] //TODO 3. 完成跨进程续跑与未知副作用保护

  - 实现目标：依赖 TODO 2，贯通真实 Store 的程序恢复读取、已提交结果重放、身份/代码/运行规则/调用序列校验及累计预算恢复；接入未知写操作的人工重试/拒绝和父程序原子结算，并保持普通 Action 恢复行为。
  - 成功判据：在审批、调用和父结算边界杀死宿主后，新进程无需模型重写程序即可续跑；已提交写入不再执行，结果未提交的写入等待人工处理；旧授权、未提交 tail、损坏日志和错配身份不能推动执行，预算及 Step 不因恢复重置或重复结算。
  - 验证方式：新增 `packages/storage/test/program-recovery.test.ts` 及跨进程 fixture（待实现），在真实 JSON/JSONL Store 与独立宿主进程上注入中断；运行 `npx tsx --test packages/storage/test/program-recovery.test.ts packages/storage/test/action-observation-recovery.test.ts packages/runtime/test/trajectory-checkpoint-committer.test.ts packages/runtime/test/permission-grant-recovery.test.ts`。
  - _Requirements: [5.4](./requirements.md#req-5-4), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4), [6.5](./requirements.md#req-6-5), [7.1](./requirements.md#req-7-1)_

- [x] //TODO 4. 完成取消、资源超限与未结算调用收尾

  - 实现目标：依赖 TODO 3，完成含内部工具的次数、累计数据和活动时间预算，接通显式取消与宿主关闭的不同处理；贯通 pendingStop、未等待调用、工具取消传播及未知副作用优先处理，并验证所有退出路径的进程/管道/临时目录清理。
  - 成功判据：同步或微任务死循环、RSS 超限、过大结果及超额调用均停止推进，不把截断结果当作完整返回；取消后没有新调用，已开始写入的未知结果仍等待处理；处理后只结算原停止原因，不继续程序、不宣称回滚，宿主关闭不生成失败 Step。
  - 验证方式：新增 `packages/runtime/test/program-interruption.test.ts`（待实现），扩展真实 worker 资源测试及关闭回归；运行 `npx tsx --test packages/runtime/test/program-interruption.test.ts packages/sandbox/test/program-sandbox.test.ts packages/runtime/test/shutdown.test.ts packages/tools/test/bash.test.ts`。
  - _Requirements: [2.4](./requirements.md#req-2-4), [4.3](./requirements.md#req-4-3), [6.3](./requirements.md#req-6-3), [6.5](./requirements.md#req-6-5), [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

新增公开接口与契约改动须在相应实现中补齐中文 TSDoc 和最小示例。当前架构文档随对应实现同步，描述已实现的 Runtime、Agent、Storage 与 sandbox 责任和恢复边界，不把文档维护单独拆成编码 TODO。

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。检查须覆盖已批准的资源常量和平台限制；实现细节依照 [Design](./design.md)，不得为了通过验证删减隔离或恢复保证。

### Planned Checks

以下新测试和 fixture 均待实现；所有场景使用本地测试数据及确定性模型/检索替身，不依赖付费模型或外部服务。

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4) | 默认新 Goal 有专用 Tool；Prompt 说明选择规则与调用/返回方式；代码块不执行；直接调用保留且失败不隐式换路；自定义与冻结 Profile 不被扩大权限 | CLI/默认 Prompt 测试及 program-execution 的显式决策测试 |
| [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4) | 不同程序内存隔离；Node.js 正常加载，宿主文件/网络/凭据/进程派生被阻止；策略、运行时或监控不可用时不启动；完成/失败后无遗留执行资源 | macOS program-sandbox 真实进程测试；使用同一策略的访问探针直接触发内核检查，避免仅因 VM API 未暴露而通过；非支持平台单独验证明确拒绝 |
| [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [5.1](./requirements.md#req-5-1) | 读文件、检索、写文件和 Bash 组合可用；success/failure/rejected 分支可辨别，循环与 Promise.all 顺序交付不增加模型调用；Profile 越权、非法输入、伪造管道消息、嵌套及系统工具不能执行 | program-execution 的真实工具集成与管道边界测试，复用既有 Tool/Permission 检查 |
| [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4) | 批量读取后模型只收到显式 return；中间数据可在原始轨迹审计，原生历史、Hot/Warm、自动摘要及 Lookup 不重新载入；日志、无返回、不可序列化和程序错误只产生有界失败，证据引用仅来自已提交事实 | program-model-context 的输入与历史断言；program-execution 的返回错误场景；既有轨迹、Evidence 和检索测试 |
| [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4) | 审批展示真实子操作与范围，等待期间不推进；批准重建到原调用，拒绝不执行；单次/Goal/项目授权匹配、撤销、过期或错配答复在 Default/YOLO 下均保持边界 | Coordinator/Permission 回归和 program-execution 审批集成；已有 TUI/Browser 审批投影测试 |
| [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2) | 在意图、started、结果追加、Snapshot、marker、响应发送和父结算处中断；新进程只消费 committed 结果，重建代码不重新执行已完成调用，不需模型生成后续程序 | program-recovery 的独立宿主进程、真实 JSON/JSONL Store 与故障注入；以调用计数和文件内容核对副作用 |
| [6.3](./requirements.md#req-6-3), [6.5](./requirements.md#req-6-5) | safe 写工具结果未知仍等待人工；批准重试明确可能重复，拒绝形成 rejected；已确认完成操作不重做，重复答复及父恢复只结算一次；不宣称外部 exactly-once | program-recovery 的 write_file/edit_file/Bash 未知结果场景；检查持久化决定、外层 Step 和真实副作用次数 |
| [6.4](./requirements.md#req-6-4) | 代码/worker/Node.js 规则失配、调用顺序或输入失配、日志缺失/损坏、跨 Goal/Run 与持久化写入失败均阻止后续操作；未提交 tail 不能伪装成功 | program-recovery 与 CheckpointCommitter 故障注入；断言工具不启动且旧 committed 事实不改写 |
| [7.1](./requirements.md#req-7-1) | 已批准的源码/返回/诊断/管道/累计日志/次数/时间/RSS 边界均生效；同步与微任务循环可终止；审批等待不耗活动时间，重放和崩溃不重置预算；截断不伪装完整返回 | program-sandbox 真实资源边界与 program-interruption 集成；活动预算使用可控时钟验证，watchdog/RSS 保留真实进程验证 |
| [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3) | 工具前、工具执行中、审批等待及纯计算中取消均阻止新调用并清理；未结算副作用优先人工处理；pendingStop 处理后不续跑，宿主关闭仍可显式恢复且不伪造失败或回滚 | program-interruption 与 shutdown 回归；检查信号传播、进程/管道/目录释放及持久化状态 |
| [3.3](./requirements.md#req-3-3), [4.2](./requirements.md#req-4-2), [5.3](./requirements.md#req-5-3), [6.2](./requirements.md#req-6-2), [6.5](./requirements.md#req-6-5) | 完整“读取→待审写入→批准→重启→Bash→返回汇总”流程中结果、权限、恢复和上下文一致，模型只发生外层交互，内部调用不增加 Step | 使用真实 worker、Store 和业务工具的组合流程测试，按当前代码状态重跑四项 TODO 的检查 |

全部 TODO 完成后运行 `npm test`，覆盖类型、依赖边界、既有确定性测试和新测试；检查接口 TSDoc、架构文档与已实现行为一致，并运行 `git diff --check`。自动化验证能够覆盖本计划的验收表现，不额外设置人工审批门槛。

macOS 真实隔离检查是必需项；跳过测试或缺少环境只能记录为 blocked，不能将其他平台的拒绝执行测试当作完整功能 passed。后续仅记录当前代码和契约对应的证据，不以复用已有结果掩盖受影响检查。

### Latest Result

验证时间：2026-10-03 01:04 CST。被测基线 `e0172cc3` 加本分支暂存改动；实现、测试、架构文档及静态资源差异指纹（`git diff --cached -- packages prototypes/goal-board/src docs/architecture .gitignore | shasum -a 256`）：`199678117c6c5fd90d53e4b0507bba83ca970ce7b16fbbe029c8f4bb29f0568a`。契约指纹：Requirements `99f45a4267a6`，Design `1e0c33191970`；TODO 文本保持原样，仅勾选完成状态。

| 验收范围 | 当前证据与实际结果 |
|---|---|
| 入口与选择 1 | [CLI 默认装配](../../packages/tui/src/cli.tsx)、[Prompt](../../packages/agent/src/prompting/authorized-tools@1.njk) 和相应测试确认 `execute_program` 是显式 Tool、模型按任务选择；直接工具与冻结 Profile 保留原边界。通过。 |
| 隔离与协议 2、3 | [真实 worker 测试](../../packages/sandbox/test/program-sandbox.test.ts) 验证新进程内存隔离、显式 JSON 返回、Promise.all 顺序、无直接宿主 API、真实 Seatbelt 内核拒绝文件/网络/派生；[Runner 测试](../../packages/runtime/test/program-interruption.test.ts) 验证嵌套与系统工具拒绝。通过。 |
| 模型上下文与审计 4 | [上下文测试](../../packages/agent/test/program-model-context.test.ts) 验证大量子结果留在 Trajectory，却不进入原生历史、Hot/Warm 或检索；[Runner 测试](../../packages/runtime/test/program-execution.test.ts) 验证父程序唯一 Step、显式结果与已提交来源引用。程序异常仅产生稳定失败码。通过。 |
| 授权与审批 5 | [审批集成测试](../../packages/runtime/test/program-execution.test.ts) 验证真实子输入等待、批准后原代码续跑、拒绝分支；既有 Permission/Grant 回归包含在全量测试中，[Browser](../../packages/browser/test/browser-projection.test.ts) 与 [TUI](../../packages/tui/test/trajectory-projector.test.ts) 投影显示父子关联。通过。 |
| 持久化与恢复 6 | [真实 Store 与独立宿主测试](../../packages/storage/test/program-recovery.test.ts) 验证进程强杀后已提交读取不重做、未知写入等待人工、批准后继续到 Bash 和单次父返回；损坏结果字节及预留账本写入失败阻止推进。[Runtime 中断测试](../../packages/runtime/test/program-interruption.test.ts) 验证未知写入收尾。通过。 |
| 资源、取消与关闭 7 | [worker 边界测试](../../packages/sandbox/test/program-sandbox.test.ts) 覆盖源码、返回、管道、微任务 watchdog、真实 RSS 超限和连续活动额度；[Runner 边界测试](../../packages/runtime/test/program-interruption.test.ts) 覆盖 128 次调用、16 MiB 子结果、120 秒跨恢复预留、取消审批等待、用户取消、关闭续跑与未知写入先处理。累计结果字节、诊断上限与清理路径另核对 [sandbox](../../packages/sandbox/src/program-sandbox.ts) 和 [Runner](../../packages/runtime/src/runner.ts) 的固定限制。通过。 |
| 组合流程与回归 | `npm test` 通过：TypeScript 与依赖边界、198 个 GEPA Python 测试、1651 个 TypeScript 测试及 14 个脚本测试；PTC sandbox 与 interruption 定向测试也通过。`npm run build` 在 `prototypes/goal-board` 通过；`git diff --cached --check` 通过。 |

整体状态：`passed`；证据时效：`current`。已知限制：RSS 由 100 ms 采样，短时峰值可能早于下一次采样；Browser 原始详情超过现有 256 KiB 响应上限返回 413，完整事实仍保留在 Trajectory Store。无需额外人工验收。
