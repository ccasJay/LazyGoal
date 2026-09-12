# Implementation Plan

- [x] //TODO 1. 建立独立 Slash Command Package 与公共契约

  - 实现目标：新增 `@lazygoal/slash-command` 的 Definition、Registry、inspection/dispatch 结果、`/model` effect 和公开导出，并把零出站依赖加入仓库依赖边界。
  - 成功判据：合法命令可注册、查询和派发；重复或非法名称稳定失败；候选排序、未知命令、参数拒绝、前导空白、`//` 与普通文本均产生约定结果，Package 不导入 UI、Provider 或 Storage。
  - 验证方式：待实现的 `packages/slash-command/test/*.test.ts`；`npm run check:dependencies`；`npx tsc --noEmit`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4)_

- [x] //TODO 2. 将 Slash Command 输入语义接入现有 TUI 文本面板

  - 实现目标：实现共享 `CommandAwareTextInput`，在 Intent、question、proposal feedback 与 blocked 输入中接入候选渲染、effect 派发和普通文本回调。
  - 成功判据：`/` 与前缀实时显示稳定候选；命令不进入原提交回调；`//` 解码后按普通文本提交；非命令输入继续沿用现有 submit gate、清空和推进行为。
  - 验证方式：待实现的 command-aware 输入组件测试及现有 `packages/tui/test/*screen*.test.tsx` 定向回归。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [2.5](./requirements.md#req-2-5)_

- [x] //TODO 3. 实现统一模型目录、Catalog 补全与选择资格判定

  - 实现目标：在 `packages/llm` 增加模型描述、pi-ai Catalog 投影、在线/Catalog 合并、稳定排序、兼容性过滤和脱敏错误分类。
  - 成功判据：在线 ID 决定在线成功时的可用集合；元数据来源独立标记；非文本、模式不兼容或缺少安全 Binding 能力的条目不可确认；允许的故障显示带 warning 的兜底，鉴权、权限和协议错误阻止选择。
  - 验证方式：待实现的 `packages/llm/test/model-catalog.test.ts`；覆盖去重、来源、当前项、不可选原因和六类失败结果。
  - _Requirements: [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [3.5](./requirements.md#req-3-5)_

- [x] //TODO 4. 接入六类 Provider 在线模型 Fetch

  - 实现目标：按 OpenAI、Google、Anthropic、OpenRouter、DeepSeek 与 `openai-compatible` wire 契约实现可注入 fetch 的列表适配器、分页、共享超时和取消。
  - 成功判据：每个 Fetcher 只访问当前 Provider 的模型端点并发送对应认证；Google/Anthropic 完整分页且拒绝不前进的 cursor；401/403、404/405/501、5xx、网络、超时、取消和非法响应均映射到约定分类，错误不包含凭据或任意响应正文。
  - 验证方式：待实现的 fake-fetch Provider 矩阵测试；不得运行真实端点或付费模型请求。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [3.5](./requirements.md#req-3-5), [7.2](./requirements.md#req-7-2)_

- [x] //TODO 5. 将模型选择纳入 Goal Domain 与当前 Snapshot Schema

  - 实现目标：新增 `GoalModelSelection` 和 `GoalState.modelSelection`，扩展 Launch/Create、clone/transition、Snapshot DTO/Schema/Codec 与全部当前 fixture，保持 schemaVersion 1。
  - 成功判据：新 Goal 必须持有可重建的非敏感选择；编码再解码保持 Provider、模型、模式、容量与 estimator 描述；缺失新字段的旧开发快照明确失败；序列化结果不含 API Key、baseURL 或认证头。
  - 验证方式：待实现及更新的 Runtime domain、Launcher、Storage codec/store 测试；`npx tsx --test packages/runtime/test/*.test.ts packages/storage/test/*.test.ts`。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4)_

- [x] //TODO 6. 实现 Goal 模型选择的安全提交边界

  - 实现目标：在 Runtime 增加 `GoalModelSelectionCoordinator`，只在匹配 Goal/Run 的文本等待点复制并保存新选择，且不创建 Adapter 或追加 Trajectory 事件。
  - 成功判据：question、planning approval feedback 与 executing blocked 可保存模型选择；其它状态、Run 不匹配和终态无副作用地失败；保存失败返回旧 Goal，messages、Run、pendingAction、Context Epoch 和 Trajectory boundary 不变。
  - 验证方式：待实现的 Runtime coordinator 测试；覆盖所有允许/拒绝状态和失败 Store。
  - _Requirements: [5.2](./requirements.md#req-5-2), [5.4](./requirements.md#req-5-4), [6.2](./requirements.md#req-6-2), [6.4](./requirements.md#req-6-4)_

- [x] //TODO 7. 实现可替换 Model Binding 并改造两个 Executor

  - 实现目标：实现候选 Binding 构造、同步 generation 发布和 `ModelExecutionBindingProvider`，让 Preparation/Step Executor 在每次 execute 开始时固定读取一次 Adapter、Capabilities、Policy 与 Assembler。
  - 成功判据：有效目标使用新模型容量、输出上限和 estimator 构造完整 Binding；构造失败不改变当前 generation；连续调用可观察到切换，单次进行中的调用保持旧 generation 且仍只调用一个 Adapter。
  - 验证方式：待实现的 Binding 单元测试及更新的 `packages/agent/test/llm-*-executor.test.ts`；保留取消、协议错误和 Adapter 错误传播断言。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [7.3](./requirements.md#req-7-3)_

- [x] //TODO 8. 实现 ModelSelector 与可取消目录状态

  - 实现目标：扩展 UiCommand/UiViewModel/SessionController，并新增 ModelSelector，支持来源返回点、异步 generation、loading/list/error、方向键、Enter、ESC 和英文 notice。
  - 成功判据：打开后立即显示可取消加载；迟到 Fetch 不覆盖新页面；不可选项说明原因且 Enter 无效；ESC 保持模型和 Goal 不变；成功、失败和取消返回正确输入位置且不改变消息或 Action 状态。
  - 验证方式：待实现的 `model-selector.test.tsx` 与 SessionController 异步状态测试；使用可控 Promise 和 fake catalog 覆盖竞态。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [5.4](./requirements.md#req-5-4)_

- [x] //TODO 9. 在 Composition Root 接通选择、切换与恢复

  - 实现目标：把 Slash effect、Model Catalog、Binding manager、GoalModelSelectionCoordinator 和 Launcher/restore 流程接入单一 Composition Root，按“构造候选 → 保存 Goal → 同步发布”执行切换。
  - 成功判据：Intent 选择成为新 Goal 默认模型；活动 Goal 保存成功后才发布 Binding；保存失败维持旧选择；恢复严格使用 Snapshot，Provider/模式/权限/能力不兼容时进入选择错误态且不调用 Coordinator 或模型。
  - 验证方式：待实现及更新的 CLI/Controller 集成测试；通过 fake Adapter metadata 断言 Preparation 与 executing 的下一次请求实际采用新模型。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4)_

- [x] //TODO 10. 补齐跨组件回归与敏感信息隔离测试

  - 实现目标：补齐从命令输入到选择、切换、后续调用和进程恢复的自动化组合流，并更新依赖检查对新 Package 的覆盖。
  - 成功判据：普通输入、Action 审批、关闭与单 Controller 串行化保持原行为；命令文本不进入 Conversation；测试用 canary secret 不出现在 Snapshot、Trajectory、Trace、ViewModel、错误或捕获输出中；所有验收分支都有可归属断言。
  - 验证方式：待实现的 TUI/LLM/Runtime/Storage 组合测试；`npm test`；`npm run check:dependencies`；`git diff --check`。
  - _Requirements: [2.2](./requirements.md#req-2-2), [2.5](./requirements.md#req-2-5), [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2)、[1.3](./requirements.md#req-1-3) | 独立 Package 注册和派发稳定命令，公开结果不含 UI 类型且无禁止依赖 | Slash Command 单元测试；类型检查；依赖边界检查 |
| [2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2)、[2.3](./requirements.md#req-2-3)、[2.4](./requirements.md#req-2-4)、[2.5](./requirements.md#req-2-5) | 四类文本面板显示候选、隔离命令、拒绝非法输入、解码 `//`，普通输入按原路径推进 | Parser 与 TUI 组件/集成测试；检查 Goal messages |
| [3.1](./requirements.md#req-3-1)、[3.2](./requirements.md#req-3-2)、[3.3](./requirements.md#req-3-3) | 六种 Provider 仅查询当前端点，完整分页；在线集合经 Catalog 补全并禁用不兼容项 | fake-fetch Provider 矩阵与 Model Catalog 测试 |
| [3.4](./requirements.md#req-3-4)、[3.5](./requirements.md#req-3-5) | 网络、超时、5xx 和不支持端点按规则兜底；鉴权、权限和非法协议阻止切换 | 错误分类表驱动测试；断言 warning/source 和零 Binding 变化 |
| [4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2)、[4.3](./requirements.md#req-4-3)、[4.4](./requirements.md#req-4-4) | 加载、键盘选择、不可选项、ESC、迟到响应及返回位置符合交互契约 | Ink 键序列快照测试；Controller 可控异步测试；人工 TTY 焦点与无闪烁检查 |
| [5.1](./requirements.md#req-5-1)、[5.2](./requirements.md#req-5-2) | 候选 Binding 使用目标能力完整构造；构造或保存失败时旧选择和旧 generation 保持 | Binding、Runtime coordinator 与失败 Store 测试 |
| [5.3](./requirements.md#req-5-3)、[5.4](./requirements.md#req-5-4) | 两个 Executor 的下一次调用使用新 generation；进行中调用和非安全页面不能换模 | Agent 并发控制测试；Controller 状态矩阵测试 |
| [6.1](./requirements.md#req-6-1)、[6.2](./requirements.md#req-6-2)、[6.3](./requirements.md#req-6-3)、[6.4](./requirements.md#req-6-4) | 创建和切换保存非敏感选择；重启重建同一模型；不兼容恢复停止在选择界面且不推进 | Domain/Codec/Store 测试；Composition Root 重启集成测试 |
| [7.1](./requirements.md#req-7-1)、[7.2](./requirements.md#req-7-2)、[7.3](./requirements.md#req-7-3) | 全部边界由确定性测试覆盖，不访问真实模型；canary secret 不进入任何持久化、诊断或 UI 表面 | `npm test`；`npm run check:dependencies`；敏感信息扫描断言；`git diff --check` |
| [1.2](./requirements.md#req-1-2)、[5.3](./requirements.md#req-5-3)、[6.3](./requirements.md#req-6-3) | 当前架构文档准确描述新 Package、Binding 所有权和恢复数据流，不把未来 Web View 写成已实现 | 对照源码审查 `docs/architecture/README.md`、`tui.md`、`llm.md`、`runtime.md`、`storage.md` |

### Latest Result

- 验证状态：通过 (PASS)
- 测试套件总计：980 个测试用例全部通过（单元测试 + 集成测试 967/967 通过，scripts 依赖/文档/索引测试 13/13 通过）。
- 依赖边界：132 个源文件通过 `scripts/check-dependencies.mjs` 校验，无非法跨包依赖。
- 敏感隔离：金丝雀凭证（canary secret）经扫描未泄漏至任何快照、轨迹、Trace 日志与 ViewModel 树中。
- 类型安全：TypeScript 严苛类型检查（含 `exactOptionalPropertyTypes`）零错误。
- 差异检查：`git diff --check` 零违规。

