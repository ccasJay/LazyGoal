# Goal Board UI 验收工具

基于 Playwright 的轻量级、确定性 UI 调试与视觉回归验收工具。在不侵入前端业务代码的前提下，通过独立的 Fixture HTTP/SSE 模拟服务与 View Registry，实现一键打开指定页面视图、生成确定性截图、采集诊断报告并执行像素级视觉回归测试。

## 核心设计与保证

- **契约一致性**：Fixture 响应完全遵循 `@lazygoal/web-contracts` 的 DTO 契约，并在发送前使用对应的 `ContractBinding` 进行只读运行时校验，任何格式漂移均会立即报错。
- **业务代码零侵入**：`apps/goal-board/src` 不依赖、不导入任何 harness 模块；视图定位通过工作区偏好 Cookie 与既有 UI 导航实现。
- **环境隔离**：每次执行均分配独立的 loopback 随机端口与独立 BrowserContext，结束后立即清理，绝不修改、污染真实的 `~/.lazygoal` 目录。
- **确定性截图**：在 1280×900 视口、DPR 1、浅色模式与固定 UTC 时钟下关闭全部 CSS 动画与过渡，等待字体、图片与指标等异步数据加载就绪后输出。
- **有状态 Fixture**：场景可为控制命令提供副作用，并在受理后向同一 Goal 的 SSE 订阅者推送事件；因此可以验证命令受理、提交边界与事件驱动刷新，而不只是首屏快照。

## 常用命令

### 1. 截图与调试 (shot)

```bash
# 截取 Board 视图整页视口截图
npm run ui -- shot --view board

# 截取指定元素（如单张卡片）
npm run ui -- shot --view board --selector ".goal-card"

# 截取 Session（问答/审批等待）视图
npm run ui -- shot --view session

# 截取 Trajectory（执行轨迹）视图
npm run ui -- shot --view trajectory

# 截取 Settings（设置）视图
npm run ui -- shot --view settings

# 输出单行 JSON 结果供脚本或 Agent 解析
npm run ui -- shot --view board --json
```

### 2. 诊断采集 (inspect)

自动捕获页面运行期间的 Console Error/Warning、JavaScript 未捕获异常、网络失败与 HTTP 状态码异常（≥400）：

```bash
npm run ui -- inspect --view board
npm run ui -- inspect --view session --json
```

若存在未被视图声明忽略的错误，命令以非零状态码退出。

### 3. 常驻服务与外部连接 (serve / --attach)

```bash
# 启动常驻 Fixture 服务器供人工浏览器调试
npm run ui -- serve --scenario board-populated

# 连接已启动的真实 LazyGoal Web 服务执行截图与诊断（attach 模式不启动 fixture 服务）
npm run ui -- shot --view board --attach "http://127.0.0.1:5173/#my-token"
```

### 4. 声明式交互流程 (flow)

```bash
# 执行内置流程，按步骤输出 PASS/FAIL
npm run ui -- flow --flow send-message

# 输出单行 JSON 报告供脚本或 Agent 解析
npm run ui -- flow --flow send-message --json

# 指定失败截图目录与报告文件
npm run ui -- flow --flow send-message --artifacts /tmp/lg-flow --report /tmp/lg-flow/report.json
```

流程定义在 `ui-harness/src/flows/`，由视图、专用场景和有序步骤组成。步骤支持 `click`、`fill`、`press`、`expect`（可见性、文本、输入值、禁用态、属性、数量）与 `expectControl`（校验 Fixture 实际收到的控制命令）。任一断言失败会立即停止、截取现场并返回失败步骤；运行时诊断与步骤结果相互独立，两者都通过才算通过。

`send-message` 流程演示了完整闭环：场景在命令受理时提交用户消息并进入 `running`，随后依次推送模型开始、正文分块、工具开始与结束，最后提交助手消息并推送终态。因此连续观察能看到 `Waiting for model response`、临时 `Live response` 与工具活动组，而不是一段静止画面；最后的 `Run finished` 仍然只能依赖事件驱动的定向重读。

### 5. 连续观察 (observe)

```bash
# 驱动一个 Goal 工作流，同时按固定间隔录制画面与页面事实
npm run ui -- observe --flow send-message

# 自定义间隔、输出目录与帧数上限
npm run ui -- observe --flow send-message --interval 500 --out /tmp/lg-observe --maxFrames 60 --json
```

录制与步骤执行并发进行：流程负责触发状态迁移，观察器按间隔保留画面。每帧附带 `sendLabel`、可见 Run 状态与结果、消息数量、临时正文、步骤与活动标题、状态栏与错误提示等页面事实，写入 `manifest.json`。先截图再采样事实，因此事实不会领先于画面。

典型闭环：`observe` 录制 → Agent 读取关键帧与 manifest → 描述行为与视觉问题 → 修改代码 → 用同一流程重新录制对比。相比逐步断言，它能保留 `Sending message` 这类瞬时状态和过渡中的布局变化。

### 6. 视觉回归比较 (test:ui-visual)

```bash
# 先执行 harness 自身的隔离、截图、诊断与契约测试
npm run test:ui-harness

# 执行四个桌面视图与仓库基线的像素级比较测试
npm run test:ui-visual

# 显式更新已提交的视觉基线
npm run test:ui-visual:update
```

基线存储于 `apps/goal-board/ui-harness/visual/baselines/`，比较失败产物自动存入 gitignore 的 `visual/artifacts/` 目录。
