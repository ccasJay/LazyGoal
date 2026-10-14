# 轨迹看板交互修复 设计

## Overview

本设计针对 [requirements.md](./requirements.md) 中的 5 项核心交互与可访问性需求，重构生产端 React 组件（[trajectory.tsx](file:///Users/sawyerlau/Project/LazyGoal/apps/goal-board/src/trajectory.tsx)、[trajectory-records.tsx](file:///Users/sawyerlau/Project/LazyGoal/apps/goal-board/src/trajectory-records.tsx)）及独立原型（[trajectory-explorer.html](file:///Users/sawyerlau/Project/LazyGoal/apps/goal-board/prototypes/trajectory-explorer.html)）。通过引入受控的选项卡偏好记忆状态、双态泳道刻度投影、无害定位指示、合规化可访问性焦点管线与带修饰键的滚轮缩放，消除审查打断、状态漂移与操作劫持问题。

## Key Design Decisions

- **D1 — 记忆偏好（preferredTab）与有效性动态投影（满足 req-1-1, req-1-2, req-1-3）**：
  在组件中维护 `preferredDetailTab` 状态。点击顶部导航箭头（Previous/Next）切换事件时不重置偏好，计算属性 `activeTab` 优先采用 `availableTabs.includes(preferredDetailTab) ? preferredDetailTab : "Summary"`；仅当用户在左侧列表显式点击选择新条目时，才重置偏好为 `"Summary"`。
- **D2 — 泳道刻度过滤状态投影与非破坏性定位（满足 req-2-1, req-2-2, req-2-3）**：
  泳道刻度渲染区分 `matched` 与 `dimmed` 状态（未命中当前搜索词或过滤类别的刻度应用 `opacity: 0.25`）。点击弱化刻度时，执行 `select(entry)` 但保持 `query` 与 `category` 筛选参数不变；详情面板顶部显示 `Event outside active filter` 状态徽章，并在左侧列表中动态高亮该条目，禁止静默清空用户过滤。
- **D3 — 步骤折叠选中项持久化与精确空状态引导（满足 req-3-1, req-3-2, req-3-3）**：
  折叠 Step 时保留当前 `selectedSequence`，不触发自动跳选；左侧列表允许处于折叠状态的分组隐藏行条目，但详情面板保持对选中事件的展示。当全部分组折叠导致无可见条目时，检查器展示引导文案：“所有步骤已收起，请展开步骤以查看事件”，消除原有的更改筛选提示。
- **D4 — 原生 A11y 语义改造与持久焦点恢复（满足 req-4-1, req-4-2, req-4-3）**：
  将列表行上的非法 `<button aria-selected="...">` 重构为带有 `role="listbox"` / `role="option"` 的语义结构；原型与组件在重绘或切换时通过 `element.focus({ preventScroll: true })` 保持焦点，防止焦点跳回 `document.body`；`copy()` 方法包裹 `try...catch`，并在异常时呈现“Copy failed”反馈。
- **D5 — 执行关系卡片作用域约束与滚轮缩放解耦（满足 req-5-1, req-5-2）**：
  “Execution relationship”卡片仅在 `activeTab === "Summary"` 时挂载渲染，切至 Raw/Input/Result 时卸载；时间轴区域的 `wheel` 事件默认放行原生纵向滚动，仅在检测到 `event.shiftKey`、`event.ctrlKey` 或 `event.metaKey` 时才调用 `preventDefault()` 触发时间轴缩放。

## 风险与待确认

- 风险等级：low；理由：仅影响浏览器端交互表现与 DOM 呈现，不改动运行时与后端存储。
- 关键操作：无
- 风险：无
- 待确认：无

## Components and Interfaces

```text
+---------------------------------------------------------------+
|                       Trajectory View                         |
|                                                               |
|  [Time/Seq Switch] [Timeline Ruler: Matched & Dimmed Ticks]   |
+-------------------------------+-------------------------------+
|       TrajectoryRecords       |      Trajectory Inspector     |
|  - role="listbox" 规范角色    |  - preferredDetailTab 状态    |
|  - 独立 focus 管理            |  - Summary: 携带执行关系卡片  |
|  - 折叠保持选中 sequence      |  - Raw/Input: 纯净数据展示    |
|                               |  - Copy: try-catch 状态闭环   |
+-------------------------------+-------------------------------+
```

- **`preferredDetailTab`**：`string | null`，记录用户显式选择的选项卡名称；跨事件切换时持久保留。
- **`isEventMatched(entry, query, category)`**：纯函数，用于判定泳道刻度的 `dimmed` 样式及详情面板的未命中状态徽章。

## Testing Strategy

- **单测验证（req-1-1, req-1-2, req-1-3）**：针对 `apps/goal-board/test/` 增加针对 `preferredDetailTab` 计算与回退逻辑的单元测试，覆盖相邻切换、无对应载荷事件回退及列表直接点击重置场景。
- **端到端与交互验证（req-2-1 ~ req-5-2）**：在 `apps/goal-board/e2e/` 增加或运行 Playwright/Node E2E 测试，验证：
  1. 搜索状态下泳道刻度样式（高亮 vs 弱化）；点击弱化刻度后搜索词不被清空且高亮选中项。
  2. 全部折叠状态下的提示文案准确性。
  3. 复制失败时的 UI 提示与未捕获异常防御。
  4. 键盘 Tab 切换事件后的焦点保持情况。
  5. 时间轴滚轮在普通滚动时不劫持页面滚动。

