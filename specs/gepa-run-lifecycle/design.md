# GEPA Run Lifecycle 设计

## 审批摘要

### 方案

在现有 `prompt-evaluation/gepa` Python package 中增加持久生命周期控制器和后台 Worker，并增加一个只负责 Reflection LM 的 TypeScript 机器桥。控制器通过官方 `run_dir` 管理续跑，通过现有 Adapter 评测候选，最终以摘要前置条件原子发布回项目 default Agent Profile。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 三个身份边界 | default Agent Profile 是优化对象，XDG default LLM 是 Working LM，`gepa.reflection_profile` 是 Reflection LM | Working 与反思不会混用，但预检必须同时解析三者 |
| 后台单 Worker | 每个 Run 使用一个脱离调用会话的 Python Worker和独占 owner 记录 | `start` 可立即返回；状态与恢复需要处理存活和失联 |
| 官方 checkpoint 所有权 | 直接把 Run 子目录传给 `gepa.optimize(run_dir=...)`，停止使用官方 `gepa.stop` | 不复制 GEPA 状态机，升级仍受固定版本约束 |
| Reflection 机器桥 | Python 以无 shell 子进程调用 LazyGoal TypeScript LLM Adapter，Reflection Profile 强制纯文本生成 | 复用现有 Provider 配置与脱敏，不引入 LiteLLM 配置体系 |
| 固定组件集合 | seed 的 `system_prompt` 和连续 `instruction_NNN` 都可变，但 instruction 数量与顺序固定 | 兼容已实现 CandidateCodec，不允许结构进化 |
| 摘要保护发布 | 启动时冻结目标文件摘要，正常完成后比较并原子替换 | 人工修改不会被覆盖；冲突时保留最佳产物并显式阻塞 |
| 单版本机器协议 | 生命周期请求、状态和报告各使用一个当前 schema，不维护开发期旧版本 | 协议变化直接更新两端并快速拒绝旧数据 |

### 风险与待确认

- 风险等级：medium；理由：跨 Python/TypeScript 后台生命周期、付费外部调用和 Profile 持久写回需要集成、恢复与冲突验证，但不改变权限边界或迁移历史数据。
- 关键操作：`start`、`resume` 必须显式确认费用与成功后的 Profile 发布。
- 风险：后台 Worker 非正常退出会留下失联 owner；Reflection 桥错误不能降级为候选失败；发布冲突需要人工处理最佳产物。
- 待确认：无

## Overview

该功能是现有 `LazyGoalGEPAAdapter` 之上的控制面，不改变 GEPA 的候选选择算法，也不改变 `prompt-evaluation@1` 的领域评分所有权。生命周期层只负责解析运行请求、冻结身份、启动 Worker、投影状态、恢复官方 checkpoint 和发布最终 Profile。（需求 1、3、4、5、6）

## Architecture

```text
lazygoal gepa preflight/start/status/stop/resume/report
                         |
                         v
               Python Lifecycle Controller
                 | run.json / state.json / owner.json
                 | detached Worker
                 v
             official gepa.optimize(run_dir)
                 |                    |
                 | candidate eval     | reflection prompt
                 v                    v
        LazyGoalGEPAAdapter     ReflectionLMClient
                 |                    |
                 v                    v
    lazygoal eval prompt       lazygoal gepa reflect
                 |                    |
        Working LM: default     Reflection LM Profile
                 |
                 v
      best candidate -> ProfilePublisher
                         |
                         v
             .lazygoal/profiles/default.json
```

控制 CLI 与 Worker 共享 Run Store，但状态只有 Worker 写入；`stop` 只创建停止标记。`status` 和 `report` 只读取原子提交的文件，不能从日志推断成功。（需求 2、4、5）

## Components and Interfaces

### 生命周期机器接口

`bin/lazygoal.cjs` 对外路由以下命令到 Python package；`reflect` 例外，路由到 TypeScript Reflection bridge：

```text
lazygoal gepa preflight --request <request.json>
lazygoal gepa start     --request <request.json> --yes
lazygoal gepa status    --run <runId>
lazygoal gepa stop      --run <runId>
lazygoal gepa resume    --run <runId> --yes
lazygoal gepa report    --run <runId>
lazygoal gepa reflect   --request <request.json>   # internal
```

所有公开控制命令 stdout 恰好输出一个 JSON 对象，面向人的诊断写 stderr。`--yes` 是调用方已确认费用和发布副作用的机器证明，不替代上层 Skill 的用户确认。（需求 2、4、5）

运行请求采用当前单版本协议：

