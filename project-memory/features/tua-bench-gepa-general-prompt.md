---
feature: tua-bench-gepa-general-prompt
status: active
summary: "基于 TUA-Bench 驱动 LazyGoal 通用 Prompt 自主进化的 GEPA 适配器，包含无特权 Docker 权限管理、两阶段候选变异、确定性 reward 评分、Final Comparison 配对对照与断点安全恢复"
source_spec: specs/tua-bench-gepa-general-prompt/
distilled_at: 2026-09-25
reviewed_at: 2026-09-25
tags: [gepa, tua-bench, prompt-optimization, container-isolation, reflection, dac-permissions, checkpoint-resume]
authorities: [docs/architecture/README.md, benchmarks/tua-bench/src/environment-spec.ts, benchmarks/src/prompt-evaluation/cli.ts, prompt-evaluation/gepa/src/lazygoal_gepa/final_comparison.py, prompt-evaluation/gepa/src/lazygoal_gepa/store.py, prompt-evaluation/gepa/src/lazygoal_gepa/worker.py]
---

# TUA-Bench GEPA General Prompt

## Purpose

- 将 TUA-Bench 终端任务集作为通用 Agent Prompt 自进化与泛化评测基准接入 GEPA，支持多任务族划分、两阶段候选变异（systemPrompt 与 instructions）、无特权容器安全隔离、防泄漏脱敏审计、最终配对对照评估与跨中断安全断点恢复。 [S1, S2, S3]

## Durable Decisions

- D1 — 容器无特权 DAC 属主自适应提权与清理：在 `--cap-drop ALL --security-opt no-new-privileges` 严格沙箱中，root 缺乏 `CAP_FOWNER` 和 `CAP_DAC_OVERRIDE`；通过 `docker cp` 进入容器的私有验证素材属主为宿主机 UID（如 501），必须探测其实际 UID 并以该属主显式 `chmod a+rwX` 赋予宽容权限，在清理时通过属主权限预清理后再由 root 强制移除；针对官方评测脚本硬编码问题建立 `/tests` 软链接并在退出时还原。 [S3, S4]
- D2 — 候选两字段独立变异与安全脱敏审计：GEPA 优化空间固定为目标 Profile 的 `systemPrompt` 与 `instructions` 两个可变文本字段；每次变异生成候选前必须通过正则与字面匹配进行任务敏感词/答案审计，若命中潜在题目泄漏则立即阻断正向晋升结论。 [S1, S2, S7]
- D3 — Final Comparison 规范请求负载与配对对照契约：最终比对执行前，通过子进程调用 `inspect-tua` 验证冻结数据集身份，请求负载必须严格采用 `{"tuaDataset": dataset.to_dict()}` 顶层包裹格式，CLI 端实施双向解包容错；对比计划固定对 Holdout 任务开展 Seed 与 Candidate 间的多试次双盲配对测试，确保评估严谨。 [S5, S6]
- D4 — 失败态断点恢复放行与 Checkpoint 完整性校验：`store.update_state` 状态迁移允许从 `failed` 或 `stopped` 状态且具备有效 `gepa_state.bin` 检查点的运行，在通过预检 `confirmationDigest` 显式确认后安全转入 `starting` -> `running`，支持基础设施偶发故障排查后继续完成后续比对，避免高昂的 LLM 与容器计算预算浪费。 [S8, S9]
- D5 — Candidate-Only 默认发布策略：GEPA 运行默认采用 `candidate-only` 策略，生成的所有优质变异 Profile 仅作为单次 Run 的持久化产物落盘至 `artifacts/best-profile.json`，严禁在未经用户明确批准的情况下自动篡改全局或本地默认 Profile (`~/.lazygoal/agent-profiles/default.json`)。 [S1, S2, S9]

## Guardrails

- 严禁在 Docker 隔离环境中为追求清理便利而重新引入特权模式或保留危险 capabilities。 [S3]
- 严禁直接修改或跳过 Final Comparison 数据集身份校验，防止历史评估数据因测试集漂移失效。 [S5]
- 任何从 terminal 状态（`stopped` / `failed`）的恢复必须经过 preflight 重新计算 `confirmationDigest`，输入或 Checkpoint 发生漂移必须强行拒绝。 [S8, S9]
- 严禁将带有敏感任务答案、提示词泄漏或未通过安全脱敏审计的 Candidate 晋升为可用 Profile。 [S7]

## Revisit When

- 当 Docker 支持原生 rootless user namespace 映射使容器内外 UID 完全解耦时。
- 当 GEPA 核心演化算法支持 Profile 更多组件（如 toolIds 动态裁剪）时。
- 当 Final Comparison 拓展至大规模多 Benchmark 自动化分布式并行评测时。

## Sources

- S1: `specs/tua-bench-gepa-general-prompt/requirements.md`
- S2: `specs/tua-bench-gepa-general-prompt/design.md`
- S3: `benchmarks/tua-bench/src/environment-spec.ts`
- S4: `benchmarks/tua-bench/src/worker-entry.ts`
- S5: `prompt-evaluation/gepa/src/lazygoal_gepa/final_comparison.py`
- S6: `benchmarks/src/prompt-evaluation/cli.ts`
- S7: `prompt-evaluation/gepa/src/lazygoal_gepa/reporter.py`
- S8: `prompt-evaluation/gepa/src/lazygoal_gepa/store.py`
- S9: `prompt-evaluation/gepa/src/lazygoal_gepa/controller.py`
