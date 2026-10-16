# Goal Board UI Consistency 执行计划

> 风险等级：medium（评估与依据见 [spec.md 风险节](./spec.md#风险与否定性保证)）。执行遵循 approve → execute 循环，逐 TODO 原子提交。

## 任务清单

- [x] //TODO 1. 建立字号与触控下限 token 体系
  - 落实标准：[6.1](./spec.md#spec-req-6-1), [6.2](./spec.md#spec-req-6-2)
  - 实施目标：在 `style.css` `:root` 新增 `--font-size-xs/sm/base`（11/12/14px）并让既有 `9px` 字号全部归零、`10px` 仅保留给状态徽章/短标签（时间、序号）；`.icon`、`.tr-page-arrow`、`.goal-card-options` 热区以 padding 扩至 ≥36×36px（不放大可见图标）。
  - 验证手段：grep 断言脚本（新增 `apps/goal-board/test/design-token.test.ts`：style.css/trajectory.css 中不得出现 `font-size: 9px`；`--font-size-*` token 存在）+ `npm test --prefix apps/goal-board` 全绿 + `npm run test:e2e --prefix apps/goal-board` 几何断言通过（失败项按 6.3 同步更新see期望值并记录于提交说明）。

- [x] //TODO 2. 补齐 Plan Run 阶段分组缺失样式
  - 落实标准：[1.1](./spec.md#spec-req-1-1), [1.2](./spec.md#spec-req-1-2), [1.4](./spec.md#spec-req-1-4)
  - 实施目标：在 `style.css` 为 `.run-stages-container`、`.run-level-steps`、`.run-stage-group`、`.run-stage-heading`、`.stage-target`、`.stage-status`（in_progress/review_pending/accepted 三态色）、`.stage-revision`、`.stage-content`、`.stage-steps`、`.stage-rejection-feedback` 写终态单层规则，复用 `--line/--accent-ink/--warning` token，禁止新增 DOM 包裹层。
  - 验证手段：新增 `apps/goal-board/test/run-stage-styles.test.ts`（读 style.css 断言关键类选中器存在）+ e2e `run-stages.test.mjs` 补 computed-style 断言（见 TODO 9 前置）通过。

- [x] //TODO 3. e2e 增加 stage 样式 computed-style 断言
  - 落实标准：[1.3](./spec.md#spec-req-1-3), [1.4](./spec.md#spec-req-1-4)
  - 实施目标：在 `e2e/run-stages.test.mjs` 中对 `.run-stages-container`、`.run-level-steps`、`.run-stage-heading`、`.stage-content`、`.stage-rejection-feedback` 断言 `display: flex / grid`、`align-items` 与字号下限，防样式缺失回归；不改变既有 DOM 断言语义。
  - 验证手段：`npm run test:e2e --prefix apps/goal-board`（含 run-stages 用例）全绿。

- [x] //TODO 4. 补齐会话提示条与恢复行样式
  - 落实标准：[2.1](./spec.md#spec-req-2-1), [2.2](./spec.md#spec-req-2-2)
  - 实施目标：`style.css` 新增 `.session-intro` 终态规则（居中提示条、`--accent-ink`、11–12px）；`.composer-recover-row`/`.composer-recover-actions` 对齐 `--conversation-width`，标签与 Resume Run 按钮水平排布、右对齐。
  - 验证手段：e2e（扩展 `runtime.test.mjs` 或既有 recoverable 用例）断言 `.composer-recover-actions { display:flex; justify-content:flex-end }` computed style + `npm run test:e2e --prefix apps/goal-board` 全绿。

- [x] //TODO 5. 用户文案全英文化并加语言回归检查
  - 落实标准：[3.1](./spec.md#spec-req-3-1), [3.2](./spec.md#spec-req-3-2)
  - 实施目标：`trajectory.tsx` 折叠指导文案改为英文等义句；新增 `apps/goal-board/test/user-copy-language.test.ts` 扫描 `src/**/*.tsx` 字符串字面量中的 CJK 字符（白名单：注释、中文 TSDoc、项目专有词），断言为空。
  - 验证手段：`npm test --prefix apps/goal-board`（新增检查用例）全绿。

- [x] //TODO 6. liveText 通路帧合并与滚动跟随节流
  - 落实标准：[4.1](./spec.md#spec-req-4-1), [4.3](./spec.md#spec-req-4-3)
  - 实施目标：`useRunStream` 内以 rAF（无 rAF 环境退化为 setTimeout 16ms）缓冲 `assistant_text_delta`，每帧最多一次 `setLiveText` 提交，流结束时 flush 保证文本完整；`GoalSession` 跟随滚动 effect 改为按帧合并读写 scrollTop（scrollHeight 读 ≤1 次/帧），`follow` 语义与 jump 按钮不变。
  - 验证手段：新增 `apps/goal-board/test/live-text-batch.test.ts`（模拟高频 delta：断言最终文本逐字一致、两次提交间存在帧合并）+ `npm test --prefix apps/goal-board` 全绿。

- [x] //TODO 7. 消息渲染 memo 边界与活动投影记忆化
  - 落实标准：[4.2](./spec.md#spec-req-4-2), [4.4](./spec.md#spec-req-4-4)
  - 实施目标：`AssistantMarkdown` 包 `React.memo`（props 为 content 字符串）；单条消息组件 memo 化；GoalSession 内 `projectActivityGroups` 调用按 `(run, liveEvents, showTools)` `useMemo` 记忆化，liveText 变化不重投影；不引入包装 DOM。
  - 验证手段：新增 `apps/goal-board/test/activity-projection-memo.test.tsx`（渲染计数探针）+ `npm test --prefix apps/goal-board` 全绿 + e2e 几何不变。

- [x] //TODO 8. trajectory.css 单层终态重写与会话样式归位
  - 落实标准：[5.1](./spec.md#spec-req-5-1), [5.2](./spec.md#spec-req-5-2), [5.3](./spec.md#spec-req-5-3)
  - 实施目标：以 trace-workbench 终态为基准将 `trajectory.css` 重写为可读格式的单层规则；`.goal-info-toggle`/`.goal-info-panel` 迁至 `style.css`；重写后每个选择器至多定义一次，消费 TODO 1 的字号 token。
  - 验证手段：grep 断言脚本扩展（`test/design-token.test.ts`：trajectory.css 无重复选择器定义、无非 Trajectory 规则）+ `npm run test:e2e --prefix apps/goal-board` 全绿（选择器与几何保持）+ 对重写前后截取 Trajectory 视图截图比对（评审记录）。

- [x] //TODO 9. Queue 的 localStorage 持久化与恢复
  - 落实标准：[7.1](./spec.md#spec-req-7-1), [7.2](./spec.md#spec-req-7-2), [7.3](./spec.md#spec-req-7-3), [7.4](./spec.md#spec-req-7-4), [7.5](./spec.md#spec-req-7-5)
  - 实施目标：`useQueue` 新增 localStorage 镜像层（key `lazygoal.queue.<goalId>`），入队/暂停/继续/消费/删除时同步写删；读取经 JSON 结构守卫，非法即清空降级内存；存储异常不阻塞状态机；同步更新 `apps/goal-board/notes/overview.md` 与语义表（删除"刷新页面会丢失 Queue"限制，写入持久化语义与归属模块）。`RunControlContext` 对外契约不变。
  - 验证手段：新增 `apps/goal-board/test/queue-persistence.test.ts`（写读恢复、损坏数据清空、写失败降级、跨 Goal 隔离）+ `npm test --prefix apps/goal-board` 全绿 + e2e `runtime.test.mjs` 补刷新恢复场景断言。

- [x] //TODO 10. 长会话渐进加载窗口
  - 落实标准：[8.1](./spec.md#spec-req-8-1), [8.2](./spec.md#spec-req-8-2), [8.3](./spec.md#spec-req-8-3), [8.4](./spec.md#spec-req-8-4)
  - 实施目标：GoalSession 新增窗口状态：首渲渲染最近 ≥1 个完整 Run（且消息数 ≥ 阈值 50 条时截窗口），顶部"See earlier messages"按钮按完整 Run 边界向上扩页并基本保持视口位置；`history-note` 提示未渲染历史规模；窗内消息时不显示控件。
  - 验证手段：新增 `apps/goal-board/test/session-window.test.tsx`（多 Run fixture：首渲窗口、扩页边界、全量收口）+ `npm test --prefix apps/goal-board` 全绿 + e2e board 用例（少于阈值行为不变）通过。

- [x] //TODO 11. 渲染错误边界与会话错误卡
  - 落实标准：[9.1](./spec.md#spec-req-9-1), [9.2](./spec.md#spec-req-9-2)
  - 实施目标：新增 class `ErrorBoundary`（React 内置 API，无第三方）：顶层包裹 `content` 会话区、Trajectory 视图内再包一层；捕获时在会话区域渲染错误摘要 + "Reload session"（复用 `sessionError` 重载入口），并将 error + 组件栈输出到 console.error；不改变现有清理副作用。
  - 验证手段：新增 `apps/goal-board/test/error-boundary.test.tsx`（注入抛错子组件：shell 可用、错误卡可见、console 记录）+ `npm test --prefix apps/goal-board` 全绿。
- [ ] //TODO 12. 文档与模块说明同步（随交付收尾）
  - 落实标准：[7.5](./spec.md#spec-req-7-5), [5.2](./spec.md#spec-req-5-2)
  - 实施目标：同步 `apps/goal-board/notes/overview.md`、`notes/semantics.md` 中受影响的职责/语义行（CSS 归属、Queue 持久化、渐进加载边界、错误边界），并修正 "main.tsx 收敛至 102 行" 的失实表述；运行 `npm run check:docs` 确认覆盖与链接。
  - 验证手段：`npm run check:docs` 通过。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
|---|---|---|---|
| 阶段分组呈现 | [1.1](./spec.md#spec-req-1-1), [1.2](./spec.md#spec-req-1-2) | mock 含 stages + review rejection 的 Run：阶段分组以 flex 头、状态徽章、Rev 徽章与 feedback 块呈现 | `npm run test:e2e --prefix apps/goal-board`（run-stages 用例含 computed-style 断言） |
| 阶段样式防回归 | [1.3](./spec.md#spec-req-1-3), [1.4](./spec.md#spec-req-1-4) | e2e 断言 `.run-stage-heading` 等 computed style 非浏览器默认值，选择器/几何保持 | `npm run test:e2e --prefix apps/goal-board` |
| 提示条与恢复行 | [2.1](./spec.md#spec-req-2-1), [2.2](./spec.md#spec-req-2-2) | Plan Mode 提示与 recoverable 行在会话区可见、排布对齐 | `npm run test:e2e --prefix apps/goal-board` |
| 文案一致性 | [3.1](./spec.md#spec-req-3-1), [3.2](./spec.md#spec-req-3-2) | `src/**/*.tsx` 字符串字面量无 CJK；折叠指导为英文 | `npm test --prefix apps/goal-board`（user-copy-language 用例） |
| 打字机性能收敛 | [4.1](./spec.md#spec-req-4-1), [4.2](./spec.md#spec-req-4-2), [4.3](./spec.md#spec-req-4-3), [4.4](./spec.md#spec-req-4-4) | 高频 delta 下提交按帧合并、最终文本一致；liveText 变化不重投影、不重解析历史 markdown | `npm test --prefix apps/goal-board`（live-text-batch、activity-projection-memo 用例）+ 人工体验核对运动中打字输出 |
| CSS 归位等价 | [5.1](./spec.md#spec-req-5-1), [5.2](./spec.md#spec-req-5-2), [5.3](./spec.md#spec-req-5-3) | trajectory.css 单层终态、无会话规则；Goal info 样式在 style.css；重写前后视图等价 | `npm test --prefix apps/goal-board`（design-token 用例）+ e2e 全绿 + 截图比对记录 |
| 字号触控下限 | [6.1](./spec.md#spec-req-6-1), [6.2](./spec.md#spec-req-6-2), [6.3](./spec.md#spec-req-6-3) | 无 9px；三档 token 生效；高频控件热区 ≥36px | `npm test --prefix apps/goal-board`（design-token 断言）+ e2e 几何通过 |
| Queue 持久化恢复 | [7.1](./spec.md#spec-req-7-1), [7.2](./spec.md#spec-req-7-2), [7.3](./spec.md#spec-req-7-3), [7.4](./spec.md#spec-req-7-4) | 入队 → 刷新 → 重开同 Goal 队列恢复且继续出队状态机；损坏/失败降级、跨 Goal 隔离 | `npm test --prefix apps/goal-board`（queue-persistence 用例）+ e2e runtime 刷新恢复场景 |
| 长会话渐进加载 | [8.1](./spec.md#spec-req-8-1), [8.2](./spec.md#spec-req-8-2), [8.3](./spec.md#spec-req-8-3), [8.4](./spec.md#spec-req-8-4) | 超 50 条消息按 Run 边界截窗口并可向上扩页至全量；窗内不显示控件 | `npm test --prefix apps/goal-board`（session-window 用例）+ e2e board 用例 |
| 错误边界兜底 | [9.1](./spec.md#spec-req-9-1), [9.2](./spec.md#spec-req-9-2) | 注入渲染异常：shell 可用、会话区错误卡可重载、console 含组件栈 | `npm test --prefix apps/goal-board`（error-boundary 用例） |
| 文档同步 | [7.5](./spec.md#spec-req-7-5) | overview/semantics 与新行为一致；check:docs 通过 | `npm run check:docs` |

### Latest Result

- 状态：未执行
- 验证时间：-
- 验证摘要：尚未开始执行。