```python
class GEPARunRequest(TypedDict):
    protocol: Literal["gepa-run@1"]
    benchmark: Literal["alfworld", "gaia"]
    trainset: list[GEPAExampleRequest]
    valset: list[GEPAExampleRequest] | None
    maxMetricCalls: int
    reflectionMinibatchSize: int | None
    seed: int | None

class GEPAExampleRequest(TypedDict):
    sampleId: str
    taskId: str
    manifestPath: str
```

`valset=null` 表示复用 trainset。每个样本继续遵守 Adapter 的单任务 Manifest 契约；路径按请求文件所在目录解析后冻结为绝对路径。首版固定目标 Agent Profile ID 和 Working LLM Profile 名均为 `default`，不提供替换参数。（需求 1.1、2.1、3.3）

### GEPA 配置与 Reflection bridge

主配置增加唯一的新配置节：

```toml
[gepa]
reflection_profile = "gepa-reflection"
```

`reflection_profile` 必须是非空且不是 `default` 的安全 Profile 名，并由现有 XDG loader 从 `profiles/<name>.toml` 解析完整 LLM 配置。Working LM 显式解析 `profiles/default.toml`，不受 `[profile].active` 改变；Prompt Evaluation 使用冻结的 `model.configId="default"` 与实际 model ID。（需求 1.3）

内部 Reflection 请求接受 GEPA 的 `str | list[message]`，归一化为无 Tool 的 `LLMRequest`；字符串成为一条 user message，消息列表只允许 `system/user/assistant` 文字内容。Bridge 强制 `prompt_only`、`toolChoice="none"`，通过 `createLlmAdapter()` 调用独立 Profile，并只返回生成文本和规范化用量摘要。请求、输出和诊断有大小上限，异常不得回退到 Working LM。（需求 3.2、7.1）

为让 Working LM 真正来自 XDG default Profile，Prompt Evaluation 生产接线改用 `loadRuntimeConfig({ cliArgs: { profile: request.model.configId, model: request.model.modelId } })`；协议仍不携带凭据，测试注入的 Adapter 行为保持不变。（需求 1.3、3.3）

### Run Store 与 Worker

```text
.lazygoal/gepa/runs/<runId>/
|-- run.json                 immutable, safe frozen manifest
|-- state.json               atomic mutable lifecycle projection
|-- owner.json               pid, worker token, startedAt, heartbeatAt
|-- request.json             canonical request without credentials
|-- gepa/                    official GEPA run_dir
|-- adapter/                 existing adapter evaluations
|-- reflection/              bounded bridge requests/results
|-- artifacts/
|   |-- base-profile.json
|   |-- best-profile.json
|   `-- report.json
`-- worker.log               bounded lifecycle diagnostics
```

`start` 完成全部预检后用随机稳定 `runId` 建目录、原子提交 `run.json/state.json`，再以重定向 stdio 和新进程会话启动 `worker`。Worker 用排他创建的 `owner.json` 宣告所有权，并周期更新 heartbeat；重复 Worker 在模型调用前失败。owner PID 不存在时可判定失联，但系统不向该 PID 发送信号，也不自动抢占仍存活的 owner。（需求 2.3、2.4、4.3）

状态枚举固定为：`starting | running | stop_requested | stopped | succeeded | publish_blocked | failed`。每次变更先写同目录临时文件再 rename。`status` 可把过期 heartbeat 投影为 `workerHealth="stale"`，但只读查询不重写权威状态。（需求 4）

### 优化和恢复

Worker 从 `base-profile.json` 构造固定候选键，实例化现有 `LazyGoalGEPAAdapter`，再调用：

```python
gepa.optimize(
    seed_candidate=seed_candidate,
    trainset=trainset,
    valset=valset,
    adapter=adapter,
    reflection_lm=reflection_client,
    max_metric_calls=request["maxMetricCalls"],
    reflection_minibatch_size=request.get("reflectionMinibatchSize"),
    run_dir=str(run_dir / "gepa"),
    seed=request.get("seed", 0),
)
```

不传 `task_lm`，因为候选执行归 Adapter 和 LazyGoal Working LM 所有。`resume` 不创建新 Run：确认 owner 不存活，重新解析两套 LLM 安全身份并与 `run.json` 比较，校验目标 Profile 摘要，清除 `gepa/gepa.stop` 后启动同一 Worker。官方 GEPA 自己从相同 `run_dir` 恢复候选和预算。（需求 3、5）

`stop` 原子创建 `gepa/gepa.stop`；Worker 返回后若标记仍存在则写 `stopped`，不进入发布。基础设施异常写分类错误和 `failed`，保留所有目录。（需求 3.4、5）

### ProfilePublisher

启动时把经过现有 Agent Profile Schema 校验的完整 `default.json` 保存为 `base-profile.json`，并记录原文件字节 SHA-256。完成后将 `GEPAResult.best_candidate` 通过现有 CandidateCodec 转回 Prompt，覆盖基准 Profile 的 `systemPrompt/instructions`，再次使用 Agent Profile Schema 校验并写 `best-profile.json`。（需求 1、6.1）

