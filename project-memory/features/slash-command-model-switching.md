---
feature: slash-command-model-switching
status: active
summary: "独立 Slash Command 架构与 /model 模型切换，支持 Provider 在线发现、离线 Catalog 补全与 Goal Snapshot 跨重启一致恢复"
source_spec: specs/slash-command-model-switching/
distilled_at: 2026-09-21
reviewed_at: 2026-09-21
tags: [slash-command, model-switching, catalog, provider, snapshot, tui]
authorities: [docs/architecture/tui.md, docs/architecture/llm.md, packages/slash-command/src/index.ts, packages/runtime/src/domain.ts, packages/tui/src/session-screen.tsx]
---

# Slash Command & Model Switching

## Purpose

- 提供 UI 无关的 Slash Command 核心包，并交付 `/model` 命令实现当前 Provider 内的模型在线发现、元数据补全、交互式切换与跨重启一致恢复。 [S1, S2, S3, S4, S6]

## Durable Decisions

- D1 — 独立 Slash Command Package：创建零 UI 依赖的 `@lazygoal/slash-command` Package，负责命令注册、语法解析与输入检查，供 TUI 及未来 Web 界面复用。 [S1, S2, S4, S6]
- D2 — Provider 在线发现与 Catalog 补全：优先以当前凭据在线列出可用模型，再由 pi-ai Catalog 补齐上下文上限与多模态能力；网络故障允许标注兜底，鉴权/权限失败严格阻止选择。 [S1, S2, S5, S8]
- D3 — Snapshot 先于 Binding 发布的原子切换：在安全等待点构造候选 Binding，优先将非敏感 `modelSelection` 写入 Goal Snapshot，保存成功后再同步替换进程 Binding，保证 Snapshot 始终为恢复权威。 [S1, S2, S4, S7, S8]
- D4 — 每次调用读取不可变代 Binding：Executor 在每次调用开始时获取最新 Binding 并在单次执行内保持不可变，不在调用中途中止换模。 [S1, S2, S4, S7]
- D5 — 恢复失败关闭推进：重启恢复 Goal 时若当前 Provider 或模型能力不匹配，阻止推进并要求重新选择，严禁静默回退到环境变量默认模型。 [S1, S2, S4, S7]

## Guardrails

- API Key、Token 与 baseURL 等敏感凭据严禁写入 Goal Snapshot、Trajectory、Trace 或 UI 错误展示中。 [S1, S2, S4, S7]
- 模型切换只能在 Intent 或等待用户输入的明确安全等待点发生，严禁在 Tool 执行或模型调用中途中途换模。 [S1, S2, S4, S8]

## Revisit When

- 支持跨 Provider 动态切换模型或在单个 Goal 内配置异构多模型策略时。
- Slash Command 体系扩展支持带复杂管道或参数补全的通用命令解释器时。

## Sources

- S1: `specs/slash-command-model-switching/requirements.md`
- S2: `specs/slash-command-model-switching/design.md`
- S3: `specs/slash-command-model-switching/tasks.md`
- S4: `docs/architecture/tui.md`
- S5: `docs/architecture/llm.md`
- S6: `packages/slash-command/src/index.ts`
- S7: `packages/runtime/src/domain.ts`
- S8: `packages/tui/src/session-screen.tsx`
