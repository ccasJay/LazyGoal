# Prompt 自进化评测接入设计

## 审批摘要

### 方案

在 `benchmarks/src/` 增加 Prompt Evaluation 编排层，并通过 `lazygoal eval prompt --request <path>` 暴露版本化 JSON 协议。编排层从已注册 benchmark 加载基准 Profile，只替换候选 Prompt 字段，再调用 benchmark 自己的隔离执行与评分入口；现有 ACP 与 LLM RPC 保持内部通信机制。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 外部 CLI、内部 ACP | 外部使用 JSON 文件与 JSON Lines；ACP 仅在 LazyGoal 宿主与隔离 Worker 之间使用 | LazyPrompt 无需绑定 ACP 生命周期，LazyGoal 保留现有隔离链路 |
| 候选覆盖层 | 请求只携带 `systemPrompt` 与 `instructions`，由 benchmark 基准 Profile 派生完整 Profile | 工具、权限和执行契约不可被候选改变，候选比较保持同条件 |
| Benchmark 注册表 | 公共编排依赖窄接口，首批注册 ALFWorld 与 GAIA；领域解析和评分留在各自目录 | 验证非单 benchmark 架构，同时避免首批纳入 SWE-bench 的高成本链路 |
| 结果双层状态 | task 同时记录执行状态与领域判定；CLI 只把协议、基础设施和取消映射为非零退出 | benchmark 失败是有效优化样本，不会被误判为调用失败 |
| Attempt 作为执行事实 | 扩展公共 Attempt 的可选 Prompt 评测元数据，汇总结果只引用已提交 Attempt 与产物 | 中断后已有事实可审计，ACP 事件不成为权威记录 |
| 当前版本单协议 | 使用 `prompt-evaluation@1` 判别当前协议，不提供开发期旧版本迁移或兼容分支 | 解析失败清晰，后续只有确需多版本共存时才新增版本 |

### 风险与待确认

- 风险等级：medium；理由：新增跨 CLI、两个 benchmark、隔离 Worker 配置与公共 Attempt 数据的接入，但不改变 Runtime、权限、恢复或 Evidence 语义。
- 关键操作：无。
- 风险：Worker 若未冻结派生 Profile，可能出现宿主记录与实际 Prompt 不一致；汇总器若混合执行状态和领域评分，可能污染 GEPA 适应度。
- 待确认：无。

## Overview

Prompt Evaluation 是 LazyGoal 面向外部优化器的评测封装，不是优化引擎。一次请求只有一个候选和一个 benchmark Manifest，公共层负责协议、候选冻结、任务编排、进度与汇总；benchmark 适配器继续拥有任务加载、隔离环境声明、Worker 工具和领域评分。（需求 1、2、3）

本设计复用 `HeadlessCompositionRoot`、`IsolatedEnvironment`、ACP/LLM RPC 与 `AttemptRecorder`。不新增第二套 Agent Runtime、持久化协议或评分框架。（需求 3、5、7）

## Architecture

```text
LazyPrompt
    |
    | lazygoal eval prompt --request request.json
    v
PromptEvaluationCli
    |
    +-- parsePromptEvaluationRequest()  [strict, current version]
    |
    +-- PromptEvaluationBenchmarkRegistry
    |       |
    |       +-- AlfworldPromptEvaluationAdapter
    |       +-- GaiaPromptEvaluationAdapter
    |
    +-- deriveCandidateProfile(baseProfile, candidate)
    |
    +-- PromptEvaluationRunner
            |
            +-- per task: benchmark adapter -> IsolatedEnvironment
            |                                  |
            |                                  +-- ACP + LLM RPC -> Worker
            |                                  +-- HeadlessCompositionRoot
            |
            +-- AttemptRecorder.commit()
            +-- result.json atomic commit
            +-- JSON Lines progress (non-authoritative)
```

外部调用方只依赖请求、事件与结果协议。`PromptEvaluationRunner` 不解释 `won`、GAIA 分数或其他领域字段，只读取 adapter 返回的标准 task 判定和不透明 `domainResult`。（需求 3.1、4.1）

## Components and Interfaces

### Prompt Evaluation 协议

请求只接受协议定义字段，解析器在任何文件准备、容器启动或模型配置加载前完成结构与路径校验。模型凭据不进入请求；`model.configId` 和 `model.modelId` 只标识由 LazyGoal 本地配置解析的模型。（需求 1.1–1.3、5.1）

