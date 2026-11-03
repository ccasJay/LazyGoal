---
feature: goal-board-ui-harness
status: proposed
risk: medium
created_at: 2026-11-03
delivered_at: null
supersedes: []
superseded_by: null
---

# Goal Board UI 验收工具

## 目标与范围

用 Playwright 建立隔离、可重复的 Goal Board UI 验收工具：一条命令打开 Board、Session、Trajectory、Settings 视图，产出截图、诊断报告与像素基线比较结果。
不修改 Goal Board 产品行为与运行时语义，不新增产品 URL 路由，不替换现有 `test:web-e2e`，首版不覆盖移动端与跨浏览器矩阵。

## 用户故事

- **S1** 作为 UI 开发者或 AI，我希望一条命令启动隔离的确定性环境并打开指定视图，以便快速检查页面。
- **S2** 作为 UI 开发者或 AI，我希望对整页或组件截图，以便观察和比较视觉结果。
- **S3** 作为 UI 开发者或 AI，我希望自动获得 Console、JS 异常与网络错误报告，以便定位回归原因。
- **S4** 作为 UI 开发者，我希望用 Playwright 编写点击、输入、滚动与跳转流程，以便验证交互行为。
- **S5** 作为维护者，我希望视觉基线与失败产物的位置固定、可更新，以便判断改动影响。
- **S6** 作为维护者，我希望 fixture 与真实 wire 契约一致且不侵入产品代码，以便随时切回真实服务。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | 执行 `npm run ui -- shot --view <view>` | 由 view registry（Board、Session、Trajectory、Settings，含 fixture 场景、目标 Goal、就绪选择器与遮罩，`--goal` 可覆盖目标）在 loopback 随机端口启动一次性静态页面与 fixture API，使用临时目录与独立 BrowserContext 打开视图，结束后清理且不读写真实 LazyGoal Home | 四视图 CLI smoke；临时目录与 Home 隔离断言 |
| R1.2 | S1 | 异常 | 视图无法打开、Goal 不存在、就绪选择器超时或 `dist` 未构建 | 以非零退出码说明具体原因，不回退到 Board，不生成截图 | 失败路径 CLI 测试 |
| R2.1 | S2 | 事件 | 执行整页截图 | 在 1280×900、DPR 1、浅色主题、固定 UTC 时钟下关闭动画与过渡，等待字体、图片与就绪选择器后输出 PNG | 连续两次截图 PNG 哈希一致 |
| R2.2 | S2 | 事件 | 截图指定 `--selector` | 输出该元素边界内的 PNG | 元素尺寸断言 |
| R2.3 | S2 | 异常 | 选择器不存在、不可见或尺寸为零 | 失败并说明原因，不写出空图 | 负向 selector 测试 |
| R3.1 | S3 | 事件 | 任意截图或诊断运行结束 | 输出 Console error/warning、pageerror、requestfailed 与 HTTP≥400 的 JSON 报告 | 注入错误后的报告测试 |
| R3.2 | S3 | 异常 | 存在未被视图声明忽略的错误 | `inspect` 以非零退出码结束；SSE 长连接与主动取消不算失败 | 白名单与退出码测试 |
| R4.1 | S4 | 事件 | Playwright 交互测试使用共享 fixture | 可执行点击、输入、滚动与导航，每个测试使用独立 BrowserContext，互不泄漏状态 | 交互样板测试 |
| R5.1 | S5 | 事件 | 执行 `npm run test:ui-visual` | 对 Board、Session、Trajectory、Settings 的固定桌面视图与仓库基线比较 | 视觉测试通过 |
| R5.2 | S5 | 异常 | 像素比较失败 | 保留 actual、expected、diff 图片与 JSON 结果；执行更新命令后同一环境重跑通过 | 失败产物检查与基线更新测试 |
| R6.1 | S6 | 普遍 | fixture 提供任何 HTTP 或 SSE 响应 | 响应由 `@lazygoal/web-contracts` 类型约束并在发送前用对应 binding 校验；`apps/goal-board/src` 不导入 harness | fixture binding 测试；`npm run check:dependencies` |
| R6.2 | S6 | 事件 | 使用 `--attach <url>#<token>` | 连接已启动的真实 web 服务执行截图与诊断，不启动 fixture，并禁用视觉比较 | attach 到 serve 进程的 smoke 测试；确认未启动第二个 fixture |

