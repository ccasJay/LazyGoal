---
feature: acp-operation-admission
status: active
summary: 同一 ACP Session 从校验到结算只接纳一个 Prompt，连接关闭时已注册 Session 恰好释放一次并回收工厂迟交的实例
source_spec: specs/acp-operation-admission/
distilled_at: 2026-11-16
reviewed_at: 2026-11-16
tags: [acp, session-admission, prompt-exclusivity, cancellation, connection-close, late-session, dispose, factory-reservation]
authorities: [packages/acp/src/agent.ts, packages/acp/src/contracts.ts, packages/acp/test/agent-session.test.ts, packages/acp/test/client-lifecycle.test.ts]
---

# ACP Prompt 排他准入与 Session 创建回收

## Purpose

- 让同一 ACP Session 的 Prompt 从输入校验到结算具备明确的占用、取消与失败语义，避免重复执行，并保证本次调用结束后可安全重试。 [S1]
- 让 ACP 连接宿主在创建途中断线时仍能回收交付给 Agent 的 Session，并保留请求的原始失败原因。 [S1]

## Durable Decisions

- D1 — Prompt 排他准入：Agent 在首个异步校验前把当前 Prompt 连同中止控制与结算归属登记为 Session 的占用记录；同一 Session 已有 Prompt 正在校验或执行时，后续请求以现有 `invalidParams` 与 Prompt 进行中诊断拒绝，不进入校验、不调用 Session、不排队执行。 [S1, S2, S4]
- D2 — 结算释放与取消优先：结算仅能释放自己占用的记录，已关闭记录保持终态；未被取消的校验失败或 Session 执行失败返回原参数或执行错误并释放占用与中止监听，随后新 Prompt 可执行。`session/cancel`、请求中止或断线先于 Prompt 进入 Session 时中止该 Prompt，校验结算后不调用 Session；仍可回复的请求返回 `stopReason: "cancelled"`，SDK 已中止的请求保留 SDK 的取消或关闭结果。已取消 Prompt 在等待校验或执行结算期间保持同一 Session 占用，原操作结算后才允许新 Prompt；执行中的取消沿用 Session 的中止信号与结果语义。 [S1, S2, S4, S5]
- D3 — 多 Session 并行：同一连接的多个已注册 Session 可并行执行；取消只作用于目标 Session，不触发其他 Session 的中止信号。 [S1, S4, S5]
- D4 — 创建预留与注册：Agent 在每次服务启动持有的独立连接状态内，于调用工厂前登记当前连接下的创建预留并独立预留 Session ID；只在工厂成功且预留仍属于当前开放连接时注册。成功后客户端可使用该 ID，创建中的 Session 不可被调用或接收更新，注册前的更新被抑制。 [S1, S2, S3, S4]
- D5 — 工厂失败不重试：创建工厂拒绝时保留工厂原错误并释放该次预留，Agent 不自动重试工厂；之后由客户端显式重发的新建请求可以成功。 [S1, S2, S4]
- D6 — 连接关闭清理与迟交回收：连接关闭时中止连接与 Prompt 信号，禁止旧 Session 继续发更新；已注册 Session 等自己的 Prompt 结算后恰好释放一次，其释放不被未完成工厂阻塞。工厂在连接关闭后才返回的 Session 即使预留未失效也不注册、不发送创建成功或 Session 更新，并恰好调用一次 `dispose`；释放失败不覆盖原关闭结果、不触发重试或产生未处理拒绝。 [S1, S2, S4]

## Guardrails

- 资源清理职责分工不变：工厂仍负责清理未交付给 Agent 的资源，Agent 只负责已交付实例的注册与释放，不兜底工厂内部资源。 [S1]
- 请求格式、能力声明、资源链接校验与 Runtime 所有权沿用 acp-container-runtime 设计边界；准入层不复制或重定义这些契约，仅在 TSDoc 与 ACP 模块说明中同步 Prompt 排他、连接关闭及工厂交付语义。 [S1, S3]
- 准入与清理状态由 ACP Agent 进程内持有，不新增持久化或跨进程会话登记。 [S1]
- 回归验证使用官方 SDK 内存连接、可控闸门与临时文件，不启动真实模型或容器。 [S1]

## Revisit When

- ACP 协议版本或官方 SDK 的会话生命周期、请求中止语义变化时。
- 连接宿主需要跨进程会话注册、持久化创建预留或共享会话状态时。
- Prompt 准入需要排队、会话级限流或多路复用语义时。
- acp-container-runtime 的 Runtime 所有权或资源链接校验契约调整时。

## Sources

- S1: `specs/acp-operation-admission/spec.md`
- S2: `packages/acp/src/agent.ts`
- S3: `packages/acp/src/contracts.ts`
- S4: `packages/acp/test/agent-session.test.ts`
- S5: `packages/acp/test/client-lifecycle.test.ts`
