# Browser 控制契约执行计划

## 任务清单

- [x] //TODO 1. 统一控制意图与受理收据
  - 落实标准：[1.1](./spec.md#spec-req-1-1), [1.2](./spec.md#spec-req-1-2), [1.3](./spec.md#spec-req-1-3), [1.4](./spec.md#spec-req-1-4), [2.3](./spec.md#spec-req-2-3)
  - 实施目标与场景：在 `packages/web-contracts` 定义可生成的 `ControlIntentCommand`、`ControlReceipt`、`ControlScope` 与相关结果联合；在 `packages/browser`／`apps/goal-server` 增加单一控制入口，按 kind 分发到现有命令服务。提交 SessionInput、计划模式、模型选择、权限模式、Grant 撤销、Goal 归档／删除、Action 预检时均返回同一 receipt 形状；SessionInput 的 `intentId` 与 `inputId` 一致，重复身份与旧 revision 返回 `existing` 或稳定拒绝。
  - 验证手段：运行 `npm run contracts:generate -- --write` 生成新制品；新增 `packages/browser/test/browser-control-intents.test.ts`，覆盖 accepted、existing、rejected 与 receipt 回显。

- [x] //TODO 2. 显式控制事件与 Browser 投影
  - 落实标准：[2.1](./spec.md#spec-req-2-1), [2.2](./spec.md#spec-req-2-2), [2.3](./spec.md#spec-req-2-3), [2.4](./spec.md#spec-req-2-4), [2.5](./spec.md#spec-req-2-5), [4.1](./spec.md#spec-req-4-1), [4.2](./spec.md#spec-req-4-2)
  - 实施目标与场景：在 `packages/web-contracts` 定义 `BrowserControlEvent`、`BrowserContentEvent` 与 `BrowserGoalEvent`，原位替换 `BrowserGoalLiveEvent`；在 `packages/browser` 把 Runtime 的 `state_sync`、`state_committed`、`input_result`、`interaction_settled`、`run_status`、`run_result`、`tool_activity`、`stream_fault`、`closed` 投影为显式事件。给定一次 Run 从 waiting 到 completed、一次交互结算和一次流缺口，浏览器应分别收到 `run_status_changed`／`run_result`、`interaction_settled` 和带 `code`／`resync` 的 `stream_fault`，不再出现对应的 `activity_boundary`。
  - 验证手段：运行 `npx tsx --test packages/browser/test/browser-session-output.test.ts packages/browser/test/browser-stream.test.ts`，并新增迟到／重复事件断言。

- [x] //TODO 3. 权威控制快照与精确失效
  - 落实标准：[3.1](./spec.md#spec-req-3-1), [3.2](./spec.md#spec-req-3-2), [3.3](./spec.md#spec-req-3-3), [3.4](./spec.md#spec-req-3-4), [3.5](./spec.md#spec-req-3-5), [2.2](./spec.md#spec-req-2-2)
  - 实施目标与场景：定义 `ControlSnapshot` 与 `ControlResources`；Browser 在首次同步／重连时组装包含 Goal／Run、队列、交互、待审批 Action、`commitRevision` 与执行所有者的完整快照；`state_committed` 只声明实际变化 scope。给定连接重建，页面应直接应用 `state_sync` 而不再完整读取 session／activity 历史；给定一次仅影响 `grants` 的提交，页面只失效 Grant 资源。
  - 验证手段：扩展 `packages/browser/test/browser-session-output.test.ts` 与 `packages/browser/test/browser-recovery.test.ts`，断言快照字段完整、scope 精确且无额外完整读取。

- [x] //TODO 4. Goal Board 控制 reducer 与 intent 生命周期
  - 落实标准：[1.5](./spec.md#spec-req-1-5), [4.3](./spec.md#spec-req-4-3), [7.3](./spec.md#spec-req-7-3), [7.4](./spec.md#spec-req-7-4)
  - 实施目标与场景：在 `apps/goal-board/src/control/` 实现 `ControlState`、`ControlIntentState` 与纯 `applyControlEvent`／intent reducer。给定 pending intent、accepted receipt、applied 事件与 unknown 结果，reducer 应分别得到 `pending`、`accepted`、`applied` 与 `unknown`；低 `commitRevision` 事件不得覆盖高修订快照。
  - 验证手段：新增 `apps/goal-board/test/control-reducer.test.ts`，覆盖状态转移、幂等、乱序与 stale scope。

- [x] //TODO 5. 审批会话与工具活动生命周期
  - 落实标准：[5.1](./spec.md#spec-req-5-1), [5.2](./spec.md#spec-req-5-2), [5.3](./spec.md#spec-req-5-3), [5.4](./spec.md#spec-req-5-4), [6.1](./spec.md#spec-req-6-1), [6.2](./spec.md#spec-req-6-2), [6.3](./spec.md#spec-req-6-3), [6.4](./spec.md#spec-req-6-4)
  - 实施目标与场景：从 `pendingAction`、`reviewRef`、SessionInput 收据与提交事实派生 `ApprovalSession`；从 `tool_activity` 与 `state_committed` 维护按 `actionId` 聚合的 `ToolActivity`。给定预检成功、提交受理、交互结算与 pendingAction 变化，审批会话应依次进入 `reviewed`、`accepted`、`settled` 或 `invalidated`；给定工具返回但 Observation 未提交，卡片应停留在 `result_pending`。
  - 验证手段：新增 `apps/goal-board/test/approval-session.test.ts` 与 `apps/goal-board/test/tool-activity.test.ts`，覆盖失效、迟到 attempt 与重复事件。

- [ ] //TODO 6. 统一命令迁移与未知结果核验
  - 落实标准：[1.5](./spec.md#spec-req-1-5), [7.1](./spec.md#spec-req-7-1), [7.2](./spec.md#spec-req-7-2), [7.3](./spec.md#spec-req-7-3), [7.4](./spec.md#spec-req-7-4), [9.1](./spec.md#spec-req-9-1)
  - 实施目标与场景：将 `useRunCommands`、`useQueue`、`usePermissions`、`useToolGrants` 迁移到控制 intent 与统一 reducer；实现 `verify(intentId)` 到 input 收据、权限 revision、grantId、Goal 状态、模型选择与 pendingAction 的映射。给定一次丢响应、一次明确拒绝和一次原身份重试，页面应分别显示“结果不明”“可编辑拒绝”“按原身份核验后重试”，且不产生第二个 `inputId` 或重复 list／revoke。
  - 验证手段：运行 `npx tsx --test apps/goal-board/test/session-controls.test.ts apps/goal-board/test/p0-fixes.test.ts`，并新增每类 intent 的核验用例。

- [ ] //TODO 7. 模型选择与默认偏好原子化
  - 落实标准：[8.1](./spec.md#spec-req-8-1), [8.2](./spec.md#spec-req-8-2), [8.3](./spec.md#spec-req-8-3)
  - 实施目标与场景：控制入口的 `model_selection` 接受 `persistAsDefault`，一次返回 `selection` 与 `defaultPreference` 子结果；Goal Board 不再调用第二次 `setModelPreference`。给定模型切换成功但偏好保存失败，页面应显示部分成功与可重试提示；给定当前 Run 已不允许切换，应返回稳定拒绝且不单独写入偏好。
  - 验证手段：运行 `npx tsx --test packages/browser/test/browser-model-selection.test.ts`，并新增 Goal Board 部分成功用例。

- [ ] //TODO 8. Goal Board 事件消费与刷新路径迁移
  - 落实标准：[3.2](./spec.md#spec-req-3-2), [3.3](./spec.md#spec-req-3-3), [3.4](./spec.md#spec-req-3-4), [4.4](./spec.md#spec-req-4-4), [9.2](./spec.md#spec-req-9-2), [9.3](./spec.md#spec-req-9-3)
  - 实施目标与场景：把 `useRunStream` 的事件 switch 改为控制 reducer；`state_sync` 直接应用快照，`state_committed` 只处理声明 scope；原有 generation／candidate／message 内容路径保持不变。给定连续模型增量、正式消息与交互结算，页面应更新控制状态而不触发 `refreshSelectedSession`；给定另一客户端结算当前交互，旧草稿应失效并切换到真实后续状态。
  - 验证手段：运行 `npx tsx --test apps/goal-board/test/session-output-consumer.test.ts apps/goal-board/test/session-stream-recovery.test.ts apps/goal-board/test/session-output-api.test.ts`，并用 API 调用计数断言控制事件不触发全量读取。

- [ ] //TODO 9. 清理旧事件与本地状态机、更新文档与生成物
  - 落实标准：[9.1](./spec.md#spec-req-9-1), [9.5](./spec.md#spec-req-9-5)
  - 实施目标与场景：删除 `BrowserGoalLiveEvent`、控制事件的 `activity_boundary` 压扁、被 reducer 取代的 `UnverifiedSubmissionState`／`InteractionSubmissionState` 提交阶段与重复 Grant 状态；更新 `web-contracts`、`browser`、`goal-board`、`runtime` 的相关中文 TSDoc、模块概览与语义表，并重新生成 Catalog 制品。交付后源码中只保留一套控制事件与控制状态实现。
  - 验证手段：运行 `npm run contracts:generate -- --check`、`npm run check:docs`、`npm run check:dependencies` 与 `npx tsc --noEmit`。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
|---|---|---|---|
| 控制意图与收据 | [1.1](./spec.md#spec-req-1-1), [1.2](./spec.md#spec-req-1-2), [1.3](./spec.md#spec-req-1-3), [1.4](./spec.md#spec-req-1-4), [1.5](./spec.md#spec-req-1-5), [2.3](./spec.md#spec-req-2-3) | 每类 intent 均返回统一 receipt；重复身份、旧 revision、未知结果分别得到 existing／稳定拒绝／unknown | `npm test` 与新增控制 intent 测试 |
| 控制事件与关联 | [2.1](./spec.md#spec-req-2-1), [2.2](./spec.md#spec-req-2-2), [2.3](./spec.md#spec-req-2-3), [2.4](./spec.md#spec-req-2-4), [2.5](./spec.md#spec-req-2-5) | Run 状态、终态、交互、工具与流故障均为显式事件；迟到／重复事件不影响高修订状态 | `npx tsx --test packages/browser/test/browser-session-output.test.ts packages/browser/test/browser-stream.test.ts` |
| 权威快照与失效 | [3.1](./spec.md#spec-req-3-1), [3.2](./spec.md#spec-req-3-2), [3.3](./spec.md#spec-req-3-3), [3.4](./spec.md#spec-req-3-4), [3.5](./spec.md#spec-req-3-5) | state_sync 恢复完整控制状态；state_committed 只失效声明 scope；不触发完整历史重读 | Browser 投影测试与 Goal Board API 调用计数测试 |
| Run 与交互生命周期 | [4.1](./spec.md#spec-req-4-1), [4.2](./spec.md#spec-req-4-2), [4.3](./spec.md#spec-req-4-3), [4.4](./spec.md#spec-req-4-4) | waiting 不显示 completed；interaction_settled 才解除等待；另一客户端结算后旧草稿失效 | `apps/goal-board/test/session-output-*.test.ts` 与 Chrome E2E |
| 审批会话 | [5.1](./spec.md#spec-req-5-1), [5.2](./spec.md#spec-req-5-2), [5.3](./spec.md#spec-req-5-3), [5.4](./spec.md#spec-req-5-4) | 预检、提交、结算阶段正确；参数／范围变化使 reviewRef 失效；不直接执行 Tool | `apps/goal-board/test/approval-session.test.ts` 与集成审批测试 |
| 工具活动 | [6.1](./spec.md#spec-req-6-1), [6.2](./spec.md#spec-req-6-2), [6.3](./spec.md#spec-req-6-3), [6.4](./spec.md#spec-req-6-4) | 工具返回停在 result_pending；Observation 提交后才 observed_committed；旧 attempt 不回退 | `apps/goal-board/test/tool-activity.test.ts` 与 `execution-progress.test.tsx` |
| 未知结果核验 | [7.1](./spec.md#spec-req-7-1), [7.2](./spec.md#spec-req-7-2), [7.3](./spec.md#spec-req-7-3), [7.4](./spec.md#spec-req-7-4) | 所有 intent 均可按原身份核验；只有 not_applied 允许重试；unknown 不显示失败 | `apps/goal-board/test/session-controls.test.ts` 与新增核验用例 |
| 模型选择 | [8.1](./spec.md#spec-req-8-1), [8.2](./spec.md#spec-req-8-2), [8.3](./spec.md#spec-req-8-3) | 一次请求完成选择与偏好；部分失败显示子结果；不再第二次写入偏好 | `packages/browser/test/browser-model-selection.test.ts` 与 Goal Board 部分成功测试 |
| Goal Board 迁移 | [9.1](./spec.md#spec-req-9-1), [9.2](./spec.md#spec-req-9-2), [9.3](./spec.md#spec-req-9-3) | 控制事件不触发全量刷新；视觉与 Activity／Trajectory 不变；交互表单归属不变 | `npm run build:web` 与 `npm run test:web-e2e` |
| 契约与文档交付 | [9.4](./spec.md#spec-req-9-4), [9.5](./spec.md#spec-req-9-5) | 生成物、类型、依赖、文档与完整回归通过；旧事件与旧状态机删除 | `npm test`、`npm run contracts:generate -- --check`、`npm run check:docs`、`npm run check:dependencies` |
| 失败与恢复路径 | [2.4](./spec.md#spec-req-2-4), [2.5](./spec.md#spec-req-2-5), [3.3](./spec.md#spec-req-3-3), [5.3](./spec.md#spec-req-5-3), [6.3](./spec.md#spec-req-6-3), [7.3](./spec.md#spec-req-7-3) | 断线、背压、乱序、审批失效与结果不明均保留最后确认状态，只重读受影响范围 | 真实 SSE 集成测试、重连测试与手工 Chrome 场景 |

### Latest Result

- 状态：未执行
- 验证时间：-
- 验证摘要：尚未开始执行。
