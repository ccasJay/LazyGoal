# 自适应 Run 阶段路线与活动组实施计划

## 执行边界

[Spec](./spec.md) 已获批准。本 Plan 遵循 Spec 的范围：完整阶段路线和审批前只读门仅用于 Plan Run；普通 Run 沿用现有逐阶段 RunStage 生命周期；活动组从实际事件派生并覆盖两种模式。不修改 GoalPlan Todo 的生命周期，不增加子 Goal、阶段并行或持久化 ActivityGroup。

风险评估：高。Plan Run 的审批前只读门会改变工具副作用边界；路线、审批和阶段状态进入恢复流程；活动投影还要协调不同来源的身份与持久化边界。关键检查操作是：审批前拒绝未明确标记只读的业务工具；路线和审批事实持久化成功前不执行写入；恢复后不重复审批或重放已完成副作用；不把隐藏推理内容投影到界面。每项任务先建立针对这些行为的失败断言，再实现并运行该项验证。新增公共 TypeScript 契约须附中文契约级 TSDoc 与最小示例；每项任务同步其所属模块的 overview、semantics 和语义表。

## 任务清单

- [x] //TODO 1. 建立 Plan Run 专属的阶段路线契约、状态流转与检查点恢复
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[4.1](./spec.md#spec-req-4-1)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[4.5](./spec.md#spec-req-4-5)。
  - 先在待新增的 Runtime 路线状态测试、Model Contracts 路线候选测试和 Storage Snapshot 往返/恢复测试中断言：Runtime 分配路线与阶段身份；仅 Plan Run 可持有完整路线；阶段目标、验收条件、顺序、游标和状态无效时整份拒绝；普通 Run Snapshot 不增加路线状态；GoalPlan 不随路线变化；只恢复 Snapshot 提交边界内的路线事实，不读取未提交候选或旧版兼容字段。
  - 实现模型候选到 Runtime 权威状态的映射、稳定身份分配、顺序/状态校验与 Snapshot 编解码。路线由 Runtime 保存完整历史所需的当前修订和阶段结果；不把模型候选当成已批准状态，不新增旧开发 Snapshot 迁移路径。更新 runtime、model-contracts、storage 的所有者说明。
  - 验证入口：npx tsx --test packages/runtime/test/run-plan-route.test.ts packages/model-contracts/test/run-plan-route.test.ts packages/storage/test/run-plan-route-snapshot.test.ts packages/storage/test/goal-snapshot-current.test.ts（前三项待新增）。

- [ ] //TODO 2. 在 Plan Run 审批前建立只读工具边界
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.6](./spec.md#spec-req-2-6)、[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)。
  - 先扩展 packages/runtime/test/pre-approval-stage-gate.test.ts：未批准 Plan Run 只可调用必要控制工具和 ToolDefinition.isReadOnly 为 true 的业务工具；伪造模型输出直接调用未标记工具时 Runtime 在执行前拒绝；Prompt/Schema 暴露范围与 Runtime 实际门禁一致；请求批准或等待用户时不执行写入；普通 Run 的工具授权、当前阶段、恢复及审批行为保持不变。
  - 以现有 ToolDefinition.isReadOnly 契约作为唯一只读依据，在模型可见工具集合和 Runner 调用入口同时施加边界；不解析 Bash 文本，不将只读声明视为授权，也不改变 Tool Grant、YOLO、Action 审批或沙箱策略。更新 tool-core、runtime 和 model-contracts 所有者说明及相关 TSDoc。
  - 验证入口：npx tsx --test packages/runtime/test/pre-approval-stage-gate.test.ts packages/runtime/test/goal-plan-mode.test.ts packages/runtime/test/goal-plan-run.test.ts packages/runtime/test/tool-discovery.test.ts packages/runtime/test/tool-grant.test.ts。

- [ ] //TODO 3. 让 Plan Run 按复杂度形成路线，并把路线纳入单一任务提案
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.4](./spec.md#spec-req-1-4)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)。
  - 先在 Agent Prompt、模型输出和 Runtime 任务提案测试中断言：单一连贯结果产出一个阶段；多个可独立验收结果、真实依赖或不同验证关口产出有序多阶段路线；不按 Step/工具/token 数凑阶段；影响范围、正确性或授权的未知信息先通过 ask_user 收集；一次 task_proposal 同时包含范围、总体验收条件和完整路线。
  - 将路线候选接入 Plan Run 的模型输出契约、Prompt 与现有任务提案交互；批准对象保持单一。普通模式 Prompt 与 Runtime 不新增全路线输出要求。保留只读探查、用户提问、拒绝提案与恢复已有语义。更新 agent、model-contracts、runtime 所有者说明。
  - 验证入口：npx tsx --test packages/model-contracts/test/model-output-canonical.test.ts packages/model-contracts/test/model-output-wire.test.ts packages/agent/test/prompt.test.ts packages/agent/test/prompting-renderer.test.ts packages/runtime/test/goal-plan-run.test.ts packages/runtime/test/pre-approval-stage-gate.test.ts。

- [ ] //TODO 4. 在同一获批 Plan Run 中推进、修订并恢复阶段路线
  - 落实标准：[1.3](./spec.md#spec-req-1-3)、[1.5](./spec.md#spec-req-1-5)、[2.5](./spec.md#spec-req-2-5)、[2.6](./spec.md#spec-req-2-6)、[2.7](./spec.md#spec-req-2-7)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)。
  - 先在待新增的 Run 路线执行/恢复测试及现有 Runtime 测试中断言：批准后同一 Run 依路线顺序执行；任一时刻最多一个活动阶段；中间阶段接受只推进游标、不完成 Run/Goal；阶段切换、路线修订和批准状态先通过领域校验及检查点提交；获批范围内修订需记录理由且保留仍有效结果；扩大范围时暂停并等待用户决定；进程恢复不重复审批或重放已完成工具副作用；GoalPlan 不被创建或改写。
  - 将阶段启动、接受、路线修订与提案批准接入 Runtime 的 transition/checkpoint/recovery 生命周期。路线版本和审批范围保持对应；修订按新证据保留仍有效结果，不静默覆盖已接受的历史事实；普通 Run 继续按当前 RunStage 接受/拒绝及恢复逻辑，不新增路线状态。更新 runtime、storage 所有者说明和公开契约 TSDoc。
  - 验证入口：npx tsx --test packages/runtime/test/run-plan-execution.test.ts packages/runtime/test/run-plan-recovery.test.ts packages/runtime/test/run-stage.test.ts packages/runtime/test/run-stage-recovery.test.ts packages/runtime/test/goal-multi-run-recovery.test.ts packages/storage/test/run-stage-snapshot.test.ts（前两项待新增）。

- [ ] //TODO 5. 将 Plan Run 完整路线投影到会话 DTO 并独立呈现
  - 落实标准：[3.1](./spec.md#spec-req-3-1)、[3.3](./spec.md#spec-req-3-3)、[5.1](./spec.md#spec-req-5-1)。
  - 先在 packages/browser/test/browser-projection.test.ts、packages/web-contracts/test/web-contracts.test.ts 和 Goal Board 阶段展示测试中断言：Plan Run 显示完整路线及每阶段顺序、目标和状态；普通 Run 不暴露路线字段且仍显示现有当前/最新阶段；未执行阶段也能出现；路线视图不取代轨迹/事件视图，已有 RunStage 数据不被误读为完整路线。
  - 从 Snapshot 的 Runtime 权威路线投影安全 DTO，并在会话视图以独立列表展示；不将路线复制到 Trajectory、GoalPlan 或活动组。为 DTO 与新增组件补中文 TSDoc/界面契约，并更新 browser、web-contracts、goal-board 所有者说明。
  - 验证入口：npx tsx --test packages/browser/test/browser-projection.test.ts packages/web-contracts/test/web-contracts.test.ts apps/goal-board/test/run-stage-presentation.test.ts。

- [ ] //TODO 6. 实现按调用身份和来源相邻关系派生活动组
  - 落实标准：[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5)、[5.6](./spec.md#spec-req-5-6)、[5.8](./spec.md#spec-req-5-8)。
  - 先在待新增的纯 ActivityProjector 测试、浏览器事件流测试和现有 trajectory-page-window 测试中建立断言：同 Run/阶段内相邻且同类调用可合并；阶段/Run/用户等待/助手可见决策/终态失败/类别切换形成边界；同一 actionId 的流式开始、输出、重试和结束更新同一个调用；attempt 失败后同 Action 成功不导致组失败；ExecutionStream 与 Trajectory 的 eventId、cursor、sequence 独立去重；实时未提交增量不进入恢复历史；跨页只在事件身份与相邻序号可验证时合并；未知类别原样保留；隐藏推理内容不输出。
  - 建立可重放的纯投影器，分别消费实时事件与已提交 Trajectory，再以 actionId 和提交边界协调；保留组内详情顺序、可见性、耐久性及来源引用，不创建持久化组 ID，不依靠相同摘要/工具名/时间近似猜测成员。更新 goal-board/browser/web-contracts 说明与新增接口 TSDoc。
  - 验证入口：npx tsx --test apps/goal-board/test/activity-projector.test.ts packages/browser/test/browser-stream.test.ts packages/browser/test/browser-trajectory.test.ts apps/goal-board/test/trajectory-page-window.test.ts packages/execution-stream/test/execution-stream.test.ts（ActivityProjector 测试待新增）。

- [ ] //TODO 7. 在两种模式的会话活动中展示可展开活动组并保留原始检查入口
  - 落实标准：[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5)、[5.6](./spec.md#spec-req-5-6)、[5.7](./spec.md#spec-req-5-7)、[5.8](./spec.md#spec-req-5-8)。
  - 先在 Goal Board 单元与 E2E 测试中断言：展开组可按原顺序查看成员、命令/工具调用、结果和错误；详情入口仍定位原事件；重连、刷新和补页不产生重复/错配；Plan Run 的路线与实际活动各自呈现；普通 Run 也用活动组但保留现有阶段显示；折叠或摘要不改变 Runtime、授权、Trajectory 或评测数据。
  - 将 ActivityProjector 接入实际实时订阅、轨迹分页和会话 UI；安全 Web DTO 必须保留分组所需身份与公开事件信息，不扩大 restricted/diagnostic 可见范围。新增界面行为通过键盘可访问的展开控件暴露；更新 goal-board 的 TSDoc 与模块说明。
  - 验证入口：npm run --prefix apps/goal-board test；npm run --prefix apps/goal-board test:e2e（扩展 apps/goal-board/e2e/run-stages.test.mjs 或新增对应场景）。

- [ ] //TODO 8. 联调 Plan/普通 Run 边界并完成模块说明
  - 落实标准：[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[4.4](./spec.md#spec-req-4-4)、[4.5](./spec.md#spec-req-4-5)、[5.1](./spec.md#spec-req-5-1)、[5.8](./spec.md#spec-req-5-8)。
  - 先建立跨层场景断言：Plan Run 从只读调查、信息收集、单次路线审批到多阶段执行/中途恢复完整闭环；普通 Run 保持原阶段决策及审批边界且没有完整路线字段或审批前只读门；两种模式活动组都可展开并追溯来源；GoalPlan 与 Run/Goal 终态语义不变。
  - 核对并同步 Runtime、Model Contracts、Agent、Storage、Browser、Web Contracts 和 Goal Board 所有者 README、notes/overview.md、notes/semantics.md 与语义表；不改写已有历史 Spec/Memory。完成文档链接、类型和依赖边界检查。
  - 验证入口：npx tsx --test packages/runtime/test/pre-approval-stage-gate.test.ts packages/runtime/test/goal-plan-run.test.ts packages/browser/test/browser-projection.test.ts apps/goal-board/test/activity-projector.test.ts；npm run check:docs；npm run check:dependencies。

## Feature Verification

### Planned Checks

每一行对应 Spec 的独立验收标准。标注“待新增”的测试在对应 TODO 中先建立；所有命令须在实现后执行并以具体断言结果判断，不以退出码单独作为成功依据。

| 验收项 | 对应标准 | 场景与预期结果 | 检查手段 / 命令入口 |
| --- | --- | --- | --- |
| Plan 路线持久化和写入门 | [1.1](./spec.md#spec-req-1-1) | Plan Run 获批执行前已有覆盖批准范围的有效路线；缺失/无效路线时没有副作用工具被调用。 | Runtime 路线执行测试；审批前门禁测试。 |
| 按结果和验收关口拆分 | [1.2](./spec.md#spec-req-1-2) | 一个连贯交付物形成单阶段；独立结果、真实依赖或不同验收关口形成有序多阶段。 | Agent Prompt/模型合同测试；固定输入输出场景。 |
| 单活动阶段与顺序推进 | [1.3](./spec.md#spec-req-1-3) | 按序开始下一阶段，同一时刻最多一个活动阶段；每阶段目标和完成条件非空。 | Runtime 路线状态和执行测试。 |
| 不按动作数量凑阶段 | [1.4](./spec.md#spec-req-1-4) | 改变预计 Step/工具/token 数而不改变交付结构，不增加路线阶段。 | Prompt 契约测试及单/多阶段场景断言。 |
| 中间阶段不终结 Run | [1.5](./spec.md#spec-req-1-5) | 中间阶段被接受只推进路线；Goal/Run 只有通过既有最终审查才完成。 | Runtime 执行/完成审查测试。 |
| 审批前允许范围 | [2.1](./spec.md#spec-req-2-1) | Plan Run 提案前可调用明确只读业务工具和所需控制工具，其他业务工具被 Runtime 拒绝。 | pre-approval-stage-gate.test.ts：只读成功、写入拒绝、伪造输出拒绝。 |
| 只读按工具契约判断 | [2.2](./spec.md#spec-req-2-2) | isReadOnly 为 false/缺失的 Bash 与程序工具均被挡住，不根据命令文字推断。 | Runtime 门禁单元测试及工具合同测试。 |
| 先询问实质未知信息 | [2.3](./spec.md#spec-req-2-3) | 影响范围、正确性或授权的未知项先进入 ask_user；常规偏好不产生额外审批。 | Agent Prompt、Runtime 交互恢复测试。 |
| 单一提案含路线全貌 | [2.4](./spec.md#spec-req-2-4) | 一次 task_proposal 同时显示范围、总体验收条件和完整有序路线，获批范围内无需逐阶段再批准。 | Model Contracts、Goal Board 提案测试。 |
| 同 Run 自主推进并沿用授权 | [2.5](./spec.md#spec-req-2-5) | 批准后阶段在同一 runId 顺序执行，仍遵循 Tool Grant、YOLO、Action 审批和完成审查。 | Runtime route execution 与 permission regression。 |
| 等待/拒绝时不写入及范围扩张 | [2.6](./spec.md#spec-req-2-6) | 等待或拒绝提案不执行写工具；实质扩展范围会暂停并要求用户决定。 | Runtime 门禁、提案拒绝、范围修订测试。 |
| 证据驱动修订与保留结果 | [2.7](./spec.md#spec-req-2-7) | 同范围修订记理由并保留仍有效阶段；扩大范围或变更承诺需重新取得用户决定。 | Runtime route revision/execution 测试和恢复测试。 |
| 普通 Run 保持当前阶段机制 | [3.1](./spec.md#spec-req-3-1) | 普通 Run 仍可按现有规则先声明当前阶段并调用首个业务工具，不要求全路线。 | normal Run 阶段执行回归；不存在路线状态字段。 |
| 普通 Run 不套用 Plan 门 | [3.2](./spec.md#spec-req-3-2) | 普通 Run 没有路线审批、Plan 前置只读门或额外阶段审批，现有授权策略有效。 | pre-approval gate 的 normal-mode 对照测试及权限回归。 |
| 普通 Run 的阶段和恢复不变 | [3.3](./spec.md#spec-req-3-3) | 普通 Run 的声明、执行、审核、接受/拒绝和恢复保持现有 RunStage 行为。 | run-stage、run-stage-review、run-stage-recovery 回归。 |
| 路线由 Runtime 持有 | [4.1](./spec.md#spec-req-4-1) | Runtime 分配 ID/状态；Plan 路线进入 Snapshot；普通 Run 不写完整路线。 | Runtime domain 与 Snapshot round-trip 测试。 |
| 检查点先于后续动作 | [4.2](./spec.md#spec-req-4-2) | 路线/审批/修订/阶段启动/接受的检查点提交失败时，依赖该事实的动作不运行。 | Runtime checkpoint 故障注入和 commit boundary 测试。 |
| 恢复路线及批准事实 | [4.3](./spec.md#spec-req-4-3) | 从 Snapshot 和已提交 Trajectory 重建当前版本/阶段；不重问已批准提案，不采信候选。 | run-plan-recovery.test.ts 与 Snapshot/Trajectory boundary tests。 |
| GoalPlan 生命周期独立 | [4.4](./spec.md#spec-req-4-4) | 路线声明、阶段接受和恢复均不创建、完成或改写 GoalPlan Todo。 | GoalPlan persistence 与 Runtime route tests。 |
| 无旧开发数据迁移 | [4.5](./spec.md#spec-req-4-5) | 新实现不增加旧 Snapshot 专用兼容分支或迁移逻辑。 | Codec schema tests、代码检查。 |
| 独立路线列表 | [5.1](./spec.md#spec-req-5-1) | Plan 显示全部路线及顺序、目标、状态；普通 Run 保留当前阶段；轨迹视图仍可访问。 | Browser projection、web-contracts、Goal Board presentation/E2E。 |
| 实时活动与耐久边界 | [5.2](./spec.md#spec-req-5-2) | 工具开始立即显示运行中组，公开输出/完成/失败更新同一调用；live-only 数据不冒充已提交事实。 | ActivityProjector tests、Browser stream tests、reconnect E2E。 |
| 连续分组合并和边界 | [5.3](./spec.md#spec-req-5-3) | 同 Run/阶段/类别的相邻调用可组合；回复、等待、阶段/Run 切换、终态失败和不兼容类别断组；详情顺序及可见策略不变。 | ActivityProjector boundary matrix tests。 |
| actionId 与来源身份去重 | [5.4](./spec.md#spec-req-5-4) | 同一调用开始/增量/尝试/完成正确配对；重连无重复；两个来源的身份空间独立。 | projector identity tests、ExecutionStream tests。 |
| 跨页历史重建 | [5.5](./spec.md#spec-req-5-5) | 邻页数据齐全且来源相邻时可修复分页断组；身份缺失、序号缺口、跨 Run/阶段均不合并。 | trajectory-page-window 与 projector page-boundary tests。 |
| 组状态、重试与非持久化 | [5.6](./spec.md#spec-req-5-6) | 投影具有稳定成员引用和 running/completed/failed；尝试失败后同 Action 成功则组成功；不写持久化组 ID。 | projector retry/status tests 与 Snapshot 对照断言。 |
| 展开后核验原始事件 | [5.7](./spec.md#spec-req-5-7) | 原始 Steps、调用、结果、错误及详情入口按原顺序可达；未知事件仍单列。 | Goal Board unit/E2E，检查详情定位与顺序。 |
| 视图不改变执行事实 | [5.8](./spec.md#spec-req-5-8) | 展开、折叠、摘要和实时状态不改 Run、授权、Trajectory、评分；live-only 事件在恢复后消失。 | UI interaction 与 Runtime/Snapshot 对照测试。 |

### Latest Result

- 总体状态：未执行
