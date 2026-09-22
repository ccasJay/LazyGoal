# GAIA 真实端到端 GEPA 评测设计

## 审批摘要

### 方案

保留现有 `gepa-run@1` 协议，通过显式 Profile 路径和 GAIA Profile 物化补齐 GEPA 与 GAIA 的基准身份边界；先以真实 GAIA 单任务 Prompt Evaluation 作为闸门，再复用同一公共边界执行最小双模型 GEPA 运行。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 单任务 GEPA sample | 每个 GEPA sample 使用一个单任务 Manifest；GAIA 原始多任务 Manifest 只作为输入源 | 保持 `taskId`、分数、Attempt 和反思证据一一对应，不改变 GAIA 原始数据格式 |
| Profile path & identity | 在 GEPA `preflight/start/resume` 暴露显式 Profile 路径，并允许非 `default` 的合法 Profile ID | GAIA 使用 `gaia-worker-profile`，不会把候选误投到通用 Profile |
| GAIA profile source of truth | 从 Worker 内置 `GAIA_WORKER_PROFILE` 生成或校验磁盘 Profile | 避免手工复制 Prompt、工具白名单和提交协议造成漂移 |
| Real run gates | 先运行真实单任务 Prompt Evaluation，再运行 train/validation 各一条的 GEPA | 基础链路失败时不消耗 GEPA 反思预算，真实副作用可分段定位 |
| Failure and publication | 只使用公开 GEPA 生命周期；以目标文件摘要做乐观并发保护 | 基础设施故障不计为低分，Profile 冲突进入 `publish_blocked` |
| Dataset capability boundary | GEPA 接受 validation、Level 1/2 任务；附件必须是 `dataRoot` 内的现有相对文件 | Level 3、test split 和全量自动发现仍在本 Spec 外 |

### 风险与待确认

- 风险等级：medium；理由：涉及真实模型费用、Docker 执行、跨 Python/Node 协议和 Profile 发布，但目标 Profile 可显式隔离且发布受摘要保护。
- 关键操作：调用 Working LM 和 Reflection LM、创建 GAIA 容器、向指定 GAIA Profile 发布候选。
- 风险：数据准备、附件挂载、容器依赖、模型输出和第三方 GEPA API 均可能失败；Level 3 仍不在本范围内。
- 待确认：无。

## Overview

本设计覆盖 Requirements 1–7。实现分为数据物化、Profile 对齐、真实单任务闸门和最小 GEPA 生命周期四个部分。数据、GAIA 评分、隔离环境和 Attempt 仍由 GAIA/Prompt Evaluation 所有；GEPA 只拥有候选搜索、反思、预算和生命周期状态。

```text
GAIA source Manifest
        |
        v
single-task materializer ----> train/validation Manifest files
        |                                  |
        |                                  v
        +--> real Prompt Evaluation --> GAIA adapter --> Docker/ACP --> Working LM
                                                   |
                                                   v
                                              authoritative result

GEPA preflight/start --> official GEPA adapter --> same Prompt Evaluation boundary
        |                                      |
        +--> Reflection LM --------------------+
        |
        v
status/report --> best candidate --> GAIA Profile publisher
```

单任务闸门和 GEPA 运行共享同一 GAIA adapter、Worker 构建和评分逻辑；不复制第二套评测实现。真实调用均由显式命令触发，默认回归只运行离线替身和协议测试。

## Key Design Decisions

### 单任务 GEPA sample

GEPA 当前请求项只有 `sampleId`、`taskId` 和 `manifestPath`。因此新增一个 GAIA 数据物化边界：读取用户提供的源 Manifest，按显式 task ID 输出一个只含目标 task 的 Manifest，保留源 `dataRoot`、`expectedAnswer`、`level` 和 `split`。物化器拒绝重复 task ID、缺失答案、非 `validation`、Level 3、附件路径越界或不存在的附件文件。

该边界只约束 GEPA 输入，不改变 GAIA 原始 Manifest，也不限制直接 `lazygoal eval prompt` 使用多任务 Manifest。其输出文件是运行输入，不由 GEPA Worker 在运行中修改。

### Profile path & identity

GEPA Controller 已有 Profile 路径参数，但当前 CLI 未暴露，且 Profile loader 将 ID 限定为 `default`。本 Spec 将：

