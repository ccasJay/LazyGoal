# GEPA LazyGoal Adapter 设计

## 审批摘要

### 方案

在仓库根目录 `prompt-evaluation/gepa/` 建立独立 Python package，实现官方 `GEPAAdapter`，将每个 GEPA 样本顺序转换为一次 `lazygoal eval prompt` 单任务调用，再把权威 `result.json` 投影为 GEPA 的 score、output、trajectory 和 reflective dataset。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 官方 GEPA 直接依赖 | 精确锁定 `gepa==0.1.4` 并实现其公开 adapter 接口，不复制优化算法 | GEPA 负责完整进化循环；升级必须先通过兼容性测试 |
| CLI 协议隔离 | Python 只调用 `lazygoal eval prompt` 并读取 `prompt-evaluation@1`，不导入 TypeScript 内部模块 | adapter 与 LazyGoal 内部结构解耦，依赖前置 Prompt Evaluation Spec |
| 单样本单任务 | 每个 GEPA 样本引用一个单任务 Manifest，一次子进程只评测一个样本 | score、结果和 Attempt 可一一对应；首版执行成本较高但边界确定 |
| 固定组件编码 | `system_prompt` 加连续 `instruction_NNN` 无损映射 Profile Prompt | 支持独立进化多条 instruction，并拒绝含糊候选形状 |
| 故障不计分 | 只有 `passed/failed` 转换为 `1.0/0.0`；协议、基础设施和取消抛异常 | 运行故障不会污染 Pareto 选择，但会终止当前 batch |
| 权威摘要反思 | 反思仅使用 `result.json`、`domainResult` 与 Attempt/产物摘要，不解析原始 Trajectory | 反馈可审计且不复制 Runtime 提交语义；首版反思粒度受结果协议限制 |

### 风险与待确认

- 风险等级：medium；理由：跨 Python/Node 子进程、公开协议与第三方 API，需验证兼容、失败分类和取消，但无权限或持久数据迁移。
- 关键操作：无。
- 风险：GEPA API 或 Prompt Evaluation 协议变化会使 adapter 快速失败；单样本进程模型牺牲吞吐；领域结果反馈质量依赖各 benchmark 的 `domainResult`。
- 待确认：无。

## Overview

该 package 是官方 GEPA 与 LazyGoal Prompt Evaluation 之间的防腐层。GEPA 拥有优化状态机，LazyGoal 拥有 Agent 执行、隔离环境、领域评分和 Attempt；adapter 只负责确定性转换和故障分类。（需求 1、4、5）

实现依赖 `prompt-evaluation-integration` 先提供 `lazygoal eval prompt` 与 `prompt-evaluation@1`。adapter 不读取 ACP，不接触 benchmark Worker，也不解析 Runtime Trajectory JSONL。（需求 4、6）

## Architecture

```text
official gepa.optimize()
          |
          v
LazyGoalGEPAAdapter
  |-- CandidateCodec
  |-- DatasetValidator
  |-- PromptEvaluationClient
  |       |
  |       +-- request.json
  |       +-- lazygoal eval prompt --request ...
  |       +-- terminal NDJSON -> resultPath
  |       +-- authoritative result.json
  |
  +-- EvaluationBatch
          |-- outputs
          |-- scores
          +-- lightweight trajectories
                    |
                    v
          make_reflective_dataset()
```

每次 `evaluate()` 按 batch 顺序运行。首个异常停止后续样本并向 GEPA 抛出；已完成样本的 LazyGoal 产物保留，但本次调用不返回部分 `EvaluationBatch`。（需求 4.3、5.2、5.3）

## Components and Interfaces

### Python package

`prompt-evaluation/gepa/` 包含独立 `pyproject.toml`、实现模块、测试与显式 smoke 入口。distribution 使用不会与上游 `gepa` 冲突的名称，Python import package 使用 `lazygoal_gepa`。核心依赖精确固定为 `gepa==0.1.4`；package 的 Python 范围与该版本上游范围 `>=3.10,<3.15` 取交集。（需求 1.1、1.3）

预检同时验证 `importlib.metadata.version("gepa")` 和所需公开符号可导入。接口形状由针对 `GEPAAdapter`、`EvaluationBatch` 和 `optimize` 的兼容性测试固定，而不是在生产代码中维护多版本适配分支。（需求 1.2、1.3）

### 配置与样本

```python
@dataclass(frozen=True)
class LazyGoalGEPAConfig:
    benchmark_id: Literal["alfworld", "gaia"]
    base_profile_id: str
    model_config_id: str
    model_id: str
    output_directory: Path
    lazygoal_executable: Path

@dataclass(frozen=True)
class LazyGoalEvaluationExample:
    sample_id: str
    task_id: str
    manifest_path: Path
```

