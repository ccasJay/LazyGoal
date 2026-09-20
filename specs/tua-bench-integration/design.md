# TUA-Bench 评测接入 设计

## 审批摘要

### 方案

在统一隔离环境上实现 `TuaBenchEnvironmentSpec`，使用 custom 镜像模式引用 TUA-Bench 每个任务的预构建 Docker 镜像。Worker 注册 `bash_exec` 工具供 Agent 执行 shell 命令。任务完成后在容器内运行官方 `tests/test.sh` 验证脚本，从 `/logs/verifier/reward.txt` 读取评分结果。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 镜像策略 | custom 模式；TUA-Bench 每个任务有独立 Dockerfile，由 `uv run setup-env` 预构建 | 不叠加 managed 安装层；要求用户预先构建镜像 |
| 任务定义解析 | 解析 `task.toml`（TOML）+ `instruction.md`；使用 `smol-toml` 解析器 | 无需 Python 运行时；轻量纯 JS 解析 |
| 容器网络策略 | 按 task.toml 的 `network_mode` 字段决定：`no-network` 保持 `--network none`，`public` 允许容器网络访问 | 与现有 benchmark 全部 `--network none` 不同；live-web 任务族必须有网络才能完成 |
| bash 执行工具 | 单一 `bash_exec` 工具，接收命令字符串，返回 stdout/stderr/exit_code | Agent 通过 shell 命令完成所有终端任务；不需要其他领域工具 |
| 评分协议 | 在同一容器内执行 `tests/test.sh`，从 `/logs/verifier/reward.txt` 读取 reward 值 | 复用 TUA-Bench 官方评分；reward ≥ 1.0 视为 passed |

### 风险与待确认

- 风险等级：medium；理由：复用已验证的 `IsolatedEnvironment` 和 ACP 链路，新增内容为增量适配层；容器网络策略按 task.toml 声明值放行，不引入 Agent 可控的权限提升
- 关键操作：用户需在评测前执行 `uv run setup-env` 预构建 TUA-Bench 任务镜像；live-web 任务的容器具有网络访问权限
- 风险：TUA-Bench 任务镜像体积较大（科学/工程任务含 OpenFOAM、CellProfiler 等），首次构建和拉取耗时；按 task.toml 放行容器网络改变了现有 benchmark 的统一无网络约束
- 待确认：无

## Overview

TUA-Bench 是第四个消费统一隔离环境的 benchmark，与前三者的区别在于：(1) Agent 主要通过 bash 命令与终端交互，不需要特定领域工具或宿主代理工具；(2) 每个任务有独立的 Docker 镜像和确定性 setup 脚本；(3) 部分任务（live-web 族）需要容器网络访问。（需求 1–5）

## Architecture

```text
eval tua-bench host
    |
    +-> TuaBenchManifestLoader (parse tasks/*/task.toml + instruction.md)
    |       |
    |       +-> TuaBenchManifest { tasks[], repoRoot }
    |
    +-> WorkerBuilder (shared) -> cache/{source-lock-digest}/
    |
    +-> IsolatedEnvironment (shared, LazyGoal-owned)
            |
            +-- spec.resolveImage()  →  custom: task-specific pre-built image
            |
            +-- security: cap-drop ALL, no-new-privileges
            |       +-- network: none (default) | bridge (task.toml public)
            |
            +-- docker cp -> /opt/lazygoal/{node,worker,manifest}
            |
            +-- spec.prepareEnvironment()
            |       +-- exec(environment/setup or task setup script)
            |
            +-- spec.preflight()
            |       +-- verify setup script exit 0, test.sh exists
            |
            +-- docker exec -i -> WorkerProcess
            |       |
            |       +-- channel: acp <-> HeadlessCompositionRoot
            |       |       +-- tools: bash_exec
            |       |
            |       +-- channel: llm <-> HostLlmRpcServer <-> LLMAdapter
            |
            +-- spec.collectArtifacts()
            |       +-- exec(tests/test.sh) -> /logs/verifier/reward.txt
            |       +-- copyOut(reward.txt, logs/)
            |
            +-- AttemptRecorder.commit() (shared)
            |
            +-- container rm (shared, guaranteed)
```

## Components and Interfaces

### TuaBenchManifestLoader

```ts
interface TuaBenchTaskDefinition {
    readonly taskId: string;
    readonly name: string;
    readonly instruction: string;
    readonly taskFamily: string;          // metadata.category
    readonly imageRef: string;            // environment.docker_image 或从 Dockerfile 构建的 tag
    readonly networkMode: "none" | "public";
    readonly agentTimeoutSec: number;
    readonly verifierTimeoutSec: number;
    readonly verifierUser: string;        // 默认 "root"
    readonly taskDir: string;             // tasks/<task-name> 绝对路径
}

interface TuaBenchManifest {
    readonly tasks: readonly TuaBenchTaskDefinition[];
    readonly repoRoot: string;
    readonly loadedAt: string;            // ISO 8601
}
```

