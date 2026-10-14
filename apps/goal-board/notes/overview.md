# Goal Board

React 浏览器前端，呈现已提交会话及临时活动。本文描述当前实现、使用边界与限制。

## 职责与使用

通过本模块的公开入口使用上述能力。状态或副作用由调用方在所属边界控制。

## 边界与限制

本模块不替代其依赖模块的协议或持久化职责；具体输入、失败语义与类型以链接的源码契约为准。

## 操作说明

运行前提、命令和结果示例见 [使用说明](./usage.md)。

## 页面交互

`GET /api/project/workspace` 在同一访问边界内读取 Composition Root 的执行工作目录和当前 Git 分支、worktree 根路径；非 Git 工作区及 detached HEAD 明确区分。所有本机 Goal 共用启动工作区，这些值不表示 Goal 创建时的历史绑定。页面在打开会话、已提交会话刷新及重新获得焦点时读取位置，并在紧凑的一行中展示分支与 worktree；完整路径可悬停查看。

React 看板源码位于 [`apps/goal-board`](../README.md)，构建后输出到 `apps/goal-board/dist`，由上述同源静态路由提供；若产物未构建，服务分发内置引导页面提示执行 `npm run build:web`。源码采用职责明确的轻量架构：入口 `src/main.tsx` 严格收敛在 100 行左右，仅负责挂载与顶层 App Shell 装配；会话快照与时间轴通过 `GoalSessionContext` 隔离，指令调度与单飞锁排队状态机通过 `RunControlContext` 隔离，避免全树重复渲染。网络流与状态流解耦为独立自治领域 Hooks（`useRunStream` 维护 SSE 重试与打字机聚合，`useGoalSession` 维护快照同步与草稿态，`useQueue` 维护单飞防重锁与自动出队，`useRunCommands` 承载 Steer/Interrupt/Resume 统一分发降级）；视图层拆分为独立的 `GoalBoard.tsx`、`GoalSession.tsx` 及 `src/components/` 下的单职责子组件（`GoalCard.tsx`、`ModelPicker.tsx`、`MessageComposer.tsx`、`PermissionControl.tsx`、`WorkspaceContext.tsx` 等）。New Goal 先打开仅保存在页面状态的空白会话草稿；读取工作区默认模型后显示真实名称并允许发送，首条非空普通消息显式提交该草稿模型 ID，作为 Goal 意图和首条用户消息启动唯一 Run。草稿刷新即丢弃，不创建 Goal 或启动模型。页面复用 Slash Command Registry 识别 `/plan` 与 `/model`：前者设置创建模式或提交 Plan Mode；后者打开当前 Provider 的模型选择器，草稿明确选择会立即持久化为工作区偏好，已有 Goal 在安全文本等待点或 completed/failed/cancelled 终态提交到服务端。运行期间输入框可编辑：Enter 打开发送按钮原位的 Steer/Queue 选择，Shift+Enter 换行；空输入时按钮发送 Interrupt 并立即显示 Stopping。页面显示尚未应用的 Steer 与 Queue 顺序。Queue 只保存在当前页面内存，当前 Run 完成后按序创建后继 Run；等待人工交互时不出队，失败或取消后暂停，用户明确继续才发送队首。刷新页面会丢失 Queue。命令文本本身不发送到消息接口。页面通过 Bearer 头调用 Goal 列表、会话、创建、消息、Steer、Interrupt、模型目录与选择、Plan Mode、结构化交互和授权管理接口，并用同一授权边界连接实时事件；Fragment 凭据不会写入本地存储。模型选择器支持名称/标识搜索，使用原生模态层隔离背景、限制键盘焦点并在关闭后恢复焦点。模型目录请求随选择器关闭或目标变化而取消，迟到结果不会覆盖当前选择器；保存错误保留原选择及结构化等待表单内容。会话视图按 Run 排列消息和已提交步骤：用户消息在步骤前，助手消息在步骤与终态之后；步骤详情可展开查看。Action 审批优先显示白名单内置工具的有界命令或目标摘要，其他工具显示有限输入预览；若预览被截断，用户需先读取当前 Action 的完整输入才能选择持续授权。Goal 与 Workspace 授权可在会话头部的 Goal info 面板查看和撤销；切换 Goal 时清空旧授权列表。实时文本只显示当前模型阶段，新阶段开始即清除上一阶段的临时文本；快照刷新后以新提交事实为准。

未限定 execution unit 的轨迹列表按服务端 cursor 每段最多读取 100 条。左右箭头在相邻段之间移动，已读取的相邻段最多保留 3 段；移出窗口的段返回时按 cursor 重读，使事件列表与内存中的页数据都有界。页脚显示当前导航段末的匹配事件序数/总量，返回上一段时序数随之回退。切换段时滚动到该段第一条实际渲染的事件，跳过列表隐藏的边界事件。限定 execution unit 的轨迹视图不提供跨段导航。

轨迹页将同源 API 的 Run、事件摘要、事件详情及独立保存的模型输入呈现为三轨时间轴、按 Step 分组的事件列表和互斥详情侧栏。列表列序为序号、事件、时间、摘要；当前已加载事件中，Step 起点到下一个 Step 或 Run 终态之间的无 Step 摘要也归入该可折叠区段，之前和之后的 Run 事件保持普通行。该归组只用于显示，不回写 Step 索引。折叠状态由组首记录标识，分页扩展时不会转移到另一个组；程序内工具事件仅在摘要提供父 Action 与调用索引时缩进，并保留原始详情可查。搜索、类别过滤、时间轴缩放／平移／范围筛选、模型输入详情、重试组和跨段分页继续使用现有查询与读取边界；筛选或折叠隐藏选中事件时关闭对应详情。

看板通过受同一 Bearer 令牌保护的 [`session-metrics` 查询路由](../../../packages/session-metrics/notes/overview.md)读取各 Goal 的累计指标；已选 Goal 额外订阅指标 SSE。卡片展示 Goal 汇总；会话输入区下方展示轮次、Step、模型用量，以及最近一次当前模型调用结束后的上下文剩余比例。页签行分别显示当前已提交任务状态与连接状态；指标栏可打开详情查看测量和排除调用数。未上报用量和不可计算的缓存命中率、生成速度、上下文余量显示为缺失值；部分覆盖单独提示，不将缺失值计为零。

`npm run dev:web`（或 `npm run dev --prefix apps/goal-board`）只启动无后端授权的布局预览，不代理正式 Runtime API。真实操作须先构建静态页（`npm run build:web`），再从 `lazygoal web` 打印的本机入口打开。页面不提供模拟 Goal、示例计划、虚构完成状态、项目分配或设置操作。

已有会话刷新失败时，页面保留最后保存的消息、等待表单和当前草稿，并显示错误及重试入口；刷新错误期间禁用会话提交，成功读取最新快照后恢复。只有首次读取尚无会话时，错误才替代会话内容。SSE 暂无活动事件本身不表示保存的会话不可操作。
