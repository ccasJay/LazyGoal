# 多 Spec 编排

## 编排目标

先完成 Run 执行与持久化恢复职责拆分及安全存储重试，再在其已验证边界上交付 Steer、页面 Queue 和 Interrupt。共同交付范围以两个已批准 Spec 为准，包含 Interrupt 后同一 Run 的有限自动收尾，InstantInterrupt 留待后续。

## 涉及的 Spec

| Spec | 路径 | 批准状态 | 完成条件 |
| --- | --- | --- | --- |
| Run 执行与持久化恢复职责拆分（A） | [run-execution-persistence-separation](./run-execution-persistence-separation/tasks.md) | Requirements、Design、Tasks 均已获用户批准 | 全部 TODO 完成，Feature Verification passed / current |
| Run 输入与主动终止（B） | [run-input-control](./run-input-control/tasks.md) | 修订后 Requirements、Design、Tasks 均已获用户批准 | TODO 已完成；Feature Verification pending-human，Queue 自动多条续跑验收待补 |

A 的 3 个 TODO 均已完成，Feature Verification passed / current。B 的 4 个 TODO 均已完成并提交；B 的主要回归通过，但 Queue 正常完成后的多条自动续跑 E2E 补测超时，Feature Verification 暂记 pending-human，跨 Spec Integration Verification 的最终门尚未完成。

## 依赖关系与执行顺序

`A → B`。A 完成并通过 Feature Verification 后才开始 B；B 消费 A 已实现的 Runner 门面、RunRecoveryReader、RunExecutor 和共享检查点提交边界。每个 Spec 内部的实施与验收由其 tasks.md 和 executing-task 技能管理。

## 可并行执行的部分

无。两项共同修改 Runtime、Storage 和恢复边界，B 有明确的前置依赖；由当前会话依次执行。

## 分支与合并策略

- 基础为当前 `dev` 已提交的 `ab39701a`；实施前记录完整提交身份。A 使用 `codex/run-execution-persistence-separation`，B 在 A 验收通过的提交上创建 `codex/run-input-control`，两个分支分别使用包含 Spec 名的独立 worktree。
- 主工作区保留已有 `apps/goal-board/src/main.tsx`、`apps/goal-board/src/style.css` 修改。请求用户批准从已提交基础隔离执行的处理方式：不要求先提交这些修改，不将其复制或提交到功能分支。B 按自身已批准的按钮需求实现；后续合入时须处理与主工作区按钮修改的重叠。
- 两个未跟踪的 Spec 目录完整复制到 A 的 worktree 并作为规划材料入库，主工作区保留原文件；B 从 A 继承两份 Spec，使相对依赖链接有效。编排文件作为共同执行记录维护；不同副本出现进度差异时以对应执行分支的 tasks.md 及提交为准。
- 若目标分支或 worktree 已存在，先核对归属和进度；归属冲突时停止，不覆盖。worktree 依赖单独安装，验证使用隔离测试数据。
- 集成验证在 B 最终提交上进行。交付时保留分支与 worktree，等待用户验证；合入顺序为 A 后 B，实际 merge、push、PR 和清理 worktree 另行由用户授权。

## 跨 Spec 协调约束

- Goal Snapshot 仍是唯一可恢复状态；B 的受理记录与终止意图扩展该状态，页面 Queue 保持页面所有权。A 不提前实现 B 的交互。
- B 沿用 A 的提交端口、事实/frame → Patch → Snapshot → marker 顺序及 Store 内部安全重试。不得通过重试整个提交或原工具调用补偿存储故障。
- A 的普通关闭、调用级取消与待处理 Action 恢复规则，在 B 中继续有效；只有持久化的用户 Interrupt 进入 B 定义的有限收尾与 cancelled 路径。
- B 的命令受理、模型输入冻结和检查点提交，使用同一最新已提交 Goal；模型及工具等待不占用短暂串行边界。跨 Spec 修改后重新验证 A 的恢复不变量。
- Snapshot/Trajectory 按当前开发期策略原位更新，不新增旧数据兼容分支。公开契约 TSDoc 和当前架构文档随实现更新。
- 若发现需求、接口或架构缺口，返回受影响 Spec 修订；编排不补写产品行为。材料性变更按对应 Spec 及编排的批准流程处理。

## 跨 Spec 集成验证

在 B 最终代码状态上执行，并记录提交、契约指纹、验证时间、证据与未解决问题；相关代码变化使原证据失效时重新验证。

