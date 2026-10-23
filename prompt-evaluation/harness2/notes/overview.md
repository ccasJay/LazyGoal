# Harness2 优化

基于 Google Research Harness²（`Propose–Probe–Compose`）方法论的离线框架与 Prompt 协同优化器。本文描述当前实现、使用边界与限制；[公开入口](../src/lazygoal_harness2/cli.py)。

## 职责与使用

`prompt-evaluation/harness2` 独立于 [`packages/runtime`](../../../packages/runtime/README.md)，通过 [`lazygoal eval prompt`](../../../benchmarks/README.md) 与 [`lazygoal gepa reflect`](../../../benchmarks/src/prompt-evaluation/reflection-bridge.ts) 驱动双轨（Invariant + Domain）候选迭代：

- **可编辑面（Mutable Surface）**：由 [`HarnessWorkspace`](../src/lazygoal_harness2/workspace.py) 将 5 个可调 Prompt Bundle 模板（`global-overview@1`、`agent-decision@1`、`agent-think@1`、`authorized-tools@1`、`run-mode@1`，即 Invariant Edits）与 SWE-bench `AgentProfile` 的 `systemPrompt`/`instructions`（即 Domain Edits）投影为模块化文件树，自动提取变更模板为 `templateOverrides`。
- **全量 Trajectory 可见与对比（Contrastive Trajectory Comparison）**：[`trajectory_reader.py`](../src/lazygoal_harness2/trajectory_reader.py) 从 `PromptEvaluationResultV1` 的 `artifactLocator.trajectory` 读取完整已提交 JSONL Trajectory 事件流（对 API Key/Bearer Token 自动脱敏），并为 Compose 阶段构造 Baseline vs. Probe 逐题对比视图（消除的故障码 vs. 新引入的故障码）。
- **持久化改进库（Improvement Library）**：[`ImprovementLibrary`](../src/lazygoal_harness2/library.py) 按 `scope`（`"invariant"` | `"domain"`）持久化每次 Probe 的假设、目标故障码、`avgScoreDelta` 与 `avgFaultDelta`。
- **产物导出与回写**：[`exporter.py`](../src/lazygoal_harness2/exporter.py) 在 Run 目录下的 `exports/` 产出 `best-profile.json`、`prompt-bundle/*.njk`、标准 `git apply` unified diff 格式的 `prompt-bundle.patch` 以及 `improvement-library.json`，支持通过 `lazygoal harness2 apply --run <runId>` 应用回隔离 worktree。

## 命令行入口

```text
lazygoal harness2 preflight --request <request.json>
lazygoal harness2 start --request <request.json> [--detach]
lazygoal harness2 status --run <runId>
lazygoal harness2 stop --run <runId>
lazygoal harness2 resume --run <runId> [--detach]
lazygoal harness2 report --run <runId>
lazygoal harness2 wait --run <runId>
lazygoal harness2 apply --run <runId> [--profile-output <path>]
```

## 边界与限制

- 仅允许覆盖白名单内的 5 个 `.njk` 模板；其余纯数据投影模板（`profile@1`、`working-memory@1`、`approved-task@1`、`goal-plan@1`、`goal-context-navigation@1`）与 Runtime 状态机、工具实现、Schema 编译器保持锁定。
- Probe 阶段使用 SWE-bench 容器内执行 + 宿主 [`runtime-error-scorer.ts`](../../../benchmarks/swebench/src/runtime-error-scorer.ts) 毫秒级计算 `runtimeScore` 与 `zeroFaultPass`，跳过耗时的官方 `swebench` 判题容器；收尾阶段支持对保留的 `.patch` 产物离线执行 `lazygoal grade swebench`。
