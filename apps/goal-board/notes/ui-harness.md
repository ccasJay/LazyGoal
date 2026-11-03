# Goal Board UI 验收工具

基于 Playwright 的轻量级、确定性 UI 调试与视觉回归验收工具。在不侵入前端业务代码的前提下，通过独立的 Fixture HTTP/SSE 模拟服务与 View Registry，实现一键打开指定页面视图、生成确定性截图、采集诊断报告并执行像素级视觉回归测试。

## 核心设计与保证

- **契约一致性**：Fixture 响应完全遵循 `@lazygoal/web-contracts` 的 DTO 契约，并在发送前使用对应的 `ContractBinding` 进行只读运行时校验，任何格式漂移均会立即报错。
- **业务代码零侵入**：`apps/goal-board/src` 不依赖、不导入任何 harness 模块；视图定位通过工作区偏好 Cookie 与既有 UI 导航实现。
- **环境隔离**：每次执行均分配独立的 loopback 随机端口与独立 BrowserContext，结束后立即清理，绝不修改、污染真实的 `~/.lazygoal` 目录。
- **确定性截图**：在 1280×900 视口、DPR 1、浅色模式与固定 UTC 时钟下关闭全部 CSS 动画与过渡，等待字体、图片与指标等异步数据加载就绪后输出。

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

### 4. 视觉回归比较 (test:ui-visual)

```bash
# 先执行 harness 自身的隔离、截图、诊断与契约测试
npm run test:ui-harness

# 执行四个桌面视图与仓库基线的像素级比较测试
npm run test:ui-visual

# 显式更新已提交的视觉基线
npm run test:ui-visual:update
```

基线存储于 `apps/goal-board/ui-harness/visual/baselines/`，比较失败产物自动存入 gitignore 的 `visual/artifacts/` 目录。
