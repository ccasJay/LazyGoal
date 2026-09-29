# 统一 Permission 实施计划

执行依赖：涉及 Sandbox 能力的任务须在 [macOS Seatbelt Sandbox Spec](../macos-seatbelt-sandbox/tasks.md) 完成重叠职责修订并重新获批后执行；其受限命令与实际能力契约是本计划的前置输入。此处不重复实施 Seatbelt 策略。

- [x] //TODO 1. 建立独立 Permission package 并迁入现有 Tool 授权判断

  - 实现目标：创建 `@lazygoal/permission` 的 Tool matcher、Grant 契约和判定入口，接入 Runtime／Storage，保留现有 Tool Grant 文件格式与默认审批行为。
  - 成功判据：Default 下只读 Tool 自动执行、其他 Tool 按现有操作范围审批；已有 Tool Grant 仍可匹配，YOLO 不生成持续授权；Profile、输入或策略拒绝不能借授权放行，损坏账本不能回退放行。
  - 验证方式：待实现的 `packages/permission/test/tool-authorization.test.ts`；现有 Tool Grant／Runner 回归；`npm run check:dependencies`。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.4](./requirements.md#req-2-4), [4.2](./requirements.md#req-4-2), [4.4](./requirements.md#req-4-4)_

- [x] //TODO 2. 让项目模式在 Browser 与 TUI 中持久切换并作用于后续 Action

  - 实现目标：加入项目模式记录和修订检查；Browser／TUI 聊天框左下角提供 Permission 入口与模式选择，现有快捷键改走同一服务端命令。
  - 成功判据：项目 A 选择 YOLO 后，A 的其他本机交互 Goal 和重启后的新 Goal 使用该模式，项目 B 仍为 Default；旧待审 Action 不自动获批，过期切换被拒绝，Benchmark 策略不变。
  - 验证方式：待实现的 `packages/storage/test/project-permission-mode.test.ts`、`packages/browser/test/browser-permission-mode.test.ts` 与 `packages/tui/test/session-permission-mode.test.tsx`；现有 `session-controller.test.ts` 和 Browser 命令回归。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [2.2](./requirements.md#req-2-2), [7.1](./requirements.md#req-7-1), [7.3](./requirements.md#req-7-3)_

- [x] //TODO 3. 接通 Sandbox 越界能力的单次审批与真实范围展示

  - 实现目标：把规范化 Sandbox 能力送入 Permission 判断、Runtime pending Action 与 Browser／TUI 审批；Sandbox 仅消费核准范围执行。
  - 成功判据：macOS 默认沙箱内 Bash 自动执行；外部路径、受保护路径和联网请求在 Default／YOLO 下均需有效能力，整网出站含回环按真实范围展示；完整输入可审阅，拒绝或过期审批不启动命令，结果未知不自动重放。
  - 验证方式：待实现的 `packages/permission/test/sandbox-decision.test.ts`、`packages/runtime/test/sandbox-permission-action.test.ts`、Browser／TUI 审批交互测试；复用 Sandbox Spec 的真实 macOS 受限进程测试。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

- [ ] //TODO 4. 交付两类持续授权的复用、统一查看与撤销

  - 实现目标：新增独立 Sandbox Grant 账本，保留 Tool Grant 账本；Permission 统一列出和撤销两类授权，Browser／TUI 左下角入口可进入管理，批准后按 Action 检查点激活。
  - 成功判据：单次、Goal、项目授权各守其范围；同一路径写入可换内容，不同 Bash 命令和不同 Sandbox 能力不得复用；重启后只认已激活授权，撤销或过期请求不放行，页面不暴露凭据与未获准文件内容。
  - 验证方式：待实现的 `packages/permission/test/grant-matching.test.ts`、`packages/storage/test/sandbox-grant-store.test.ts`、`packages/runtime/test/permission-grant-recovery.test.ts` 及 Browser／TUI 授权管理测试。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [6.1](./requirements.md#req-6-1), [6.3](./requirements.md#req-6-3), [7.2](./requirements.md#req-7-2)_

- [ ] //TODO 5. 串行化跨进程模式、撤销与 Action 开始并验证恢复

  - 实现目标：用项目私有的跨进程闸门保护模式写入、Grant 变更及执行前复核，加入冲突和中断恢复的集成测试。
  - 成功判据：两个进程同时切换模式或撤销 Grant 时只承认已确认顺序；撤销先于执行开始则不得放行，执行已开始则不伪称被停止；锁不可用、记录损坏、崩溃中断及结果不确定均失败关闭且不重放。
  - 验证方式：待实现的 `packages/storage/test/permission-concurrency.test.ts` 与 `packages/runtime/test/permission-start-gate.test.ts`，使用两个本机进程和注入的提交边界故障；`npm test` 全量回归。
  - _Requirements: [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4) | 双端左下角入口切换项目模式；现有和新建交互 Goal 使用已保存模式，旧待审 Action 不自动通过；过期切换冲突。 | Browser／TUI 交互、跨 Goal、重启与冲突测试（待实现）；必要时人工检查入口可发现性。 |
| [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.4](./requirements.md#req-2-4) | Default、YOLO、只读 Tool、Profile 拒绝和现有 Tool Grant 的组合符合各自边界。 | Permission 判定与 Runner 回归（待实现）；现有 Tool Policy 测试。 |
| [2.3](./requirements.md#req-2-3), [3.1](./requirements.md#req-3-1), [3.3](./requirements.md#req-3-3) | 越界文件／网络在 YOLO 下仍待批准；UI 展示真实整网或路径范围；拒绝不启动受限命令。 | Permission／Runtime 测试（待实现）与真实 macOS Seatbelt 集成检查。 |
| [3.2](./requirements.md#req-3-2), [3.4](./requirements.md#req-3-4) | 截断输入可展开，未展开不授持续权；错误 Run／Action 或过期答复无副作用。 | Browser／TUI 审批、Coordinator 身份和快照测试（待实现）。 |
| [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4) | 三档授权跨相应范围复用；不同 Bash、写入同路径及不同 Sandbox 能力分别按规则判定；Profile 和沙箱仍有效。 | Grant matcher、Store、跨 Run／Goal 和受限命令测试（待实现）。 |
| [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3) | 两类 Grant 在统一入口可审阅并撤销；后续 Action 重新判断，旧页面与跨项目请求被拒绝。 | Browser／TUI 管理界面、撤销与身份集成测试（待实现）。 |
| [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4) | 跨进程切换／撤销与开始顺序一致；提交前崩溃、损坏记录、结果不确定和拒绝均不越权或重放。 | 两进程竞争、故障注入与跨重启恢复测试（待实现）。 |
| [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3) | Browser／TUI 状态一致且不泄露凭据；Linux／Windows 标示无 Seatbelt，Benchmark 的独立策略不受项目模式影响。 | 投影与脱敏测试（待实现）；平台与 Benchmark 策略回归；必要时人工检查跨端文案。 |

完成实施后运行 `npm test` 全量回归；真实 macOS Seatbelt 放行／拒绝证据沿用 Sandbox Spec 的系统级验证，不能用模拟判定替代。

### Latest Result

未执行。后续记录被测提交和 Spec 版本、逐项结果、证据位置、未解决问题、整体状态与时效。
