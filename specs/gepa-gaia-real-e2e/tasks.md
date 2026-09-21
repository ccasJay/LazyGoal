# 实施任务

- [x] //TODO 1. 实现 GAIA validation 单任务 Manifest 物化器

  - 实现目标：在 `benchmarks/gaia` 增加从用户指定源 Manifest 按 task ID 物化单任务 Manifest 的入口，复用现有 GAIA 校验并补充首阶段 validation、Level 1、非空 `expectedAnswer`、绝对 `dataRoot`、无附件和路径边界检查。
  - 成功判据：有效 task 只生成一个与声明一致的任务且源 Manifest 不被修改；test、重复 task、缺失答案、无效数据根目录、附件或越界路径在模型调用前返回可定位错误。
  - 验证方式：新增 `benchmarks/gaia/test` 物化器与边界测试（待实现）；执行 `npm --prefix benchmarks test -- gaia/test/manifest.test.ts` 或等价的定向测试。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [7.1](./requirements.md#req-7-1), [7.3](./requirements.md#req-7-3)_

- [x] //TODO 2. 将单任务 Manifest 接入 GEPA Dataset 校验与请求边界

  - 实现目标：扩展 `prompt-evaluation/gepa` 的 Dataset/Protocol 校验，使 GAIA 请求强制使用 `gaia`、非空 trainset、单任务 Manifest、唯一 sample/task，并让 validation 集在存在时满足相同约束且不与 trainset 重复。
  - 成功判据：空 validation、非正 metric 预算、重复样本、跨 benchmark、多任务 Manifest、taskId 不一致和无效物化产物均在 Worker 或模型启动前返回稳定协议错误。
  - 验证方式：扩展 `prompt-evaluation/gepa/tests/test_dataset.py`、协议测试和请求读取测试（待实现）；执行 `npm run test:gepa-adapter`。
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.4](./requirements.md#req-4-4), [6.1](./requirements.md#req-6-1)_

- [x] //TODO 3. 物化并校验 GAIA 基准 Profile，冻结候选字段

  - 实现目标：增加 benchmark-owned 的 GAIA Profile JSON 物化/校验入口，以 `GAIA_WORKER_PROFILE` 为唯一语义来源；接入 Worker metadata 校验，允许候选只改变 `systemPrompt` 和 `instructions`。
  - 成功判据：物化文件与 Worker 常量的身份、工具列表和 Prompt 完全一致；非 `gaia-worker-profile`、工具白名单、提交协议、结构化输出模式或其他冻结字段发生变化时，preflight/Worker 在模型调用前拒绝。
  - 验证方式：新增 GAIA Profile 物化与 Worker runtime 测试（待实现），并扩展 `benchmarks/test/prompt-evaluation/profile.test.ts`；执行 `npm --prefix benchmarks test -- gaia/test/prompt-evaluation-adapter.test.ts` 或等价定向测试。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.4](./requirements.md#req-3-4), [6.3](./requirements.md#req-6-3)_

- [x] //TODO 4. 暴露 Profile 路径并完善 GEPA 生命周期冻结与 preflight

  - 实现目标：为 GEPA `preflight`、`start`、`resume` 增加显式 `--profile-path`，放宽 Profile ID 为稳定非空标识，冻结目标路径与摘要，并让 preflight/status/report 使用同一份生命周期 Manifest。
  - 成功判据：GAIA 使用专用 Profile 路径而不回退通用 default；摘要包含 benchmark、train/validation 数量、预算、两侧模型和目标 Profile；运行中目标文件漂移时阻止 resume/publish 且不覆盖文件，preflight 失败不创建 Worker、容器或模型调用。
  - 验证方式：扩展 `prompt-evaluation/gepa/tests/test_lifecycle_controller.py`、`test_lifecycle_resume.py`、CLI 测试（待实现）；执行 `npm run test:gepa-adapter`。
  - _Requirements: [3.3](./requirements.md#req-3-3), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [5.3](./requirements.md#req-5-3), [6.4](./requirements.md#req-6-4)_

- [x] //TODO 5. 强化 GAIA Prompt Evaluation 的真实边界与权威结果映射

  - 实现目标：将 GAIA 单任务请求接入既有隔离 Docker、GAIA Worker、ACP/LLM RPC 和真实模型配置边界，确认候选 Profile 传递、Attempt/Goal Snapshot/Trajectory 定位和领域评分均来自公开 Prompt Evaluation 结果。
  - 成功判据：模型真实调用路径不替换为假模型；答案正确/错误分别得到 `passed`/`failed`，complete 文本和进度事件不能决定领域结果；容器、模型、协议、取消或持久化失败保持非领域状态并保留已回收产物。
  - 验证方式：扩展 `benchmarks/gaia/test/prompt-evaluation-adapter.test.ts`、`benchmarks/test/prompt-evaluation/runner.test.ts` 和 Prompt Evaluation CLI 集成测试（待实现）；执行 `npm --prefix benchmarks test -- gaia/test/prompt-evaluation-adapter.test.ts`。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [3.2](./requirements.md#req-3-2), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

- [ ] //TODO 6. 接通官方 GEPA 双模型最小生命周期

  - 实现目标：在 GEPA Worker/Adapter 中固定首轮 train/validation 配置、`seed=0`、`reflectionMinibatchSize=1` 和 `maxMetricCalls<=4`，复用 Prompt Evaluation 边界执行候选评测，并把 Working LM、Reflection LM、候选、预算、终态和发布状态写入公开生命周期状态/报告。
  - 成功判据：每个候选只使用 GAIA `passed`/`failed` 计算分数；基础设施、协议、模型、容器、持久化和取消错误不转换为零分；`status`/`report` 可在不读取内部 checkpoint 或日志的情况下返回完整终态。
  - 验证方式：扩展 `prompt-evaluation/gepa/tests/test_worker_orchestration.py`、`test_lifecycle_controller.py` 和 reporter/adapter 测试（待实现）；执行 `npm run test:gepa-adapter`。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [7.2](./requirements.md#req-7-2)_

- [ ] //TODO 7. 完善 Profile 发布保护与敏感信息边界

  - 实现目标：收紧 `ProfilePublisher`、reporter、result recorder 和产物摘要的输出边界，确保只写入有界定位信息；以冻结摘要进行原子发布和冲突检测，并禁止写入凭据、Authorization 或完整供应商响应。
  - 成功判据：目标文件未漂移时只发布完整最佳候选并返回 `published`/`unchanged`；发生漂移时保留 artifact、返回 `publish_blocked` 且目标内容不变；请求、报告、Attempt 和 Profile artifact 均不含敏感信息或完整供应商响应。
  - 验证方式：扩展 `prompt-evaluation/gepa/tests/test_publisher.py`、`test_reporter.py` 和 Prompt Evaluation result recorder 测试（待实现）；执行 `npm run test:gepa-adapter`。
  - _Requirements: [1.4](./requirements.md#req-1-4), [5.4](./requirements.md#req-5-4), [6.2](./requirements.md#req-6-2), [6.4](./requirements.md#req-6-4)_

- [ ] //TODO 8. 增加显式真实 E2E 闸门并保持默认回归隔离

  - 实现目标：增加只在显式命令和用户提供数据/模型配置存在时运行的 GAIA 真实单任务与最小 GEPA E2E 入口，串联 `preflight → start → status → report`；默认 `npm test`、现有 smoke 和离线协议测试不得触发真实模型或真实容器。
  - 成功判据：真实闸门能读取指定 validation Level 1 无附件任务，完成 Prompt Evaluation 和最小 GEPA 终态报告；领域答案错误不会被视为生命周期协议成功；未显式启用时不会访问外部 GAIA 数据服务或创建真实容器。
  - 验证方式：新增环境门控的 E2E runner/fixture 与脚本测试（待实现），执行默认 `npm test` 和显式真实 E2E 命令的 dry-run/preflight 检查；真实模型调用留在 Feature Verification 中执行。
  - _Requirements: [2.2](./requirements.md#req-2-2), [4.2](./requirements.md#req-4-2), [5.1](./requirements.md#req-5-1), [5.4](./requirements.md#req-5-4), [6.1](./requirements.md#req-6-1), [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2) | 只接受调用方指定的 validation task；每个样本对应一个且仅一个任务，taskId 一致 | GAIA 物化器与 GEPA Dataset 单元测试（待实现） |
| [1.3](./requirements.md#req-1-3) | 缺失答案、无效绝对 dataRoot、附件或越界路径在模型调用前失败 | Manifest 边界测试（待实现） |
| [1.4](./requirements.md#req-1-4) | 请求、Manifest、结果、报告和 artifact 不含凭据、Authorization 或完整供应商响应 | 敏感信息扫描测试（待实现） |
| [2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2) | 显式真实任务使用真实 Working LM、隔离 Docker、GAIA Worker、ACP 和 LLM RPC | 真实单任务 E2E 闸门；默认回归只做 dry-run |
| [2.3](./requirements.md#req-2-3) | GAIA authoritative scoring 决定 passed/failed，不由 complete 文本决定 | GAIA adapter fake-model 集成测试与真实结果检查（待实现） |
| [2.4](./requirements.md#req-2-4) | 结束/取消均保留 Attempt 与可回收 artifact；故障不伪造领域结果 | Prompt Evaluation 失败/取消测试（待实现） |
| [3.1](./requirements.md#req-3-1)、[3.4](./requirements.md#req-3-4) | GAIA 只接受 gaia-worker-profile，文件与 Worker 常量一致 | Profile 物化/漂移测试（待实现） |
| [3.2](./requirements.md#req-3-2) | 候选只改变 Prompt 文本，工具、提交协议和其他冻结字段不变 | Worker metadata 与 profile 校验测试（待实现） |
| [3.3](./requirements.md#req-3-3)、[6.4](./requirements.md#req-6-4) | 目标路径和 digest 冻结；运行中漂移阻止覆盖并标记 publish_blocked | Controller resume/publisher 并发测试（待实现） |
| [4.1](./requirements.md#req-4-1)、[4.4](./requirements.md#req-4-4) | train/validation 非空、唯一、不跨 benchmark、不重复任务；非法预算和多任务 Manifest 拒绝 | Protocol/Dataset 单元测试（待实现） |
| [4.2](./requirements.md#req-4-2) | preflight 校验失败不启动 Worker、容器或模型调用 | Controller side-effect 断言测试（待实现） |
| [4.3](./requirements.md#req-4-3) | preflight 摘要显示数据规模、预算、Working/Reflection LM、Profile 和副作用 | CLI 输出测试（待实现） |
| [5.1](./requirements.md#req-5-1) | 最小 GEPA 使用一条 train、一条独立 validation、seed 0、minibatch 1、预算不超过 4 | Worker 配置单元测试与显式 E2E preflight |
| [5.2](./requirements.md#req-5-2)、[6.3](./requirements.md#req-6-3) | 只有 GAIA passed/failed 进入分数；模型/容器故障保持 null 或等价非领域状态 | Adapter scoring/error-path 测试（待实现） |
| [5.3](./requirements.md#req-5-3) | status 公开 runId、状态、Worker 健康、metric 使用量、候选和发布状态 | 生命周期状态测试（待实现） |
| [5.4](./requirements.md#req-5-4) | report 显示数据规模、预算、最佳候选、终态、发布状态、Profile 路径和错误分类 | Reporter 终态测试与显式 E2E report |
| [6.1](./requirements.md#req-6-1) | 默认回归不调用真实模型、不创建真实 GAIA 容器、不访问外部数据服务 | `npm test` 回归与环境门控测试（待实现） |
| [6.2](./requirements.md#req-6-2) | 基础设施/协议/产物回收/持久化错误保留已提交产物且不发布不完整候选 | 失败隔离与 publisher 测试（待实现） |
| [7.1](./requirements.md#req-7-1) | 指定 Level 1、无附件、无网页依赖任务完成数据校验、真实评测、评分和回收 | 真实单任务 E2E 闸门 |
| [7.2](./requirements.md#req-7-2) | 单任务闸门通过后，最小 GEPA 生成可读终态报告；答案错误不冒充协议成功 | 真实 GEPA E2E 闸门 |
| [7.3](./requirements.md#req-7-3) | 首阶段默认集合不加入全量、test、Level 3、网页或复杂附件任务 | Manifest fixture 与默认回归范围检查（待实现） |

### Latest Result

未执行。实现完成后按 `delivery-loop.md` 记录每项证据、整体状态、时效、被测 Git 状态和契约版本。
