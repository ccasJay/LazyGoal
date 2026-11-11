---
name: lg-ui-develop
description: 在 LazyGoal 中开发或改造 Web 界面时固定执行顺序：先路由需求、必要时用 HTML 草稿确认方向，再修改代码并做轻量编译检查，最后用 goal-board UI harness 做视觉与交互验收。用户提出新增页面、调整布局、修改交互或样式，或只给出模糊的界面改造意图时使用。
---

# lg-ui-develop

UI 开发按三个阶段顺序推进，不跳阶段，不把三个阶段合并成一次"改完就说完成"。设计约束仍以 [lg-ui](../lg-ui/SKILL.md) 为准；本技能只规定顺序、门禁和交付边界。

## 阶段一：路由需求

先判断用户输入属于哪一类，两类的起点不同。

| 输入 | 起点 |
| --- | --- |
| 已给出修改思路、参考图、期望状态或验收标准 | 直接进入阶段二 |
| 只说要新增或改造某个界面，没有具体方向 | 先出 HTML 草稿，用户确认后再进入阶段二 |

需要出草稿时：

- 写成单个自包含 HTML 文件，样式内联，不引入构建步骤，不引用 `apps/goal-board/src` 中的任何模块。
- 视觉语言从现有实现取值：字号、间距、语义色和边框宽度参照 [ui.css](../../../apps/goal-board/src/ui.css) 与 [style.css](../../../apps/goal-board/src/style.css)，不新造一套。
- 草稿只用来确认结构、层级和密度，不实现数据绑定、网络请求或真实交互状态。
- 写入 `apps/goal-board/ui-drafts/<slug>.html`（已 gitignore），把绝对路径交给用户在浏览器打开。
- 草稿是一次性产物：不进入产品代码，不被 `src` 导入，不提交入库。

同时把这次改动的验收面写清楚：目标视图、使用的 fixture 场景、需要断言的状态。这三项没定下来就先不要改代码。

## 阶段二：实现与轻量检查

按确认的方向修改 `apps/goal-board/src`。不在编码过程中反复跑完整验收，每完成一个可编译单元执行一次类型检查。

```bash
apps/goal-board/node_modules/.bin/tsc -p apps/goal-board/tsconfig.json --noEmit
```

必须使用 `apps/goal-board` 自带的 TypeScript。仓库根目录的 TypeScript 7 已移除 `baseUrl`，对同一份配置会直接报 TS5102。

编译通过后进入阶段三。若改动包含新视图、新 fixture 端点或新场景数据，先补齐对应部件再验收，避免用未打桩的端点掩盖缺陷。

## 阶段三：视觉与交互验收

按顺序执行，不要只跑其中一步。

```bash
npm run build:web                  # harness 读取 dist，缺失会报 dist_not_built
npm run check:ui-harness
npm run test:ui-harness            # 隔离、截图、诊断、契约与交互
npm run ui -- shot   --view <view> --json
npm run ui -- inspect --view <view> --json
npm run test:ui-visual             # 像素比较
```

需要检查局部区域时用 `--selector` 指定元素，不要只截整页。切换数据形态时用 `--scenario`。

判定：

- `inspect` 输出 `ok !== true` 即验收失败，必须处理 console error、未捕获异常或 HTTP 状态码 ≥400 的请求。
- 视觉比较失败时，逐处判断差异属于"有意的界面变更"还是"缺陷"。允许保留有意变更，但必须先在回复中逐项说明原因，再单独执行 `npm run test:ui-visual:update`。
- 功能可用、运行无异常、视觉符合预期是三层独立结论，不要用其中一层通过代表全部通过。

失败处理：

- 先读 `--json` 输出与 `apps/goal-board/ui-harness/visual/artifacts/` 下的产物，依据证据定位，不猜。
- 允许：修产品代码、补 fixture 端点并保持 `sendValidatedJson` 的契约校验、补场景数据、报告 harness 自身缺陷。
- 禁止：删除或跳过测试、放宽 `maxDiffPixelRatio`、删除 mask、自动覆盖基线、调整 `readySelector` 或 `maskSelectors` 去迁就当前渲染结果来让验收通过。
- 最多迭代 3 轮。仍未通过就停下，输出失败的视图与场景、证据路径、已排除的原因和剩余假设。

## 前置条件与能力边界

- 阶段三依赖 goal-board UI harness 提供的 `npm run ui` 与 `npm run test:ui-visual`。这些脚本不存在时，只执行阶段一和阶段二，并明确说明视觉验收未执行；不得用其他方式宣布验收通过。
- 当前只有 board、session、trajectory、settings 四个视图，单一 1280×900 桌面视口，浅色模式。窄屏与移动端尚未纳入自动验收，需要时人工核对。
- fixture 场景是静态快照，不支持运行时状态迁移。审批中、执行中、失败等中间态无法通过 harness 主动推进。
- `--attach` 模式下 session 与 trajectory 不可用，只能验 board 与 settings。
- 视图定位目前基于 CSS class。UI 重构导致 class 变化时应同步更新 `VIEW_REGISTRY`，并在交付说明中写出该变化，不要靠放宽就绪条件消除报错。
- fixture 通过不等于真实后端可用。涉及真实数据形态的改动不能只凭 harness 结论交付。

## 已知陷阱

- 用户相对路径以 `INIT_CWD` 为基准；`npm run --prefix` 会把进程工作目录切到 `apps/goal-board`。
- 不要用 `npm run --prefix ... -- <args>` 给 Playwright 传参，参数会被当成文件路径。直接调用 `./apps/goal-board/node_modules/.bin/playwright test --config apps/goal-board/ui-harness/playwright.config.ts`。
- 不要使用 `page.clock.setFixedTime`，它会抑制 `pageerror` 传播；固定时间靠 `addInitScript` 覆写 `Date`。
- CLI 截图不要传遮罩，遮罩会污染人工阅图。
- 不提交 `visual/artifacts/`、`test-results/`、`playwright-report/` 和草稿文件。

## 交付

- 回复中给出：改动位置（带链接）、执行过的命令与结果、每处有意视觉差异及原因、仍未解决的问题。设计意图与截图基线冲突时以设计意图为准，不把"与基线一致"当作验收目的。
- 完成交付时构建并启动包含本次修改的 Web UI，供开发者手动验证。
