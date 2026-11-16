---
feature: goal-creation-resilience
status: active
summary: Web 手动创建 Goal 在名称摘要失败、Worker 通道或 socket 路径受限时仍可完成创建，并以可区分错误码与文案诊断剩余失败
source_spec: specs/goal-creation-resilience/
distilled_at: 2026-11-16
reviewed_at: 2026-11-16
tags: [goal-creation, error-mapping, worker-channel, socket-path, name-fallback, trigger-admission, worker-registration]
authorities: [apps/goal-server/src/runtime/worker-process.ts, apps/goal-server/src/runtime/worker-execution-error.ts, apps/goal-server/test/goal-creation-error-status.test.ts, apps/goal-server/test/goal-creation-name.test.ts, apps/goal-board/src/types.ts, apps/goal-server/src/browser-session-port.ts]
---

# Goal 创建可靠性与失败诊断

## Purpose

- Web 手动创建 Goal 在名称摘要失败、Worker 启动注册失败或临时目录受限时仍可稳定完成，或以可区分错误码与可行动文案诊断剩余失败；不改变 Goal／Run／Trigger 的身份、准入与推进语义。 [S1, S2]

## Durable Decisions

- D1 — 名称摘要固定 prompt_only best-effort：模型返回空正文、仅 reasoning、Markdown 围栏、超长文本或抛错、超时（默认 5 秒上限）时回退本地确定性名称，创建不因摘要失败而失败；摘要回退只影响 `Trigger.name`，不放宽既有身份冲突与幂等语义，摘要适配器不再有独立模型输出契约（`trigger-name-summary` 已删除）。 [S1, S2, S3]
- D2 — wire 错误码区分执行环境与内部失败：Worker 启动、注册或控制通道不可用映射为 `execution_unavailable`（HTTP 503），未分类内部失败保持 `create_failed`（HTTP 500）；既有错误码含义与 HTTP 状态不因新增码而改变，浏览器经统一 `errorMessage` 映射渲染每个创建错误码的独立文案并保留可重试草稿。 [S1, S2, S4, S5, S6]
- D3 — Worker socket 路径解析使用短私有根并按平台 `sun_path` 可用长度校验（macOS 103 / Linux 107 字节），socket 文件 `0600`、目录 `0700`；短私有根不可复用（非本人所有、权限不足或仍超长）时回退平台临时目录，回退后仍不可用则返回 `execution_unavailable` 并记录实际路径长度与上限。 [S1, S2, S3, S4, S5]
- D4 — 配置与运行时不为测试放宽：受控适配器与定向测试注入失败，不放松身份校验、权限位或长度上限要求。 [S1, S2]

## Guardrails

- 摘要回退只影响 `Trigger.name`，不改写 material、Goal intent、模型选择或授权。 [S1]
- 新增错误码不改变既有错误码的含义与 HTTP 状态；未知码不得显示为成功或被通用文案静默吞掉。 [S1, S2]
- 只在临时根下创建私有目录，不删除既有目录，不执行持久化迁移。 [S1]

## Revisit When

- 平台 socket 长度上限、临时目录策略或私有根属主校验规则变化时。
- 新增创建错误码或调整错误码与 HTTP 状态映射时。

## Sources

- S1: `specs/goal-creation-resilience/spec.md`
- S2: `apps/goal-server/src/runtime/worker-process.ts`
- S3: `apps/goal-server/src/runtime/worker-execution-error.ts`
- S4: `apps/goal-server/test/goal-creation-error-status.test.ts`
- S5: `apps/goal-server/test/goal-creation-name.test.ts`
- S6: `apps/goal-server/src/browser-session-port.ts`
