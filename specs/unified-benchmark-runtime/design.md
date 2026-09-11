# 统一 Benchmark 运行基础设施 设计

## 审批摘要

### 方案

从 `benchmarks/swebench/src/` 提取通信复用、LLM RPC、Worker 构建和进程控制到 `benchmarks/src/` 共享层。LazyGoal 提供统一的 `IsolatedEnvironment` 隔离执行环境，拥有容器安全、Worker 注入、通信和生命周期保障；各 benchmark 通过声明式 `EnvironmentSpec` 在该环境中适配自己的镜像和领域需求。以 ALFWorld 容器化迁移验证边界完整性，并将 Attempt 记录和评分入口统一到共享层。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 共享设施位置 | 放在 `benchmarks/src/` 而非新 package；当前无外部消费者，内聚于 benchmark 目录更简单 | SWE-bench 和 ALFWorld 从同一路径导入；无新 workspace 配置 |
| LazyGoal 统一隔离环境 | `IsolatedEnvironment` 拥有容器创建、安全约束、Worker 注入、通信和清理；benchmark 通过 `EnvironmentSpec` 声明基础镜像、工作目录、环境准备和产物导出，不直接操作 Docker | 隔离保障统一由 LazyGoal 拥有；benchmark 接入只需声明式配置；安全策略集中维护 |
| 镜像策略双模式 | "自带镜像"模式供 SWE-bench 等有官方镜像的 benchmark；"托管镜像"模式由 LazyGoal 提供基础镜像 + benchmark 声明安装层，供 ALFWorld 等无专用镜像的 benchmark | SWE-bench 继续使用官方镜像不受影响；新 benchmark 无需自建完整镜像 |
| ALFWorld 容器化 | 使用托管镜像模式：LazyGoal 基础镜像 + ALFWorld 声明 Python/游戏数据安装层；sidecar 在容器内作为 Worker 子进程运行 | 宿主不需要 Python 环境；镜像分层缓存减少重建成本 |
| 统一 Attempt 增量落盘 | 共享 `BenchmarkAttemptRecord` 含公共字段 + 不透明 `domainResult`；每个 Attempt 阶段结束后原子写入 | 中途退出保留已有记录；领域字段互不干扰 |
| 独立评分入口 | `grade` 子命令读取已有产物执行评分；不走 ACP，不调用模型 | 评分失败可独立重试；作答和评分解耦 |

### 风险与待确认

- 风险等级：high；理由：修改已验证的 SWE-bench ACP 执行路径，ALFWorld 从宿主迁移到容器，跨 benchmark 共享基础设施。
- 关键操作：重构 SWE-bench 共享设施路径（功能不变，导入路径变更）；新建 LazyGoal 基础镜像和 ALFWorld 安装层。
- 风险：提取时若改变取消和部分启动失败的行为会引入回归；ALFWorld 安装层大小和构建时间需实测；Python sidecar 容器化可能遇到系统库兼容性问题。
- 待确认：无。

## Overview

将已在 SWE-bench 验证的 ACP 容器链路重构为 LazyGoal 拥有的统一隔离环境。`IsolatedEnvironment` 作为一等公民拥有容器安全、Worker 注入、双通道通信、模型代理和生命周期管理；benchmark 通过 `EnvironmentSpec` 声明式适配，只提供镜像来源、工作目录、环境准备和产物回收逻辑。`packages/acp` 继续负责协议边界，`HeadlessCompositionRoot` 继续负责 Goal/Runtime/工具装配。（需求 1、2、6）

ALFWorld 作为第二个消费者使用托管镜像模式验证公共边界：声明 Python + ALFWorld 安装需求，容器内运行 Headless Root、专用工具和 Python sidecar，宿主只保留配置和模型代理。（需求 3）

## Architecture

