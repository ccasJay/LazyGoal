---
feature: goal-board-backend-validation
status: active
summary: "Goal 看板单会话后端接入验证、有界白名单会话投影与防误触审批交互"
source_spec: specs/goal-board-backend-validation/
distilled_at: 2026-10-02
reviewed_at: 2026-10-02
tags: [browser, goal-board, session-projection, approval-ux, safe-summary, markdown, e2e]
authorities: [docs/architecture/browser.md, packages/browser/src/index.ts, packages/browser/src/browser-projection.ts, packages/browser/src/browser-goal-routes.ts, packages/browser/src/browser-goal-command-service.ts, prototypes/goal-board/src/main.tsx, prototypes/goal-board/src/panels.tsx]
---

# Goal Board Backend Validation

## Purpose

- 将 Goal 看板原型接入 LazyGoal 真实回环后端，以 Snapshot 提交边界与白名单会话投影展示真实会话进展。 [S1, S2, S3]
- 规范会话步骤安全摘要投影、结构化 Markdown 呈现与低误触审批交互，防止敏感内容泄露并确保审批明确。 [S1, S3, S4, S5, S6]

## Durable Decisions

- D1 — 单活动会话与严格回环授权边界：看板通过随机能力令牌及回环 HTTP 服务保护，创建 Goal 时重验模型与意图并锁定单活动会话，禁止并发创建或暗中推进其他 Goal；页面刷新与服务重启完全依据已提交 Snapshot 重建，连接中断或故障不伪造终态。 [S1, S2, S3, S7]
- D2 — 会话步骤安全白名单摘要投影：会话步骤（`BrowserSessionStep`）通过 `inputSummary` 提供最多 240 字符的紧凑操作标题；严格限定只投影内置文件工具（`read_file`/`write_file`/`edit_file`）的目标路径、`grep` 的匹配模式、`web_search` 的查询词和 `web_fetch` 的 URL，绝对禁止投影写入正文、替换内容或其他参数；Bash 命令由结构化 `bashExecution` 承载，保证会话层不泄漏未授权内容。 [S1, S3, S4, S8]
- D3 — 助手消息与流式响应的安全富文本呈现：前端采用 GFM Markdown 规范渲染助手回复和实时流响应（支持表格横向滚动、外部链接新窗口打开与图片安全降级），Activity 列表按工具类型提供直观语义动词（`Ran`、`Read`、`Wrote`、`Searched for`）与对应图标，仅在非完成状态显示状态标签。 [S1, S3, S5]
- D4 — 审批交互主次收敛与权限弹层防误触：动作审批表单（`ActionApprovalForm`）将批准（Approve action）作为第一主操作，将驳回操作折叠并要求必填原因，防止无意阻断执行；项目权限菜单支持外部点击与 Escape 键即时失焦收起，切换模式后立即关闭，已存权限列表采用折叠收起。 [S1, S3, S6, S9]

## Guardrails

- 会话投影只包含已持久化 Snapshot 提交边界内的事实；未提交的中间推理、原始事件信封及非白名单工具参数严禁进入 `BrowserSessionStep`。 [S1, S3, S4, S8]
- 普通聊天文本不能代替结构化问答、任务提案或工具动作审批；过期、重复或跨 Goal/Run 的操作必须直接被服务端拒绝，不得触发底层 Coordinator 推进或工具二次执行。 [S1, S2, S3, S7]
- 审批表单的驳回操作必须填写有效理由后才允许提交，单次审批通过不隐式扩展为持久权限。 [S1, S3, S6]

## Revisit When

- 会话协议引入用户直接向步骤提供行级或交互式反馈时。
- 引入支持富文本编辑或工具输入直接内联修改的交互模式时。
- 浏览器后端支持多 Goal 协同并行调度时。

## Sources

- S1: `specs/goal-board-backend-validation/requirements.md`
- S2: `specs/goal-board-backend-validation/tasks.md`
- S3: `docs/architecture/browser.md`
- S4: `packages/browser/src/browser-projection.ts`
- S5: `prototypes/goal-board/src/main.tsx`
- S6: `prototypes/goal-board/src/panels.tsx`
- S7: `packages/browser/test/browser-commands.test.ts`
- S8: `packages/browser/test/browser-projection.test.ts`
- S9: `prototypes/goal-board/e2e/runtime.test.mjs`