Loader 遍历 `tasks/` 下每个子目录，用 `smol-toml` 解析 `task.toml`，读取 `instruction.md` 作为 instruction。`imageRef` 从 `environment.docker_image` 取值；若该字段缺失，使用约定 tag `tua-bench/<task-name>:latest`（由 `uv run setup-env` 预构建）。解析失败的任务跳过并记录警告。（需求 1）

### TuaBenchEnvironmentSpec

```ts
class TuaBenchEnvironmentSpec
    implements EnvironmentSpec<TuaBenchTaskDefinition, TuaBenchCollectedArtifacts> {

    readonly benchmarkId = "tua-bench";

    resolveImage(task: TuaBenchTaskDefinition): ImageSource {
        return { mode: "custom", image: task.imageRef };
    }

    getWorkerEntryConfig(task: TuaBenchTaskDefinition): WorkerEntryConfig {
        return { artifact: this.workerArtifact, cwd: "/home/agent" };
    }

    resolveNetworkMode(task: TuaBenchTaskDefinition): "none" | "bridge" {
        return task.networkMode === "public" ? "bridge" : "none";
    }

    async prepareEnvironment(env: EnvironmentHandle): Promise<void> {
        // 无需额外准备——镜像已包含 setup 后的环境状态
    }

    async preflight(env: EnvironmentHandle): Promise<PreflightResult> {
        // 验证 tests/test.sh 存在且可执行
    }

    async collectArtifacts(
        env: EnvironmentHandle, outputDir: string, graceMs: number
    ): Promise<TuaBenchCollectedArtifacts> {
        // 1. 以 verifierUser 身份执行 tests/test.sh
        // 2. 读取 /logs/verifier/reward.txt
        // 3. copyOut reward.txt 和执行日志
    }
}
```

`resolveNetworkMode` 是新增的 Spec 方法。`IsolatedEnvironment` 在创建容器时查询此方法决定 `--network` 参数。若 Spec 未实现该方法，默认 `"none"`，保持向后兼容。（需求 2）

### 容器网络策略

`IsolatedEnvironment` 当前硬编码 `--network none`。为支持 TUA-Bench 的 live-web 任务，将网络模式提取为 `EnvironmentSpec` 的可选声明：

- 默认值 `"none"`：SWE-bench、ALFWorld、GAIA 行为不变
- `"bridge"`：容器可访问外部网络，仅用于 task.toml 声明 `network_mode = "public"` 的任务

网络模式由 task.toml 的静态声明决定，Agent 无法在运行时请求或变更网络权限。其余安全约束（cap-drop ALL、no-new-privileges、无宿主挂载）不受影响。（需求 2.1）

### TUA-Bench Worker

Worker 入口（`benchmarks/tua-bench/src/worker-entry.ts`）注册单一工具：

| 工具 | 用途 |
|---|---|
| `bash_exec` | 在容器内执行 shell 命令，返回 stdout/stderr/exit_code |

```ts
interface BashExecInput {
    readonly command: string;
    readonly timeoutMs?: number;   // 默认 120_000，上限 task.agentTimeoutSec
    readonly workdir?: string;     // 默认当前工作目录
}

interface BashExecOutput {
    readonly stdout: string;       // 有界截断
    readonly stderr: string;       // 有界截断
    readonly exitCode: number;
}
```

Agent 判断任务完成时，Worker 自动结束 ACP Session。没有显式的 `submit_answer` 工具——TUA-Bench 的评分基于容器最终状态而非提交的答案字符串。（需求 3）

### 评分集成

评分在 `collectArtifacts` 阶段执行，仍在同一容器内：

1. 以 `verifierUser`（通常 root）身份执行 `tests/test.sh`，超时为 `verifierTimeoutSec`
2. 读取 `/logs/verifier/reward.txt`，解析为浮点数
3. `reward >= 1.0` 视为 `passed: true`；低于 1.0 视为 `passed: false`
4. 若验证脚本执行失败或 reward 文件不存在，标记为 `verifierError`

独立 `grade` 入口：对已有 Attempt 记录，重新启动容器、恢复环境状态、重跑验证脚本并更新 `domainResult`。（需求 4）

## Data Models

### TuaBenchDomainResult

```ts
interface TuaBenchDomainResult {
    readonly taskFamily: string;
    readonly passed: boolean | null;         // 评分前为 null
    readonly reward: number | null;          // 原始 reward 值
    readonly verifierOutput: string | null;  // 验证脚本 stdout（有界）
    readonly verifierError: string | null;   // 验证脚本失败信息
}
```