组合：四视图在 fixture 环境中打开、截图、诊断并比较基线；attach 模式连接已启动服务；最终运行 `npm test`、`npm run check:ui-harness`、`npm run build:web`、`npm run test:ui-visual`、`npm run check:docs`、`npm run check:dependencies`。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| 固定 Playwright 精确版本并使用其捆绑 Chromium；本地与 CI 安装同一版本，系统 Chrome 仅用于手动调试。 | 像素结果只对同一浏览器版本可信，自动升级会让基线漂移。 | 使用系统 Chrome：版本随机器变化，无法稳定比较。 |
| fixture 由独立 HTTP/SSE 服务实现现有 wire 路由，响应类型与校验复用 `@lazygoal/web-contracts`，不挂载 `packages/browser` 路由。 | 需要可控的 Loading/Empty/Error 与固定数据，同时避免测试逻辑进入产品代码；类型与 binding 保证契约一致。 | 直接复用真实组合根：状态受模型与流程驱动，无法稳定覆盖失败状态。 |
| 视图由命名 registry 打开，优先调用既有工作区偏好 cookie 或现有 UI 导航；不新增产品 URL 路由。 | 保持产品行为不变，并让无法打开时的失败显式可见。 | 为测试给应用加深链接或路由：扩大产品行为范围。 |
| 四个桌面基线入库 `apps/goal-board/ui-harness/visual/baselines/`，运行产物写入被 gitignore 的测试输出目录。 | 基线需要评审与版本化，失败产物只需本地保留。 | 基线放用户目录：无法在 CI 与评审中使用。 |
| 交互与视觉验收由 Playwright Test 承载；CLI 只提供一次性的启动、截图与诊断；现有 `test:web-e2e` 保持不动。 | 一次性进程避免常驻服务与端口状态，Playwright Test 直接提供截图比较与失败产物。 | 自建截图比较与常驻调试服务：重复实现且引入生命周期管理。 |

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| medium | fixture 与真实服务可能语义漂移，视觉基线受字体、时钟与动画影响。 | 无外部副作用；连接真实服务必须显式提供 `--attach` URL 与 token。 |
| low | 工具可能误读写真实工作区或占用固定端口。 | 仅绑定 loopback 随机端口并使用临时目录，不修改真实 LazyGoal Home。 |

R6.1 的 binding 校验只证明 wire 形状一致，不证明服务端语义等价；真实集成仍以现有 `test:web-e2e` 与 `--attach` 人工检查为准。基线只覆盖 Chromium 与 macOS 桌面环境，不作为其他浏览器或移动端的验收依据。

## 任务

- [x] //TODO 1. 锁定 Playwright 与 Chromium 版本，建立安装脚本和 CI 缓存 → R5.1；检查：版本命令输出与锁文件一致。
- [x] //TODO 2. 建立 fixture HTTP/SSE 服务骨架与 binding 校验 → R6.1；检查：fixture 响应校验测试。
- [x] //TODO 3. 提供 Board 的 success、empty、loading、error 场景 → R1.1、R3.2；检查：端点与场景测试。
- [x] //TODO 4. 提供 Session（等待、审批、运行中与 state_sync）、Trajectory、Settings 场景 → R1.1、R4.1；检查：四视图打开 smoke。
- [x] //TODO 5. 实现 view registry 与隔离环境启动、目标校验和清理 → R1.1、R1.2；检查：成功与失败路径测试。
- [ ] //TODO 6. 实现确定性整页与元素截图 → R2.1、R2.2、R2.3；检查：两次哈希一致与负向测试。
- [ ] //TODO 7. 实现诊断采集、JSON 报告与退出码 → R3.1、R3.2；检查：报告与退出码测试。
- [ ] //TODO 8. 实现 CLI 的 shot、inspect、serve 与 `--attach` → R1.1、R6.2；检查：CLI smoke。
- [ ] //TODO 9. 提供共享 Playwright fixture 与交互样板 → R4.1；检查：交互样板测试。
- [ ] //TODO 10. 生成四个桌面视觉基线与 `test:ui-visual` → R5.1、R5.2；检查：比较与更新流程测试。
- [ ] //TODO 11. 接入 CI 并更新 Goal Board 文档与导航 → R5.1、R6.1；检查：`npm run check:docs` 与 CI 命令本地执行。

## 执行记录

- 状态：未执行
- 验证：-
- 结果：-
- 未决：无