```text
eval {benchmark} host
    |
    +-> WorkerBuilder (shared) -> cache/{source-lock-digest}/
    |
    +-> IsolatedEnvironment (shared, LazyGoal-owned)
            |
            +-- spec.resolveImage()  →  official image / managed base + install layer
            |
            +-- security: no-network, cap-drop ALL, no-new-privileges, no host mounts
            |
            +-- docker cp -> /opt/lazygoal/{node,worker,manifest}
            |
            +-- spec.prepareEnvironment()  (domain setup inside container)
            |
            +-- docker exec -i -> WorkerProcess
            |       |
            |       +-- channel: acp <-> @lazygoal/acp <-> HeadlessCompositionRoot
            |       |
            |       +-- channel: llm <-> HostLlmRpcServer <-> configured LLMAdapter
            |       |
            |       +-- tools/storage -> {spec.workdir}
            |       |
            |       +-- (ALFWorld) sidecar subprocess
            |
            +-- spec.collectArtifacts()  (domain)
            |
            +-- AttemptRecorder.commit()  (shared)
            |
            +-- container rm  (shared, guaranteed)
```

SWE-bench 的 `EnvironmentSpec` 使用自带镜像模式（官方题目镜像）、提供 `/testbed` 工作目录和 patch 导出；ALFWorld 的 `EnvironmentSpec` 使用托管镜像模式（声明 Python/ALFWorld 安装层）、提供游戏数据目录和环境结果回收。两者不互相导入。（需求 1.2、2.4）

## Key Design Decisions

### 共享设施位置

从 `benchmarks/swebench/src/` 移动以下模块到 `benchmarks/src/`：

| 模块 | 当前位置 | 职责 |
|---|---|---|
| `multiplex` | `swebench/src/multiplex.ts` | NDJSON 双通道帧复用 |
| `llm-rpc` | `swebench/src/llm-rpc.ts` | 宿主 LLM RPC Client/Server |
| `process` | `swebench/src/process.ts` | 子进程启动与交互式进程管理 |
| `worker-builder` | `swebench/src/worker-builder.ts` | Worker 构建、缓存和清单 |

SWE-bench 保留 `container.ts`（改为提供 `EnvironmentSpec`）、`supervisor.ts`（改为消费 `IsolatedEnvironment`）、`worker-runtime.ts`、`worker-config.ts`、`acp-result-projection.ts`、`evaluation.ts`。

不移动 `worker-preflight.ts`——预检内容因 benchmark 而异（SWE-bench 检查 Conda 和 base commit，ALFWorld 检查 Python 和 sidecar），由各 `EnvironmentSpec.preflight()` 自行实现。（需求 1.1、1.2）

### LazyGoal 统一隔离环境

```ts
interface EnvironmentSpec<TTask, TArtifact> {
    readonly benchmarkId: string;
    resolveImage(task: TTask): ImageSource;
    getWorkerEntryConfig(task: TTask): WorkerEntryConfig;
    prepareEnvironment(env: EnvironmentHandle): Promise<void>;
    preflight(env: EnvironmentHandle): Promise<PreflightResult>;
    collectArtifacts(env: EnvironmentHandle, outputDir: string,
                     graceMs: number): Promise<TArtifact>;
}

type ImageSource =
    | { readonly mode: "custom"; readonly image: string; readonly platform: string }
    | { readonly mode: "managed"; readonly installCommands: readonly string[] };
```

`IsolatedEnvironment` 是 LazyGoal 拥有的隔离执行环境。它统一处理：
- 容器创建与安全约束（无网络、cap-drop ALL、no-new-privileges、独立容器名）
- Node 运行时和 Worker 注入到 `/opt/lazygoal`
- 双通道 Mux 和 LLM RPC 建立
- ACP Client 驱动
- 取消传播和错误阶段分类
- 有界产物回收和容器销毁

`EnvironmentHandle` 是隔离环境向 `EnvironmentSpec` 暴露的受限操作接口——只允许在已创建的容器内执行命令和复制文件，不暴露容器名、Docker API 或安全参数。benchmark 通过 `EnvironmentHandle` 操作容器内部，而不是直接调用 Docker。（需求 2.1–2.4）

**镜像策略**：`ImageSource` 支持两种模式：
- `custom`：benchmark 提供完整镜像引用（SWE-bench 官方镜像）
- `managed`：LazyGoal 使用自己的基础镜像（含 Node），benchmark 声明安装命令（如 `pip install alfworld textworld`），隔离环境在容器启动后执行安装层

`IsolatedEnvironment` 编排流程：`spec.resolveImage()` → create container → start → inject Worker → `spec.prepareEnvironment()` → `spec.preflight()` → Mux + LLM RPC → ACP Client → `spec.collectArtifacts()` → `AttemptRecorder.commit()` → rm。（需求 6.3）

