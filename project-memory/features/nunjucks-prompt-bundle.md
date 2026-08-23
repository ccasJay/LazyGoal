---
feature: nunjucks-prompt-bundle
status: active
summary: "版本化 Prompt Bundle 组合、确定性 Nunjucks 渲染与不可变 PromptContext 边界"
source_spec: specs/nunjucks-prompt-bundle/
distilled_at: 2026-08-23
reviewed_at: 2026-08-23
tags: [prompt-bundle, nunjucks, rendering, prompt-context, snapshot-v5, deterministic]
authorities: [docs/architecture/agent.md, docs/architecture/runtime.md, docs/architecture/storage.md, packages/agent/src/prompting/default-bundles.ts, packages/agent/src/prompting/renderer.ts, packages/agent/src/model-inference-projector.ts, packages/storage/src/goal-snapshot.ts]
---

# Nunjucks Prompt Bundle

## Purpose

- 通过集中的 Nunjucks 渲染能力，在每轮模型请求时组合各业务模块就近维护的 Prompt，并以版本化 Prompt Bundle 冻结这一组合，保持 Goal 恢复语义与 Runtime 强制边界不变。 [S1, S2]

## Durable Decisions

- D1 — Prompt Bundle 是显式版本化 Manifest（声明模板 ID、Phase 映射与 section 顺序），而非集中存放所有 Prompt 文本的目录；模板按业务所有权就近存放，稳定模板 ID 含组件版本（如 `global-overview@1`），被受支持 Bundle 引用的模板视为不可变。 [S1, S2, S5]
- D2 — system prompt 由确定性 fragment pipeline 组成：固定按 Global Overview → Profile → Phase Protocol → Authorized Tools 顺序渲染，fragment 去尾换行后以 `\n\n` 连接且无结尾换行；三个 Phase 共享 Global Overview 与 Profile，仅按 Phase 选择协议。 [S1, S2, S4]
- D3 — Prompt Bundle 当前版本归 Agent、由 Composition Root 注入 Runtime：Agent 导出 `CURRENT_PROMPT_BUNDLE_VERSION`，TUI 注入 `LauncherDependencies.promptBundleVersion`，`GoalDefinition` 只存通用正整数版本，Runtime/Storage 不判断版本是否受支持。 [S2, S5, S7]
- D4 — Snapshot 协议从 v4 一次性升级到 v5：`GoalDefinition.globalSystemPromptVersion` 更名 `promptBundleVersion`（正整数），decode 拒绝 v1–v4 且不迁移；v5 只校验该字段为正整数，后续新增 Bundle 版本不再改变 Snapshot Schema。 [S2, S7, S8, S11]
- D5 — `PromptContext` 是 `ModelInferenceView` 内的独立深冻结 DTO（`promptBundleVersion`/`phase`/`profile`/`authorizedTools`）；Projector 逐字段深复制并递归冻结，按 Tool ID 代码单元排序且拒绝重复，不投影 goalId/runId/时间/随机数/环境/瞬时授权。 [S1, S2, S6, S10]
- D6 — 使用显式封闭 Nunjucks `Environment`（`autoescape:false`、`throwOnUndefined:true`、`trimBlocks`/`lstripBlocks`），唯一自定义 Filter 是同步 `stableJson`；模板在工厂返回前 eager compile，渲染期不读文件系统，仅接受已注册 ID 的内存 Loader。 [S2, S3, S4]

## Guardrails

- 只有 LazyGoal 注册的模板可作为模板执行；Profile、Instructions、ToolDefinition、Conversation 与 Working Context 中的 Nunjucks 语法只作为数据/文本插入，不二次执行。 [S1, S3, S4, S9]
- 渲染失败（未知 Bundle 版本、缺失变量、模板语法错误）都发生在 LLM Adapter 调用前，Executor 不重试、不修复；错误脱敏，不含 Profile/Tool Schema/Conversation 原文。 [S1, S2, S4]
- 相同输入产生字符级一致输出：模板与结果统一 LF，Tools 按 Tool ID 代码单元升序，`stableJson` 键按代码单元排序，空 Instructions/空 Tools 有固定表示。 [S1, S2, S6, S9]
- 模型请求消息顺序固定为 system → 真实 Conversation → Working Context；现有 Tool 授权、状态转换与响应 Schema 边界保持不变。 [S1, S2]

## Revisit When

- 新增 Prompt Bundle v2/v3 时：应复用未变化模板组件并新建 Bundle 版本，不升级 Snapshot Schema。
- Prompt 资产引入构建/发布流程时：需显式复制 `.njk` 资产（当前仓库源码直跑、按 `import.meta.url` 定位）。
- 需要模板支持异步 Filter、Extension、动态 `{% include %}` 或沙箱时（当前明确禁止）。

## Sources

- S1: `specs/nunjucks-prompt-bundle/requirements.md`
- S2: `specs/nunjucks-prompt-bundle/design.md`
- S3: `packages/agent/src/prompting/registry.ts`
- S4: `packages/agent/src/prompting/renderer.ts`
- S5: `packages/agent/src/prompting/default-bundles.ts`
- S6: `packages/agent/src/model-inference-projector.ts`
- S7: `packages/runtime/src/domain.ts`
- S8: `packages/storage/src/goal-snapshot.ts`
- S9: `packages/agent/test/prompting-renderer.test.ts`
- S10: `packages/agent/test/model-inference-projector.test.ts`
- S11: `packages/storage/test/goal-store.test.ts`
