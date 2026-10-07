# Run 输入与主动终止任务

前置条件：[职责拆分 Spec 的任务与验收](../run-execution-persistence-separation/tasks.md)全部完成并通过验证；本计划基于其已实现的执行、恢复和共享提交边界。TODO 2 依赖 TODO 1 的活动执行与提交串行边界，TODO 3 依赖前两项的控制 API。执行时保留已有工作树改动与全部 `//TODO` 文本。

- [x] //TODO 1. 接入持久化 Steer 并在同一 Run 的模型边界应用输入

  - 实现目标：完成 Runtime 控制入口、活动执行句柄与短暂提交边界，更新当前 Snapshot/Trajectory 契约、受理记录、模型输入与原生历史投影，并接通 Web Steer 路由及会话投影；公开源码契约同步补充中文 TSDoc。
  - 成功判据：模型或 Tool 执行期间可受理多条消息；原调用不被中断，下一模型输入按序纳入且只追加一次；并发受理不被旧检查点覆盖，完成竞争明确决定受理或拒绝；重启恢复同一 Run，旧身份和不同正文的重复身份被拒绝，保存失败不越过提交边界。
  - 验证方式：`packages/runtime/test/run-steer.test.ts`、`packages/storage/test/run-input-control-snapshot.test.ts`、`packages/browser/test/browser-run-control.test.ts` 与现有 Think、frame、原生历史测试；运行 `npx tsx --test packages/runtime/test/run-steer.test.ts packages/storage/test/run-input-control-snapshot.test.ts packages/browser/test/browser-run-control.test.ts packages/runtime/test/think-decision-recovery.test.ts packages/runtime/test/model-context-frame.test.ts packages/agent/test/native-model-history.test.ts`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [8.4](./requirements.md#req-8-4)_

- [x] //TODO 2. 接入 Interrupt 并复用既有错误反馈完成有限自动收尾

  - 实现目标：完成 Interrupt 路由与持久化意图、按 Run 隔离的执行信号、中断工具错误及原生结果配对、同一 Run 的收尾目标与预算恢复、取消结算，并使 cancelled 可经现有 continue 入口创建后继 Run；同步更新公开契约与当前数据校验。
  - 成功判据：请求受理后中断原模型和 Tool，仅针对被中断操作进行核查或修复，保留原有授权、审批和沙箱；直接 Tool 与 PTC 未知结果均记入真实错误来源，不伪造工具完成或回滚；收尾复用既有执行器，三次模型调用预算跨重启不重置，耗尽仍 cancelled；宿主关闭不产生用户终止意图，不影响其他 Run 的控制信号。
  - 验证方式：`packages/runtime/test/run-interrupt.test.ts`、`packages/agent/test/interrupted-tool-history.test.ts`、Snapshot、Browser、PTC、执行控制、关闭及多 Run 恢复测试；运行 `npx tsx --test packages/runtime/test/run-interrupt.test.ts packages/agent/test/interrupted-tool-history.test.ts packages/storage/test/run-input-control-snapshot.test.ts packages/browser/test/browser-run-control.test.ts packages/runtime/test/program-interruption.test.ts packages/storage/test/program-recovery.test.ts packages/runtime/test/execution-control.test.ts packages/runtime/test/shutdown.test.ts packages/runtime/test/goal-multi-run-recovery.test.ts`。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4), [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

- [ ] //TODO 3. 接入页面 Queue 和 Steer、Queue、Interrupt 按钮原位切换

  - 实现目标：在当前页面实现按 Goal 保存的消息队列、暂停与继续，接通稳定消息身份和后继 Run 创建去重；更新运行中 composer、按钮原位选择、停止反馈及 pending 消息展示，并一并调整受影响的既有 Web E2E 断言。
  - 成功判据：未选发送方式不提交；空输入工作按钮点击终止，有输入时原位选择 Steer 或 Queue；Queue 正常完成后逐条创建后继 Run，响应丢失重试不重复创建；等待不出队，失败或终止暂停并保留剩余项，用户明确继续后才启动；页面刷新可丢失队列，被拒绝的 Steer 保留草稿，键盘和减少动态效果设置可用。
  - 验证方式：新增 `apps/goal-board/e2e/run-input-control.test.mjs`（待实现）并扩展现有确定性测试服务；补充 `browser-messages.test.ts` 的后继身份去重及取消终态续写测试。运行 `npx tsx --test packages/browser/test/browser-messages.test.ts packages/runtime/test/goal-multi-run-session.test.ts`，再运行 `npm run build:web` 和 `node --test --test-concurrency=1 apps/goal-board/e2e/run-input-control.test.mjs apps/goal-board/e2e/runtime.test.mjs apps/goal-board/e2e/board.test.mjs`。
  - _Requirements: [2.4](./requirements.md#req-2-4), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [5.1](./requirements.md#req-5-1), [5.4](./requirements.md#req-5-4), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3), [8.4](./requirements.md#req-8-4)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。下表中的 `run-steer.test.ts`、`run-interrupt.test.ts`、`run-input-control-snapshot.test.ts`、`browser-run-control.test.ts`、`interrupted-tool-history.test.ts` 与 `run-input-control.test.mjs` 均为待实现检查；表内文件名对应上述 TODO 的完整路径。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
| --- | --- | --- |
| [1.1](./requirements.md#req-1-1) | 运行中受理 Steer，Goal 与 Run 身份不变且不创建后继 | Runtime Steer 测试及 Browser 控制集成测试 |
| [1.2](./requirements.md#req-1-2) | 多条受理消息在下一次 Decide、Think 或审查前按序进入输入 | `run-steer.test.ts` 与现有 Think/frame 测试 |
| [1.3](./requirements.md#req-1-3) | 模型和 Tool 可控延迟时 Steer 不触发 abort；Tool 结束后消息生效 | 模型、工具延迟与取消信号断言 |
| [2.1](./requirements.md#req-2-1) | Steer 保存后重建服务，恢复原 Run 和原消息顺序 | Snapshot 重建与 Web 服务重启测试 |
| [2.2](./requirements.md#req-2-2) | 重复提交、响应丢失和应用提交后重启均只追加一次用户消息 | `run-steer.test.ts`、`run-input-control-snapshot.test.ts` |
| [2.3](./requirements.md#req-2-3) | 控制两种提交先后顺序，完成不越过已受理 Steer；终态后明确拒绝 | 可控制的提交竞态测试 |
| [2.4](./requirements.md#req-2-4) | 拒绝 Steer 后草稿仍在，不生成 Queue 或后继 Run | `browser-run-control.test.ts` 与新 Web E2E |
| [3.1](./requirements.md#req-3-1) | Queue 入队不改变当前 Run 消息与模型输入 | Web E2E、测试服务调用记录 |
| [3.2](./requirements.md#req-3-2) | 连续三条消息各对应一个后继 Run，顺序与 Goal 身份一致 | Web E2E 与已提交 Run 历史断言 |
| [3.3](./requirements.md#req-3-3) | 重复点击和丢失创建响应时，同一消息只入队及创建一次 | Web E2E、`browser-messages.test.ts` 去重测试 |
| [3.4](./requirements.md#req-3-4) | 页面刷新不恢复 Queue，后端没有排队消息或自动续跑 | Web E2E、后端快照与模型调用记录 |
| [4.1](./requirements.md#req-4-1) | 问卷、任务及工具审批等待时，队列保持原顺序且不创建 Run | Web E2E 等待场景 |
| [4.2](./requirements.md#req-4-2) | 失败或 Interrupt 使 Queue 暂停，剩余输入仍在当前页面 | Web E2E 失败与终止场景 |
| [4.3](./requirements.md#req-4-3) | 暂停期间不调用 continue，明确点击继续后才提交队首 | Web E2E 与消息接口调用次数 |
| [5.1](./requirements.md#req-5-1) | 点击后立即显示 Stopping，原任务不再获得新调用准入 | Web E2E、Runtime 调用准入竞态测试 |
| [5.2](./requirements.md#req-5-2) | 活动模型和工具收到目标 Run 信号，后端仍可读写且其他控制未中止 | `run-interrupt.test.ts`、Browser 控制集成测试 |
| [5.3](./requirements.md#req-5-3) | 原资源停止且收尾结束或耗尽后，快照和轨迹均确认 cancelled，已有结果保留 | 中断结算、文件恢复与错误记录测试 |
| [5.4](./requirements.md#req-5-4) | cancelled 后发送或继续 Queue，创建同一 Goal 的新 Run | Runtime 多 Run、Browser 消息测试和 Web E2E |
| [6.1](./requirements.md#req-6-1) | 未知工具效果带原 Action 来源进入错误轨迹及同一 Run 的模型输入，无人工结果确认门禁 | 直接 Tool/PTC 中断测试与原生 history 测试 |
| [6.2](./requirements.md#req-6-2) | 收尾仅针对中断来源，必要工具仍接受 Policy、审批和沙箱检查 | `run-interrupt.test.ts` 授权及审批场景 |
| [6.3](./requirements.md#req-6-3) | unknown 记录不触发原操作重放，不被投影为确定效果或回滚 | Snapshot 恢复、执行单元和 Evidence 投影测试 |
| [6.4](./requirements.md#req-6-4) | 收尾成功、持续失败及三次调用耗尽均保存实际记录后 cancelled；没有额外模型调用 | 可计数 StepExecutor 与错误注入测试 |
| [7.1](./requirements.md#req-7-1) | Interrupt 受理保存后重启仍存在相同请求 | Snapshot 编解码与服务重启测试 |
| [7.2](./requirements.md#req-7-2) | 在 requested、settling、repairing 各边界重启，仅继续收尾，剩余预算不重置 | `run-interrupt.test.ts`、Snapshot 与 PTC 恢复测试 |
| [7.3](./requirements.md#req-7-3) | 普通关闭与调用级中止不生成终止意图或隐式取消终态 | `execution-control.test.ts`、`shutdown.test.ts` 及基础 Spec 回归 |
| [8.1](./requirements.md#req-8-1) | Run 活动期间仍可输入，输入不因停止状态切换丢失 | Web E2E composer 场景 |
| [8.2](./requirements.md#req-8-2) | 空输入显示旋转工作按钮，点击发送 Interrupt 而非普通消息 | Web E2E 按钮与动画样式断言 |
| [8.3](./requirements.md#req-8-3) | 有输入时同一位置展示两选项，选择前无写请求，没有独立终止按钮 | Web E2E、Enter/Shift+Enter/Tab/Escape 场景 |
| [8.4](./requirements.md#req-8-4) | pending Steer 与 Queue 分别显示发送方式与顺序，Steer 生效后更新投影 | Web E2E、session/SSE 投影测试 |
| 组合流程 | Steer → Queue → Interrupt 自动收尾 → 显式继续 Queue，消息、暂停与多 Run 边界一致 | 新 Web E2E 的完整真实服务流程 |
| 提交故障与并发 | 命令、frame、未知 Observation 和预算提交失败均停止推进；旧提交不覆盖已受理控制，未提交尾部不成为进度 | 新故障注入测试与 `trajectory-checkpoint-committer.test.ts`、`trajectory-failure.test.ts` |
| 完整回归与边界 | 普通/Plan Run、Headless 入口、原生历史、现有审批和关闭行为保持一致；公开 TSDoc、当前架构说明与源码同步 | `npm test`、`npm run build:web`、`npm run test:web-e2e`，核对 `docs/architecture/` 相关文档与公开源码契约，运行 `git diff --check` |

### Latest Result

未执行。实施后按 delivery-loop.md 记录逐项检查、结果与证据位置、整体状态及时效、验证时间、被测提交或未提交变更指纹、对应需求与设计版本，以及尚未解决的问题。
