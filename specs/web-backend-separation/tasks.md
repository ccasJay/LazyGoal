# Web 与后端分离及终端产品退出任务

Requirements、Design 已获批准；本文件是待批准的完整任务与验收计划，尚未开始实现。

## 执行约束

- 按 TODO 1 → 2 → 3 → 4 顺序执行，每项同时完成实现、调用方接入和行为测试。TODO 3 在现有 Web 装配中交付恢复能力，TODO 4 再迁移装配并移除普通终端产品，避免引入临时兼容适配器。
- 以 [Design](./design.md) 为实现依据，风险与删除边界见其 [风险与待确认](./design.md#风险与待确认)。不删除 Home 数据、工作区文件或评测产物，不扩大为跨域部署或并行执行改造。
- 改动公开契约和当前架构时，按仓库规则在同一实现变更中补齐中文 TSDoc、示例及相关架构说明；这些同步义务不另设文档 TODO。保留所有任务原文，完成时只将 `[ ]` 改为 `[x]`。
- 下文标为“待新增”或“待迁移”的测试/配置目前不存在于目标位置；实施时建立并接入真实验证入口，不把文件缺失、跳过或模拟退出码视为通过。

## 编码任务

- [x] //TODO 1. 建立纯通信契约并使现有 Web 完全脱离后端实现依赖

  - 实现目标：建立 `packages/web-contracts`，迁入 Web 命令、结果和展示 DTO 及必要 wire 校验；同步接入 `browser`、`session-metrics` 和全部前端消费者，消除 Runtime/Permission 类型别名与后端 barrel 依赖；扩展依赖检查以覆盖应用目录、类型导入及重导出。
  - 成功判据：现有 Web 能独立构建并继续读取会话、指标、轨迹 Raw 和完整模型输入；纯契约及前端依赖图不包含后端实现或 Node 能力；非法请求/响应仍被对应 wire 边界拒绝，序列化内容和访问白名单不因类型迁移扩大。
  - 验证方式：契约测试（`packages/web-contracts/test/`，待新增）；现有 `packages/browser/test/`、`packages/session-metrics/test/` 和依赖检查测试；执行 `npm run build:web`、`npx tsc --noEmit`、`npm run check:dependencies`、`npm run test:web-e2e`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [3.2](./requirements.md#req-3-2), [5.2](./requirements.md#req-5-2)_

- [x] //TODO 2. 移除 Benchmark 交互终端模式并保持无界面机器命令可执行

  - 实现目标：删除 GAIA/SWE-bench 的 `--tui` 分支、渲染注入、共享 TUI 评测运行器/策略及其导出；核对 Tool RPC/Worker 剩余消费者后删除终端独占链，保留 Headless/ACP 与既有 Benchmark、评分、数据准备、Prompt Evaluation、GEPA 路由。
  - 成功判据：`--tui` 在创建模型或容器前被明确拒绝；既有机器命令的参数、输出及退出码保持原语义，Headless 导入不加载终端模块；任务隔离、评分和资源释放行为不受交互分支删除影响。
  - 验证方式：更新现有 `benchmarks/gaia/test/cli.test.ts`、`benchmarks/swebench/test/manifest-cli.test.ts`，保留并执行 `benchmarks/test/headless-composition-root.test.ts`、`benchmarks/test/prompt-evaluation/cli.test.ts` 及相关 Worker/环境测试；机器入口分发测试（`scripts/lazygoal-entrypoint.test.mjs`，待新增）；执行 `npm run test:gepa-adapter` 和 `npm test`。
  - _Requirements: [2.3](./requirements.md#req-2-3), [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

- [x] //TODO 3. 集成基于提交边界的 Web 显式恢复及活动状态展示

  - 实现目标：按 Design 一并扩展纯契约、`BrowserGoalCoordinator.advance`、命令预约与受理、恢复路由、列表/会话活动投影、活动变化订阅、客户端重试和 `Resume Run` 操作；接入当前装配，不另建恢复状态机或持久化活动字段。
  - 成功判据：中断的 `created/running` Run 可从 Web 恢复同一身份和保存模型，读取页面不推进；同边界在途重试复用受理，旧 Run/边界和其他活动 Goal 被拒绝；已提交结果不重放，manual 未知结果、PTC、审批和纠错遵循现有 Runtime；模型/首个保存失败以及受理后故障均可诊断，页面断开不提前释放执行预约，结束后活动展示和监听正确清理。
  - 验证方式：恢复命令/路由/预约/流测试（`packages/browser/test/browser-resume.test.ts`，待新增）及现有 `browser-recovery.test.ts`、`browser-stream.test.ts`；扩展 `apps/goal-board/e2e/runtime.test.mjs` 和 `board.test.mjs`，使用确定性 Adapter 覆盖中断、重启、重复请求和断开；执行 `npx tsx --test packages/browser/test/*.test.ts`、`npm run build:web`、`npm run test:web-e2e`。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [5.3](./requirements.md#req-5-3), [6.1](./requirements.md#req-6-1)_

- [ ] //TODO 4. 迁移独立 Web 后端与可靠生命周期并完成普通终端产品退出

  - 实现目标：建立 `apps/goal-server`，迁入无 UI 的 Composition Root、保存通知、路由与关闭装配，采用正式工作区 Store；切换薄启动器的默认/`web` 入口，拒绝旧终端命令，删除 `packages/tui` 和终端独占依赖。同步迁移模型绑定、Tool/Profile/预算、路径与权限、数据恢复及进程生命周期测试，更新真实 Web E2E 装配和回归发现；实现启动失败清理及关闭中的写入/排队请求拒绝。
  - 成功判据：普通启动提供同源授权 Web，后端及核心不加载 React/Ink/Controller/Benchmark 装配；既有 Web 功能与 TODO 3 恢复能力保持可用，同一隔离 Home 的身份、路径、内容和模型偏好连续；损坏数据不覆盖；无静态产物仍提供引导与 API；SIGINT 保留最后成功快照、清理资源并退出 130，关闭期间的新推进和排队命令不能产生模型、文件或 Tool 副作用。
  - 验证方式：`apps/goal-server/test/` 装配、启动分发、数据连续性和生命周期测试（待新增/迁移）；迁移现有 TUI 中对应业务断言，终端视觉断言随产品退出；建立服务独立类型检查配置（`apps/goal-server/tsconfig.json`，待新增）；执行 `npx tsc --noEmit -p apps/goal-server/tsconfig.json`、`npx tsx --test apps/goal-server/test/*.test.ts`、`npm run build:web`、`npm run check:dependencies`、`npm test` 和 `npm run test:web-e2e`。
  - _Requirements: [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [5.1](./requirements.md#req-5-1), [5.3](./requirements.md#req-5-3), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [7.2](./requirements.md#req-7-2)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。以下是功能验收，不计为编码 TODO；全部 TODO 完成后，在最终组合状态运行，不能只依赖迁移前或单项完成时的结果。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式与证据 |
| --- | --- | --- |
| [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3) | 前端独立构建、服务独立类型检查与启动；依赖图无实现泄漏。非法 JSON 在 wire 边界拒绝，正常 DTO/SSE 保持现有内容；后端不需前端源码或 UI 库，无静态产物也不影响核心导入 | 前端构建、服务类型检查、契约/路由测试、依赖规则的允许与拒绝用例、核心导入及缺失产物启动测试 |
| [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3) | `lazygoal` 与 `lazygoal web` 提供实际本地入口；旧 `-c`/`resume`/`inspect` 及 Benchmark `--tui` 非零拒绝，拒绝前无模型或工具执行；终端专属源码/依赖退出，共享业务断言仍存在 | 隔离子进程入口测试、模块加载检查及生产引用核对；业务测试迁移清单按原断言核验，不能以总测试数降低替代覆盖 |
| [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2) | 经新服务完成 Goal 创建、等待交互、后续 Run 与 Plan；归档/删除、模型切换与跨重启偏好、权限/撤销、计划、Activity、轨迹、完整模型输入和指标均正常 | 更新后的 `board.test.mjs`、`runtime.test.mjs`、Browser/模型/权限/指标测试；缺口用待新增确定性服务测试补齐，各行为记录具体断言 |
| [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4) | 重组前生成的当前格式隔离 Home 被新服务直接读取，Goal/Run、边界、模型、偏好和授权不重置；已归档记录及产物保留。损坏/未知版本明确失败且原文件内容不变 | 数据连续性测试（待新增），记录同一数据目录的路径/身份及文件内容指纹；既有 Storage 严格解析测试 |
| [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4) | 模型请求、Tool、PTC 和纠错检查点中断后重启：读页面无执行，显式恢复保持 Run/模型，不重放已提交副作用；未知结果与审批继续等待人工。并发/重试、过期边界、旧 Run、另一活动 Goal、模型/保存失败均符合设计，监听和预约最终释放 | 恢复单元/集成测试与真实本地服务 Web E2E；观测 Run ID、提交边界、模型选择、工具调用数、待审批状态及清理后的活动状态 |
| [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3) | 仅同源本地有效凭据可操作，未授权/Host/Origin/身份错配被拒绝；DTO 不暴露凭据或完整配置，详情保持既有授权。创建、消息、交互和恢复共享一个活动预约，前端不决定领域提交 | 访问控制、路由和命令竞态测试；凭据哨兵的响应/前端存储检查；Snapshot 提交顺序与白名单测试 |
| [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3) | 页面断开后已受理任务继续，重连读取已提交事实；SIGINT 中在途保存完成、后续/排队推进被拒绝并退出 130。配置/装配/监听或关闭失败时清理已创建资源，保留原始诊断与最后快照，不伪造终态 | 隔离进程生命周期与资源故障注入测试（待新增/迁移）、Root/Shutdown/长进程现有测试及重连 E2E；观测保存顺序、资源状态和真实进程退出码 |
| [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3) | Headless/ACP、评分、数据准备、Prompt Evaluation 与 GEPA 继续采用已有参数/输出/退出码和隔离清理规则；导入和执行不加载终端，Web 不启动评测环境 | 各 Benchmark CLI/Headless/Worker/环境测试、机器分发子进程测试、`npm run test:gepa-adapter`；使用确定性替身，不产生付费模型请求 |

统一检查入口：`npm run build:web`、服务独立类型检查、`npx tsc --noEmit`、`npm run check:dependencies`、`npm test`、`npm run test:web-e2e`、`git diff --check`。验证以最终代码状态为准；若有缺失环境或失败检查，记录为阻塞或失败，不能跳过后宣称完成。

本计划使用自动化的真实本地 HTTP 服务和浏览器验证同源运行及跨重启恢复，不额外要求人工验收；真实 Provider 与付费评测不是本轮检查。若实现中发现自动化无法建立某项必需结果，按 delivery-loop.md 单独记录未解决项。

### Latest Result

未执行。当前没有功能成功证据或已完成 TODO。

实施后在此记录每项检查的实际结果、证据位置与未解决问题，以及验证时间、被测提交或明确无提交、相关未提交变更的路径与内容指纹、需求/设计契约指纹、整体状态和时效。检查失败优先于阻塞或待人工确认；相关代码或契约变化后原证据须标为过期并补验受影响范围。