```ts
interface PromptEvaluationRequestV1 {
    readonly protocol: "prompt-evaluation@1";
    readonly benchmark: {
        readonly id: "alfworld" | "gaia";
        readonly manifestPath: string;
    };
    readonly candidate: {
        readonly id: string;
        readonly baseProfileId: string;
        readonly systemPrompt: string;
        readonly instructions: readonly string[];
    };
    readonly model: {
        readonly configId: string;
        readonly modelId: string;
    };
    readonly outputDirectory: string;
}
```

请求通过全部前置校验后，LazyGoal 生成新的 `evaluationId`，并在 `outputDirectory/evaluations/<evaluationId>/` 下保存本次结果。重复候选仍创建新 `evaluationId`、Goal、Run 和 Attempt，不扫描或复用旧结果。（需求 6.4）

CLI 的 stdout 每行只输出一个 `PromptEvaluationEventV1`，stderr 只承载启动器无法编码为协议事件的最后防线诊断。终态事件始终给出 `resultPath`（若结果已提交）和分类。（需求 1.1、6.1）

### Benchmark 注册与执行边界

```ts
interface PromptEvaluationBenchmarkAdapter<TTask, TDomain> {
    readonly benchmarkId: string;
    loadManifest(path: string): Promise<readonly TTask[]>;
    loadBaseProfile(profileId: string): Promise<AgentProfile>;
    validateCandidateProfile(profile: AgentProfile): AgentProfile;
    taskId(task: TTask): string;
    runTask(input: PromptEvaluationTaskInput<TTask>): Promise<PromptEvaluationTaskResult<TDomain>>;
}
```

该接口位于 `benchmarks/src/`；具体实现位于 `benchmarks/alfworld/` 和 `benchmarks/gaia/`，不得形成 benchmark 间横向依赖。公共 registry 由 CLI 组合根注入 adapter，不从公共层反向导入领域目录。（需求 3.1、3.4）

`runTask` 复用 benchmark 当前 Supervisor/Worker 链路，但增加显式候选 Profile 输入。候选 Profile 通过 ACP `sessionMeta` 传入 Worker；Worker 在创建 `HeadlessCompositionRoot` 前再次验证并冻结它。ACP Prompt 仍只承载任务声明，不承载候选配置。（需求 2.4、3.3）

### 候选 Profile 派生

公共层加载 `baseProfileId` 后构造：

```ts
const candidateProfile: AgentProfile = Object.freeze({
    ...baseProfile,
    systemPrompt: candidate.systemPrompt,
    instructions: Object.freeze([...candidate.instructions]),
});
```

协议不暴露 `id` 或 `toolIds` 的候选字段；严格未知字段拒绝阻止调用方偷偷加入冻结字段。公共层比较派生结果与基准 Profile 的 `id`、`toolIds`，benchmark adapter 再执行领域 Profile 校验。Worker 接收后重复相同不变量检查，防止跨进程配置漂移。（需求 2.1–2.4）

### CLI 路由与退出码

`bin/lazygoal.cjs` 将 `eval prompt` 路由到公共 Prompt Evaluation CLI。退出码固定为：

| 退出码 | 含义 |
|---|---|
| `0` | 请求完成，所有已计划任务均产生领域判定；领域通过与失败均属于有效结果 |
| `1` | 基础设施失败或只得到部分权威结果 |
| `2` | 请求、协议、候选或 benchmark 校验失败，模型未调用 |
| `130` | 调用被取消 |

现有 benchmark CLI 不经过该入口，因而保留当前参数和退出语义。（需求 4.4、7.1）

## Data Models

### 任务结果

```ts
type PromptEvaluationTaskStatus =
    | "passed"
    | "failed"
    | "infrastructure_error"
    | "cancelled";

interface PromptEvaluationTaskResult<TDomain = unknown> {
    readonly taskId: string;
    readonly status: PromptEvaluationTaskStatus;
    readonly domainResult: TDomain | null;
    readonly attemptPath: string | null;
    readonly errors: readonly BenchmarkAttemptError[];
}
```

`passed`/`failed` 只能由 adapter 根据领域 outcome 生成；公共层只聚合。`infrastructure_error` 不携带伪造的 `domainResult`。`cancelled` 允许引用取消前已提交的 Attempt，但不能伪装为领域判定。（需求 4.1–4.3）

### Attempt 元数据

`BenchmarkAttemptRecord` 增加可选 `promptEvaluation`：

```ts
interface PromptEvaluationAttemptMetadata {
    readonly evaluationId: string;
    readonly candidateId: string;
    readonly baseProfileId: string;
    readonly promptSha256: string;
    readonly promptSummary: {
        readonly systemPromptCharacters: number;
        readonly instructionCount: number;
        readonly instructionCharacters: number;
    };
    readonly modelConfigId: string;
    readonly modelId: string;
}
```

