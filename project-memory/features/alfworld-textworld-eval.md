---
feature: alfworld-textworld-eval
status: active
summary: "提供基于独立 Conda 环境的 ALFWorld TextWorld 端到端可复现评测能力"
source_spec: specs/alfworld-textworld-eval/
distilled_at: 2026-09-03
reviewed_at: 2026-09-03
tags: [benchmark, alfworld, textworld, evaluation, tool]
authorities: [docs/architecture/README.md, benchmarks/alfworld/src/evaluation-runner.ts, benchmarks/alfworld/src/alfworld-tools.ts, benchmarks/alfworld/src/sidecar-client.ts]
---

# ALFWorld TextWorld Evaluation

## Purpose

- 为 LazyGoal 增加可重复、可选启用的 ALFWorld TextWorld 端到端评测套件，通过隔离环境与专用环境 Tool 驱动任务，收集机器可读的评测结果。 [S1, S2]

## Durable Decisions

- D1 — 评测使用独立的 Conda 环境与 Python sidecar 进程，评测依赖与 Node/TypeScript 生产运行时严格解耦，普通测试运行不强制要求该环境。 [S1, S2, S5]
- D2 — Agent 只能通过经 Profile 授权的专用 ALFWorld 环境 Tool（初始化、单步推进行动、关闭会话）与环境交互，严禁使用通用 Bash 替代环境 Tool。 [S1, S2, S4]
- D3 — 评测成功以环境返回的事实（`won`）为唯一判定标准，模型自主声明 `complete` 但环境未报告成功时判定为未成功。 [S1, S2, S3, S6]
- D4 — 任务集合、环境随机种子和运行配置必须显式记录并在结果中可追溯，确保跨提交与基准评测结果的可复现性。 [S1, S2, S3]

## Guardrails

- 严禁在生产运行时中硬编码对 ALFWorld 环境或协议的依赖。 [S1, S2, S3]
- 任务结束、失败或中断时必须显式调用关闭操作释放环境会话，防止子进程泄漏。 [S1, S2, S5]

## Revisit When

- 需要支持 ALFWorld THOR 视觉环境或跨多智能体协作评测时。
- 引入新的游戏引擎或基准交互协议时。

## Sources

- S1: `specs/alfworld-textworld-eval/requirements.md`
- S2: `specs/alfworld-textworld-eval/design.md`
- S3: `benchmarks/alfworld/src/evaluation-runner.ts`
- S4: `benchmarks/alfworld/src/alfworld-tools.ts`
- S5: `benchmarks/alfworld/src/sidecar-client.ts`
- S6: `benchmarks/alfworld/test/evaluation-runner.test.ts`
