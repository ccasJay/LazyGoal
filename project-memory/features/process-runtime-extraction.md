---
feature: process-runtime-extraction
status: active
summary: "将 ProcessManager 迁入独立 process-runtime 包，并收敛启动受理、输出与关闭的结算语义"
source_spec: specs/process-runtime-extraction/
distilled_at: 2026-10-17
reviewed_at: 2026-10-17
tags: [process-runtime, process-session, lifecycle, admission, output-settlement, shutdown, recovery]
authorities: [packages/process-runtime/src/process-manager.ts, packages/process-runtime/src/errors.ts, packages/process-runtime/src/index.ts, packages/runtime/src/process-session-store.ts, packages/tools/src/process-tools.ts, packages/storage/src/json-file-process-session-store.ts, scripts/check-dependencies.mjs]
---

# Process Runtime Extraction

## Purpose

- 新增私有包 `packages/process-runtime` 并迁入 `ProcessManager`：宿主只注入现有进程存储、宿主身份与可选资源注册接口，即可启动、观察、停止和清理自己拥有的后台进程；本轮同时修正启动与关闭竞态、输出写入未结算与错误丢失，工具协议与磁盘 Schema 保持不变。 [S1, S2]

## Durable Decisions

- D1 — 职责归属：`process-runtime` 拥有管理器、启动受理与额度、当前句柄、输出等待、进程组停止与自身结算；`tools` 保留进程工具、输入校验、可信身份、沙箱计划与结果映射；`runtime` 保留 ProcessSessionStore 契约与实例生命周期；`storage` 保留磁盘 Schema、轮转与 interrupted 投影；`sandbox` 保留受限 spawn 与进程组信号；`goal-server` 只做装配与关闭权交付。生产依赖只允许 `runtime` 与 `sandbox`，Runtime 不得反向依赖本包。 [S1, S2, S3, S7, S8]
- D2 — 最小消费方式：经 `packages/process-runtime/src/index.ts` 注入契约一致的 Store、本次 hostInstanceId 与可选注册接口，即可启动、等待输出、查询活跃数量、停止与关闭；不要求构造 Goal、Agent、ToolRegistry 或 HTTP；构造不 spawn、不读取配置、不注册进程信号，借用 Store / 注册表不被关闭。 [S1, S2, S4, S10]
- D3 — 启动受理同步预留并计入额度（每 Goal 4 个活跃、宿主 16 个活跃、每 Goal 32 项会话），异步存储检查不能使并发请求绕过限制，拒绝不排队、不创建进程；关闭插入任意异步边界时，尚未 spawn 的启动被重新检查并拒绝，已创建句柄必须纳入同一清理。初始 `starting` 记录先于 spawn 保存，保存失败拒绝启动且不创建 OS 进程；spawn 失败保留原始故障并尝试写入现有 `failed` 记录，不用清理故障覆盖原始错误。 [S1, S2, S11]
- D4 — 输出与终态写入由管理器结算：每通道串行追加、保持接收顺序，退出后仍等待已接收写入；写入失败进入可辨识的结算错误并被保留（首个已知失败不被后续覆盖），不能在仍有未结算写入时报告关闭成功；等待只负责唤醒，后续读取仍以 Store 为准。 [S1, S2, S12]
- D5 — stop / close / forceClose 如实语义：stop 只有确认句柄退出且终态结算才成功，已写 `stopped` 或已发信号不算退出证明，等待窗口到期返回失败；close 首次调用同步停止受理并复用同一次清理；forceClose 可升级终止本实例自有进程组、不被 Store 等待阻塞。成功要求启动、句柄、监听 / 定时器与已接收写入全部结算且无未报告失败。 [S1, S3, S13]
- D6 — 失败以类型化 `ProcessSessionError` 报告，携带 goalId / processId、失败阶段（admission / spawn / persistence / output / stop / settlement）、原始原因与未确认类别；错误描述不复制命令、环境或输出正文，工具继续映射为既有 `PROCESS_START_FAILED`、`PROCESS_STOP_FAILED` 等结果。 [S1, S3, S5, S8]
- D7 — 与 RuntimeLifecycle 的组合契约：管理器以单一资源身份注册（借用注册表只要求最小 `register` 面），正常 / 强制期限与失败汇总由实例生命周期统一负责（默认各 2000ms），本包不复制两阶段状态机；未确认停止或未结算写入不能被注册表吞掉，借用 Store / 注册表与其它管理器拥有的进程保持原所有权。 [S1, S2, S6, S14, S15]
- D8 — 恢复只读投影：新宿主重启后旧非终态记录由存储层投影为 `interrupted`，不保存可重连句柄、不遍历或误杀旧 PID、不自动重放命令；manual 工具结果未知沿用 Runtime 确认规则，进程记录不取得 Goal 完成证据地位。 [S1, S2, S9, S14]
- D9 — 工具协议保持：`process_start` / `process_read` / `process_stop` 的 ID、Input Contract、成功输出结构、失败映射与 replayPolicy 不变；跨 Goal 操作拒绝、跨 Run 读取同一 Goal 可用，额度拒绝与关闭拒绝不扩大 Profile / 权限。 [S1, S8, S15]
- D10 — 机器约束：依赖门覆盖普通 / 类型 import / export、import 类型表达式、侧效与字面量 dynamic import，禁止工具 / Agent / 应用 / Storage 实现依赖、Runtime 反向依赖、跨包入口穿透与宿主退出 / 信号监听、项目产物导入；向本组件自有进程组发送终止信号不属禁止的宿主行为。 [S1, S2, S16]