规范化哈希按 UTF-8 JSON `{"systemPrompt":...,"instructions":[...]}` 的固定键序列计算。Attempt 不重复保存完整 Prompt；权威 Goal Snapshot 已冻结完整 Profile，汇总通过 `artifactLocator` 指向它。（需求 5.1、5.2）

汇总 `result.json` 包含协议、评测身份、候选元数据、benchmark/Manifest/模型身份、整体状态、每个任务结果和生成时间。文件先写临时文件再 rename；它只汇总已提交 Attempt 和明确的未完成状态，不从 JSON Lines 事件反推事实。（需求 5.3、5.4）

## Error Handling

处理顺序固定为：协议解析与未知字段检查 → 路径与 registry 校验 → 基准 Profile 加载 → 候选派生与两层校验 → 模型配置解析 → 逐任务执行。前五步失败返回退出码 `2` 且不创建有效 Attempt。（需求 1.2、2.2、2.3、3.4）

任务执行中的错误沿用 `IsolatedEnvironmentFailureStage` 与 Attempt 状态。Runner 收到取消后不再启动后续任务；当前任务由现有 AbortSignal、产物回收和清理语义处理，随后原子写入当前可证明的汇总。（需求 4.3、6.2、6.3）

首版顺序执行 Manifest，以保持资源边界和事件顺序确定；并发与自动续跑属于 LazyPrompt 调度层或后续独立设计。

## Key Design Decisions

### 外部 CLI、内部 ACP

ACP 是有状态的 Agent Session 协议，要求调用方理解 Session、update 和 transport 终止；这不适合作为 LazyPrompt 的稳定优化接口。JSON 请求与结果用于跨仓库契约，现有 ACP/LLM RPC 原样承担隔离 Worker 通信。（需求 1.1、3.3）

### 候选覆盖层

候选不是任意 `AgentProfile`。由 LazyGoal 加载基准 Profile 再覆盖两个 Prompt 字段，能从协议形状上排除工具与权限变化；宿主和 Worker 双重验证避免跨进程漂移。（需求 2）

### Benchmark 注册表

公共 registry 只解析 benchmark ID 并返回窄 adapter。首批 ALFWorld 与 GAIA 分别覆盖交互式环境任务和问答/检索任务，足以验证公共边界；SWE-bench 的镜像、补丁导出和官方 grading 不在首批范围。（需求 3、7）

### 结果双层状态

执行状态回答“是否得到可信评分”，领域判定回答“候选是否完成任务”。两者分开后，GEPA 可以惩罚真实任务失败，同时丢弃或重试基础设施失败样本。（需求 4）

### Attempt 作为执行事实

Attempt、Goal Snapshot、Trajectory 和领域产物是权威事实；事件流仅用于观察。汇总只能引用已提交事实或显式未完成状态，因此进程中断不会把最后一条进度误当结果。（需求 5、6）

### 当前版本单协议

协议带显式判别符以便快速拒绝错误调用，但开发期只实现当前版本。除非未来需要多版本共存，否则直接更新当前版本及两端，不引入迁移或兼容层。（需求 1.2）

## Testing Strategy

| 验收范围 | 场景与预期 | 验证方式 |
|---|---|---|
| 需求 1 | 有效请求产生 NDJSON 事件；未知字段、旧版本、坏路径在副作用前失败 | 协议解析与 CLI 测试，注入模型调用计数器 |
| 需求 2 | 只覆盖 Prompt；冻结字段保持不变；宿主与 Worker 拒绝非法候选 | Profile 派生单元测试；ALFWorld/GAIA Worker 配置测试 |
| 需求 3 | 两个 adapter 走同一 runner；每任务独立；未知 benchmark 被拒绝 | registry 测试；伪 adapter 多任务集成测试；依赖边界检查 |
| 需求 4 | 领域失败退出 `0`；基础设施失败退出 `1`；校验失败 `2`；取消 `130` | 状态映射与 CLI 集成测试 |
| 需求 5 | Attempt 包含候选元数据；中断保留已提交记录；汇总原子且引用产物 | Attempt codec 测试；部分完成测试；结果序列化测试 |
| 需求 6 | 事件有界且非权威；取消停止新任务；重复调用创建新身份 | 事件投影、AbortSignal 与重复执行测试 |
| 需求 7 | 现有 CLI 回归不变；默认测试无 Docker/真实模型 | 现有回归；`npm run check:dependencies`；TypeScript 检查 |

显式 smoke 使用小型 ALFWorld Manifest 和确定性假 LLM 走完整容器、ACP、LLM RPC、领域 outcome 与产物回收；GAIA 的真实外部检索不作为默认或必须 smoke 前置条件。（需求 7.2、7.3）
