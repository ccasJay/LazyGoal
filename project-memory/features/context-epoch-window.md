---
feature: context-epoch-window
status: active
summary: 长任务上下文以可计量 Epoch 工作窗口运行，阈值触发、/compact 与一次超窗恢复共用以结算占用为据的有界 Compact，执行数据按 Goal/Run 布局组织
source_spec: specs/context-epoch-window/
distilled_at: 2026-11-16
reviewed_at: 2026-11-16
tags: [context-window, epoch, compaction, token-budget, storage-layout, long-running, runtime]
authorities: [packages/runtime/src/context-epoch.ts, packages/runtime/src/context-compaction.ts, packages/runtime/src/runner.ts, packages/config/src/toml-config.ts, packages/storage/src/goal-workspace-layout.ts, packages/runtime/test/context-epoch-compaction.test.ts]
---

# Context Epoch 工作窗口

## Purpose

- 所有受支持的 Goal 和模型统一使用可计量的 Epoch 工作窗口：容量以模型标称或用户配置为基数，占用在普通调用结算后统一计量，阈值触发、`/compact` 与一次超窗恢复共用同一轮有界 Compact；提炼只服务当前 Goal 的上下文接续，不写 Working Memory。 [S1, S2]

## Durable Decisions

- D1 — 容量与阈值基数：模型窗口已知时默认用标称容量，用户可设更小的 token 上限和整理阈值（默认 80，接受 1–99）；模型窗口未知时以用户上限作为容量与阈值基数，未知且未配置上限则在发送前拒绝模型调用并提示配置。 [S1, S4]
- D2 — 结算后统一调度：完整工作窗口先发送给供应商，预计超窗不提前裁剪、拒绝或触发压缩；结算占用取当次输入加输出，缓存输入计一次，历史不跨调用累加，新窗口按实际内容重计；占用严格超过阈值才执行一轮提炼，提炼调用计入成本但不作为下一轮自动触发依据。 [S1, S2, S6]
- D3 — 提炼边界与保留语义：候选历史按完整工作窗口前缀选取并为输出预留空间，超大候选工具结果可用现有预览与来源引用，放不下的候选保留在窗口；新窗口保留有效用户要求、任务状态、近期完整交互、已验证发现、未解决问题与关键决策理由及其来源；原始历史仍可查。 [S1, S2]
- D4 — 提交是唯一切换点：压缩正文与来源范围写入当前 Run 的 Epoch 切换事件，复用 Goal 提交闸门，快照只保存新 Epoch、事件身份、实际序号与水位；提交前恢复旧 Epoch，提交后按快照指针恢复新 Epoch；无效或未缩减的提炼保持旧窗口，迟到结果与未提交轨迹不推进水位。 [S1, S2, S7]
- D5 — 超窗恢复恰好一次：供应商明确以超出上下文窗口拒绝首次完整请求时，以可装入提炼请求的候选历史执行一次 Compact 并重试同一逻辑请求一次；无法完成或重试仍被明确拒绝为超窗则结束本次 Run 并区分失败原因，其他请求错误走既有处理路径。 [S1, S3]
- D6 — `/compact` 绑定 Goal 当前 Epoch：无参数提交按与自动触发相同的规则执行一次，忙时在安全边界执行，与自动触发重合时共用同一轮；命令不进入对话、不创建业务 Run，已归档 Run 只读，中断中的 Compact 不自动重放；新 Run 可引用最后一次已提交压缩，换模型时重计并结束旧供应商的原生续接。 [S1, S3]
- D7 — 存储布局归一：Goal 根保存快照与完整对话（`snapshot.json`、`blobs/`、`indexes/`），Run 子目录保存执行专属文件（轨迹、轨迹索引、模型输入、指标、trace）；存储装配、查询与维护入口共用同一路径规则，不做旧布局迁移或并行读写。 [S1, S5]

## Guardrails

- 预计压力到达之前不裁剪、不拒绝、不触发压缩；压缩只发生在阈值、`/compact` 与超窗恢复三个入口。 [S1]
- 缺少占用的样本不用于阈值触发；占用不可计量时显示不可用，不生成伪造百分比，允许的估算必须带标记。 [S1]
- 自动触发的提炼失败记录后继续普通执行，手动触发返回原因；无可压缩内容时反馈，不产生空切换；等待外部动作且无法切换时说明原因。 [S1]

## Revisit When

- 引入 Working Memory 扩展、经验总结、跨 Goal 记忆或独立 Epoch 交接记录时。
- 模型窗口标称、缓存计价或用量口径变化影响结算计量时。
- Run 子目录文件清单、快照提交边界或恢复校验规则调整时。

## Sources

- S1: `specs/context-epoch-window/spec.md`
- S2: `packages/runtime/src/context-epoch.ts`
- S3: `packages/runtime/src/context-compaction.ts`
- S4: `packages/config/src/toml-config.ts`
- S5: `packages/storage/src/goal-workspace-layout.ts`
- S6: `packages/runtime/src/runner.ts`
- S7: `packages/runtime/test/context-epoch-compaction.test.ts`