| 场景 | 预期结果 | 检查方式 |
| --- | --- | --- |
| Steer 受理与模型/frame、完成提交竞争，叠加临时存储故障及重启 | 同一 Run 按序且仅一次应用，旧提交不覆盖受理记录；未提交尾部不成为进度 | 两 Spec 的提交故障、Steer、frame 和恢复检查联合运行；补足跨机制故障组合证据 |
| Interrupt 受理、工具未知结果和收尾预算保存期间发生故障或重启 | 用户终止意图保留，只恢复有限收尾；存储重试不重复工具效果，预算不重置，最终 cancelled | Interrupt、直接 Tool/PTC、Snapshot 与提交器检查联合运行 |
| 普通服务关闭与显式 Interrupt 对照 | 普通关闭仍可恢复原进度；用户 Interrupt 只收尾，后端继续运行 | 执行控制、shutdown、多 Run 恢复及 Browser 控制集成检查 |
| Web Steer → Queue → Interrupt → 收尾 → 显式继续 Queue | 界面状态、队列暂停和新 Run 身份一致；响应丢失重试不重复创建 | B 的真实服务组合 E2E 与后继 Run 去重检查 |
| 普通/Plan Run、审批等待及 Headless 入口回归 | A 保持的原行为仍成立；B 不绕过授权或等待点 | 两 Spec 已批准的完整回归，包含 `npm test`、`npm run check:dependencies`、`npm run build:web`、`npm run test:web-e2e` |
| 源码、公开契约和当前架构一致 | 职责、状态所有权及恢复语义与最终实现一致；无无关改动 | 相关源码与文档检查、`git diff --check` |

### Latest Result

状态：**pending-human / current**。全量回归验证时间：2026-10-08 00:40（Asia/Shanghai）；后续补测发现 Queue 多条自动续跑尚未取得直接 E2E 证据。被测实现提交：`808eedeaec11febe8efe4ba6a7a7ead8f3ee7b64`；后续文档记录提交不含实现代码变更。B Requirements SHA-256 `7d8876caa2c04f38a68a0b338e0b9900c900f3120ec31a32e1a46a3623556b0e`；Design SHA-256 `6eb9653ef00550fecc0e1db5f76d8239db043701d418f6ad7e1fcb318c35c84f`。

| 场景 | 检查与观察结果 | 证据 |
| --- | --- | --- |
| Steer 与提交竞争、恢复、存储重试 | Steer 在相同 Run 按序且仅一次应用；提交器/恢复安全检查通过。 | A Feature Verification 仍为 passed/current；`packages/runtime/test/run-steer.test.ts`、`packages/runtime/test/trajectory-checkpoint-committer.test.ts`、Snapshot 与恢复检查纳入 `npm test`。 |
| Interrupt 与未知工具结果收尾 | 用户终止意图恢复后只进行有界收尾；直接 Tool/PTC 未知结果有原 Action 来源，预算不重置，不重放原调用，最终 cancelled。 | `packages/runtime/test/run-interrupt.test.ts`、`packages/runtime/test/program-interruption.test.ts`、`packages/agent/test/interrupted-tool-history.test.ts`、`packages/storage/test/run-input-control-snapshot.test.ts`；全量回归通过。 |
| 宿主关闭与用户 Interrupt 区分 | 普通关闭仅传播宿主取消，保留检查点，不写用户终止意图或访问已关闭 Trace；Interrupt 仍按目标 Run 结算。 | `apps/goal-server/test/browser-session.integration.test.ts`、`packages/runtime/test/execution-control.test.ts`、`packages/runtime/test/shutdown.test.ts`。 |
| Web Steer → Queue → Interrupt → 显式继续 Queue | 可编辑 composer 与按钮原位切换工作；中断后队列暂停，显式继续按同一 Goal 创建后继 Run。响应丢失与服务重启重试返回同一后继身份。正常完成后的多条 Queue 自动续跑补测超时，刷新丢队列没有通过的直接 E2E 证据。 | `apps/goal-board/e2e/runtime.test.mjs`、`apps/goal-board/e2e/run-input-control.test.mjs`、`packages/browser/test/browser-messages.test.ts`。原有浏览器 E2E 3/3 通过；新增多条续跑验收未通过。 |
| Normal/Plan、审批等待、Headless 与源码契约回归 | 全量 `npm test` 通过：1,604 项 TS 测试、24 项脚本测试；Web 构建、依赖边界和差异格式检查通过。 | `npm test`、`npm run build:web`、`npm run check:dependencies`、`git diff --check`。依赖边界覆盖 218 个源文件。 |

未解决问题：B 的 Queue 正常完成后多条自动续跑补测超时，尚未定位续跑实现或测试模型的原因；刷新丢队列缺少直接 E2E 证据。跨 Spec 的其余全量回归、构建与边界检查通过。InstantInterrupt 未实现，符合编排范围。

## 生命周期状态

- [x] 编排已获用户批准
- [x] A Feature Verification passed / current（提交 `7afd22ea24d2a66e75edf136484f28e8048f7513`；`npm test`、类型检查、依赖边界与定向恢复/存储测试通过）
- [ ] B Feature Verification pending-human（其余回归通过；Queue 多条自动续跑 E2E 待定位并验收）
- [ ] 各 Spec Feature Verification 全部 passed
- [ ] 跨 Spec Integration Verification passed
- [x] Memory 沉淀门完成（用户明确选择暂不沉淀；本次未写入项目记忆）
- [ ] 用户确认最终交付
- [ ] 已删除 orchestration.md

仅在执行、验收、Memory 门和最终交付确认全部完成后删除本编排文件，保留两份 Spec 及其验收证据。
