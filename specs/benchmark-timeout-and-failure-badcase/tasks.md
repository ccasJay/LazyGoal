# 评测超时与决策失败 Badcase 归类及协议对齐 实施任务

- [ ] //TODO 1. 解耦单任务超时与外部取消信号 (IsolatedEnvironment)

  - 实现目标：在 `benchmarks/src/isolated-environment.ts` 中区分外部调用方传入的 `options.signal` 与单任务时限 `taskTimeoutMs`，超时时终止当前容器但记录特定超时原因，不标记为全局 `cancelled`
  - 成功判据：单任务超时触发后，环境结果携带 `TASK_TIMEOUT` 标识且未标记为 `cancelled`；外部 `signal` 触发时依然正确标记为 `cancelled`
  - 验证方式：待实现的 `IsolatedEnvironment` 超时与取消单元测试；`pnpm --filter @lazygoal/benchmarks test`
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2)_

- [ ] //TODO 2. 将超时与模型决策错误映射为领域失败并保留轨迹 (GaiaSupervisor)

  - 实现目标：在 `benchmarks/gaia/src/supervisor.ts` 中，将单任务超时（`TASK_TIMEOUT`）和模型非法决策（`INVALID_AGENT_DECISION`）判定为未作答领域失败（`status: "completed"`, `domainResult.correct: false`），保留 Attempt 中的 Goal 快照与 Trajectory，真实容器/API 崩溃仍归为 `infrastructure_error`
  - 成功判据：超时或决策错误终止的任务生成 `completed` 且 `correct: false` 的 Attempt 记录并包含完整轨迹路径；真正基础设施故障仍标记为 `infrastructure_error` 且无领域得分
  - 验证方式：待补充更新的 `benchmarks/gaia/test/prompt-evaluation-adapter.test.ts` 判定用例；`pnpm --filter @lazygoal/benchmarks test`
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3)_

- [ ] //TODO 3. 对齐 Python 协议阶段白名单 (lazygoal_gepa)

  - 实现目标：在 `prompt-evaluation/gepa/src/lazygoal_gepa/protocol.py` 中，将 `"cancelled"` 加入 `_PROGRESS_STAGES` 白名单，与 TypeScript 端进度事件保持一致
  - 成功判据：Python 协议解析器正常解析 `stage: "cancelled"` 的进度事件，不再抛出 `PromptEvaluationProtocolError` 异常
  - 验证方式：待实现的 `prompt-evaluation/gepa/tests/test_protocol.py` 协议阶段测试；`prompt-evaluation/gepa/.venv/bin/pytest`
  - _Requirements: [3.1](./requirements.md#req-3-1)_

- [ ] //TODO 4. 验证 Prompt Evaluation 失败汇总与 GEPA 串联

  - 实现目标：验证 `PromptEvaluationRunner` 在单任务超时和模型决策错误场景下输出 `task status: "failed"` 且 CLI 以退出码 0 正常退出，确保 GEPA 能够顺利接收 Badcase 轨迹并进入后续反思阶段
  - 成功判据：单任务领域失败时 CLI 退出码为 0，任务状态报告为 `failed`，GEPA 提取轨迹作为 Badcase 不中断优化流程
  - 验证方式：Prompt Evaluation 失败汇总测试；`pnpm --filter @lazygoal/benchmarks test`
  - _Requirements: [3.2](./requirements.md#req-3-2)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) | 任务耗时达到 `taskTimeoutMs` 上限时终止容器且内部状态标记为超时，不触发全局取消 | `IsolatedEnvironment` 超时单元测试（待实现） |
| [1.2](./requirements.md#req-1-2) | 外部显式 signal 触发时立即终止执行并将状态标记为 `cancelled` | 取消信号处理测试（待实现） |
| [2.1](./requirements.md#req-2-1) | 任务因超时或决策错误终止时生成 `status: "completed"` 且 `domainResult.correct = false` | Supervisor 领域判定测试（待更新） |
| [2.2](./requirements.md#req-2-2) | 超时或决策错误终止的 Attempt 记录中保留对应的 Goal 快照与 Trajectory 路径 | Attempt 轨迹留存测试（待更新） |
| [2.3](./requirements.md#req-2-3) | 真正基础设施故障（容器创建失败、Worker 崩溃等）标记为 `infrastructure_error` 且无领域得分 | 基础设施故障处理测试（待更新） |
| [3.1](./requirements.md#req-3-1) | Python 协议解析器正确解析 `stage: "cancelled"` 的进度事件，不抛出阶段非法错误 | Python 协议阶段白名单测试（待实现） |
| [3.2](./requirements.md#req-3-2) | 单任务发生领域失败时，Prompt Evaluation CLI 以退出码 0 退出且汇总状态为 `failed` | Prompt Evaluation CLI 退出与汇总测试（待实现） |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。

