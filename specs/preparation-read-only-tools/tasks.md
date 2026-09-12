# Implementation Plan

- [x] //TODO 1. 在 Contracts 与 Tools 中建立声明式 isReadOnly 契约与工具元数据定义
  - 实现目标：在 `@lazygoal/contracts` 与 `@lazygoal/tools` 中为工具定义增加 `readonly isReadOnly: boolean` 契约属性，并显式标注现有工具（`read_file`、`grep` 为 `true`，`write_file`、`edit_file`、`bash` 为 `false`）。
  - 成功判据：TypeScript 类型编译通过，所有注册工具具备明确的只读语义，且为后续新增工具提供标准接口。
  - 验证方式：新增单元测试验证工具只读属性的反射与校验。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.3](./requirements.md#req-1-3)_

- [x] //TODO 2. 在 Agent 中实现基于只读元数据的动态工具过滤与扩展接入
  - 实现目标：重构 `packages/agent/src/prompt.ts` 的 `buildPreparationRequest`，废除硬编码逻辑，改为依据工具的 `isReadOnly` 属性动态构建准备阶段可用工具集。
  - 成功判据：模型在 `gathering_context` 与 `planning` 阶段接收到且仅接收到声明为 `isReadOnly: true` 的工具，新增只读工具无需修改 Prompt 引擎即可自动注入。
  - 验证方式：编写 `packages/agent/test/` 单元测试，验证模拟只读工具自动识别而写工具被严格排除。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3)_

- [x] //TODO 3. 扩展 PreparationResult 契约引入只读 probe_action 决策类型
  - 实现目标：在 `@lazygoal/contracts` 中扩展 `GatheringPreparationResultContract` 与 `PlanningPreparationResultContract`，加入 `probe_action` 分支以承载只读探查意图。
  - 成功判据：契约解析器能够合法解析并验证只读探查动作，且与写操作决策严格隔离。
  - 验证方式：在 `packages/contracts/test/` 中编写契约结构与边界用例测试。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2)_

- [x] //TODO 4. 在 Runtime 中实现受控的准备阶段只读探查循环与熔断保护
  - 实现目标：在 `packages/runtime` 的 Coordinator 与 Preparation 流程中驱动多轮只读探查，执行前强制校验只读性，并将工具输出反馈给下一轮推理；引入最大 5 步硬上限熔断保护。
  - 成功判据：模型可连续发起多轮只读探查并最终收敛为 proposal；任何在准备阶段尝试调用非只读工具的动作均被立即拦截，工作区零写入。
  - 验证方式：编写 `packages/runtime/test/` 集成测试覆盖多轮探查、步数超限熔断与非只读工具拦截场景。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2)_

- [x] //TODO 5. 重构 PreparationScreen 支持只读步骤流式瀑布展示与活动抽屉
  - 实现目标：重构 `packages/tui/src/preparation-screen.tsx`，引入 Ink `<Static>` 瀑布流输出准备阶段的只读探查步骤，先前步骤完全保留不被擦除，下方活动抽屉展示 Spinner、提问或提案审批面板。
  - 成功判据：准备阶段的每一步探查在终端中形成连贯的向上瀑布流，底部整洁切换为输入或确认状态。
  - 验证方式：在 `packages/tui/test/` 中使用 `ink-testing-library` 断言准备阶段多步探查在终端帧中累积留存。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [x] //TODO 6. 全量集成验证与端到端回归
  - 实现目标：执行全量回归套件，验证新特性在端到端 CLI 与评测管线中运行平稳。
  - 成功判据：全量测试套件 100% 通过，无类型错误，架构规范测试全部通过。
  - 验证方式：运行 `node scripts/run-regression.mjs`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.1](./requirements.md#req-2-1), [3.1](./requirements.md#req-3-1), [4.1](./requirements.md#req-4-1)_

- [ ] //TODO 7. 端到端 TUI 交互与真实终端视觉瀑布流验证
  - 实现目标：通过交互脚本驱动包含多轮准备阶段只读探查（本地代码检索、外部网络查询模拟）到任务提案审批的真实终端渲染，捕获各阶段视觉画面帧并进行可视化核验。
  - 成功判据：验证准备阶段各只读步骤在终端向上瀑布式累积留存，不发生原地覆盖，底部抽屉平滑衔接，视觉体验流畅完整。
  - 验证方式：运行端到端视觉捕获脚本，输出并核验多个关键交互时间点的终端渲染帧。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) | 准备阶段根据 isReadOnly 动态注入只读工具集 | 待实现的 Agent 提示词只读过滤单元测试 |
| [1.2](./requirements.md#req-1-2) | 扩展只读工具（如 web_search）自动被准备阶段识别 | 待实现的扩展工具动态识别测试 |
| [1.3](./requirements.md#req-1-3) | 准备阶段无硬编码工具白名单，按元数据过滤 | 待实现的元数据契约测试 |
| [2.1](./requirements.md#req-2-1) | gathering 阶段可自主发起只读探查并接收观察 | 待实现的 Runtime 准备探查集成测试 |
| [2.2](./requirements.md#req-2-2) | planning 阶段可先探查代码库再产出 task proposal | 待实现的 Planning 探查集成测试 |
| [2.3](./requirements.md#req-2-3) | 探查步数达到 5 步上限时强制熔断并要求收敛 | 待实现的步数超限熔断测试 |
| [3.1](./requirements.md#req-3-1) | 准备阶段调用写工具直接拦截并拒绝 | 待实现的安全拦截单元测试 |
| [3.2](./requirements.md#req-3-2) | 用户批准计划前工作区零写入零变更 | 待实现的工作区无副作用隔离测试 |
| [4.1](./requirements.md#req-4-1) | 准备阶段已完成步骤通过 Static 固化到终端历史 | 待实现的 PreparationScreen 瀑布流渲染测试 |
| [4.2](./requirements.md#req-4-2) | 准备阶段探查时底部活动抽屉展示 Spinner | 待实现的探查运行态界面测试 |
| [4.3](./requirements.md#req-4-3) | 探查后下方活动抽屉整洁展示问答或审批面板 | 待实现的交互抽屉无缝衔接测试 |
| [4.1-4.3](./requirements.md#req-4-1) | 准备阶段流式瀑布到提案审批的端到端真实终端视觉交互 | 自动化交互驱动脚本与各帧视觉输出核验 |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。
