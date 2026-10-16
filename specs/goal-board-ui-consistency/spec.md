---
status: proposed
created_at: 2026-10-16
supersedes: []
superseded_by: null
---

# Goal Board UI Consistency Spec

## 目标与范围

本 Spec 消除 Goal Board（`@lazygoal/goal-board`）浏览器 UI 的四类已证实问题，使展示层回到"缺陷归零、性能收敛、样式归位"的一致状态：

1. **P0 缺陷**：Plan Run 阶段分组（`.run-stage-group` 等 11 个类）、`.session-intro` 提示条与 `.composer-recover-row` 恢复行完全缺失 CSS，以浏览器默认样式呈现；`trajectory.tsx` 存在硬编码中文用户文案。
2. **P1 性能**：liveText 打字机通路每个 SSE delta 触发全会话树重渲染与强制同步滚动；`AssistantMarkdown` 无 memo；`projectActivityGroups` 每渲染重投影。
3. **P1 样式架构**：`trajectory.css` 为压缩单行"补丁地层"（同一选择器最多 11 次覆盖、`.tr-overview` 高度 83→62→104px 三层抵消），会话组件样式（`.goal-info-toggle` 等）错放在 trajectory.css。
4. **P2 体验**：9–14px 五档字号并存（9px 低于舒适阅读阈值）；高频图标按钮热区仅 27–28px；无 React 错误边界（渲染异常即整页空白）；Queue 刷新即丢（overview.md 已声明的限制）；长会话历史消息全量首渲。

**明确不包含（Non-goals）**：不改 HTTP/SSE 路由、事件信封、Snapshot 投影与授权契约；不引入任何第三方状态管理或列表虚拟化库；不做薄荷绿视觉语言重构或暗色主题；不清理 `prototypes/` 目录（另行处理）；不改变会话投影白名单与审批防误触语义。

## 需求与验收标准

### 需求 1: Plan Run 阶段分组样式补齐

作为**使用 Plan Run 的用户**，我希望**阶段分组按设计语言的层级结构可读呈现**，以便**识别阶段顺序、状态、修订与审查反馈**。

- <a id="spec-req-1-1"></a>**验收标准 1.1**：当 Run 含 stages 时，`.run-stage-group` 应当以可折叠分组呈现，阶段头（`.run-stage-heading`）应为水平 flex 行，包含 `.stage-target`（可读标题，11px 以上）、`.stage-status`（按 in_progress / review_pending / accepted 区分色彩的状态徽章）、`.stage-revision`（Rev N 徽章），并复用现有 `--line` / `--accent-ink` / `--warning` 设计 token。
- <a id="spec-req-1-2"></a>**验收标准 1.2**：当 stage 含 `latestReviewRejection` 时，`.stage-rejection-feedback` 应当以带 `--warning-border` 左边界的提示块呈现 issues 列表。
- <a id="spec-req-1-3"></a>**验收标准 1.3**：当 e2e `run-stages.test.mjs` 运行时，`run-stages-container`、`run-level-steps`、`run-stage-heading`、`stage-content` 应当分别断言 `display`、`align-items` 与正文字号的 computed style，防止样式再次缺失回归。
- <a id="spec-req-1-4"></a>**验收标准 1.4**：若样式修复引入任何 DOM 结构变化，系统应当保持 e2e 现有选择器与几何断言全部通过；结构确需调整时，本 Spec 内同步更新 e2e 选择器并保持语义等价。

### 需求 2: 会话提示与恢复行样式补齐

作为**管理 Run 恢复的用户**，我希望**顶部模式提示与恢复操作行有稳定排版**，以便**理解当前模式并正确执行恢复**。

- <a id="spec-req-2-1"></a>**验收标准 2.1**：当会话处于 Plan Mode 提示（`nextRunMode === "plan"` 或草稿 Plan Mode）时，`.session-intro` 应当以居中提示条（`--accent-ink` 前景、11–12px）呈现。
- <a id="spec-req-2-2"></a>**验收标准 2.2**：当 `execution.state === "recoverable"` 时，`.composer-recover-row`/`.composer-recover-actions` 应当与 `composer-extra-controls` 一样对齐 `--conversation-width`，标签说明与 Resume Run 按钮水平排布、右侧对齐。

### 需求 3: 用户文案语言一致

