# Context Benchmark 语义表

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Script stage | 当前用户操作及完成后的预期边界。 | [Context Benchmark](../README.md) | [脚本契约](../src/scenario.ts) |
| Checkpoint | 静止已提交边界的 Snapshot、历史与文件包。 | [Context Benchmark](../README.md) | [检查点契约](../src/checkpoint.ts) |
| Candidate | 尚待人工复核的采集材料。 | [Context Benchmark](../README.md) | [模块说明](./overview.md) |
| Frozen case | 具备人工批准和内容身份的不可覆盖版本。 | [Context Benchmark](../README.md) | [冻结契约](../src/corpus.ts) |
| Paired evaluation | 隔离的恢复后缀与完整执行参照。 | [Context Benchmark](../README.md) | [Runner](../src/runner.ts) |
| Combined score | 确定性检查、隔离约束与 Judge 的联合结果。 | [Context Benchmark](../README.md) | [评分契约](../src/evaluator.ts) |

| 模型诊断 Trace | 回收的调用关联诊断，供检查非法响应，非恢复依据。 | [Agent 模型请求](../../../packages/agent/README.md) | [诊断说明](../../../packages/agent/notes/overview.md) |
