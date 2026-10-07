# 多 Spec 编排

## 编排目标

先完成 Run 执行与持久化恢复职责拆分及安全存储重试，再在其已验证边界上交付 Steer、页面 Queue 和 Interrupt。共同交付范围以两个已批准 Spec 为准，包含 Interrupt 后同一 Run 的有限自动收尾，InstantInterrupt 留待后续。

## 涉及的 Spec

| Spec | 路径 | 批准状态 | 完成条件 |
| --- | --- | --- | --- |
| Run 执行与持久化恢复职责拆分（A） | [run-execution-persistence-separation](./run-execution-persistence-separation/tasks.md) | Requirements、Design、Tasks 均已获用户批准 | 全部 TODO 完成，Feature Verification passed / current |
| Run 输入与主动终止（B） | [run-input-control](./run-input-control/tasks.md) | 修订后 Requirements、Design、Tasks 均已获用户批准 | 全部 TODO 完成，Feature Verification passed / current |

当前两项均有 3 个未完成 TODO，Feature Verification 均为未执行。

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

未执行。两项 Feature Verification 均通过且上述集成检查全部满足，才能记录 Integration Verification 为 passed / current。

## 生命周期状态

- [x] 编排已获用户批准
- [ ] A Feature Verification passed / current
- [ ] B Feature Verification passed / current
- [ ] 各 Spec Feature Verification 全部 passed
- [ ] 跨 Spec Integration Verification passed
- [ ] Memory 沉淀门完成（此前用户选择暂不沉淀；交付时沿用该偏好，未经新的授权不写入）
- [ ] 用户确认最终交付
- [ ] 已删除 orchestration.md

仅在执行、验收、Memory 门和最终交付确认全部完成后删除本编排文件，保留两份 Spec 及其验收证据。