- <a id="spec-req-3-1"></a>**验收标准 3.1**：当轨迹检查器所有步骤折叠时，指导意见应以英文等义文案呈现（"All steps are collapsed. Expand a step to see its events."），`src/` 内不得再出现中文用户文案。
- <a id="spec-req-3-2"></a>**验收标准 3.2**：当仓库执行文案语言检查时（新增 `test/` 断言或 lint 脚本扫描 `.tsx` 字符串字面量），`src/` 用户面向文案应当全部为 ASCII 英文（项目专有词与标识符除外）。

### 需求 4: liveText 渲染通路收敛

作为**观察 Run 实时输出的用户**，我希望**打字机输出流畅且不阻塞交互**，以便**在运动中阅读响应**。

- <a id="spec-req-4-1"></a>**验收标准 4.1**：当 SSE `assistant_text_delta` 高频到达时，`useRunStream` 应当按帧（rAF 或等价批量机制）合并提交 `liveText` 状态，单位时间内 React 提交次数不超过帧率量级，且流结束后最终文本与逐字累积一致（不丢字、不重复）。
- <a id="spec-req-4-2"></a>**验收标准 4.2**：当任一消息内容变化时，`AssistantMarkdown` 及单条消息的渲染组件应当被 `React.memo`（或等价 props 浅比较）隔离，无变化的历史消息不应重新执行 react-markdown 解析。
- <a id="spec-req-4-3"></a>**验收标准 4.3**：当 `follow` 为真且内容增长时，滚动跟随应当按帧节流合并，不得在每个 delta 上同步读取 `scrollHeight` 后立即写入 `scrollTop` 两次以上。
- <a id="spec-req-4-4"></a>**验收标准 4.4**：当 Activity 视图渲染运行中的 Steps 时，活动组投影（`projectActivityGroups`）调用结果应当按 `(run, liveEvents, showTools)` 记忆化，liveText 变化不应触发其重新计算。

### 需求 5: CSS 架构归位

- <a id="spec-req-5-1"></a>**验收标准 5.1**：当 `trajectory.css` 重写完成时，每个选择器至多定义一次（同一元素的多层覆盖收敛为单层终态），文件以可读格式（非压缩单行）保存，且视觉终态与重写前逐视图比对等价（Trajectory 概览/检查器/记录列表）。
- <a id="spec-req-5-2"></a>**验收标准 5.2**：当打开 Goal info 抽屉时，`.goal-info-toggle`/`.goal-info-panel` 样式应当迁移至 `style.css`（会话样式归位），`trajectory.css` 不再包含非 Trajectory 视图的规则。
- <a id="spec-req-5-3"></a>**验收标准 5.3**：当所有视图运行时，现有 CSS 类语义（含 e2e 依赖的 `.great-circle`…等选择器）应当不变；删除的只有被更高特异性覆盖抵消的死值，不改变任何最终计算样式。

### 需求 6: 字号与触控目标下限

- <a id="spec-req-6-1"></a>**验收标准 6.1**：当定义设计 token 时，`style.css` 应当新增 `--font-size-xs: 11px`、`--font-size-sm: 12px`、`--font-size-base: 14px` 三档辅助/正文/会话正文字号；全站 9px 清零；10px 仅允许用于状态徽章与短标签（时间、序号）。
- <a id="spec-req-6-2"></a>**验收标准 6.2**：当渲染高频交互控件（`.icon` 面板按钮、`.tr-page-arrow` 分页箭头、`.goal-card-options`）时，命中热区应当不小于 36×36px（可用 padding 扩展而不放大可见图标）。
- <a id="spec-req-6-3"></a>**验收标准 6.3**：若字号提升导致既有 e2e 几何断言失败，系统应当同步更新断言的期望值并在 PR 说明中列出，不得静默放宽断言精度。

### 需求 7: Queue 的 localStorage 持久化

作为**排入多轮续跑指令的用户**，我希望**队列在页面刷新后仍可恢复**，以便**不丢失已排定的执行顺序**。

