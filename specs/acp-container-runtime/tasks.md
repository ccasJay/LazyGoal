# Implementation Plan

- [x] //TODO 1. 建立 `@lazygoal/acp` package 与依赖边界

  - 创建 package、入口导出、SDK 1.4.0 精确依赖、中文契约级 TSDoc 和最小示例；纳入依赖边界检查和 workspace 类型检查，并保持不依赖现有 Runtime、Agent、Storage、Tools 或 benchmark。
  - 成功判据：调用方能够从 package 入口导入公开 ACP 类型与工厂契约；依赖检查拒绝反向导入；待实现的导出与 TSDoc 测试通过。
  - 验证方式：待实现的 `packages/acp/test/public-api.test.ts`；`npx tsc --noEmit`；`npm run check:dependencies`。
  - _Requirements: [1.3](./requirements.md#req-1-3)_

- [x] //TODO 2. 实现 ACP Agent 的 Session 生命周期与 Prompt 校验

  - 使用官方 SDK App API 实现 `initialize`、`session/new`、`session/prompt`、`session/cancel`，为每条连接拥有独立 Session Map、AbortSignal 和释放流程；校验绝对 cwd、空 MCP/额外目录、`Text` 与 cwd 内本地 `file:` `ResourceLink`，并按序交给 Session，拒绝其余非法内容。
  - 成功判据：能力声明不包含 load/resume、认证、客户端 FS 或终端；非法建会话和 Prompt 不创建副作用；合法请求只进入对应 Session。
  - 验证方式：待实现的 `packages/acp/test/agent-session.test.ts`；使用 SDK 内存 Stream 覆盖能力、路径、ResourceLink 和 JSON-RPC 错误。
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3)_