1. 为 `preflight`、`start`、`resume` 增加 `--profile-path`，并将路径写入冻结 Run Manifest；`status` 和 `report` 从冻结 Manifest 读取，不重新推断路径。
2. 将 Profile ID 校验放宽为非空稳定字符串；Profile 的字段结构、Prompt 非空约束和候选组件约束保持不变。
3. 要求 GAIA 运行目标 Profile 的 ID 为 `gaia-worker-profile`，并在 preflight 校验其 Prompt、工具白名单和 Worker 内置 Profile 一致。
4. 保持 `gepa-run@1` 请求字段不变，Profile 路径属于生命周期 CLI 运行参数，不写入包含数据样本的请求协议。

这样既支持 GAIA 专用 Profile，也保持现有 `default` Profile 的兼容行为。

### GAIA profile source of truth

GAIA Profile 的唯一语义来源仍是 `benchmarks/gaia/src/worker-entry.ts` 中的 `GAIA_WORKER_PROFILE`。增加一个 benchmark-owned 的物化/校验入口，将该常量序列化为标准 Profile JSON；测试同时比较文件与常量的身份、工具列表、system Prompt 和 instructions。GEPA 只读取物化后的文件，不直接导入 TypeScript。

物化入口只接受显式输出路径，并原子写入；不得从用户输入覆盖工具列表、答案提交工具或结构化输出模式。真实 GEPA 运行的目标文件放在 GAIA 专用路径，不使用通用 `.lazygoal/profiles/default.json`。

### Real run gates

第一道闸门调用现有 `lazygoal eval prompt --request`，使用一条指定的 Level 1/2 validation 任务和真实 Working LM。成功标准是 GAIA 领域结果、Attempt 和运行产物均可读取；答案错误仍是有效领域失败。Level 2 任务的附件通过现有 GAIA Environment 注入容器，宿主路径不直接暴露给 Worker。

第二道闸门使用官方 `lazygoal gepa` 生命周期，初始请求固定为：train 一条、validation 一条且不重复、`maxMetricCalls=4`、`reflectionMinibatchSize=1`、`seed=0`。必须读取当次 `preflight` 摘要后才可由用户批准并启动。GEPA 每次候选评测都重新穿过第一道闸门的公共 Prompt Evaluation 边界。

### Failure and publication

分数只来自 GAIA adapter 返回的 `passed`/`failed`。数据、Profile、协议、模型、容器、Worker、产物回收和持久化错误使用现有基础设施/协议分类，不转换为 `0.0`。已提交 Attempt 和可回收产物保留。

GEPA Worker 使用启动时冻结的 Profile 摘要进行乐观并发检查：摘要未变化时才可原子发布最佳 GAIA Profile；摘要变化时保留最佳 artifact，但终态为 `publish_blocked`，不覆盖目标文件。不得为测试便利增加强制覆盖选项。

### Dataset capability boundary

本 Spec 的 GAIA Environment 仍保持容器无网络；已有的宿主 `web_search`/`web_fetch` 代理和附件挂载契约继续作为 GAIA Worker 的受控边界。数据物化器允许 Level 1/2 与合法附件，但拒绝 Level 3 和 test split，不改变本 Spec 的成功判定。

## Components and Interfaces

| 边界 | 输入 | 输出/责任 | 关键不变量 |
|---|---|---|---|
| GAIA 数据物化器 | 源 Manifest、显式 task IDs、输出目录 | 单任务 Manifest 文件 | 只接受 validation Level 1/2；task ID 唯一；附件路径相对且存在 |
| GAIA Profile 物化器 | `GAIA_WORKER_PROFILE`、输出路径 | 标准 Profile JSON | ID、工具和 Prompt 与 Worker 常量一致 |
| GEPA CLI | request、`--workspace-root`、`--runs-dir`、`--profile-path` | preflight/start/resume 生命周期结果 | 启动前只读校验；运行中冻结路径和摘要 |
| Prompt Evaluation CLI | 单候选请求、GAIA Manifest、模型配置 | NDJSON 事件和权威 `result.json` | 领域失败与基础设施失败分离 |
| GEPA Adapter | Candidate、单任务样本 | score、output、bounded trajectory | 只从权威 task 结果计分 |
| Profile Publisher | 最佳候选、冻结摘要、GAIA 目标文件 | best artifact、发布状态 | 原子写入；冲突不覆盖 |

GEPA Adapter 不读取 Docker、ACP 或 Runtime Trajectory 原文；它只消费公开 Prompt Evaluation 结果和有界产物定位器。GAIA adapter 继续拥有数据根目录、任务执行、评分和 Attempt 领域结果。