发布前重新读取目标文件并比较原始字节摘要。相同则在目标文件同目录写临时文件、同步关闭后 rename，保留原文件权限；最佳 Prompt 与基准相同则记录 `unchanged`。摘要不同写 `publish_blocked`，最佳产物仍可审计，但首版不提供强制覆盖命令。（需求 6.2、6.3）

## Data Models

`run.json` 保存请求、workspace、目标路径与摘要、GEPA 版本、Working/Reflection Profile 名、provider/model 安全身份、预算和时间；不保存解析后的 API key、环境变量或完整反思内容。

`state.json` 保存状态、Worker 健康投影所需时间、metric calls、候选数、最佳分数、停止标记、错误分类和 publication 状态。Worker 可通过轻量 GEPA callback 更新进度；回调不得复制候选全文。

`report.json` 在终态原子提交，包含与需求 4.2 对应的稳定摘要及 `baseProfilePath/bestProfilePath`。最佳 Prompt 全文只存在 Profile artifacts 和官方 GEPA state，不复制进报告。（需求 4、7.1）

## Error Handling

错误至少区分 `invalid_request`、`invalid_profile`、`invalid_working_model`、`invalid_reflection_model`、`gepa_incompatible`、`worker_already_running`、`worker_lost`、`evaluation_failed`、`reflection_failed`、`checkpoint_failed`、`publish_conflict` 和 `publish_failed`。错误消息包含 Run/sample/component 定位和修复方向，但不包含 Prompt 全文、凭据或供应商响应正文。（需求 1.4、3.4、4.3、6.3、7.1）

后台启动成功只表示 Worker 已接管，不表示优化成功。`status` 发现存活性未知时报告 `unknown/stale`；只有 Worker 原子写入 `succeeded` 且 publication 为 `published/unchanged` 才能报告完整成功。（需求 2.3、4.3、6）

## Key Design Decisions

### 三个身份边界

Agent Profile 决定 Prompt 与工具，Working LLM Profile 决定执行模型，Reflection LLM Profile 决定变异模型。三者分别冻结能避免“训练哪个 Prompt”和“哪个模型负责反思”再次混淆。（需求 1）

### 后台单 Worker

外部 Codex 调用不应持有长时间前台进程。每 Run 单 Worker 加保守 owner 检查提供足够恢复性，同时不引入常驻 daemon 或分布式调度器。（需求 2、4、5）

### 官方 checkpoint 所有权

GEPA 已提供 `run_dir` 恢复与 `gepa.stop`。生命周期只冻结外部输入和投影状态，不能解析或修改私有 checkpoint 来实现自有续跑。（需求 3.1、5）

### Reflection 机器桥

Reflection 调用复用 LazyGoal LLM Adapter，保持 Provider、模型目录和脱敏一致；Python 仅实现 GEPA `LanguageModel` callable，不引入第二套凭据或 LiteLLM 配置。（需求 1.3、3.2、7.1）

### 固定组件集合

当前 Adapter 的候选编码已经支持 system prompt 与多条 instruction 的独立变异。固定数量和顺序保留 Profile 语义，也避免把结构迁移塞入本 Spec。（需求 1.1、1.2）

### 摘要保护发布

Profile 是用户可编辑配置，长时间 Run 不能持有文件锁。乐观摘要检查与同目录原子替换兼顾人工编辑、崩溃安全和直接发布目标。（需求 6）

### 单版本机器协议

项目处于开发期，生命周期持久数据只支持当前 schema。未知版本快速失败，不增加迁移、fallback 或双写。（需求 2.1、4.3）

## Testing Strategy

- Python 单元测试覆盖请求解析、Run Store 原子写入、owner 互斥、状态投影、停止标记、恢复前置条件、报告和发布冲突。（需求 2、4、5、6）
- TypeScript 单元测试覆盖 `[gepa]` 配置校验、default/Reflection Profile 独立解析、Reflection 请求归一化、纯文本调用、大小限制和脱敏。（需求 1.3、3.2、7.1）
- 使用 fake Prompt Evaluation CLI 与 fake Reflection bridge 调用真实 `gepa.optimize(run_dir=...)`，覆盖后台启动、官方停止、同目录恢复、最终发布和故障不发布。（需求 3、5、6、7.2、7.3）
- 回归测试覆盖 `prompt-evaluation@1` 仍不接收凭据、普通 LazyGoal/TUI 不加载 GEPA 组件，以及现有 GEPA Adapter 测试保持通过。（需求 3.3、7）
- 显式 smoke 使用小型 ALFWorld 或 GAIA 数据与真实两套 LLM 配置，不进入 `npm test`。（需求 7.4）