### ALFWorld 容器化

**镜像策略**：使用 `managed` 模式。`IsolatedEnvironment` 的基础镜像包含 Node；ALFWorld 声明 Python 和依赖安装命令。`prepareEnvironment` 在容器内安装依赖并复制游戏数据。镜像安装层可通过 Docker commit 或构建缓存加速后续运行。

**Sidecar 容器化**：现有 `SidecarClient` 通过 `child_process.spawn` 启动 Python 进程。容器化后，Worker 入口在启动 HeadlessRoot 前先 spawn sidecar subprocess，使用相同的 stdin/stdout JSON 协议。sidecar 与 Worker 共享容器网络命名空间和文件系统，无需额外通信通道。

**Worker 入口**：ALFWorld Worker 入口与 SWE-bench Worker 入口分开构建（各自的 `worker-entry.ts`），共享相同的 Worker 构建器。两个入口都消费 `HeadlessCompositionRoot` 但注册不同的工具集。（需求 3.1–3.4）

### 统一 Attempt 增量落盘

```ts
interface BenchmarkAttemptRecord<TDomain = unknown> {
    readonly benchmarkId: string;
    readonly taskId: string;
    readonly goalId: string;
    readonly runId: string;
    readonly attempt: number;
    readonly status: "completed" | "failed" | "cancelled" | "infrastructure_error";
    readonly durationMs: number;
    readonly usage: HeadlessModelUsage | null;
    readonly errors: readonly { stage: string; code?: string; message: string }[];
    readonly artifactLocator: BenchmarkPersistenceLocator | null;
    readonly domainResult: TDomain;
}
```

`AttemptRecorder` 在每个 Attempt 阶段结束后原子写入（`writeFile` + `rename`）。报告由各 benchmark 的 `aggregateReport()` 消费 Attempt 记录生成，共享层不解释 `domainResult`。（需求 4.1–4.4）

SWE-bench 的 `domainResult` 保留 `patch`、`patchSha256`、`gradingStatus`、`resolved`；ALFWorld 的 `domainResult` 保留 `won`、`steps`、`goalConditionSuccessRate`、`failureCategory`。

### 独立评分入口

各 benchmark CLI 新增 `grade` 子命令，读取指定输出目录的 Attempt 记录和产物，执行领域评分逻辑，更新 Attempt 的评分字段并重新生成汇总报告。

- SWE-bench：读取已导出的 patch 文件，调用官方 Python harness 评分。
- ALFWorld：环境 `won` 已在作答时确定，`grade` 只重新聚合统计。

ACP 不参与评分过程。评分在隔离环境执行但不要求容器化——SWE-bench 的官方 harness 已经在独立容器中评分。（需求 5.1–5.3）

## Testing Strategy

| 验收范围 | 场景与预期 | 验证方式 |
|---|---|---|
| 需求 1：共享设施 | SWE-bench 和 ALFWorld 导入同一 `benchmarks/src/` 模块；依赖检查拒绝跨 benchmark 导入 | 依赖边界测试；`npm run check:dependencies` |
| 需求 2：隔离环境 | `IsolatedEnvironment` 统一处理安全约束和生命周期；伪 `EnvironmentSpec` 不引用 Conda 或 `/testbed` 时正常运行 | 伪 Spec 集成测试；`EnvironmentHandle` 操作断言 |
| 需求 3：ALFWorld 容器 | 宿主无 Python 环境时容器评测通过；不同任务环境互不污染 | ALFWorld Docker smoke；隔离性测试 |
| 需求 4：Attempt 记录 | 中途退出后已完成 Attempt 可读取；重试创建新记录；领域字段保持独立 | 中断恢复测试；多 Attempt 序列化测试 |
| 需求 5：独立评分 | `grade` 读取已有产物完成评分且不触发模型调用 | 评分入口测试；无 LLM 环境下运行 |
| 需求 6：语义保持 | SWE-bench 单题通过现有验证；CLI/退出码不变；取消/断线/复制失败/清理失败有覆盖 | SWE-bench 真实 smoke；确定性回归；ALFWorld 容器 smoke |

确定性回归不依赖 Docker 或外部供应商；真实容器 smoke 通过显式入口运行。（需求 6.3）
