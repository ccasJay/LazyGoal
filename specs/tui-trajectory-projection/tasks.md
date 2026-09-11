# Implementation Plan: TUI Trajectory Event Projection

- [x] //TODO 1. 定义结构化单步视图模型与事件投影器契约

  - 实现目标：在 `packages/tui/src/types.ts` 中定义 `UiStepDecisionBlock`、`UiStepActionBlock`、`UiStepObservationBlock`、`UiStepResultBlock` 与新版 `UiInspectorStep` 结构；在 `SessionControllerDependencies` 中扩充 `readTrajectory` 依赖字段。
  - 成功判据：类型定义完整，配齐中文契约级 TSDoc 与 `@example`，类型检查 0 报错。
  - 验证方式：`npx tsc --noEmit`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [3.1](./requirements.md#req-3-1), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 2. 实现 Trajectory Event Projector 核心投影逻辑与单元测试

  - 实现目标：新建 `packages/tui/src/trajectory-projector.ts`，实现 `projectTrajectoryEvents`；完成生命周期事件聚合成 Preparation 步、按 `executionUnitId` 划分执行步、提取 Decision/Action/Tool/Observation/Result 区块、以及标注 `uncommittedTail` 警示。
  - 成功判据：通过完备的单测覆盖生命周期步、普通工具调用步、拒绝操作步、失败/取消事件以及未提交尾部警示等各种场景。
  - 验证方式：编写 `packages/tui/test/trajectory-projector.test.ts` 并执行通过。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [2.5](./requirements.md#req-2-5), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [ ] //TODO 3. 扩展 Benchmark 轨迹目录路由与 AggregatedTrajectoryStore

  - 实现目标：在 `benchmark-discovery.ts` 中支持解析 `trajectoryDirectory`；在 `createCompositionRoot` 中装配能够透明代理本地与 Benchmark 轨迹的 `readTrajectory` 闭包。
  - 成功判据：针对 Benchmark 会话执行轨迹读取时，能够正确定位并解码评测目录下的 `.ndjson` 轨迹事件文件。
  - 验证方式：在 `packages/tui/test/benchmark-discovery.test.ts` 中补充轨迹目录解析与读取测试。
  - _Requirements: [1.4](./requirements.md#req-1-4), [5.1](./requirements.md#req-5-1)_

- [ ] //TODO 4. 在 SessionController 中内聚轨迹读取与状态流转

  - 实现目标：重构 `session-controller.ts` 中的 `selectGoal` 与 `openHistory` 流程；通过注入的 `readTrajectory` 异步加载事件并调用 `projectTrajectoryEvents`；在轨迹缺失或空事件时设置规范的 `TRAJECTORY_NOT_FOUND` 稳定错误码。
  - 成功判据：Controller 完整驱动轨迹加载，异步期间保持 `busy: true`，读取成功后派发结构化步骤；缺失轨迹时给出明确错误提示，不回退到 message slicer。
  - 验证方式：更新 `packages/tui/test/session-controller.test.ts` 补充控制器层面的轨迹异步加载与错误流转测试。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3)_

- [ ] //TODO 5. 升级 InspectorScreen 结构化渲染与快捷键交互

  - 实现目标：重构 `src/inspector-screen.tsx`，按 Decision、Action & Approval、Tool & Observation、Result 四个区块清晰排版；默认对 Observation 适度截断；支持按 `o` 快捷键展开/收起完整 Observation 输出；保持 `r`（思维链）、`e`（外部编辑器）、`Esc`（返回列表）与 `q`（退出）。
  - 成功判据：全屏展示高可视性结构化区块，截断与展开流畅切换，快捷键交互 100% 正常工作。
  - 验证方式：更新 `packages/tui/test/inspector-screen.test.tsx` 交互渲染测试。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [3.5](./requirements.md#req-3-5)_

- [ ] //TODO 6. CLI inspect 子命令端到端对齐与全量回归验证

  - 实现目标：更新 `cli.tsx` 中的 `lazygoal inspect [goalId]` 流程直接对接 Controller 异步轨迹流；运行全量测试套件并保证全库通过。
  - 成功判据：`npm test`（930+ 用例及 scripts 规则）全部 100% 通过。
  - 验证方式：`npm test` 全量回归。
  - _Requirements: [1.2](./requirements.md#req-1-2), [5.3](./requirements.md#req-5-3)_

## Feature Verification

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2) | 选中 Goal 后 Controller 异步调用 readTrajectory 并正确派发结构化 Step | Controller 单元测试 |
| [1.3](./requirements.md#req-1-3) | 轨迹文件不存在时抛出/展示 `TRAJECTORY_NOT_FOUND` 错误提示 | 缺失轨迹错误处理测试 |
| [1.4](./requirements.md#req-1-4) | Benchmark 任务能定位对应 runtime/trajectories 目录读取事件流 | Benchmark 发现与恢复测试 |
| [2.1](./requirements.md#req-2-1), [2.3](./requirements.md#req-2-3) | 事件流按 `executionUnitId` 严格划分为对应 Step | Projector 单步切分测试 |
| [2.2](./requirements.md#req-2-2), [2.5](./requirements.md#req-2-5) | 前置生命周期事件归入 Step 1: Preparation & Planning | 准备阶段投影测试 |
| [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2) | Step 详情清晰渲染 Decision、Action、Tool/Observation、Result 四大区块 | InspectorScreen 渲染测试 |
| [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4) | 按 `o` 展开/折叠 Observation，按 `r` 展开/折叠思维链 | 键盘交互行为测试 |
| [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2) | 严格以 committed 边界为主，存在未提交尾部时在末尾呈现 Warning 区块 | 未提交尾部边界测试 |
| [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2) | 遵循中文 TSDoc 与 exactOptionalPropertyTypes 规则 | 类型检查与静态扫描 |
| [5.3](./requirements.md#req-5-3) | 代码、注释与测试无外部禁止的项目名称 | 依赖与敏感词检查 |
