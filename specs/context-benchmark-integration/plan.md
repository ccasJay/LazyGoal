# Context Benchmark 自动化底座执行计划

依据已批准的 [Spec](./spec.md)，按以下顺序实现。任务采用先建立行为断言、再实现、最后运行相关回归的顺序；新增测试与命令在下文标为待实现，不表示目前已经存在。完成任务只修改复选框，保留 `//TODO` 原文。

实现集中于 `benchmarks/context/` 与必要的共享 benchmark 组装。CLI 使用 `lazygoal eval context capture`、`lazygoal eval context run`，人工冻结使用 `lazygoal eval context freeze`；freeze 只管理候选和版本，不启动模型执行。各执行入口接受显式配置与任务过滤，不自动选择模型或修改用户配置。已有工作树修改属于前一个功能，不纳入本功能提交。

## 任务清单

- [x] //TODO 1. 提供可保持与恢复 Goal 的共享 Headless 会话，接入真实 context lookup 和完整模型输入记录
  - 落实标准：[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[2.3](./spec.md#spec-req-2-3)、[6.1](./spec.md#spec-req-6-1)。
  - 实施目标：在 `benchmarks/src/headless-composition-root.ts` 提取满足 launch、continue、resume、restore 和 close 的最小会话组装，让原 `run(task)` 复用组装并保持单 Run 返回及清理契约。扩展共享持久化绑定和 `file-persistence-adapter.ts`，使用既有 ModelInputStore 与检索索引设施；将同一 lookup port 注入 Runner 与 Coordinator。恢复从当前 Snapshot 出发，不改写 frozen Profile 或回放旧模型请求；采集、执行适配器可不同，但检查点的 Profile 与声明预算必须与评测配置相符。新增或扩展公共接口附中文契约 TSDoc 和最小示例，同步共享层 README、overview 与 semantics。
  - 先验证再实现：扩展 `benchmarks/test/headless-composition-root.test.ts`、`file-persistence-adapter.test.ts`，断言两个 Run 使用同一 Goal、等待回答沿用 Run、重建会话能读 committed histories、每次模型调用都有输入记录、检索不越过提交边界。单任务返回、失败及幂等 close 的既有断言保持。验证入口：`npx tsx --test benchmarks/test/headless-composition-root.test.ts benchmarks/test/file-persistence-adapter.test.ts`。

- [x] //TODO 2. 用固定脚本自动推进 Docker 内的多 Run 与等待恢复，并隔离未来消息
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[6.1](./spec.md#spec-req-6-1)、[6.3](./spec.md#spec-req-6-3)。
  - 实施目标：建立 `benchmarks/context/src/` 的场景解析、脚本驱动、EnvironmentSpec 与 ACP Worker。宿主保存完整阶段脚本，每次只发送当前操作及消息；Worker 调用 TODO 1 的会话入口，返回持久化后的状态和 Run 身份。使用 `IsolatedEnvironment.runAgent` 组织有界 ACP 交互与宿主 LLM RPC；仅在现有客户端无法表达必要交互时，给共享客户端增加最小会话能力，不增加另一套 Docker 生命周期。通过 `buildBenchmarkWorker` 内嵌模板，默认无网络、无宿主挂载，沿用镜像缓存与进程基线。冻结阶段、调用、单步与总时长预算，超限取消；状态不匹配停止推进；预期失败允许 continue。取消和错误均回收资源。
  - 先验证再实现：新增待实现 `context/test/script-driver.test.ts`、`worker-protocol.test.ts`、`environment-spec.test.ts`；从文件与 ACP JSON 边界验证脚本和操作，覆盖正常 continue、waiting resume、预期失败、错状态及错等待类型、预算超限和取消。检查 Worker 接收内容及模型输入均不含未来 prompt、隐藏判据或完整脚本。入口：`npx tsx --test benchmarks/context/test/script-driver.test.ts benchmarks/context/test/worker-protocol.test.ts benchmarks/context/test/environment-spec.test.ts`。

- [x] //TODO 3. 自动采集安全检查点并在新容器与新 Worker 中校验恢复
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[6.2](./spec.md#spec-req-6-2)。
  - 实施目标：实现候选采集、检查点清单和导入。capture 执行到声明的终态或 waiting 边界后暂停脚本推进，确认提交完成，停止 Worker 并核对任务子进程退出，再回收当时 Snapshot、所需历史、模型输入和限定工作区归档；不靠最终日志重建过去状态。归档排除秘密、宿主文件和隐藏评分材料，解包路径限制在声明工作区。记录镜像身份、当前持久化契约、脚本位置、采集角色、实际 Worker/模板/源码内容摘要及文件哈希。恢复复制到独立命名空间，保留 Goal/Run/事件身份及关系，不以随意改写 ID 破坏引用；检索索引按真实 committed histories 重建。材料无效或进程未静止时保留失败诊断，不发布有效检查点、不静默重采集。
  - 先验证再实现：新增待实现 `context/test/checkpoint.test.ts`、`capture.test.ts`，覆盖捕获时与后续文件变化的区分、等待 Snapshot、历史多 Run 引用、hash/镜像/协议/Profile 不匹配、文件缺失、不安全归档路径、未完成副作用与残留进程拒绝。验证实际构建摘要能区分同一 HEAD 下的不同源码及模板内容。入口：`npx tsx --test benchmarks/context/test/checkpoint.test.ts benchmarks/context/test/capture.test.ts`；真实新进程恢复在 TODO 7 的 Docker 探针验证。

- [x] //TODO 4. 通过人工批准冻结候选与核心集、挑战集版本
  - 落实标准：[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)。
  - 实施目标：实现候选审核材料和 freeze 命令，要求显式指定候选内容身份、批准人和集合归属；冻结前核对脚本、环境、检查点、可执行判据、rubric 与来源齐全且哈希有效。以冻结清单保存批准时间和内容身份，拒绝覆盖既有版本。修改 prompt、材料或评分规则产生待复核候选；挑战集晋升需新的明确批准。运行前按清单校验全部选中用例，损坏用例不得以原版本参与评测。
  - 先验证再实现：新增待实现 `context/test/corpus.test.ts`、`cli.test.ts` 的冻结场景，覆盖未批准不得入库、缺少判据、旧哈希批准拒绝、相同版本覆盖拒绝、内容变化需新批准和挑战集晋升。入口：`npx tsx --test benchmarks/context/test/corpus.test.ts benchmarks/context/test/cli.test.ts`。验收时使用受控验证候选的明确审核操作，不把 capture 成功视为批准。

- [x] //TODO 5. 对冻结用例执行恢复与从头两组隔离评测，并保留可配对性和成本来源
  - 落实标准：[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[6.4](./spec.md#spec-req-6-4)。
  - 实施目标：实现配对 runner，恢复组从检查点执行剩余脚本，从头组从固定初始环境执行完整脚本；每组单独分配容器、目录和 attempt。配对前冻结执行适配器、Profile、预算政策和评分身份，核对 Snapshot 内实际配置，不通过改写 Snapshot 伪造一致性。分别记录采集、恢复续接与完整执行成本，保留两组前缀来源及最终产物差异。一组中断仍归档另一组及计划/尝试/完成/未完成数量；配置漂移明确标记不可配对。模型输入暴露、检索及引用只作为观测。
  - 先验证再实现：新增待实现 `context/test/paired-runner.test.ts`，断言组间写入不相互可见、恢复仅执行剩余阶段、从头完整执行、配置不一致拒绝有效配对、单组失败不会丢失另一组结果、缺失 usage 不填零、采集不计入执行成本。入口：`npx tsx --test benchmarks/context/test/paired-runner.test.ts`。

- [x] //TODO 6. 在 agent 停止后执行确定性 verifier 与独立 Judge，并保存逐项评分证据
  - 落实标准：[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5)。
  - 实施目标：实现宿主评分编排和 Judge 角色配置，使用冻结的可执行判据验证文件、测试、状态及声明证据约束。由共享环境清理 Worker 并确认新增进程退出，再执行独立 verifier；隐藏检查材料只在此时注入评测进程，不由 agent 工具执行。保留被评产物身份和评分前后检查，判据不得修补产物。Judge 在宿主使用独立角色配置，只接收指定输出、rubric 与审计证据，保存请求响应、依据、配置及用量。确定性失败或隔离违规使综合验收失败；Judge 缺失或无效保留为未完成，不覆盖已知失败、不转成零分；成功须两类检查同时满足。
  - 先验证再实现：新增待实现 `context/test/evaluator.test.ts`、`judge.test.ts`、`grading-isolation.test.ts`，覆盖确定性通过/失败、Judge 高分不能覆盖失败、非法引用、Judge 格式错误/请求失败/证据缺失、缺失用量、残留进程阻止评分和产物被修改的拒绝结果。入口：`npx tsx --test benchmarks/context/test/evaluator.test.ts benchmarks/context/test/judge.test.ts benchmarks/context/test/grading-isolation.test.ts`。

- [x] //TODO 7. 接通 CLI、可追溯报告和必要验证场景，完成底座端到端验收
  - 落实标准：[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4)、[6.5](./spec.md#spec-req-6-5)，并整体验证需求 1–5。
  - 实施目标：在 `bin/lazygoal.cjs` 分发 context 命令，补齐参数解析、角色配置预检和任务过滤，使用 workspace-scoped 默认目录与共享 AttemptRecorder，不扩展其状态枚举。输出逐组 JSON 和英文可读报告，定位脚本消息、Snapshot、trajectory、模型输入、评分记录和构建身份；行为失败、脚本差异、评分未完成、基础设施错误分别呈现，分母保留所有计划样本。新增少量底座 smoke 材料及待实现 `worker-smoke.ts`、`model-smoke.ts`；离线 Worker 替身只用于设施探针，真实模型验证使用实际采集/执行/Judge 配置。将 context 纳入 `benchmarks/package.json` 测试、typecheck 范围及 docs/dependency 检查；维护 `benchmarks/context/README.md`、`notes/overview.md`、`notes/semantics.md`、`notes/usage.md`，更新共享说明、根导航和 `AGENTS.md` 的目录。
  - 先验证再实现：新增待实现 `context/test/report.test.ts`、`cli.test.ts` 和必要的共享 package-wiring 回归，断言新命令不误入 web server，配置缺失在模型调用前失败，报告分类和分母正确。入口：`npx tsx --test benchmarks/context/test/*.test.ts benchmarks/test/package-wiring.test.ts`。新增包命令 `context:worker-smoke`、`context:model-smoke`，验证捕获、明确审核冻结、配对执行与报告全链；执行完整 Feature Verification 并在下方保存当前代码与 Spec 指纹及证据。

## Feature Verification

### Planned Checks

新增测试文件与 smoke 命令均为待实现入口。真实模型探针使用执行时明确选择的有效配置，模型配置路径、实际模型身份、预算和证据位置记录于 Latest Result；缺 Docker、镜像或模型权限时记为 blocked，不能用 mock 成功代替。

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
| --- | --- | --- | --- |
| 消息身份与跨 Run 推进 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2) | 固定脚本自动注入两段消息；持久化真实用户身份，同一 Goal 创建新 Run，历史和文件保留，每段能定位触发事件 | `script-driver.test.ts`、`headless-composition-root.test.ts`；Docker 与真实模型 smoke 的消息/Run 记录 |
| 等待与进程恢复 | [1.3](./spec.md#spec-req-1-3) | 在 waiting 捕获，停止旧 Worker，启动新容器/Worker 后通过 resume 接收预设回答，Run 身份不变，提交前文件保留 | `checkpoint.test.ts`；两级 smoke 的进程身份及 Snapshot/文件证据 |
| 意外状态与预算 | [1.4](./spec.md#spec-req-1-4) | 错状态、错等待类型、调用/阶段/时长预算终止，不发送下一段 prompt，并回收资源 | `script-driver.test.ts`、`worker-protocol.test.ts`、`environment-spec.test.ts` |
| 预期失败后重试 | [1.5](./spec.md#spec-req-1-5) | 受控失败满足脚本触发条件，随后 continue；综合评分依据完整场景而非首个失败 | `script-driver.test.ts`；Docker smoke 的自动 continue 记录 |
| 显式采集与输入归档 | [2.1](./spec.md#spec-req-2-1) | 采集角色配置有效，candidate 含 committed histories 和每次模型输入，状态保持未入库 | `capture.test.ts`、`file-persistence-adapter.test.ts`；真实模型 capture 产物 |
| 安全捕获时序 | [2.2](./spec.md#spec-req-2-2)、[2.4](./spec.md#spec-req-2-4) | 捕获文件与当时 Snapshot 对齐；后续变更不污染检查点；残留进程或未提交操作阻止发布 | `checkpoint.test.ts`、`capture.test.ts`；Docker 进程基线证据 |
| 检查点校验与真实恢复 | [2.3](./spec.md#spec-req-2-3) | 有效包在新容器恢复；篡改哈希、镜像/协议/Profile 不符、缺历史或不安全路径明确拒绝，不重采集 | `checkpoint.test.ts`；Docker smoke 的包哈希和恢复路径 |
| 审核材料完整性 | [3.1](./spec.md#spec-req-3-1) | 审核材料可查看；缺判据、rubric、来源或必需材料不能冻结 | `corpus.test.ts`、CLI 审核输出 |
| 明确批准与内容身份 | [3.2](./spec.md#spec-req-3-2) | freeze 记录批准人/时间/哈希；改 prompt 或 rubric 变为新待复核候选；旧批准不覆盖新内容 | `corpus.test.ts`、`cli.test.ts` |
| 集合版本与晋升 | [3.3](./spec.md#spec-req-3-3) | 核心/挑战集不可覆盖；晋升需要新批准；运行拒绝篡改，报告保存版本 | `corpus.test.ts`、`cli.test.ts`、`report.test.ts` |
| 配对隔离及完整脚本 | [4.1](./spec.md#spec-req-4-1) | 两个容器/目录独立；恢复执行后缀，从头执行完整脚本；组间文件写入不传播 | `paired-runner.test.ts`；Docker smoke 的容器、目录和阶段证据 |
| 配对配置一致性 | [4.2](./spec.md#spec-req-4-2) | 两组实际执行配置一致，保留教师来源；任何相关配置漂移都显示不可配对 | `paired-runner.test.ts`、`report.test.ts` |
| 成本归属 | [4.3](./spec.md#spec-req-4-3) | 采集、恢复后缀与从头完整成本分开，并呈现各自前缀来源 | `paired-runner.test.ts`、`report.test.ts`；真实模型用量记录 |
| 失败样本与分母 | [4.4](./spec.md#spec-req-4-4) | 一组中断仍保留另一组；计划、尝试、完成、未完成、可配对数量均可复核 | `paired-runner.test.ts`、`report.test.ts` |
| 真实产物检查 | [5.1](./spec.md#spec-req-5-1) | 冻结判据检查文件/测试/状态/证据；agent 自述完成但文件错误时明确失败 | `evaluator.test.ts`；Docker verifier 输出及原始产物 |
| 独立 Judge 与追溯 | [5.2](./spec.md#spec-req-5-2) | Judge 角色显式配置，原始请求/响应、rubric、依据及用量可定位 | `judge.test.ts`；真实模型 smoke 的 Judge 记录 |
| 综合结果优先级 | [5.3](./spec.md#spec-req-5-3) | 确定性失败/隔离违规加 Judge 高分仍失败；两类均满足门槛才通过 | `evaluator.test.ts`、`grading-isolation.test.ts` |
| 评分缺失 | [5.4](./spec.md#spec-req-5-4) | Judge 网络/格式错误、证据不足保留未完成；已知失败保持失败；缺失 usage 显示不可用 | `judge.test.ts`、`report.test.ts` |
| 隐藏材料与进程隔离 | [5.5](./spec.md#spec-req-5-5) | 执行阶段工具/文件/模型输入看不到未来 prompt、verifier 或 rubric；残留进程阻止评分；verifier 不改产物 | `grading-isolation.test.ts`、Docker smoke 的隐藏材料探针及进程检查 |
| 共享设施与镜像行为 | [6.1](./spec.md#spec-req-6-1) | 容器无网络、宿主凭据和挂载，模型经 RPC；模板内嵌；缓存镜像不重拉、自定义镜像不重复安装；路径 base64url 正确 | `environment-spec.test.ts`、共享环境/Worker 回归、`context:worker-smoke` |
| 实际执行身份 | [6.2](./spec.md#spec-req-6-2) | 同一 HEAD 下改源码或模板产生不同摘要，报告包含实际 Worker/配置/镜像/集合/判据身份及输入索引 | `capture.test.ts`、`report.test.ts`；回收构建清单 |
| 错误分类与回收 | [6.3](./spec.md#spec-req-6-3) | 正常、取消、基础设施故障均关闭 Worker/RPC/容器；各类失败原因分开可读 | `environment-spec.test.ts`、共享隔离测试、`report.test.ts`；Docker 结束后的资源检查 |
| 报告可复核性 | [6.4](./spec.md#spec-req-6-4) | JSON 与可读报告含逐组结果/成本/分母/context 违规；观测命中不被当作使用信息或任务成功 | `report.test.ts`；真实模型 smoke 报告审计 |
| 三级设施与真实模型全链 | [6.5](./spec.md#spec-req-6-5) | 离线契约、真实 Docker、真实采集/执行/Judge 均验证通过，包含自动跨 Run、等待恢复、配对与评分，不以替身覆盖真实模型门槛 | `npm --prefix benchmarks run context:worker-smoke`；`npm --prefix benchmarks run context:model-smoke -- --config <显式配置文件>` |
| 受影响回归与文档 | 需求 1–6、Spec 实现边界 | 共享单 Run 行为无回归，context 文件进入类型/测试检查；依赖无跨 benchmark 引用，模块导航与说明有效 | `npm --prefix benchmarks run typecheck`、`npm --prefix benchmarks run test`、`npm run check:dependencies`、`npm run check:docs`、`git diff --check`，最后执行 `npm test` |

### Latest Result

- 状态：passed；freshness: current。用户授权改用 `gemini-3.6-flash-high` 的一次完整验收通过；全部 TODO 完成，Spec 已交付。
- 验证时间：2026-10-12T13:36:23.464523+08:00；构建、实际模型和各组证据见 [验证记录](./verification/latest.json)。
- 两次采集完成；continue 与 resume 的恢复组、从头组均通过确定性检查和独立 Judge（均为 1 分），两对均可配对。新 Worker 保持同一 Goal；continue 创建新 Run，resume 沿用 Run。当前执行 Run 的 Trace 未发现 model_error。
- 实际 Worker buildDigest 与宿主 sourceDigest 和此前回归完全相同，复用 Agent/Runtime 261 项、benchmark 286 项、全量 1683 项 TypeScript、33 项脚本及 198 项 Python，以及类型、文档、依赖和 Docker 探针证据。本次仅切换三个角色的模型，未修改实现、schema、预算或评分门槛。
- 使用隔离临时 Home 覆盖 `default` 的模型字段，临时凭据已删除，全局配置不变。原 default 失败仍保存在 [此前记录](./verification/pre-flash36.json)；一次成功不证明原失败原因已修复或广泛 context 质量提升。

### TODO 7 重试（2026-10-12）

- 验证时间：2026-10-12T11:06:49.988634+08:00；仍使用三个 default 角色，未修改实现、场景或验收门槛。
- 命令：`npm --prefix benchmarks run context:model-smoke -- --config specs/context-benchmark-integration/verification/model-config.json`；退出码 1。
- 本次证据：`/Users/sawyerlau/.lazygoal/workspaces/ff6ceb47b1fee227489f8feb89dda49e5242f8870a6aeaddc408d14c44627d1a/benchmarks/context/runs/model-smoke-dba7ae8c-a829-43af-a75c-d86f054d1635`。continue capture 调用 6 次后行为失败：连续三次 `extra_field`，路径为顶层 `protocolVersion`，随后 `INVALID_AGENT_DECISION`。未生成该场景的有效检查点。
- resume capture 完成（7 次调用），恢复组（5 次调用）与从头组（9 次调用）均完成，确定性检查通过，独立 Judge 均为 1.0，综合结果 passed。
- 资源检查：结束后 `docker ps` 无运行容器。此前静态、单元、Docker 与全量回归证据保留，本次未重复执行。完整真实模型门槛仍为 failed，TODO 7 保持未完成，Spec 保持 proposed。

### 带 Trace 的 TODO 7 重试（2026-10-12）

- 验证时间：2026-10-12T12:25:50.910702+08:00；三个角色仍为 default。真实模型命令退出码 1。
- 证据：`/Users/sawyerlau/.lazygoal/workspaces/ff6ceb47b1fee227489f8feb89dda49e5242f8870a6aeaddc408d14c44627d1a/benchmarks/context/runs/model-smoke-5da01f12-2c50-4b57-98b2-d3f3f2a221bc`；非法调用、实际 Adapter 请求 schema 与校验问题见 [关联诊断](./verification/invalid-responses.json)。
- continue capture 行为失败（6 次调用）：system_complete_task 前两次多出 protocolVersion，第三次还缺少 summary；三次纠错后 INVALID_AGENT_DECISION。
- resume capture 完成（4 次调用）；恢复组（3 次调用）与完整组（9 次调用）均 completed，综合评分 passed。
- benchmark 286 项测试通过。检索 fixture 查询用户对话时使用 historical_execution 与当前来源边界冲突，已改为 conversation_history，保留同一历史 Run 命中断言。
- Docker 无残留运行容器；diff 检查通过。全量回归保留为此前证据，本次未重复；TODO 7 仍未完成，Spec 未 delivered。

### 已批准的输出契约纠错修复

- 将 runtime_feedback 放在请求末尾；其他阶段消息、动态 Section、原生历史和 Working Memory 保留。
- 已声明原生工具 Object 参数校验失败时，在 Agent 异常上附工具名和字段形状；转换为现有有界 constraints，不回传参数值，不改变 RuntimeFeedback 持久化结构。
- 非法 JSON、未知工具无形状提示；严格校验及三次上限保留。公共契约 TSDoc 与模块说明已同步。
- 验证覆盖安全形状、非法 JSON/未知工具、实际请求顺序及提交反馈恢复。小样本对照与全链使用同一 default 配置，所有结果保留。
- 首轮保留 Working Memory 协议字段；仍有真实失败，下一步检查 SDK 出站 schema 与中间服务，不继续叠加字段专用 prompt。

### 3.6 Flash 验收重试（2026-10-12）

- 用户授权三个角色改用服务提供的 `gemini-3.6-flash-high`；单次全链命令退出 0。两次 capture、四个配对组均完成，确定性判据与 Judge 同时通过。
- 原始轨迹、输入、构建身份及评分保留在 [本次记录](./verification/flash36-run.json)。Docker 无运行容器；临时配置已清理。TODO 7 只修改复选框，未改变任务内容。
