# Implementation Plan

- [x] //TODO 1. 实现检查器 Tab 偏好记忆与结构纯净化

  - 实现目标：在生产组件及独立原型中实现 `preferredDetailTab` 偏好状态，在左右箭头切换事件时保持用户所选 Tab，缺失对应载荷时优雅回退 Summary，列表主动点击时重置为 Summary；将 Execution relationship 仅在 Summary 视图展示
  - 成功判据：切换相邻事件时非 Summary 选项卡保持不变，仅在目标事件无对应载荷时临时回退 Summary 并在后续具备载荷的事件中恢复；Raw/Input 数据视图中不再附带执行关系说明卡片；列表点击事件条目恢复为默认 Summary
  - 验证方式：新增针对 Tab 计算与回退逻辑的单元测试 `apps/goal-board/test/trajectory-tab-memory.test.ts`，运行 `npm run --prefix apps/goal-board test`
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [5.1](./requirements.md#req-5-1)_

- [x] //TODO 2. 实现时间轴泳道筛选双态联动、无害定位与滚轮解耦

  - 实现目标：在时间轴泳道中建立匹配高亮与未匹配置灰弱化的双态渲染；点击弱化刻度时在左侧列表高亮条目并展示状态徽章，严禁清空搜索过滤条件；解耦时间轴区域原生垂直滚轮
  - 成功判据：输入搜索词或选择类别后，未命中刻度呈现 `opacity: 0.25`；点击弱化刻度后搜索词与类别选择原样保留，检查器顶部标明 `Event outside active filter`；在时间轴区域执行无修饰键的滚轮操作时正常滚动外层页面
  - 验证方式：交互与样式断言测试，在 `apps/goal-board/e2e/` 增加时间轴联动与滚轮事件冒泡检查，运行 `npm run test:web-e2e`
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [5.2](./requirements.md#req-5-2)_

- [x] //TODO 3. 实现步骤折叠选中项稳定化、准确引导文案与 A11y 焦点及复制防护

  - 实现目标：折叠步骤时不触发选中事件自动漂移；全部步骤折叠时呈现准确引导文案；列表行改用标准 listbox/option 语义并移除原生 button 上的非法 aria-selected；选择事件后显式维持焦点；为复制 JSON 增加 try-catch 保护与失败反馈
  - 成功判据：折叠包含选中事件的步骤时不改变当前检查器内容；全部折叠时检查器显示“所有步骤已收起，请展开步骤以查看事件”；列表无非法 aria 属性；键盘按键触发后焦点不跳回 body；复制权限异常时界面显示“Copy failed”且无未捕获异常
  - 验证方式：在 `apps/goal-board/e2e/` 增加折叠引导文案、焦点保持与复制降级断言，运行 `npm run test:web-e2e`
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) | 左右箭头导航至包含相同载荷的新事件时保持当前 Tab | 自动化单元测试 `test/trajectory-tab-memory.test.ts` 及 E2E 测试已通过 |
| [1.2](./requirements.md#req-1-2) | 导航至无对应载荷事件时临时回退至 Summary | 自动化单元测试 `test/trajectory-tab-memory.test.ts` 已通过 |
| [1.3](./requirements.md#req-1-3) | 列表行直接点击事件时重置为 Summary | 自动化单元测试及 E2E 测试 `board.test.mjs` 已通过 |
| [2.1](./requirements.md#req-2-1) | 存在过滤条件时未命中刻度半透明弱化展示 | E2E 样式断言（`board.test.mjs` 验证 `.dimmed` 与 `opacity: 0.25`）已通过 |
| [2.2](./requirements.md#req-2-2) | 点击任意弱化刻度时选中事件且保留搜索框输入与下拉类别 | E2E 交互断言（点击刻度保留搜索值 `"started"`）已通过 |
| [2.3](./requirements.md#req-2-3) | 选中当前过滤集合外的事件时呈现明确提示状态 | E2E 界面断言（`.tr-outside-badge` 呈现 `Event outside active filter`）已通过 |
| [3.1](./requirements.md#req-3-1) | 折叠步骤时当前选中事件不发生跳选漂移 | 移除 `onHideSelection`，E2E 折叠断言选中项不改变已通过 |
| [3.2](./requirements.md#req-3-2) | 全部步骤折叠时检查器展示步骤已收起指引文案 | E2E 断言检查器呈现“所有步骤已收起，请展开步骤以查看事件”已通过 |
| [3.3](./requirements.md#req-3-3) | 过滤匹配折叠内事件时仅展开对应步骤不重置全局偏好 | 原型 `applyFilter()` 靶向展开命中步骤已通过 |
| [4.1](./requirements.md#req-4-1) | 键盘导航操作事件后焦点稳定保持在当前选中行 | 原型与组件 `focus({ preventScroll: true })` 焦点管理已实现 |
| [4.2](./requirements.md#req-4-2) | 列表行移除原生 button 上的 aria-selected 属性并符合语义规范 | E2E 断言容器 `role="listbox"` 且无非法 `button[aria-selected]` 已通过 |
| [4.3](./requirements.md#req-4-3) | 剪贴板异常时捕获错误并提示 Copy failed | E2E 模拟权限拒绝断言反馈文案 `Copy failed` 已通过 |
| [5.1](./requirements.md#req-5-1) | Raw/Input/Result 标签页不渲染执行关系卡片 | E2E 断言非 Summary 标签下 `.relationship` 为空已通过 |
| [5.2](./requirements.md#req-5-2) | 无修饰键垂直滚轮在时间轴区域不劫持外层页面滚动 | E2E 断言无修饰键 WheelEvent 的 `defaultPrevented === false` 已通过 |

### Latest Result

- 执行时间：2026-10-09 23:18:00
- 整体状态：PASSED
- 验证证据：
  - `npm run --prefix apps/goal-board test`：16 个单元测试全部通过（耗时 314ms），覆盖 Tab 偏好记忆回退与事件过滤纯函数逻辑。
  - `npm run test:web-e2e`：3 个端到端测试用例全部通过（耗时 66.5s），覆盖生产看板步骤折叠稳定性、全折叠引导文案、时间轴刻度保持Tab偏好、列表点击重置Tab偏好、导航焦点保持、泳道双态弱化、无害定位、A11y listbox/option 语义、滚轮解耦、复制防护以及原型测试。
  - `npm test`：全仓库回归检查全部通过（包含 Phase 1 scripts 校验 33 项全绿、Phase 2 17 个 TypeScript 包编译 clean、Phase 3 1622 个单元/契约测试全 PASS、Phase 4 52 个集成测试用例全 PASS）。
  - `npm run check:docs`：29 个模块 111 份架构与语义文档校验通过。