- <a id="spec-req-7-1"></a>**验收标准 7.1**：当用户入队、暂停或继续队列时，`useQueue` 应当按 `goalId` 将该 Goal 的队列与暂停态以独立 key（如 `lazygoal.queue.<goalId>`）同步写入 `localStorage`，读取时按 JSON 结构校验（wire 边界验证），非法数据按空队列处理并清除该 key。
- <a id="spec-req-7-2"></a>**验收标准 7.2**：当用户刷新页面并重新打开同一 Goal 会话时，系统应当恢复该 Goal 的队列内容与暂停态，并延续既有的自动出队状态机（成功 Run 后依序创建后继 Run，等待交互不出队）。
- <a id="spec-req-7-3"></a>**验收标准 7.3**：当队列被消费至空、Goal 被删除或队列被手动清空时，系统应当移除对应的 localStorage key，不残留孤儿数据。
- <a id="spec-req-7-4"></a>**验收标准 7.4**：若 `localStorage` 写入失败（配额、隐私模式），系统应当降级为纯内存队列并继续可用，不因持久化失败阻塞入队；恢复时若发现队列中存在其他 Goal 的 key，不得跨 Goal 混用。
- <a id="spec-req-7-5"></a>**验收标准 7.5**：当恢复行为完成时，`apps/goal-board/notes/overview.md` 中"刷新页面会丢失 Queue"的限制声明应当同步更新为持久化语义，并在语义表中明确归属。

### 需求 8: 长会话渐进加载

- <a id="spec-req-8-1"></a>**验收标准 8.1**：当打开一个超过阈值（最近 50 条消息为窗口）的会话时，Activity 视图首渲应当只渲染最近窗口内的消息与相对应 Runs 的活动组，窗口起点以完整 Run 为不可分割边界（不切割同一 Run 的消息与活动组）。
- <a id="spec-req-8-2"></a>**验收标准 8.2**：当用户点击窗口顶部"查看更早消息"按钮时，系统应当向上扩展一个完整 Run 窗口并基本保持当前视口位置，可重复点击直到覆盖全部已保存历史。
- <a id="spec-req-8-3"></a>**验收标准 8.3**：当窗口外尚有未渲染历史时，系统应当显示已省略历史规模的提示（复用/扩展 `history-note` 样式），且与服务端 `historyTruncated` 提示叠加时语义不冲突。
- <a id="spec-req-8-4"></a>**验收标准 8.4**：若会话消息总量在窗口内，系统应当保持现有"打开即见全部"行为不变，不显示扩页控件。

### 需求 9: 渲染错误边界

- <a id="spec-req-9-1"></a>**验收标准 9.1**：当会话视图（Activity / Trajectory / Goal info）渲染抛出未捕获异常时，系统应当在会话区域显示包含错误摘要与"Reload session"入口的错误卡，顶层 shell（顶栏、看板、模型选择器）保持可用，不整页空白。
- <a id="spec-req-9-2"></a>**验收标准 9.2**：当错误边界捕获异常时，系统应当把错误上报到浏览器控制台（含组件栈），并允许用户重载会话以恢复；边界内不吞掉副作用清理责任（已有 abort/cleanup 不因边界存在而跳过）。

## 架构与核心决策

### 系统拓扑与接口

```
style.css (全局 token + 看板 + 会话 + Goal info + 字号/触控 token)
trajectory.css (仅 Trajectory 视图: runbar/overview/records/inspector, 单层终态)

hooks/useRunStream.ts  ── rAF 合并 textDelta → setLiveText (节流提交)
components/AssistantMarkdown.tsx (memo)  ← props: content 字符串
components/GoalSession.tsx ── useMemo(projectActivityGroups) + 渐进加载窗口状态
class ErrorBoundary (React 内置 API, 无第三方) ── 包裹会话视图区
hooks/useQueue.ts ── localStorage 适配 (key 校验, 失败降级内存)
```

- 组件拆分只允许 `React.memo` 边界与 `<Fragment>`，不得引入额外包装 DOM 节点（继承自 goal-board-architecture-refactor 护栏，破坏 e2e 选择器与几何即非法）。
- Queue 持久化键仅在 `useQueue` 内部读写；`RunControlContext` 暴露的队列接口与消费状态机不变，Context 值不再是"页面内存唯一来源"而是"内存态 + 持久化镜像"。
- 渐进加载窗口为 GoalSession 内部视图状态（`useState`），不进入 Context；扩页边界取 Run 边界，保证 Run 内消息/活动/PlanRoute 呈现完整性。

### 核心决策