`domainResult` 保留 `taskFamily` 用于按族聚合统计。（需求 4.2）

### TuaBenchBenchmarkAdapter

```ts
const adapter: BenchmarkAdapter<TuaBenchTaskDefinition, TuaBenchOutcome> = {
    describeTask(task) {
        return {
            intent: task.instruction,
            objective: `完成终端任务：${task.name}`,
            completionCriteria: ["Agent 认为任务已完成并终止执行"],
            maxSteps: 50,  // 可通过配置覆盖
        };
    },
    async createEpisode(task, context) {
        // bash_exec 工具注册 + episode 构造
    },
};
```

（需求 5.2）

## Key Design Decisions

### 镜像策略

使用 custom 模式。TUA-Bench 每个任务有独立的 `environment/Dockerfile`，由仓库级 `uv run setup-env` 统一构建为预构建镜像。与 SWE-bench 的 custom 模式一致——引用已存在的镜像，不在运行时构建。

用户需在首次评测前运行 `uv run setup-env` 完成镜像构建。headless 入口在启动时验证 Manifest 中所有任务的镜像是否本地可用。（需求 2.1）

### 容器网络策略

按 task.toml 声明的 `network_mode` 字段决定容器网络，而非统一强制 `--network none`。理由：

- TUA-Bench 的 live-web 任务族（约 24 个任务）需要在容器内进行网页搜索和信息检索，没有网络无法完成
- 网络模式由 task.toml 静态声明，Agent 无运行时提权路径
- 其余安全约束（cap-drop、no-new-privileges、无宿主挂载）全部保持

`IsolatedEnvironment` 的 `EnvironmentSpec` 接口新增可选 `resolveNetworkMode` 方法。未实现该方法的 Spec 默认 `"none"`，现有三个 benchmark 行为不变。（需求 2.1–2.3）

### 任务定义解析

使用 `smol-toml`（纯 JS TOML 解析器，无 native 依赖）解析 `task.toml`。解析逻辑只提取 LazyGoal 需要的字段（task name、metadata.category、environment.docker_image、environment.network_mode、agent.timeout_sec、verifier 配置），不验证 Harbor 特有的字段。

容错策略：字段缺失使用默认值（timeout 600s、network none、verifier user root）；TOML 解析失败跳过该任务。（需求 1）

### bash 执行工具

单一 `bash_exec` 工具覆盖全部 5 个任务族。不分化为多个专用工具（如 file_edit、email_send），因为 TUA-Bench 的设计意图就是测试 Agent 使用原生终端命令完成任务的能力。

输出截断上限 100KB（stdout + stderr 各自），防止超长输出占满模型上下文。（需求 3.1–3.2）

### 评分协议

在 `collectArtifacts` 阶段而非 Worker 运行时执行评分。理由：

- 评分需要 root 权限（`verifier.user = "root"`），Worker 以 `agent` 用户运行
- 评分在 Agent 完成后执行，不影响 Agent 的决策循环
- `collectArtifacts` 在 ACP Session 结束后、容器销毁前调用，是执行评分的自然阶段

`grade` 独立入口复用相同逻辑：启动容器 → 恢复到评测后状态（通过 docker commit 或保存的产物） → 重跑验证脚本。（需求 4）

## Testing Strategy

| 验收范围 | 场景与预期 | 验证方式 |
|---|---|---|
| 需求 1：任务加载 | `task.toml` 解析覆盖全部必要字段；`instruction.md` 读取；字段缺失用默认值；TOML 错误跳过任务 | 伪任务目录单元测试（fixture task.toml + instruction.md） |
| 需求 2：隔离环境适配 | `TuaBenchEnvironmentSpec` 使用 custom 镜像；网络模式按 task.toml 决定；preflight 检查验证脚本存在 | 伪 `EnvironmentHandle` 单元测试 |
| 需求 3：Worker 与 bash 工具 | `bash_exec` 执行命令返回 stdout/stderr/exit_code；超时截断；LLM 通过 ACP 通道 | 工具行为测试（伪进程） |
| 需求 4：评分集成 | `tests/test.sh` 执行后读取 reward.txt；reward ≥ 1.0 为 passed；验证脚本失败标记 verifierError；`grade` 不触发模型调用 | 评分逻辑测试（fixture reward 文件） |
| 需求 5：Headless 入口 | 任务族/ID 过滤正确；每任务独立 Goal 和容器；中途退出保留已有记录；汇总报告按族统计 | Manifest 过滤测试；AttemptRecorder 序列化测试 |
| 依赖边界 | `benchmarks/tua-bench` 不从其他 benchmark 目录导入 | `npm test` 依赖检查 |

确定性回归不依赖 Docker、TUA-Bench 仓库或外部网络。容器 smoke 通过显式入口运行。