- [x] //TODO 3. 实现一次性 ACP Client 与并发取消契约

  - 实现 `connectWith` 生命周期的 initialize → newSession → prompt 流程、update 路由和终止结果收集，并在返回或异常时关闭连接及本地资源；为同一 Session 建立重入拒绝和取消终态仲裁，为不同 Session 保持并发隔离。
  - 成功判据：一次性 Client 在合法 Prompt 下返回终止结果；同 Session 并发请求被拒绝；不同 Session 可并发完成；断线后不再产生成功更新。
  - 验证方式：待实现的 `packages/acp/test/client-lifecycle.test.ts`；覆盖并发、cancel、断线和恰好一次 dispose。
  - _Requirements: [1.2](./requirements.md#req-1-2), [2.4](./requirements.md#req-2-4), [2.5](./requirements.md#req-2-5)_

- [x] //TODO 4. 实现有序有界的 ACP/LLM 双通道 Mux

  - 在 benchmark 进程边界实现版本化外层 NDJSON 帧、每方向单调 sequence、按字节限长解析、通道有界队列和单 writer 轮转调度，并向 ACP SDK 提供消息级 Stream；覆盖拆包、粘包、交错、背压和非法帧关闭。
  - 成功判据：ACP 与 LLM 帧不会互相误投或字节交错；合法帧保持顺序；任一非法帧不产生伪成功。
  - 验证方式：待实现的 `benchmarks/swebench/test/multiplex.test.ts`；注入任意 chunk 边界、交错发送、重复/跳号和 16 MiB 边界数据。
  - _Requirements: [4.3](./requirements.md#req-4-3), [5.3](./requirements.md#req-5-3)_

- [x] //TODO 5. 实现宿主 LLM RPC Client/Server 与取消传播

  - 实现 Worker `RpcLlmAdapter`、宿主 RPC Server、唯一 request ID、structured-output mode 固定、完整 `LLMRequest/LLMResponse` 转发和独立 pending map；将错误脱敏，连接关闭、Session cancel 或任务超时都中止宿主 Adapter。
  - 成功判据：容器不读取模型配置；有效生成只调用宿主 Adapter 一次并保留完整响应；供应商错误和取消结果可区分且不泄露凭据。
  - 验证方式：待实现的 `benchmarks/swebench/test/llm-rpc.test.ts`；覆盖 mode 不匹配、重复/未知 ID、provider failure、cancel race 和断线清理。
  - _Requirements: [4.2](./requirements.md#req-4-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4)_

- [x] //TODO 6. 构建可复现的 Linux amd64 Worker 产物

  - 使用 esbuild 生成包含 Prompt 资产的单一 ESM Worker，按入口、源码/锁文件摘要、构建参数、ACP SDK 与 Node 版本缓存并原子发布；从固定官方 Node 22.22.2 linux/amd64 镜像提取运行时，生成 identity manifest，禁止容器内 npm install。
  - 成功判据：相同输入命中相同摘要；源码、lockfile、SDK 或 Node 版本变化使缓存失效；并发构建不会暴露半成品。
  - 验证方式：待实现的 `benchmarks/swebench/test/worker-builder.test.ts`；覆盖缓存命中、输入变化、并发构建和 manifest 摘要。
  - _Requirements: [5.1](./requirements.md#req-5-1)_

- [x] //TODO 7. 接入容器注入与启动前预检

  - 扩展 `SwebenchContainer` 执行 `docker cp`、`docker exec -i` 和固定资源参数，将 Worker、Node 和 manifest 注入 `/opt/lazygoal`，保持 `/testbed` 无挂载、无网络和无凭据；实现 preflight 验证平台、Node、动态库、摘要、base commit 与 `conda testbed`，并隔离 Tool 子进程 stdio。
  - 成功判据：预检失败发生在首次模型调用和 Goal 副作用前并保留诊断；有效容器只能看到题目工作区和注入目录，不能看到模型凭据。
  - 验证方式：待实现的 `benchmarks/swebench/test/process-container.test.ts` 与 `worker-preflight.test.ts`；使用伪 ProcessRunner 断言 Docker 参数、凭据隔离和零模型调用。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.4](./requirements.md#req-4-4), [5.2](./requirements.md#req-5-2)_

- [x] //TODO 8. 在容器内装配 SWE-bench Headless Runtime

  - 为 Worker 接入真实 `HeadlessCompositionRoot`，固定 `/testbed`、`swebench-acp-profile` 五个 Tool、容器内 Storage 和确定性任务描述，以 metadata 隔离 instance/Goal/Run；问题描述经现有状态转换和自动批准进入 executing，题目之间不共享容器、Registry 或命名空间。
  - 成功判据：五个 Tool 直接读写 `/testbed`；Goal、Run、Storage 和 Tool Registry 在题目之间不共享；Headless Root 的状态事实仍由现有 Runtime 产生。
  - 验证方式：待实现的 `benchmarks/swebench/test/container-headless-runtime.test.ts`；使用临时 testbed、假 LLM 和真实 Headless Root 验证文件修改、确定性审批与隔离。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4)_

- [x] //TODO 9. 映射 Trajectory Tool 更新与 ACP Prompt 终态

  - 装饰 `TrajectoryStore`，在 `tool_started`/`tool_finished` 成功提交后发送稳定 actionId、Tool 类型、状态和有界结果的 ACP update；将完成、等待、步数耗尽、取消和基础设施错误映射为约定终态或协议错误，并填充校验后的 `_meta`。
  - 成功判据：Tool 更新只属于对应 Session；正常/上限/取消终态可区分；通知失败和 Runtime 基础设施异常不会形成成功终态。
  - 验证方式：待实现的 `benchmarks/swebench/test/acp-result-projection.test.ts`；覆盖 Tool 失败、取消竞态、迟到模型响应、终态 metadata 和错误阶段。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.4](./requirements.md#req-6-4)_

- [x] //TODO 10. 接入单题 Supervisor 与有界产物回收

  - 用 ACP Client 驱动每题容器 Session，传播超时和 SIGINT/SIGTERM，按阶段记录错误；在宽限期内复制 Snapshot、Trajectory、Trace，并用 `/opt/lazygoal` 临时 `GIT_INDEX_FILE` 相对 base commit 导出 patch，任何单步失败都继续幂等清理。
  - 成功判据：正常、模型停止、步数耗尽、Runtime 错误、协议错误和取消均尽力保存可读取产物；宽限期结束后本次唯一容器必被删除；locator 只指向宿主 output。
  - 验证方式：待实现的 `benchmarks/swebench/test/evaluation-cleanup.test.ts`；使用伪容器注入每个导出步骤失败并检查顺序、超时和报告错误。
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

- [x] //TODO 11. 替换 SWE-bench 评测路径并更新报告

  - 将 `eval swebench` 从 `swebench_shell` 切换到 ACP 容器 Supervisor，更新当前报告 schema 与 `swebench-acp-container-v1` identity，保留完整 Manifest 分母和官方 `resolved` 唯一评分来源；同步更新 benchmarks README、架构文档、package 清单和仓库布局说明。
  - 成功判据：预测文件只提交成功导出的 patch；官方 grading 结果决定 resolved；旧 `swebench_shell` 与旧报告兼容分支不再对外暴露。
  - 验证方式：待实现的 `benchmarks/swebench/test/evaluation.test.ts`、`manifest-cli.test.ts` 和报告 fixture；执行 TypeScript/Python SWE-bench 回归。
  - _Requirements: [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_

- [x] //TODO 12. 完成组合回归与显式 Docker Worker 冒烟

  - 将 ACP、benchmark TypeScript/Python、真实 Headless Root、伪 Docker 边界、协议/模型失败和取消清理测试纳入确定性回归；新增 `swebench:worker-smoke`，在固定 linux/amd64 fixture 中验证 Node、动态库、Conda、双通道、隔离边界、宿主假模型和题目文件修改。
  - 成功判据：默认回归不依赖 Docker 或外部供应商；显式 smoke 能证明 Worker 真实启动；风险相关检查均有可定位的测试证据。
  - 验证方式：`npm test`；`npx tsc --noEmit`；`npm run check:dependencies`；`npm run typecheck --prefix benchmarks`；`npm run test --prefix benchmarks`；`npm run swebench:test-python --prefix benchmarks`；显式 `npm run swebench:worker-smoke --prefix benchmarks`；`git diff --check`。
  - _Requirements: [8.4](./requirements.md#req-8-4)_

- [x] //TODO 13. 修复 Google 原生 strict 执行协议

  - 将 Gemini strict 请求改用原生 `responseJsonSchema` 并保留对象联合的分支约束；为 executing 输出派生阶段专用 MemoryPatch 契约，排除 Runtime 阶段门禁止的 `create_plan_item`，同时保持 Planning 可创建 PlanItem。
  - 成功判据：Google 原生 strict Schema 保留 `anyOf`、`required` 与 `additionalProperties`；executing Schema、Shape Guide 和本地 decode 均拒绝 `create_plan_item`；真实单题不再在首轮因该协议矛盾失败。
  - 验证方式：Contracts 与 Gemini Adapter 定向测试；TypeScript、依赖、全仓库及 benchmark 回归；Docker Worker smoke；Google 原生单题与五题运行。
  - _Requirements: [3.1](./requirements.md#req-3-1), [4.2](./requirements.md#req-4-2)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2)、[1.3](./requirements.md#req-1-3) | 通过双向 Stream 启动 Agent，并由一次性 Client 完成初始化、Session、Prompt、更新、终态和释放；公开接口契约可导入且所有权明确 | ACP SDK 内存 Stream 契约测试；公开 API/TSDoc 测试（待实现） |
| [2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2)、[2.3](./requirements.md#req-2-3)、[2.4](./requirements.md#req-2-4)、[2.5](./requirements.md#req-2-5) | 能力只声明支持范围；cwd/MCP/额外目录和 Text/ResourceLink 校验准确；同 Session 重入被拒绝、跨 Session 隔离并发、断线停止更新并释放资源 | ACP Agent/Client 生命周期测试（待实现） |
| [3.1](./requirements.md#req-3-1)、[3.2](./requirements.md#req-3-2)、[3.3](./requirements.md#req-3-3)、[3.4](./requirements.md#req-3-4) | 每题在独立容器中运行真实 Headless Root、五个 Tool、`/testbed`、确定性 Preparation 和独立持久化 | Headless Root + 临时 testbed 集成测试（待实现）；伪容器参数检查 |
| [4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2)、[4.3](./requirements.md#req-4-3)、[4.4](./requirements.md#req-4-4) | 容器无网络/挂载/凭据；模型请求只到宿主 Adapter；ACP/LLM 路由互不污染；Tool 子进程不能继承控制通道 | RPC/安全边界测试（待实现）；伪 Docker 检查；真实 smoke |
| [5.1](./requirements.md#req-5-1)、[5.2](./requirements.md#req-5-2)、[5.3](./requirements.md#req-5-3) | Worker 与 Node 摘要可复现且注入在 `/testbed` 外；preflight 在模型和 Goal 副作用前失败；拆包/粘包/非法帧不产生伪成功 | WorkerBuilder、preflight 和 Mux 测试（待实现）；显式 Docker smoke |
| [6.1](./requirements.md#req-6-1)、[6.2](./requirements.md#req-6-2)、[6.3](./requirements.md#req-6-3)、[6.4](./requirements.md#req-6-4) | Tool update 有稳定 ID 和有界结果；终态、取消传播、迟到响应和阶段错误保持可区分；取消后无成功终态 | ACP 投影、RPC cancel、Runtime 集成和错误注入测试（待实现） |
| [7.1](./requirements.md#req-7-1)、[7.2](./requirements.md#req-7-2)、[7.3](./requirements.md#req-7-3) | 正常/异常/取消都尽力复制状态和导出 patch；宽限期有限且最终删除容器；locator 指向宿主可读文件 | Supervisor cleanup 测试（待实现）；伪容器逐步骤失败注入 |
| [8.1](./requirements.md#req-8-1)、[8.2](./requirements.md#req-8-2)、[8.3](./requirements.md#req-8-3)、[8.4](./requirements.md#req-8-4) | 新 CLI 路径保持退出与评分语义；报告身份完整；官方 `resolved` 是唯一成功事实；默认回归与显式 smoke 分离 | SWE-bench TS/Python、全仓库回归、依赖检查、`git diff --check` 和显式 Docker smoke |
| TODO 13；[3.1](./requirements.md#req-3-1)、[4.2](./requirements.md#req-4-2) | Google strict 请求保留执行决策联合与严格对象边界；executing 模型契约不再提供 Runtime 禁止的 `create_plan_item` | Gemini/Contracts 定向测试；Google 原生单题；单题通过后执行五题 |

### Latest Result

验证时间：2026-09-09（Asia/Shanghai）。被测树基于 `b7edc84`，实现与文档 diff SHA-256 为 `942f21f05653d052596185b3b44fb6bc00329c8cc59b762024fce81509268201`；该树随后提交为 `3fe7ae9`。契约：`structured@1`、`swebench-acp-container-v1`、ACP SDK `1.4.0`、Google Gen AI SDK `2.15.0`。

- **passed**：`npm test` 通过 783 个 TypeScript/TSX 测试与 11 个脚本测试；`npx tsc --noEmit`、`npm run check:dependencies`、benchmark typecheck、108 个 benchmark 测试、5 个 Python 测试及 `git diff --check` 均通过。
- **passed**：Contracts/Gemini 定向测试共 83 项通过；executing Schema、Shape Guide 与 decode 拒绝 `create_plan_item`，Planning 仍允许创建；Google 请求使用 `responseJsonSchema` 并保留 `anyOf`、`required` 与 `additionalProperties`。
- **passed**：`SWEBENCH_PYTHON=/Users/sawyerlau/Project/LazyGoal/.lazygoal/swebench-venv/bin/python npm run swebench:worker-smoke --prefix benchmarks` 通过，固定 Worker SHA-256 为 `bbecd51b4445b02ef55e3a63dd159f50915c15db1fb7ccd0b22ac502af977317`。
- **failed**：本地 `http://127.0.0.1:8317/v1beta` 上的 `gemini-3.1-flash-lite` 未遵守 native strict 的复杂执行 Schema，见 `.lazygoal/benchmarks/swebench-runs/google-native-single-fixed-20260909-1805/`；Google 原生 `prompt_only` 已连续解析并执行两轮 Tool、导出 847-byte patch，随后供应商请求失败，见 `.lazygoal/benchmarks/swebench-runs/google-native-prompt-single-fixed-20260909-1820/`。`gemini-3.6-flash-high` 在当前 `responseJsonSchema` 路径返回旧式 `action/toolID/rationale` 结构，见 `.lazygoal/benchmarks/swebench-runs/google-native-strict-36-single-20260909-1900/`；受控 `responseSchema` 对照已生成正确决策外层，但遗漏 wire 契约要求的 nullable Tool 参数，见 `.lazygoal/benchmarks/swebench-runs/google-native-response-schema-36-single-20260909-1910/`。因单题未形成完整终态，五题按门禁未执行。

整体状态：**failed**。新鲜度：**current**。实现提交：`3fe7ae9`。

## Learning Candidates

### 本地 Google 原生代理的复杂结构化输出能力需要实测

- 适用范围：通过可覆盖 `LLM_BASE_URL` 的 Google 原生端点运行复杂 `structured@1` 决策 Schema。
- 观察：本地代理接受 `responseJsonSchema` 请求，但 `gemini-3.1-flash-lite` 返回旧式 Tool 形状；`responseSchema` 路径也会遗漏 wire 契约要求的 nullable 字段。相同模型在 `prompt_only` 下能生成并执行合法决策。
- 已验证做法：Adapter 继续发送官方 `responseJsonSchema` 并保持本地严格解码；端点不能可靠执行该字段时显式选择 `prompt_only`，不得修复响应或静默降级。
- 证据：上述两个真实单题目录、Gemini Adapter 定向测试和 Google 原生请求集成测试。
- 限制与复查条件：结论只覆盖 2026-09-09 的本地代理及 `gemini-3.1-flash-lite`、`gemini-3.6-flash-high`；代理升级、其他模型或官方端点凭据可用后，应重新运行 strict 单题，成功后再执行五题。
