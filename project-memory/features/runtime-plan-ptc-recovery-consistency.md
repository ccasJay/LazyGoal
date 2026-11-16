---
feature: runtime-plan-ptc-recovery-consistency
status: active
summary: 最终审查拒绝后可在原 Plan Run 重开末阶段修正，程序批次按单点消费队列推进，恢复导航只消费各 Run Snapshot 提交水位内的事实
source_spec: specs/runtime-plan-ptc-recovery-consistency/
distilled_at: 2026-11-16
reviewed_at: 2026-11-16
tags: [plan-stage, stage-reopen, review-rejection, ptc-batch, batch-ordering, navigation, committed-watermark, recovery-consistency, runtime]
authorities: [packages/runtime/src/run-plan.ts, packages/runtime/src/runner.ts, packages/runtime/src/run-recovery-reader.ts, packages/runtime/test/run-plan-review-reopen.test.ts, packages/runtime/test/program-batch.test.ts, packages/runtime/test/run-recovery-reader.test.ts, packages/runtime/test/run-navigation-recovery.test.ts]
---

# Plan 阶段重开、程序批次推进与恢复导航水位

## Purpose

- 让最终审查拒绝后仍可继续修正原 Plan 阶段，保留已完成工作与批准范围。 [S1]
- 让批次内的程序调用与其余 Action 按模型顺序推进，等待和恢复后仍从正确位置继续。 [S1]
- 让恢复后的模型导航只依据权威 Snapshot 一致的工作历史，继续执行时使用可核验的阶段结果与重要信息。 [S1]

## Durable Decisions

- D1 — 末阶段重开是阶段结算：Plan Run 最后阶段已接受、最终交付候选被审查拒绝时，同一检查点一次提交拒绝反馈、重开的 `currentStage`、路线末阶段状态与回拨后的 `nextStageIndex`，两处接受指针同时清除；前序阶段与旧接受事实保留。重开保留已批准路线内容与版本，同一 Run、阶段身份、修订、批准范围及累计预算沿用既有语义；只有通过最终审查才完成 Run，拒绝后的下一模型输入包含缺口且无被拒候选的正式答复或 Memory Patch。原本执行中的路线游标保持在末阶段；恢复后沿用已保存拒绝反馈与批准范围，重新接受时追加新接受事实，两处指针共同指向新事实。 [S1, S2, S3, S5]
- D2 — 拒绝持久化失败语义：拒绝事实追加后 Snapshot 保存失败时保留原阶段与路线，未提交的拒绝不生效；Snapshot 已保存而 marker 写入失败时两处状态均已更新，继续传播 marker 故障，恢复以已保存状态为准。重开由 Plan 路线所有者表达并由 Runner 与现有阶段拒绝转换合成一次提交，满足 Storage 跨字段约束。 [S1, S2, S3, S5]
- D3 — 程序批次单点消费：无需父级审批的 `execute_program` 作为新批次队首、持久批次后续成员或末项时，程序开始检查点在同一检查点保存父 Action 的程序状态与消费队首后的剩余批次；批次身份与剩余顺序稳定，末项消费后清除游标。程序结算后从下一项继续，已消费的程序不重新入队，中间无额外 Decide。父程序需审批或程序子工具等待审批、未知结果决定、宿主重启时，父级等待检查点已消费当前批次项、批准启动程序时保留其余项，指针不二次推进；父程序未结算时后继项不执行，成功结算后按原顺序继续。 [S1, S3, S6]
- D4 — 程序开始检查点失败边界：程序开始检查点保存失败时不启动本次程序，已保存批次仍按原位置恢复；保存成功后以同一检查点的父程序身份、子调用位置和剩余批次为准，沿用现有恢复门禁，已保存但 worker 未启动即中断时按已保存检查点恢复。 [S1, S3, S6]
- D5 — 导航按各 Run 提交水位：从 Snapshot 为当前与归档 Run 恢复历史阶段和 Context Notes 时，以每个 `(goalId, runId)` 各自的 `committedThroughSequence` 选取可见事实；事实追加后保存失败遗留的接受记录与 note 修订不进入导航，Snapshot 已保存时缺失 marker 不降低可见水位。导航读取遇 I/O 或协议错误，或启用 Trajectory 的 Run 声明非零水位但缺少该提交边界时，返回保留 Goal/Run 身份与原错误的恢复失败并停止本次依赖该导航的模型推进；确实无历史的空结果与未配置 Trajectory 的受支持入口沿用既有语义。 [S1, S4, S7, S8]
- D6 — 实时与冷恢复投影一致：同一 Snapshot 水位下实时推进与冷恢复重建提供相同的历史接受结果与有效 note 版本；重开的当前阶段显示执行中，历史条目保留最近一次已提交的接受结果及其版本直到重新接受。旧 Run 历史仍只用于导航，当前完成 Evidence 继续受本 Run 校验。RunRecoveryReader 读取各 Run 的提交视图，Runtime 维护瞬时导航投影的增量与重建语义，`model-context` 消费投影；Snapshot 持有可见水位、Trajectory 持有事实，导航不另存历史副本。 [S1, S4, S7, S8]

## Guardrails

- 阶段重开沿用现有 Storage 跨字段校验、审批与未知结果恢复门禁；不新增对已批准路线内容或版本的改写。 [S1, S2]
- 程序批次不做并行、不重排、不重复入队；PTC 活动时间预留继续按既有恢复规则计费。 [S1, S3]
- 导航的提交过滤仅适用于导航来源，不改变其他读取路径的可见性；跨 Run 重名阶段按 Run 归属区分，旧 Run 事实不得用于当前完成证据。 [S1, S4]
- 验收使用文件 Snapshot 与 Trajectory、正式 Decide 多调用解码及 macOS Seatbelt PTC worker 的隔离执行，不依赖真实模型。 [S1]

## Revisit When

- Plan 路线结构、阶段审查或接受指针的存储约束变化时。
- 程序批次需要并行执行、动态重排或跨 Run 继承批次时。
- 导航可见水位引入跨 Run 聚合、新增 Context Notes 种类或新的投影消费者时。
- `model-context` 的导航消费契约或 Trajectory 提交水位语义（见 `project-memory/features/execution-trajectory.md`）调整时。

## Sources

- S1: `specs/runtime-plan-ptc-recovery-consistency/spec.md`
- S2: `packages/runtime/src/run-plan.ts`
- S3: `packages/runtime/src/runner.ts`
- S4: `packages/runtime/src/run-recovery-reader.ts`
- S5: `packages/runtime/test/run-plan-review-reopen.test.ts`
- S6: `packages/runtime/test/program-batch.test.ts`
- S7: `packages/runtime/test/run-recovery-reader.test.ts`
- S8: `packages/runtime/test/run-navigation-recovery.test.ts`