- **缺失 CSS 以终态单层规则补齐**：直接为 11 个缺失类按现有 token 写终态规则，不复制 `.run-steps` 系列再做覆盖，防止制造新的补丁地层。
- **liveText 节流放在 `useRunStream` 源头**：合并点在 hook 内（rAF flush），下游组件与 Context 契约不变；比在组件层节流更彻底且遵循"流状态归自治 Hook"的架构。
- **memo 边界以内容字符串为 props**：`AssistantMarkdown` 接收 `content: string`，浅比较即可短路，不引入深比较。
- **`trajectory.css` 整文件重写而非增量剥离**：三层高度补偿等死值没有安全的增量删除顺序；以 trace-workbench 终态为基准重写单层，用 e2e + 截图比对验证等价。
- **字号为 token 化三档 + 徽章例外**：新增 CSS 自定义属性并在各规则内消费，避免逐处硬编码再次漂移。
- **Queue 用 JSON 结构守卫读回**： localStorage 属 durable/wire 边界，读取必须校验形状（与仓库"在文件/队列边界验证"规则一致），非法数据清空不恢复。
- **ErrorBoundary 用 React 内置 class API**：单文件双粒度（顶层 + 会话视图），不引入错误上报库。

## 曾考虑的备选方案

- **列表虚拟化库（@tanstack/react-virtual 类）**：滑动窗口只挂载可视区消息，长会话流畅度上限最高。**落选原因**：与 follow/jump/liveText 追加/活动组折叠状态的重写成本最高，且引入第三方渲染库违反本仓看板的轻量依赖约束；用户已确认选择渐进加载。
- **全量渲染 + 仅 memo 化**：不改变"打开即见全部"行为、改动最小。**落选原因**：首渲成本仍随历史线性增长，无法满足 P2 长会话目标；仅 memo 缓解不了首渲。
- **liveText 直接绕过 React（自渲染 / 不走 Context）**：彻底避开重渲染。**落选原因**：破坏单向数据流与"快照上下文/指令上下文"隔离架构，后续维护成本高于帧合并。
- **逐条 inline style 修复缺失 CSS**：改动局部、无需理解全局。**落选原因**：不可复用 token、无法建立徽章/热区规范，且同样是"补丁式"写法。
- **Queue 持久化到服务端（Snapshot/Storage 包）**：跨设备一致。**落选原因**：触及持久化契约与多端语义，超出"优化看板 UI"的范围；浏览器本地队列与现有"Queue 只属当前页面 Run 生命周期"的消费状态机才自洽。
- **CSS-in-JS / CSS Modules 迁移**：彻底解决归属错位。**落选原因**：全量改写所有类名引用与 e2e 选择器，风险与收益不成比例；本 Spec 以"文件归属归位"达成同等目标。
- **字号全面上调（正文 15px、辅助 12px）**：可读性最优。**落选原因**：信息密度下降明显，Trajectory 紧凑布局需整体重排；用户已确认选择下限梳理。

## 风险与否定性保证

**风险评估（medium）**：涉及跨组件用户可见行为变化（渐进加载、Queue 持久化、字号体系）与 e2e 几何断言联动；无后端协议、公共接口或服务端持久化变更。关键运营点：(1) CSS 重写以 e2e 全绿 + 视图截图比对为闸门；(2) Queue 恢复必须通过结构校验，损坏数据不得进入状态机；(3) 渐进加载的 Run 边界窗口若选择过小，首屏可能漏当前 Run 上下文——以"包含全部当前 Run"为窗口下限；(4) 错误边界存在可能掩盖真 bug——错误必须带组件栈输出到控制台。

**否定性保证（Invariants）**：

- 不引入任何第三方状态管理、路由或列表虚拟化库。
- 不引入额外包装 DOM 节点；任何破坏现有 CSS 选择器与 e2e 几何的改动非法。
- 不修改 HTTP/SSE 路由、事件信封、Snapshot 投影白名单、审批防误触语义与授权边界。
- 轨迹视图保持只读；缩放/平移与分页读取解耦、切换 Run 重置视窗的既有语义不变。
- 所有用户可见文案保持英文（项目专有词除外）。
- `main.tsx` 保持 ≤180 行纯装配职责。
- Queue 恢复不得跨 Goal 混用数据，localStorage 故障不得阻塞入队状态机。
