---
feature: browser-trajectory
status: active
summary: "以只读紧凑记录呈现已提交执行轨迹，并保存可检查的模型输入消息与 System Prompt"
source_spec: specs/browser-trajectory/
distilled_at: 2026-10-01
reviewed_at: 2026-10-01
tags: [browser, trajectory, model-input, system-prompt, read-only, compact-ui]
authorities: [docs/architecture/browser.md, docs/architecture/storage.md, packages/runtime/src/model-input.ts, packages/storage/src/json-file-model-input-store.ts, packages/browser/src/browser-model-input.ts, prototypes/goal-board/src/trajectory-records.tsx, prototypes/goal-board/src/model-input-inspector.tsx]
---

# Browser Trajectory

## Purpose

- 浏览器以只读紧凑记录查看正式工作区中已提交的 Goal/Run 轨迹，并按需检查与轨迹关联的模型调用输入，尤其是实际发送前准备的完整 System Prompt。 [S1, S2, S3, S4, S5, S7, S8]

## Durable Decisions

- D1 — 领域轨迹仍以 Snapshot 提交边界为准；模型输入是独立的调用前事实，不参与 Snapshot 恢复，也不受该提交边界过滤。输入记录说明 Adapter 调用前准备了哪些消息，不证明 Provider 已接收，也不包含原生工具声明或 Provider 转换后的 Wire 参数。 [S1, S2, S3, S5, S7]
- D2 — 每次输入记录保留调用身份、阶段、时间、消息角色、已知来源、正文与原始顺序；正文按 Goal 内 SHA-256 内容寻址，在 Run 之间复用。写入不完整或哈希不符时拒绝读取；输入日志写入失败时阻止该次 Adapter 调用。 [S2, S4, S5, S6, S9]
- D3 — 轨迹表保持领域事件序列，用紧凑单行记录合并工具输入/结果预览，并在对应请求附近显示 System Prompt 首次出现或发生变化的记录；完整消息、System Prompt、Diff、Source 与 Raw 按需放入检查器。历史输入缺失必须标记为未记录，不能用当前配置重建旧请求。 [S1, S2, S3, S7, S8]
- D4 — 浏览器请求列表与消息正文搜索分页读取，详情设 2 MiB 上限、Diff 超过 2,000 行时退回查看完整文本；轨迹 JSONL 和输入清单仍整文件读取，因此 HTTP/DOM 分页不构成磁盘读取成本上限。 [S2, S3, S7, S8]

## Guardrails

- 输入日志与 Snapshot、Trajectory 领域事实、诊断 Trace、上下文比较基线分属不同职责；调用身份只关联记录，不能使输入事实成为恢复状态或已提交轨迹事件。 [S1, S3, S4, S5, S6]
- 模型输入日志及事件详情沿用正式浏览器的能力令牌和工作区边界；读取只投影数据，不触发模型调用、工具执行、轨迹变更或授权操作。 [S1, S2, S3, S7]
- 不得推测 Provider 实际收到的请求、缺失的历史 Prompt、模型耗时、逐事件用量或工具声明；超出读取上限时明确报错，不能显示截断文本并标成完整内容。 [S1, S2, S3, S7, S8]

## Revisit When

- 模型请求消息来源、调用身份、Snapshot／Trajectory 关联或 Provider 请求边界改变时。
- JSONL 存储获得有界随机访问、压缩或多进程共同写入保证时。
- 浏览器开始修改或重放轨迹时。

## Sources

- S1: `specs/browser-trajectory/requirements.md`
- S2: `specs/browser-trajectory/verification.md`
- S3: `docs/architecture/browser.md`
- S4: `docs/architecture/agent.md`
- S5: `packages/runtime/src/model-input.ts`
- S6: `packages/storage/src/json-file-model-input-store.ts`
- S7: `packages/browser/src/browser-model-input.ts`
- S8: `prototypes/goal-board/src/trajectory-records.tsx`
- S9: `packages/storage/test/model-input-store.test.ts`
