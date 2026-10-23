# Harness2 优化语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Harness2Candidate | 同时携带 AgentProfile 与 `.njk` 模板覆盖的双轨优化候选。 | [Harness2 优化](../README.md) | [数据模型](../src/lazygoal_harness2/models.py) |
| Propose–Probe–Compose | 提案生成、子集探针评测与对比轨迹合成的三阶段循环。 | [Harness2 优化](../README.md) | [循环引擎](../src/lazygoal_harness2/loop.py) |
| ImprovementLibrary | 按 Invariant 与 Domain 分类持久化的历史改进库。 | [Harness2 优化](../README.md) | [改进库实现](../src/lazygoal_harness2/library.py) |
| Contrastive trajectory view | 同一任务上 Baseline 与 Probe 全量已提交轨迹的故障与得分对比。 | [Harness2 优化](../README.md) | [轨迹读取器](../src/lazygoal_harness2/trajectory_reader.py) |
