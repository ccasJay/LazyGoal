---
feature: context-benchmark-integration
status: active
summary: "LazyGoal 原生 Context Benchmark 自动化底座，支持固定脚本自动跨 Run、安全检查点捕获与恢复、独立 Docker 配对评测与确定性及 Judge 双重评分"
source_spec: specs/context-benchmark-integration/
distilled_at: 2026-10-15
reviewed_at: 2026-10-15
tags: [benchmark, context, headless, docker, checkpoint, pairing, evaluation, judge]
authorities: [benchmarks/notes/overview.md, benchmarks/context/notes/overview.md, benchmarks/context/src/runner.ts, benchmarks/context/src/script-driver.ts, benchmarks/context/src/checkpoint.ts, benchmarks/context/src/corpus.ts, benchmarks/context/src/evaluator.ts, benchmarks/context/src/judge.ts, benchmarks/src/headless-composition-root.ts, benchmarks/context/test/script-driver.test.ts, benchmarks/context/test/checkpoint.test.ts, benchmarks/context/test/corpus.test.ts, benchmarks/context/test/evaluator.test.ts, benchmarks/context/test/grading-isolation.test.ts, benchmarks/context/test/paired-runner.test.ts]
---

# Context Benchmark Integration

## Purpose

- 建立 LazyGoal 原生 Context Benchmark 自动化底座，支持固定脚本驱动多 Run 执行、安全检查点捕获与环境隔离恢复，以及从头与恢复两组配对评测与独立双重评分。 [S1, S2, S3, S5, S6, S8, S9, S10]

## Durable Decisions

- D1 — 在共享组合根 `benchmarks/src/headless-composition-root.ts` 提取 Headless 会话组装，复用 Runner、Coordinator 与持久化端口支持 launch、continue、resume、restore 和 close 生命周期，并在同一 Goal 内接入真实 Context Lookup 与 ModelInput 记录。 [S1, S3, S4, S8]
- D2 — 宿主通过 `benchmarks/context/src/script-driver.ts` 读取冻结场景脚本驱动推进，每次仅向 Worker 发送当前阶段消息与操作（continue 或 resume），按真实终态与 waiting 边界推进；状态、等待类型或阶段顺序不符时停止推进，预算超限取消，不动态追加补救 prompt。 [S1, S5, S8, S11]
- D3 — 检查点仅在声明的静止边界（终态或 waiting）并在确认 Worker 与新增子进程完全停止后发布；清单包含 Snapshot、Committed Histories、模型输入、环境文件哈希、镜像与 Worker 构建指纹，恢复时强校验材料完整性与协议一致性，损坏明确拒绝，禁止静默重新采集。 [S1, S6, S8, S12]
- D4 — 候选用例经人工审核脚本、环境、检查点、可执行判据与 rubric 齐全后明确冻结入库，清单绑定批准人、时间与内容哈希；已冻结集合不可覆写，prompt 或评分材料修改产生新候选重新审核，挑战集晋升核心集须重新批准。 [S1, S7, S8, S13]
- D5 — 恢复组（从冻结检查点执行剩余脚本）与从头执行组（初始环境执行完整脚本）分别在独立 Docker 容器与持久化目录运行；固定执行模型、Profile 与预算政策，分别呈现采集、续接与从头成本，保留两组前缀来源差异，单组中断保留另一组与完整分母。 [S1, S8, S14]
- D6 — 确定性 verifier 在 Worker 退出后由独立评测进程执行，隐藏材料不向 Agent 暴露且不修补产物；独立 Judge 评估开放式解释，综合验收须确定性检查与 Judge 门槛同时满足，确定性失败或隔离违规优先判定失败，Judge 高分不可覆盖。 [S1, S9, S10, S15, S16]

## Guardrails

- 未经人工复核与内容哈希校验的候选用例不得进入冻结集，同一冻结版本禁止原地修改。 [S1, S7, S8, S13]
- 检查点仅限在静止边界（终态或 waiting）捕获，存在未完成工具调用或残留子进程时禁止发布检查点。 [S1, S6, S12]
- 确定性检查失败或隔离违规时综合判定必定为 failed，Judge 高分不得覆盖。 [S1, S9, S10, S15, S16]
- 配对评测两组必须严格使用独立容器与存储目录，禁止跨组状态泄漏或共享可变文件。 [S1, S8, S14]

## Revisit When

- 当 Benchmark 共享 Headless 架构、ACP Worker 契约或容器生命周期发生重大重构时。
- 当新增公开数据集接入模式、动态交互策略或评测任务类别扩展时。

## Sources

- S1: `specs/context-benchmark-integration/spec.md`
- S2: `specs/context-benchmark-integration/plan.md`
- S3: `benchmarks/src/headless-composition-root.ts`
- S4: `benchmarks/src/file-persistence-adapter.ts`
- S5: `benchmarks/context/src/script-driver.ts`
- S6: `benchmarks/context/src/checkpoint.ts`
- S7: `benchmarks/context/src/corpus.ts`
- S8: `benchmarks/context/src/runner.ts`
- S9: `benchmarks/context/src/evaluator.ts`
- S10: `benchmarks/context/src/judge.ts`
- S11: `benchmarks/context/test/script-driver.test.ts`
- S12: `benchmarks/context/test/checkpoint.test.ts`
- S13: `benchmarks/context/test/corpus.test.ts`
- S14: `benchmarks/context/test/paired-runner.test.ts`
- S15: `benchmarks/context/test/evaluator.test.ts`
- S16: `benchmarks/context/test/grading-isolation.test.ts`