## Data Models

### 单任务 Manifest

```json
{
  "source": "huggingface",
  "loadedAt": "<iso-time>",
  "dataRoot": "/absolute/gaia-data",
  "tasks": [{
    "taskId": "<user-selected-task>",
    "question": "<gaia-question>",
    "expectedAnswer": "<validation-answer>",
    "level": 1,
    "split": "validation",
    "attachments": []
  }]
}
```

### GEPA 真实运行参数

请求继续使用当前 `gepa-run@1`，只在首轮测试配置中固定：`benchmark=gaia`、一条 train、一条不重复的 validation、`maxMetricCalls=4`、`reflectionMinibatchSize=1`、`seed=0`。凭据只由模型配置加载，不进入请求或冻结 Manifest。

### 产物归属

```text
<run-dir>/
  request.json       # 冻结请求，不含凭据
  run.json           # 模型、Profile 路径与摘要冻结
  state.json         # 生命周期权威状态
  artifacts/         # best-profile.json
  adapter/           # 单候选 Prompt Evaluation 目录
  report.json        # 稳定终态报告
```

GAIA Attempt、Goal Snapshot 和 Trajectory 保持在各自 Prompt Evaluation 输出目录中；报告只引用稳定路径和有界摘要。

## Error Handling

| 阶段 | 分类 | 处理 |
|---|---|---|
| 请求/Manifest/Profile preflight | `invalid_request` / `dataset` / `profile` | 在模型和容器副作用前失败；目标 Profile 不变 |
| Docker、预检、Worker、ACP、LLM RPC、持久化 | `infrastructure_error` / `protocol_error` | 保留已提交产物；不生成领域分数 |
| GAIA 正常作答但答案不正确 | `failed` | 保留 `domainResult`，分数为 `0.0` |
| GEPA 协作停止 | `stopped` | 保留 checkpoint 和最佳 artifact，不发布未确认目标 |
| 目标 Profile 摘要漂移 | `publish_blocked` | 保留最佳 artifact，拒绝覆盖目标文件 |
| 运行取消 | `cancelled` | 停止启动新样本，保留已完成 Attempt 和可回收产物 |

所有错误信息只保留有界、可定位的阶段和分类；不得从 stderr、Worker 日志或供应商原始响应补全权威结果。

## Research Findings

- GAIA 已在 Prompt Evaluation 生产 registry 中接线，现有 adapter 会把 Manifest 任务交给 `runGaiaSupervisor`；因此本 Spec 不重新实现 GAIA 评分或容器执行。
- GEPA 当前 Profile loader 将 `id` 限定为 `default`，而 GAIA adapter 要求 `gaia-worker-profile`；这是全链路启动前必须修复的身份不一致。
- GEPA protocol 和 Python DatasetValidator 均拒绝多任务 Manifest；单任务物化是保持当前公开协议不变的最小方案。
- 现有 GAIA worker smoke 使用确定性 LLM 和合成任务；它只能证明容器/Worker 生命周期，不能替代本 Spec 的真实模型验收。

## Testing Strategy

1. **确定性数据与 Profile 测试**：覆盖多任务源 Manifest 拆分、重复/缺失 task、非 validation、Level 3 拒绝、合法附件、缺失答案、路径越界和附件缺失，以及 GAIA Profile 物化与 Worker 常量漂移。
2. **GEPA 协议测试**：覆盖 `--profile-path` 解析、非 `default` Profile ID、冻结 Run Manifest、单任务校验、重复 train/validation、preflight 无副作用和目标文件摘要漂移。
3. **Prompt Evaluation 集成测试**：使用 fake model 验证 GAIA `passed`、`failed`、基础设施错误和取消的状态映射，确认 Attempt 与 artifact locator 保留。
4. **真实单任务闸门**：显式使用用户提供的 GAIA validation Level 1/2 任务、真实 Working LM 和 Docker；若为 Level 2 则同时验收附件挂载；验收 `result.json`、Attempt、Snapshot、Trajectory、领域分数和容器清理。
5. **真实 GEPA 闸门**：在单任务闸门通过后，显式执行 `preflight → start → status → report`；验收 Working/Reflection LM 身份、预算不超限、候选/最佳分数、终态和 GAIA Profile 发布或阻塞。
6. **安全与回归**：默认 `npm test` 不触发真实 E2E；检查请求、报告、Attempt 和 Profile artifact 不含凭据或完整供应商响应；执行依赖边界和现有 benchmark 回归。
