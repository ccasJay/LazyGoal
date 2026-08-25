# TUI 表现层优化 需求

## 引言

本功能针对 `packages/tui` 表现层进行一致性、渲染、动画与逻辑合理性优化：消除同屏重复 Spinner、统一批准面板键位与错误展示、折叠超长 Action 输入、截断标识显示，并清理不可达的终态 fallback、switch 缺省分支与冗余校验等死代码。全部变更为行为保持型或带测试覆盖的小幅交互调整，不改变 Runtime/Agent/Storage 状态机语义；`structuredClone` 维持单次克隆（已由 `tui-simplification` 决策，不在本功能范围）。

## 需求

### 需求 1：进度指示器单一且语义化

**用户故事：** 作为 TUI 使用者，我希望在等待期间看到唯一且能区分阶段的进度指示，以便不被重复 Spinner 干扰并了解当前在做什么。

#### 验收标准

1. <a id="req-1-1"></a> 当任一屏幕处于 busy 或 Run 处于 running 时，该屏幕至多显示一个 Spinner 实例，不得出现状态行与交互面板同时各渲染一个 Spinner。
2. <a id="req-1-2"></a> 当屏幕显示 Spinner 时，其文案必须反映当前 phase（创建 Goal、准备、执行 Step、恢复等），不得再统一显示 `Working...`。
3. <a id="req-1-3"></a> 检查源码时，Spinner 必须由单一共享原语渲染且被至少三个屏幕复用，无屏幕再各自直接渲染 `@inkjs/ui` 的 `Spinner`。

### 需求 2：批准面板键位一致

**用户故事：** 作为需批准 Task 或 Action 的使用者，我希望两个批准面板的确认键位一致，以便肌肉记忆不被破坏。

#### 验收标准

1. <a id="req-2-1"></a> 在 Task 批准面板与 Action 批准面板中，按 Enter 键不得触发批准或拒绝。
2. <a id="req-2-2"></a> 仅按 Y 键批准、按 N 键进入带理由的拒绝或反馈，两个面板行为必须一致。
3. <a id="req-2-3"></a> 两个面板的 dimColor 提示语所描述的键位必须与实际行为相符。

### 需求 3：统一错误展示

**用户故事：** 作为 TUI 使用者，我希望各类错误以统一格式展示，以便快速识别错误来源与类型。

#### 验收标准

1. <a id="req-3-1"></a> 当 Controller 投影业务错误或本地校验失败时，当前屏幕必须以统一格式展示错误：颜色一致，是否附带错误 code 的规则一致。
2. <a id="req-3-2"></a> 当本地校验错误与业务错误同时存在时，屏幕必须按统一优先级展示其一，不得并列重复。
3. <a id="req-3-3"></a> 检查源码时，错误展示必须由单一共享原语渲染且被至少三个屏幕复用，无屏幕再各自手写错误 `Text`。

### 需求 4：输入提交后清空与 busy 控件一致

**用户故事：** 作为在 question 或 blocked 等待点回复的使用者，我希望提交后输入框清空且 busy 时控件行为一致，以便不误用残留内容并明确停用状态。

#### 验收标准

1. <a id="req-4-1"></a> 当使用者在 question 或 blocked 等待点提交非空文本后，输入框必须清空，不得残留上次内容。
2. <a id="req-4-2"></a> 当同一 blocked 等待点因推进再次出现时，输入框必须初始为空。
3. <a id="req-4-3"></a> busy 期间所有推进控件必须停用且策略一致，不得出现同一屏幕内一处卸载、一处 disable 的混用。

### 需求 5：Action 详情折叠

**用户故事：** 作为需审批 Action 的使用者，我希望超长输入被折叠，以便不被大段 JSON 挤掉上下文。

#### 验收标准

1. <a id="req-5-1"></a> 当 pending Action 的 input 序列化长度超过阈值时，Action 详情必须折叠超长内容并提示被折叠的字符数。
2. <a id="req-5-2"></a> 当 input 序列化长度未超过阈值时，Action 详情必须完整展示。

### 需求 6：标识截断显示

**用户故事：** 作为 TUI 使用者，我希望 Goal 标识截断显示，以便节省终端宽度且仍可辨认。

#### 验收标准

1. <a id="req-6-1"></a> SessionStatus 展示的 Goal id 与 GoalSelectScreen 选项的 goalId 必须截断显示，不得铺出完整 UUID。
2. <a id="req-6-2"></a> 截断后必须保留足够前缀以供辨认。

### 需求 7：终态派生简化与 switch 兜底

**用户故事：** 作为 LazyGoal 维护者，我希望终态摘要派生不重复、screen 路由有兜底，以便缩小维护面且行为不回归。

#### 验收标准

1. <a id="req-7-1"></a> 检查源码时，`terminalFor` 必须直接返回 `session.terminal`，不得再包含基于 runStatus 的不可达终态 fallback 分支。
2. <a id="req-7-2"></a> 检查源码时，`app.tsx` 的 screen switch 必须含 default 分支。
3. <a id="req-7-3"></a> 终态摘要展示与 screen 路由的可观察行为必须与现状一致。

### 需求 8：拒绝处理与选择面板冗余清理

**用户故事：** 作为 LazyGoal 维护者，我希望 dispatch 的拒绝处理不静默吞掉异常、Goal 选择面板不残留不可达校验，以便减少误导性死代码且行为不回归。

#### 验收标准

1. <a id="req-8-1"></a> 检查源码时，`app.tsx` 中对 `controller.dispatch` 的 `.catch` 必须显式按 `UiDispatchRejectedError` 收窄，非该类型的异常不得被静默忽略。
2. <a id="req-8-2"></a> 检查源码时，`GoalSelectScreen` 不得再包含对 `Select` onChange 值的本地非空校验死分支；空 id 的守卫仍由 `SessionController.selectGoal` 承担。
3. <a id="req-8-3"></a> busy/关闭拒绝与 Goal 选择的可观察行为必须与现状一致。
