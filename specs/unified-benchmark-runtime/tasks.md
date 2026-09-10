# Implementation Plan

- [x] //TODO 1. 提取共享基础设施模块到 `benchmarks/src/`

  - 将 `multiplex.ts`、`llm-rpc.ts`、`process.ts`、`worker-builder.ts` 从 `benchmarks/swebench/src/` 移动到 `benchmarks/src/`，更新 SWE-bench 所有导入路径。
  - 成功判据：SWE-bench 从 `benchmarks/src/` 导入共享模块；依赖检查拒绝 `swebench←→alfworld` 交叉导入；现有 SWE-bench 测试无需修改即通过。
  - 验证方式：`npm run check:dependencies`；`npx tsc --noEmit`；`npm test`；检查 SWE-bench 测试结果不变。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2)_

- [x] //TODO 2. 实现 `IsolatedEnvironment` 和 `EnvironmentSpec` 接口

  - 在 `benchmarks/src/` 实现 `IsolatedEnvironment`（LazyGoal 拥有的隔离执行环境，统一处理容器创建、安全约束、Worker 注入、通信建立、文件回收和容器销毁）、`EnvironmentSpec` 接口（benchmark 声明式适配：镜像来源、工作目录、环境准备、预检、产物导出）和 `EnvironmentHandle`（向 EnvironmentSpec 暴露的受限操作接口，只允许容器内执行和文件复制）。实现 `ImageSource` 双模式：`custom`（自带镜像）和 `managed`（LazyGoal 基础镜像 + 安装命令层）。
  - 成功判据：伪 `EnvironmentSpec` 不引用 Conda 或 `/testbed` 时仍正常完成容器生命周期；安全约束（无网络、cap-drop ALL、no-new-privileges）在容器参数中可断言；`EnvironmentHandle` 不暴露容器名或 Docker API。
  - 验证方式：待实现的 `benchmarks/test/isolated-environment.test.ts`；使用伪 ProcessRunner 验证 Docker 参数、生命周期和 EnvironmentHandle 操作。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4)_

- [x] //TODO 3. 实现 `IsolatedEnvironment` 编排流程

  - 从 `runSwebenchSupervisor` 提取通用编排逻辑到 `benchmarks/src/isolated-environment.ts`：`spec.resolveImage()` → create container → start → inject Worker → `spec.prepareEnvironment()` → `spec.preflight()` → Mux + LLM RPC → ACP Client → `spec.collectArtifacts()` → rm。统一取消传播和错误阶段分类。`IsolatedEnvironment` 驱动 `EnvironmentSpec`，benchmark 不直接操作 Docker。
  - 成功判据：伪 `EnvironmentSpec` 驱动 `IsolatedEnvironment` 可完成正常终态、取消终态和基础设施错误终态；取消后无成功终态产生。
  - 验证方式：待实现的 `benchmarks/test/isolated-environment.test.ts`（编排测试部分）；覆盖正常、取消、断线和 preflight 失败。
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.1](./requirements.md#req-2-1), [6.3](./requirements.md#req-6-3)_

- [x] //TODO 4. 重构 SWE-bench 提供 `EnvironmentSpec` 并消费 `IsolatedEnvironment`

  - 实现 `SwebenchEnvironmentSpec`，提供官方镜像（`custom` 模式）、`/testbed` 工作目录、base commit 校验和 patch 导出；`runSwebenchSupervisor` 改为创建 `SwebenchEnvironmentSpec` 后调用 `IsolatedEnvironment` 的薄封装。
  - 成功判据：所有现有 SWE-bench 测试通过；评测语义（CLI 参数、单次作答、退出码、官方 resolved 评分来源）保持不变。
  - 验证方式：`npm test`；SWE-bench benchmark 测试全量通过；`npx tsc --noEmit`。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2)_

- [ ] //TODO 5. 实现 `AttemptRecorder` 统一增量落盘

  - 在 `benchmarks/src/` 实现 `AttemptRecorder` 和 `BenchmarkAttemptRecord<TDomain>` 泛型记录，每个 Attempt 阶段结束后通过 `writeFile` + `rename` 原子写入。SWE-bench 和 ALFWorld 各使用自己的 `TDomain` 类型。
  - 成功判据：中途退出后已完成 Attempt 的记录文件可读取且完整；重试创建新 Attempt 序号；SWE-bench 的 patch/resolved 和 ALFWorld 的 won/steps 保持各自字段。
  - 验证方式：待实现的 `benchmarks/test/attempt-recorder.test.ts`；覆盖原子写入、中断恢复和领域字段隔离。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4)_