## Guardrails

- 所有权优先于记录：Goal / process 身份与磁盘状态不构成当前 OS 句柄控制权，只有管理器实际创建并持有的句柄可被停止；不扫描系统 PID、不重连或误杀旧宿主进程。 [S1, S2]
- 终止与持久化是两个事实：已退出但记录 / 日志写入失败仍是结算失败；已写 `stopped` 但未确认退出仍不能报告资源释放；失败可发生于副作用之后，不能由失败返回推断命令未运行。 [S1, S2, S13]
- Store 不响应或抛错不能阻止强制终止其它自有句柄；借用依赖不被关闭，也不为同一批句柄建立多个相互竞争的清理所有者。 [S1, S2, S14]
- 不新增进程工具协议、持久化状态、任务队列、后台重启、PID 重连、跨进程配额或多租户保证；不为等待其它 Spec 增加兼容路径。 [S1, S2]

## Revisit When

- 增加跨宿主进程管理保证、全局配额、后台重启或 PID 重连能力时。
- 进程工具协议、磁盘 Schema 或 interrupted 投影规则变化时。
- RuntimeLifecycle 的资源结算契约或两阶段期限配置变化时。

## Sources

- S1: `specs/process-runtime-extraction/spec.md`
- S2: `specs/process-runtime-extraction/plan.md`
- S3: `packages/process-runtime/src/process-manager.ts`
- S4: `packages/process-runtime/src/index.ts`
- S5: `packages/process-runtime/src/errors.ts`
- S6: `packages/runtime/src/lifecycle/runtime-lifecycle.ts`
- S7: `packages/runtime/src/process-session-store.ts`
- S8: `packages/tools/src/process-tools.ts`
- S9: `packages/storage/src/json-file-process-session-store.ts`
- S10: `packages/process-runtime/test/process-manager.test.ts`
- S11: `packages/process-runtime/test/process-startup.test.ts`
- S12: `packages/process-runtime/test/process-output.test.ts`
- S13: `packages/process-runtime/test/process-shutdown.test.ts`
- S14: `apps/goal-server/test/process-lifecycle.integration.test.ts`
- S15: `apps/goal-server/test/process-runtime-composition.integration.test.ts`
- S16: `scripts/check-dependencies.mjs`