配置不接受 token、API key 或环境变量内容。`DatasetValidator` 在 batch 执行前检查身份唯一性、benchmark 一致性和 Manifest 存在性，并只解析 ALFWorld/GAIA 共有的 JSON 顶层 `tasks` 数组与 task ID 字段，以确认恰有一个匹配任务；领域字段仍由 Prompt Evaluation 的 benchmark parser 校验。adapter 不复制领域 parser，也不导入 TypeScript 模块。（需求 2）

### CandidateCodec

候选键集合必须精确为 `system_prompt` 与零个或多个 `instruction_%03d`。编号从 `000` 连续增长，按数字升序生成 `instructions[]`；所有值保持原始字符串，不 trim、不拼接。首版拒绝超过三位编号的 instruction，以保持单一规范形状。（需求 3.1、3.2）

候选身份为固定键顺序 JSON 的 UTF-8 SHA-256：

```text
{"systemPrompt":<string>,"instructions":[<string>...]}
```

哈希相同不代表复用执行。每个 `evaluate()` invocation 生成新的调用 ID，并在运行根目录下隔离样本目录。（需求 3.3）

### PromptEvaluationClient

客户端为同步 adapter 提供同步调用，不引入自有异步调度器：

```python
class PromptEvaluationClient:
    def evaluate_one(
        self,
        example: LazyGoalEvaluationExample,
        prompt: LazyGoalPrompt,
        invocation: InvocationContext,
    ) -> LazyGoalEvaluationRecord: ...
```

它以参数数组启动配置的可执行文件，`shell=False`，工作目录不参与可执行文件解析。每个样本目录至少保存 `request.json`；捕获的 stdout/stderr 采用固定字节上限，超限即协议错误。stdout 每个非空行都必须是当前 NDJSON 事件，且恰有一个合法终态事件。客户端不读取面向人的 stderr 来推导结果。（需求 4.1、4.2、7.4）

终态给出的 `resultPath` 规范化后必须位于本 invocation 允许的输出根内。客户端严格读取当前 `prompt-evaluation@1` 结果，要求只有一个 task 且 task ID 一致，并交叉校验退出码与终态分类。分数事实只来自该文件，不能从事件顺序、ACP 文本或 Attempt 猜测。（需求 4.2、4.3、5.2）

### LazyGoalGEPAAdapter

`LazyGoalGEPAAdapter` 实现官方公开接口：

```python
class LazyGoalGEPAAdapter(GEPAAdapter[
    LazyGoalEvaluationExample,
    LazyGoalEvaluationTrajectory,
    LazyGoalEvaluationOutput,
]):
    def evaluate(self, batch, candidate, capture_traces=False) -> EvaluationBatch: ...
    def make_reflective_dataset(
        self, candidate, eval_batch, components_to_update
    ) -> Mapping[str, Sequence[Mapping[str, Any]]]: ...
```

`evaluate()` 先完整校验 batch 与 candidate，再顺序调用客户端。正常领域结果按 `passed -> 1.0`、`failed -> 0.0` 投影；`outputs` 保存领域结果和最小审计摘要。`capture_traces=False` 时 `trajectories=None`，为 `True` 时每个 output、score、trajectory 严格同序等长。（需求 1.2、4.3、5.1、6.1）

`make_reflective_dataset()` 只接受候选中存在的 `components_to_update`，并要求 trajectories 可用。每个组件收到相同样本事实但带当前组件名与当前文本，使官方 proposer 能分别改写 system prompt 或某一 instruction。记录使用稳定字段 `Inputs`、`Generated Outputs`、`Feedback`、`Score` 和 `Artifacts`，所有值先投影为 JSON-safe 有界对象。（需求 6.2、6.3）

## Data Models

```python
@dataclass(frozen=True)
class LazyGoalEvaluationOutput:
    sample_id: str
    task_id: str
    status: Literal["passed", "failed"]
    domain_result: JSONValue
    attempt_path: str | None

@dataclass(frozen=True)
class LazyGoalEvaluationTrajectory:
    sample_id: str
    task_id: str
    candidate_id: str
    status: Literal["passed", "failed"]
    score: float
    domain_result: JSONValue
    errors: tuple[BoundedError, ...]
    usage: JSONValue | None
    attempt_path: str | None
    artifact_locator: JSONValue | None
```

这里的 trajectory 是 GEPA 反思输入 DTO，不是 LazyGoal Runtime Trajectory。`domainResult` 与定位器经过递归 JSON 类型、深度、集合长度和字符串长度限制；截断必须带显式标记，不能静默改写领域状态。请求或反思产物不得包含凭据、完整 Diagnostic Trace 或原始模型对话。（需求 6、7.4）

运行目录使用安全编码的 `invocation_id/candidate_id/sample_id/` 层次。调用者提供的 ID 只能作为记录字段；文件名使用 adapter 生成的安全摘要，避免路径穿越和碰撞。（需求 3.3、7.4）