- [ ] //TODO 6. 构建 ALFWorld `EnvironmentSpec` 与托管镜像安装层

  - 实现 `AlfworldEnvironmentSpec`，使用 `managed` 模式声明 Python/ALFWorld/TextWorld 安装命令和游戏数据复制。`prepareEnvironment` 通过 `EnvironmentHandle` 在容器内执行安装和数据准备。`preflight` 验证 Python 和 sidecar 而非 Conda 和 base commit。`collectArtifacts` 回收环境结果。
  - 成功判据：`AlfworldEnvironmentSpec` 实现 `EnvironmentSpec` 接口；通过 `EnvironmentHandle` 操作容器内部而不直接调用 Docker；预检验证 Python 和 sidecar 可用性。
  - 验证方式：待实现的 `benchmarks/alfworld/test/environment-spec.test.ts`；伪 EnvironmentHandle 验证安装命令和预检内容。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.3](./requirements.md#req-3-3)_

- [ ] //TODO 7. 实现 ALFWorld Worker 入口与容器化 sidecar

  - 创建 ALFWorld Worker 入口（独立于 SWE-bench），在容器内 spawn sidecar 子进程并装配 HeadlessRoot + ALFWorld 专用工具。Worker 构建器为两个入口分别构建。
  - 成功判据：宿主未安装 ALFWorld Python 环境时容器评测通过；不同任务的 sidecar 实例和环境互不污染；ALFWorld Worker 不注册 SWE-bench 的文件工具。
  - 验证方式：ALFWorld 容器 smoke 测试（显式入口）；容器内 HeadlessRoot + 假 LLM 隔离测试。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.4](./requirements.md#req-3-4)_

- [ ] //TODO 8. 实现独立评分入口

  - 各 benchmark CLI 新增 `grade` 子命令，读取指定输出目录的 Attempt 记录和产物，执行领域评分并更新 Attempt 评分字段。SWE-bench 调用官方 Python harness；ALFWorld 重新聚合统计。
  - 成功判据：`grade` 读取已有产物完成评分且不触发模型调用；无 LLM 环境变量时评分入口仍可运行。
  - 验证方式：待实现的评分入口测试；使用 fixture 产物验证评分结果。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3)_

- [ ] //TODO 9. 组合回归与双 benchmark 容器 smoke

  - 确定性回归覆盖共享设施（Mux、LLM RPC、Worker 构建）、IsolatedEnvironment 生命周期、EnvironmentSpec 编排、取消/断线/复制失败/清理失败、AttemptRecorder 和评分入口，且不依赖 Docker 或外部供应商。新增 SWE-bench 和 ALFWorld 的显式容器 smoke 入口。
  - 成功判据：`npm test` 全量通过且不依赖 Docker；SWE-bench 和 ALFWorld 分别通过显式容器 smoke；依赖检查确认无交叉导入。
  - 验证方式：`npm test`；`npx tsc --noEmit`；`npm run check:dependencies`；显式 `npm run swebench:worker-smoke`；显式 ALFWorld 容器 smoke。
  - _Requirements: [1.3](./requirements.md#req-1-3), [6.3](./requirements.md#req-6-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2) | SWE-bench 和 ALFWorld 从 `benchmarks/src/` 导入共享模块；两者无交叉导入 | 依赖边界检查；模块导入断言 |
| [1.3](./requirements.md#req-1-3) | 共享模块变更时两个 benchmark 的测试同时覆盖 | 确定性回归 `npm test` |
| [2.1](./requirements.md#req-2-1)–[2.4](./requirements.md#req-2-4) | `IsolatedEnvironment` 统一处理安全约束和生命周期；伪 `EnvironmentSpec` 不引用 Conda 或 `/testbed` 时正常运行；`EnvironmentHandle` 不暴露容器名或 Docker API | IsolatedEnvironment 测试；伪 Spec 集成测试 |
| [3.1](./requirements.md#req-3-1)–[3.4](./requirements.md#req-3-4) | ALFWorld 容器评测在宿主无 Python 时通过；不同任务环境互不污染 | ALFWorld 容器 smoke（显式入口） |
| [4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2) | Attempt 阶段结束后原子落盘；中途退出时已完成记录可读取 | AttemptRecorder 测试；中断恢复测试 |
| [4.3](./requirements.md#req-4-3)、[4.4](./requirements.md#req-4-4) | 重试创建新 Attempt；SWE-bench 和 ALFWorld 领域字段各自独立 | 多 Attempt 序列化测试 |
| [5.1](./requirements.md#req-5-1)–[5.3](./requirements.md#req-5-3) | `grade` 读取已有产物完成评分且不触发模型调用 | 评分入口测试（无 LLM 环境） |
| [6.1](./requirements.md#req-6-1)、[6.2](./requirements.md#req-6-2) | SWE-bench 评测语义（CLI/退出码/resolved）不变 | SWE-bench 全量测试；真实容器 smoke |
| [6.3](./requirements.md#req-6-3) | 取消/断线/复制失败/清理失败覆盖；默认回归不依赖 Docker | 确定性回归 + 显式 smoke 分离 |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。
