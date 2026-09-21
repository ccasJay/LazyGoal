---
name: lg-gepa-optimization
description: 在 LazyGoal 仓库中启动 GEPA Prompt 自进化、优化 default Agent Profile，或查询、停止、恢复和汇报已有 GEPA Run 时使用。普通 benchmark 评测、手工 Prompt 编辑、GEPA 算法开发和全局 Skill 安装不使用本 Skill。
---

# LazyGoal GEPA 优化

只通过公开的 `lazygoal gepa` 生命周期 CLI 管理运行。CLI 是 Run 状态、Worker 所有权、checkpoint 恢复和 Profile 发布的唯一控制边界；不要直接管理 Worker 进程、读取或修改 `.lazygoal/gepa/runs/` 内部状态、解析 GEPA checkpoint，或直接调用模型。

## 意图路由

| 用户意图 | 前置条件 | 命令 | 确认要求 |
|---|---|---|---|
| 检查新运行 | 用户提供的 request，或足以构造 request 的数据 | `lazygoal gepa preflight --request <path>` | 无 |
| 启动新运行 | 当次成功的 preflight | `lazygoal gepa start --request <path> --yes` | 必须批准当次摘要 |
| 查询进度 | 精确 `runId` | `lazygoal gepa status --run <runId>` | 无 |
| 请求停止 | 精确 `runId` | `lazygoal gepa stop --run <runId>` | 无；只请求协作停止 |
| 恢复运行 | 精确 `runId` 和刚读取的 status | `lazygoal gepa resume --run <runId> --yes` | 必须批准当前恢复摘要 |
| 查看终态报告 | 精确 `runId` | `lazygoal gepa report --run <runId>` | 无 |

可按 CLI 的实际部署方式附加 `--workspace-root` 或 `--runs-dir`，但不要改变以上路由。缺少 `runId` 且上下文不能唯一确定时，请用户提供；不要猜测“最近运行”。

## 准备新运行

只使用用户明确提供的单一 benchmark、train/validation 单任务 Manifest 集合、正整数 metric 预算和可选整数 seed。不要扫描仓库来挑选数据集，也不要编造或替换路径。缺少任一必需输入时先索取输入，不执行 preflight 或 start。

若用户没有给出 request 文件，可把下列当前协议写到 `.lazygoal/gepa/requests/` 或系统临时目录；文件不得包含凭据：

```json
{
  "protocol": "gepa-run@1",
  "benchmark": "alfworld",
  "trainset": [
    {
      "sampleId": "user-provided-sample-id",
      "taskId": "user-provided-task-id",
      "manifestPath": "user-provided-manifest-path"
    }
  ],
  "valset": null,
  "maxMetricCalls": 20,
  "reflectionMinibatchSize": null,
  "seed": null
}
```

`benchmark` 只接受当前 CLI 支持的值；不要靠本 Skill 猜测。每个 Manifest 必须恰含一个与 `taskId` 一致的任务。省略 validation 时 CLI 以 trainset 作为 validation；不要把空数组当作省略。

始终先运行 preflight。它是只读检查，不等于启动授权。失败时：

1. 报告 CLI 返回的错误类型，以及相关 request、Manifest、模型配置或目标 Profile 路径。
2. 给出一个最小修复动作。
3. 停止流程；不要构造 start、自动改配置或换数据重试。

## 确认并启动

preflight 成功后，展示当次返回值中的：

- benchmark 和 train/validation 样本数；
- `maxMetricCalls`；
- Working LM 与 Reflection LM 的 profile、provider 和 model；
- 目标 `.lazygoal/profiles/default.json`；
- 本次运行会产生模型费用和容器执行，成功发布会整体替换目标 Profile 的 `systemPrompt + instructions`。

询问用户是否批准这份当前摘要。只有紧接这份摘要的明确批准才可执行 `start --yes`；旧请求、旧 Run 或笼统的 GEPA 授权都不能复用。用户拒绝或未明确回答时停止，不调用 start。

start 成功后只报告 CLI 返回的 `runId`、`lifecycleStatus` 和 `runDir`，并说明后台 Worker 已接管；`starting` 不表示优化完成。不要回显 `workerPid`，除非用户明确需要诊断非敏感运行信息。

## 管理已有 Run

### 查询与停止

status 是唯一的运行状态查询入口。汇报 `runId`、`lifecycleStatus`、`workerHealth`、metric calls 已用/上限、候选数、最佳分数、publication 状态和停止请求；错误存在时附错误分类和最小下一步。

区分 `running`、`stop_requested`、`stopped`、`succeeded`、`publish_blocked` 和 `failed`。Worker 为 `stale` 或 `lost` 时只报告权威 status 和恢复前置条件，不自动恢复。

stop 只写协作停止标记。返回 `stop_requested` 时表述为“已请求停止，等待 Worker 到达安全点”，不得表述为已停止；不要发送进程信号、删除 Run 目录或清理产物。

### 恢复

恢复前先对同一精确 `runId` 调用 status。展示当前状态、Worker health、预算已用/上限、候选与最佳分数、冻结模型和目标 Profile 发布影响；冻结摘要无法从 status 确认时，说明 CLI 将在 resume 中校验，但不要读取内部 manifest 补齐。

只有用户明确批准这份当前恢复摘要后才执行 `resume --yes`。start 的批准、另一个 Run 的批准或恢复前的旧 status 都无效。Worker 仍 active/stale/lost、Run 已成功或发布阻塞、Profile 或模型漂移、checkpoint 缺失/损坏时，保留 Run 并报告 CLI 阻塞；不要自行修补 checkpoint、状态或 Profile，也不要自动重跑。

## 终态报告

终态只调用 report，不从日志、trajectory、pickle、checkpoint 或内部 state 推导结果。报告以下稳定字段：

- benchmark 与 train/validation 数量；
- metric 预算消耗与上限；
- 候选数量、最佳分数和最佳 candidate ID；
- best Profile artifact 路径；
- terminal status、publication status 和错误分类；
- 一个与当前状态紧邻的最小下一步。

优化完成和发布完成是两个事实。只有 terminal status 为 `succeeded` 且 publication 为 `published` 或 `unchanged`，才说明运行完整成功。`publish_blocked` 表示优化产物仍保留，但目标 Profile 在运行期间变化、未被覆盖；提供 best Profile artifact 路径，不建议绕过摘要保护或强制覆盖。

report 尚未就绪时先用 status；不要轮询到无限期，也不要自动安排 heartbeat 或 scheduler。

## 错误与信息边界

- CLI 成功输出必须是可解析的单行 JSON。输出损坏、协议未知或字段含义不明时报告协议阻塞并保留 Run；不要从 stderr、日志或私有文件猜测状态。
- 不读取、写入或回显 API key、Authorization header、完整供应商响应、thinking、原始 reflection 内容或完整 Diagnostic Trace。
- 不在 request 或汇报中包含凭据。路径和 CLI 稳定标识可报告；完整 Prompt 只在用户另行明确请求读取非敏感 artifact 时处理。
- 生命周期错误不授权修改 default Agent Profile、重跑模型、绕过 `--yes`、强制发布或安装全局 Skill。
- 默认验证只能使用 validator、静态检查和 fake transcript；不得启动真实 Worker、Docker、网络请求或付费模型调用。
