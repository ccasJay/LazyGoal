---
feature: three-view-architecture
status: active
summary: "Runtime/Storage/LLM 三视图分层、Codec/Projector 转换边界与 Legacy 删除"
source_spec: specs/three-view-architecture/
distilled_at: 2026-08-19
reviewed_at: 2026-08-19
tags: [three-view, codec, projector, dependency-boundary, storage, agent, legacy-removal]
authorities: [docs/architecture/README.md, docs/architecture/runtime.md, docs/architecture/storage.md, docs/architecture/agent.md, packages/storage/src/goal-snapshot-codec.ts, packages/agent/src/model-inference-projector.ts, scripts/check-dependencies.mjs]
supersedes: [project-memory/features/goal-session-persistence.md]
---

# Three-View Architecture

## Purpose

- Goal/Session 数据被明确区分为 Runtime State（唯一领域真相）、Storage Snapshot（持久化表示）与 LLM Input View（模型投影）三个独立类型视图，只经 Codec 与 Projector 两个受验证边界交换数据。 [S1, S2, S3]
- 严格非 Legacy v3 Goal 的持久化、Prompt 语义与 Action/Observation 执行恢复结果保持不变，旧协议被显式删除。 [S1, S2, S4]

## Durable Decisions

- D1 — Runtime `Goal` 不再携带 `metadata.schemaVersion`；`RunState` 只保留当前 Action/Observation 协议所需的 `checkpoint`、`lastStep`、`pendingAction`、`stopReason`，其余旧运行状态类型删除。 [S1, S2, S5]
- D2 — Goal Codec 只接受严格 v3：decode 校验后构造不含 metadata 的新 Goal，encode 补入 `{ schemaVersion: 3 }` 并二次跨字段校验；v1、v2 与含 `legacy StepRecord` 的 v3 统一以稳定协议错误拒绝，绝不迁移或回写原文件。 [S1, S2, S3]
- D3 — `ModelInferenceView`（DTO 文件不导入 Runtime）由独立 Projector 逐字段复制生成新对象，覆盖 Profile 指令、真实会话、阶段化 Working Context 与已授权 Tool 描述，排除 Snapshot 版本、迁移标记与瞬时执行资源。 [S1, S2, S4]
- D4 — `StepResult`、`LegacyStepExecutor`、`legacy StepRecord`、旧 `RunInput.step` 及其 overload 全部删除；Runner 统一为单一 `AgentDecision` 路径，非协议 Executor 异常规范化为当前 `fail` Decision 并保持失败/计步/用户可见错误语义。 [S1, S2, S5]
- D5 — 源码依赖固定：`packages/runtime` 不导入 `storage`/`agent`；`storage` 与 `agent` 各自依赖 `runtime` 且互不依赖；只有 Codec 与 Projector 允许同时看到两侧类型；`tui` 作为 Composition Root 组合具体实现。 [S1, S2, S6]

## Guardrails

- View DTO 与 Renderer 不导入 Runtime；Storage DTO/Schema 不导入 Runtime；依赖方向由 `scripts/check-dependencies.mjs` 自动校验，新增依赖须更新其白名单。 [S2, S6]
- Codec/Projector 只转换保存或投影边界的数据：不启动 Tool、不重排 Transition、不吞 Store 错误，也不捕获 LLM Adapter、Tool 或中止错误。 [S2, S3, S4]
- Action 周期不变：`stage_action → 持久化 pendingAction → Tool.execute → observe_action → 持久化 Observation`；safe 沿用原 `actionId` 重放、manual 转 `outcome_unknown` waiting、瞬时授权只匹配一次且不重复计 Step。 [S2, S5, S7]
- 受支持 Goal 的最终 LLM 消息角色、内容与顺序保持不变；只有严格 Schema 解析得到的 `PreparationResult` 或 `AgentDecision` 才能进入 Runtime 控制边界。 [S1, S2, S4]

## Revisit When

- 需要在三个视图间直接共享字段或省略显式转换契约时。
- 依赖方向或 package 归属变化，需要同步 `scripts/check-dependencies.mjs` 白名单时。
- 旧快照拒绝语义需重新引入迁移窗口或磁盘升级时。

## Sources

- S1: `specs/three-view-architecture/requirements.md`
- S2: `specs/three-view-architecture/design.md`
- S3: `packages/storage/src/goal-snapshot-codec.ts`
- S4: `packages/agent/src/model-inference-projector.ts`
- S5: `packages/runtime/src/runner.ts`
- S6: `scripts/check-dependencies.mjs`
- S7: `packages/storage/test/action-observation-recovery.test.ts`