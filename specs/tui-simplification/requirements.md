# TUI 简化 需求

## 引言

落实 TUI 审核提出的 6 个简化候选：清除 `packages/tui` 中无生产消费者的公共 UI 面、去除冗余 `structuredClone`、合并重复的流程与闸门逻辑。全部变更为行为保持型重构，不触碰其他包，分两批落地（第一批纯删除合并，第二批提交闸门 hook 抽取）。

## 需求

### 需求 1：移除无消费者的公共 UI 面

**用户故事：** 作为 LazyGoal 维护者，我希望 `UiScreen`/`UiViewModel`/`UiCommand` 只保留有生产入口的变体，以便缩小状态空间与公共 API 维护面。

#### 验收标准

1. <a id="req-1-1"></a> 检查源码时，`UiScreen` 与 `UiViewModel` 不再包含 `fatal` 变体，`TuiApp`、`SessionController`、`index.ts` 中无对应分支或导出
2. <a id="req-1-2"></a> 检查源码时，`UiCommand` 不再包含 `openGoalSelect` 变体，`resume` 命令的可观察行为与现状一致
3. <a id="req-1-3"></a> 全仓库检索时，除本 Spec 文档外无 `fatal` 屏幕与 `openGoalSelect` 命令的残留引用

### 需求 2：ViewModel 派生单次克隆

**用户故事：** 作为 LazyGoal 维护者，我希望 `SessionController` 派生 ViewModel 时对每个对象只深克隆一次，以便降低每次进度更新的冗余开销而不削弱不可变性。

#### 验收标准

1. <a id="req-2-1"></a> 检查源码时，`toSessionView` 只对 Goal 执行一次 `structuredClone`，`messages`、`pendingAction`、`proposal` 直接引用该克隆的字段
2. <a id="req-2-2"></a> 检查源码时，`setGoalSelectError` 不对已由调用方隔离的 Catalog 条目再次克隆
3. <a id="req-2-3"></a> 现有关于快照隔离与错误投影的测试全部通过，ViewModel 不可变性语义不变

### 需求 3：重复流程合并

**用户故事：** 作为 LazyGoal 维护者，我希望 Controller 的 Catalog 读取与 CLI 的 SIGINT 清理各只有一个实现，以便后续修改只动一处。

#### 验收标准

1. <a id="req-3-1"></a> 检查源码时，`continueLatest` 与 `openGoalSelect` 共享同一段 Catalog 读取、`goal_select` 快照与空列表错误逻辑，两者可观察行为与现状一致
2. <a id="req-3-2"></a> 检查源码时，`runCli` 的清理路径只通过一个机制移除 SIGINT 监听，退出码 130 与关闭顺序不变
3. <a id="req-3-3"></a> 现有 SIGINT 单路径、退出码 130、`goal_select` 相关测试全部通过

### 需求 4：屏幕提交闸门统一

**用户故事：** 作为 LazyGoal 维护者，我希望 5 处复制在屏幕中的提交闸门逻辑（提交锁、busy 重置、本地校验错误）收敛为一个共享 hook，以便消除约 150 行重复而不改变屏幕语义。

#### 验收标准

1. <a id="req-4-1"></a> 检查源码时，intent、goal-select、preparation、blocked、action 五处交互面板的闸门逻辑由同一个共享 hook 提供
2. <a id="req-4-2"></a> 当用户重复提交、busy 期间提交或提交空白内容时，各屏幕的 exactly-once 语义与本地校验文案与现状一致
3. <a id="req-4-3"></a> 现有 5 个屏幕的交互测试全部通过

### 需求 5：行为保持与文档同步

**用户故事：** 作为 LazyGoal 维护者，我希望本次重构完成后类型检查、测试与架构文档保持一致，以便确认无任何可观察行为变化。

#### 验收标准

1. <a id="req-5-1"></a> `npx tsc --noEmit` 通过
2. <a id="req-5-2"></a> `packages/tui` 全部测试通过
3. <a id="req-5-3"></a> `docs/architecture/tui.md` 的职责表、命令面描述与 Ctrl+C 归属说明与实现一致
