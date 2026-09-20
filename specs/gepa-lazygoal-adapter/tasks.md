# Implementation Plan

- [x] //TODO 1. 建立独立 Python package 与官方 GEPA 兼容边界

  - 实现目标：在根目录 `prompt-evaluation/gepa/` 创建 `lazygoal_gepa` package，精确固定 `gepa==0.1.4`，实现启动预检与测试入口。
  - 成功判据：正确版本及公开符号通过预检；错误版本或缺失接口在任何 LazyGoal 子进程启动前产生分类明确的兼容性错误；package 不含上游算法副本。
  - 验证方式：待实现的依赖元数据、公开接口和启动副作用隔离测试；运行 package 声明的 Python 测试入口。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3)_

- [x] //TODO 2. 实现配置与单任务数据集校验

  - 实现目标：定义无秘密配置和单任务样本模型，完成 ALFWorld/GAIA batch 的身份、benchmark、路径与公共 Manifest envelope 预检。
  - 成功判据：有效单任务样本通过；重复样本/task、跨基准、缺失文件、多任务或 task ID 不匹配在评测子进程前失败。
  - 验证方式：待实现的配置、数据集校验与进程启动副作用隔离测试。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3)_

- [ ] //TODO 3. 实现 CandidateCodec 与隔离运行目录

  - 实现目标：完成固定组件映射、规范化候选身份、安全文件名和每次调用隔离的样本目录。
  - 成功判据：有效多组件候选字符级 round-trip；未知键、断号和非字符串组件在请求创建前失败；相同候选哈希稳定但调用目录不同。
  - 验证方式：待实现的 CandidateCodec 属性、哈希稳定性、路径安全和调用隔离测试。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

- [ ] //TODO 4. 实现 Prompt Evaluation 子进程协议客户端

  - 实现目标：生成单样本 `prompt-evaluation@1` 请求，以无 shell 子进程调用 LazyGoal，严格解析有界 NDJSON、终态、退出码和权威 `result.json`。
  - 成功判据：passed/failed 结果可按 task 身份读取；坏 JSON、多个或缺失终态、越界结果路径、结果损坏、身份或退出码矛盾均抛出分类错误且不产生伪结果。
  - 验证方式：待实现的 fake CLI 进程集成测试，覆盖成功、领域失败及各协议/基础设施失败路径。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 5. 实现官方 LazyGoalGEPAAdapter 评测与取消语义

  - 实现目标：实现 `evaluate()` 的顺序 batch 调度、逐样本 score/output/trajectory 投影、fail-fast 和有界子进程取消。
  - 成功判据：`passed/failed` 精确映射为 `1.0/0.0`；返回序列与 batch 对齐；故障或取消不启动后续样本且保留已提交产物；`capture_traces=False` 不生成轨迹。
  - 验证方式：待实现的 adapter batch、状态映射、顺序执行、故障停止和取消清理测试。
  - _Requirements: [4.3](./requirements.md#req-4-3), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [6.1](./requirements.md#req-6-1)_

- [ ] //TODO 6. 实现反思数据与官方 optimize 集成测试

  - 实现目标：实现有界 JSON-safe 轻量 trajectory 和 `make_reflective_dataset()`，并以官方 `gepa.optimize()`、fake CLI、fake reflection LM 验证完整 adapter 回路。
  - 成功判据：每个请求组件获得逐样本 Inputs/Generated Outputs/Feedback/Score/Artifacts；未知组件和缺失 trace 明确失败；最小优化运行可观察到候选经评测、反思后发生更新。
  - 验证方式：待实现的 JSON 序列化/边界测试与官方 optimize 端到端集成测试；默认运行不使用 Docker、网络、真实模型或凭据。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2)_

- [ ] //TODO 7. 接入仓库验证并提供显式真实链路 smoke

  - 实现目标：补齐敏感信息/产物目录检查，增加非默认 ALFWorld 或 GAIA 单任务 smoke，并接入仓库现有验证入口。
  - 成功判据：默认仓库回归包含 adapter 的无外部依赖测试；所有 adapter 产物限制在配置目录且不含秘密或完整 Diagnostic Trace；显式 smoke 通过真实 CLI 读取权威结果。
  - 验证方式：运行 package 测试、仓库发现的依赖/文档/回归检查，以及待实现的显式 adapter smoke 命令；检查 smoke 不属于默认测试。
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.3](./requirements.md#req-7-3), [7.4](./requirements.md#req-7-4)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2)、[1.3](./requirements.md#req-1-3) | package 只依赖官方 `gepa==0.1.4`，公开契约可用；不兼容版本在子进程前失败 | 依赖元数据、源码边界和兼容性测试 |
| [2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2)、[2.3](./requirements.md#req-2-3) | 无秘密配置和 ALFWorld/GAIA 单任务样本通过；重复、跨 benchmark、坏路径、多任务 Manifest 无副作用失败 | 配置/数据集校验测试与进程启动计数断言 |
| [3.1](./requirements.md#req-3-1)、[3.2](./requirements.md#req-3-2)、[3.3](./requirements.md#req-3-3) | 组件映射无损且哈希确定；坏组件失败；重复评测使用独立目录 | CandidateCodec round-trip、错误表和目录隔离测试 |
| [4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2)、[4.3](./requirements.md#req-4-3) | 无 shell 调用生成当前协议请求；NDJSON 只定位权威结果；返回与 batch 顺序、长度一致 | fake CLI 子进程协议测试 |
| [5.1](./requirements.md#req-5-1)、[5.2](./requirements.md#req-5-2)、[5.3](./requirements.md#req-5-3) | 领域成败映射 `1.0/0.0`；基础设施、协议与取消不计分；首个故障停止后续执行并保留产物 | 状态映射、fail-fast 与信号取消测试 |
| [6.1](./requirements.md#req-6-1)、[6.2](./requirements.md#req-6-2)、[6.3](./requirements.md#req-6-3) | 轻量 trace 不读取原始 Trajectory；反思记录按组件生成、JSON-safe 且有界；缺失来源失败 | trajectory/reflective dataset 单元与序列化测试 |
| [7.1](./requirements.md#req-7-1)、[7.2](./requirements.md#req-7-2)、[7.4](./requirements.md#req-7-4) | 默认测试由官方 optimize 驱动完整 fake 回路，无 Docker、网络、模型或秘密，产物不越界 | 官方 optimize 端到端测试、网络/进程/文件边界断言 |
| [7.3](./requirements.md#req-7-3) | 一个真实单任务 Manifest 经 adapter、真实 CLI 到达权威 `result.json` | 非默认显式 smoke（待实现） |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。
