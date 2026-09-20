# Implementation Plan

- [x] //TODO 1. 实现 TUA-Bench 任务定义解析与 Manifest 构建

  - 实现目标：在 `benchmarks/tua-bench/src/` 下创建 `manifest-loader.ts`，解析 `tasks/*/task.toml` + `instruction.md` 并构建 `TuaBenchManifest`
  - 成功判据：fixture 任务目录（含 task.toml 和 instruction.md）解析后产出包含 taskId、instruction、taskFamily、imageRef、networkMode 等字段的 `TuaBenchTaskDefinition`；TOML 解析失败或必要字段缺失的任务被跳过并记录警告；缺省字段使用默认值（timeout 600s、network none、verifier user root）
  - 验证方式：待实现的 `benchmarks/tua-bench/test/manifest-loader.test.ts`；使用 fixture task.toml 和 instruction.md 覆盖正常解析、字段缺失默认值、TOML 错误跳过三个场景
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3)_

- [ ] //TODO 2. 实现 TuaBenchEnvironmentSpec 与容器网络策略

  - 实现目标：在 `benchmarks/tua-bench/src/` 下创建 `environment-spec.ts`，实现 `EnvironmentSpec<TuaBenchTaskDefinition, TuaBenchCollectedArtifacts>`；在 `IsolatedEnvironment` 中新增可选 `resolveNetworkMode` 查询，默认 `"none"` 保持向后兼容
  - 成功判据：`resolveImage` 返回 custom 模式的任务镜像引用；`resolveNetworkMode` 按 task.toml 的 networkMode 返回 `"none"` 或 `"bridge"`；`preflight` 验证容器内 `tests/test.sh` 存在且可执行；`IsolatedEnvironment` 创建容器时使用 Spec 声明的网络模式；未实现 `resolveNetworkMode` 的现有 Spec 行为不变
  - 验证方式：待实现的 `benchmarks/tua-bench/test/environment-spec.test.ts`（伪 EnvironmentHandle）；待实现的 `benchmarks/src/test/isolated-environment-network.test.ts` 验证网络模式默认值和新 Spec 的查询分发
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4)_

- [ ] //TODO 3. 实现 TUA-Bench Worker 入口与 bash_exec 工具

  - 实现目标：在 `benchmarks/tua-bench/src/` 下创建 `worker-entry.ts` 和 `bash-exec-tool.ts`；Worker 注册 `bash_exec` 工具，Agent 通过 shell 命令与容器终端交互
  - 成功判据：`bash_exec` 接收命令字符串，返回 stdout、stderr 和 exitCode；输出超过 100KB 自动截断；超时命令返回超时错误和已收集的部分输出；Worker 使用共享 WorkerBuilder 构建，与现有 benchmark Worker 独立
  - 验证方式：待实现的 `benchmarks/tua-bench/test/bash-exec-tool.test.ts`；覆盖正常执行、输出截断、超时三个场景
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4)_

- [ ] //TODO 4. 实现评分集成与 domainResult

  - 实现目标：在 `collectArtifacts` 中以 verifierUser 身份执行 `tests/test.sh`，从 `/logs/verifier/reward.txt` 读取评分结果，映射为 `TuaBenchDomainResult`；创建独立 `grade` 入口
  - 成功判据：reward ≥ 1.0 映射为 `passed: true`，低于 1.0 为 `passed: false`；验证脚本失败或 reward 文件不存在时 `verifierError` 非空且 `passed` 为 null；`grade` 入口读取已有 Attempt 记录并重跑验证，不触发模型调用
  - 验证方式：待实现的 `benchmarks/tua-bench/test/scoring.test.ts`；使用 fixture reward 文件覆盖 passed/failed/error 三种场景；`grade` 入口测试验证无 LLM 环境下运行
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [ ] //TODO 5. 实现 BenchmarkAdapter 与 headless 评测入口

  - 实现目标：在 `benchmarks/tua-bench/src/` 下创建 `adapter.ts` 和 `eval.ts`（headless 入口）；Adapter 将 `TuaBenchTaskDefinition` 映射为 `BenchmarkTaskDescriptor`；headless 入口接收仓库路径和过滤参数，批量执行目标任务
  - 成功判据：任务族和任务 ID 过滤正确筛选 Manifest 子集；每个目标任务创建独立 Goal 和容器；执行完成后输出各任务族通过率和整体通过率的汇总报告；中途中断时已完成任务的 Attempt 记录保持完整
  - 验证方式：待实现的 `benchmarks/tua-bench/test/adapter.test.ts`（BenchmarkTaskDescriptor 映射测试）；待实现的 `benchmarks/tua-bench/test/eval-filter.test.ts`（Manifest 过滤与汇总统计测试）
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4)_

- [ ] //TODO 6. 依赖边界检查与回归集成

  - 实现目标：确保 `benchmarks/tua-bench/` 不从其他 benchmark 目录导入；新增测试被 `npm test` 自动发现；`npx tsc --noEmit` 通过
  - 成功判据：依赖检查确认无跨 benchmark 导入；`npm test` 包含全部新增确定性测试且通过；类型检查无错误
  - 验证方式：`npm test`（含依赖边界检查）；`npx tsc --noEmit`

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2) | fixture task.toml 解析产出完整 TuaBenchTaskDefinition；Manifest 按任务族分组 | manifest-loader 单元测试（待实现） |
| [1.3](./requirements.md#req-1-3) | TOML 错误或必要字段缺失的任务被跳过，不中断 Manifest 构建 | manifest-loader 容错测试（待实现） |
| [2.1](./requirements.md#req-2-1) | EnvironmentSpec 使用 custom 镜像模式；resolveNetworkMode 按 task.toml 返回 | environment-spec 单元测试（待实现） |
| [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3) | preflight 验证 setup 脚本和 test.sh 可达 | environment-spec preflight 测试（待实现） |
| [2.4](./requirements.md#req-2-4) | collectArtifacts 回收评分输出和日志 | environment-spec artifacts 测试（待实现） |
| [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2) | bash_exec 执行命令返回 stdout/stderr/exitCode；输出截断和超时正确处理 | bash-exec-tool 单元测试（待实现） |
| [3.3](./requirements.md#req-3-3) | LLM 调用通过 ACP llm 通道代理 | Worker 入口构建验证（WorkerBuilder 共享） |
| [3.4](./requirements.md#req-3-4) | Agent 完成后 Worker 结束 ACP Session | Worker session 完成测试（待实现） |
| [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2) | reward ≥ 1.0 为 passed，低于 1.0 为 failed；domainResult 包含 taskFamily 和 reward | scoring 单元测试（待实现） |
| [4.3](./requirements.md#req-4-3) | grade 入口重评分不触发模型调用 | grade 入口测试（待实现） |
| [5.1](./requirements.md#req-5-1) | 任务族和 ID 过滤正确筛选 Manifest 子集 | eval-filter 测试（待实现） |
| [5.2](./requirements.md#req-5-2) | 每任务独立 Goal 和容器 | adapter 映射测试（待实现） |
| [5.3](./requirements.md#req-5-3) | 汇总报告包含各任务族通过率和整体通过率 | eval 汇总统计测试（待实现） |
| [5.4](./requirements.md#req-5-4) | 中途中断后已完成 Attempt 保持完整 | AttemptRecorder 序列化测试（共享基础设施已覆盖） |
| 容器网络策略向后兼容 | 未实现 resolveNetworkMode 的现有 Spec 默认 `"none"`，行为不变 | isolated-environment 网络模式测试（待实现） |
| 依赖边界 | tua-bench 不从其他 benchmark 目录导入 | `npm test` 依赖检查 |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。