## Error Handling

错误类型至少区分：`ConfigurationError`、`CandidateValidationError`、`DatasetValidationError`、`GEPACompatibilityError`、`PromptEvaluationProtocolError`、`PromptEvaluationInfrastructureError` 和 `PromptEvaluationCancelled`。异常包含 invocation/sample/task 上下文与有界诊断，但不包含 Prompt 全文或凭据。（需求 1.3、3.2、5.2）

退出码 `0` 只允许对应完整领域结果；`1` 映射基础设施异常，`2` 映射请求或配置异常，`130` 映射取消。任何缺失终态、多个终态、坏 JSON、越界 `resultPath`、结果读取失败或身份不一致都属于协议错误。领域 `failed` 不是异常。（需求 5.1、5.2）

收到 `KeyboardInterrupt` 或取消信号时，adapter 终止当前子进程并等待有界清理；若未退出则升级终止，随后抛出 `PromptEvaluationCancelled`，不再启动新样本。已经由 LazyGoal 原子提交的结果和 Attempt 不删除。（需求 5.3）

## Key Design Decisions

### 官方 GEPA 直接依赖

官方 package 已提供稳定的自定义 adapter 扩展点和完整优化循环。精确版本加公开接口兼容测试比 vendoring 更小，也能让升级成为显式变更。（需求 1）

### CLI 协议隔离

`prompt-evaluation@1` 是跨进程权威边界；Python adapter 不应复制 Runtime、ACP 或 Attempt codec。这样 LazyGoal 内部重构只要维持公共协议，就不影响 GEPA。（需求 4）

### 单样本单任务

GEPA 的 score 是逐样本序列，而 Prompt Evaluation 结果可以包含多个 task。强制单任务 Manifest 消除聚合策略和 task-to-score 错配；批量与并发优化另行设计。（需求 2、4.3）

### 固定组件编码

显式组件名让 GEPA 可独立选择 system prompt 或任一 instruction 进行变异。连续编号和严格键集合避免删除、插入或排序在两个系统间产生不同解释。（需求 3）

### 故障不计分

官方接口允许 adapter 自定义失败处理，但基础设施零分会让 GEPA 把环境故障当成候选质量。首版采用 batch fail-fast，以数据完整性优先。（需求 5）

### 权威摘要反思

LazyGoal Runtime Trajectory 有提交边界与未提交 tail 语义。首版只消费 Prompt Evaluation 已承诺的权威结果和 Attempt 摘要，避免 Python 重建该协议；若未来需要 action-level 反思，应先新增独立的已提交轨迹投影协议。（需求 6）

## Research Findings

- 官方 `GEPAAdapter.evaluate()` 要求 outputs、scores 与 batch 等长；`capture_traces=True` 时 trajectories 也必须等长，且不得原地修改 batch 或 candidate。
- 官方 `make_reflective_dataset()` 返回 component 到 JSON-serializable records 的映射，记录会直接进入 instruction proposal prompt。
- 官方当前 `pyproject.toml` 声明 `gepa` 版本 `0.1.4`、MIT、Python `>=3.10,<3.15`；本设计因此使用精确 pin 和显式升级测试。

## Testing Strategy

| 验收范围 | 场景与预期 | 验证方式 |
|---|---|---|
| 需求 1 | 官方 `0.1.4` 接口可导入并满足签名；错误版本在调用 CLI 前失败 | 依赖元数据与接口兼容性测试 |
| 需求 2 | ALFWorld/GAIA 单任务样本通过；重复、跨基准、坏 Manifest 和多任务输入失败且无子进程 | 数据集校验单元测试，注入启动计数器 |
| 需求 3 | 多组件 round-trip 字符一致；未知键、断号和坏值失败；相同候选哈希稳定而 invocation 独立 | CandidateCodec 属性与目录隔离测试 |
| 需求 4、5 | fake CLI 覆盖 passed、failed、坏 NDJSON、坏结果、退出码矛盾、越界路径、基础设施与取消 | 子进程协议集成测试 |
| 需求 6 | trace 对齐且有界；reflective dataset 按组件生成并可 `json.dumps`；无 trace 或未知组件失败 | adapter 与反思数据测试 |
| 需求 7.1、7.2、7.4 | 官方 `gepa.optimize()` 驱动 fake CLI 与 fake reflection LM 完成最小优化循环，无 Docker、网络和秘密 | 默认端到端集成测试 |
| 需求 7.3 | 真实 CLI 使用单任务 Manifest 产生权威结果 | 非默认显式 smoke |

默认测试使用 Python 标准库 `unittest` 与临时目录，fake CLI 作为独立进程执行，以保留真实参数、退出码、NDJSON 和文件边界。实现时从新 package 的 `pyproject.toml` 暴露稳定测试命令，并把适用命令接入仓库验证入口。
