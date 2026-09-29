---
feature: permission
status: active
summary: "统一 Permission 分层包、两类持续授权账本、沙箱越界审批与双端交互"
source_spec: specs/permission/
distilled_at: 2026-09-29
reviewed_at: 2026-09-29
tags: [permission, sandbox, grant, tool, security, tui, browser]
authorities: [specs/permission/requirements.md, specs/permission/design.md, packages/permission/src/index.ts, packages/permission/src/types.ts, packages/permission/src/permission-grant-service.ts, packages/permission/src/grant-matching.ts, packages/runtime/src/runner.ts, packages/runtime/src/transition.ts, packages/storage/src/json-file-sandbox-grant-store.ts, packages/storage/src/json-file-project-permission-mode-store.ts]
---

# Permission

## Purpose

- 将原先分散在 Runtime、ToolPolicy 与界面层的授权机制收拢为独立的 `@lazygoal/permission` 领域包。 [S1, S2, S3]
- 建立 Tool Grant 与 Sandbox Grant 物理隔离但逻辑统一的持续授权管理机制，提供双端查看与撤销。 [S1, S2, S4, S5]
- 确保受限命令与越界沙箱能力在 Default 和 YOLO 模式下均受控审批，且执行计划与状态转换完全闭环。 [S1, S2, S7, S8]

## Durable Decisions

- D1 — 独立 `@lazygoal/permission` 包作为授权判定与匹配的领域核心：Runtime、Storage 与 Browser 统一依赖 Permission 契约，Permission 仅依赖 contracts 与 sandbox，严禁反向依赖运行时或存储实现。 [S1, S2, S3, S4]
- D2 — 权限模式与 Grant 账本持久化边界：项目权限模式由 `JsonFileProjectPermissionModeStore` 单独持久化于项目私有目录；Tool Grant 与 Sandbox Grant 采用物理隔离的双账本存储（`tool_grants.json` 与 `sandbox_grants.json`），`DefaultPermissionGrantService` 提供统一的聚合查询列表与按类别（`tool` | `sandbox`）精确派发的撤销服务。 [S1, S2, S4, S5, S9, S10]
- D3 — 越界沙箱能力强制人工审批铁律：macOS 默认沙箱内的受限 Bash 在 YOLO 模式下放行，但越界文件访问与全网出站访问即使在 YOLO 模式下也必须挂起审批（`approvalKind: "sandbox"`），绝不隐式放行。 [S1, S2, S6, S7]
- D4 — 状态转换与持久化快照严格保全沙箱能力范围：`stage_action` 与 `approve_action` 转换必须深复制并传播 `approvalKind` 与 `effectiveSandboxScope`，保证进程重启恢复与审批消费时能正确构建 `SandboxExecutionPlan`。 [S1, S2, S7, S8]
- D5 — 双端统一管理与真实安全范围审阅：Browser 与 TUI 聊天框左下角提供统一 Permission 管理入口，明确展示外部路径与真实全网出站明示（含本机回环）；完整输入在审阅前不隐式授予持续权限。 [S1, S2, S5]

## Guardrails

- 申请额外能力的 Action 未提供或失配有效 `SandboxExecutionPlan` 时，受限命令严禁启动并返回 `SANDBOX_APPROVAL_REQUIRED`。 [S1, S2, S7]
- 授权撤销后必须立即失效；任何单次、Goal 或项目持续授权均不得跨不同命令字符串或不同沙箱范围越权复用。 [S1, S2, S5, S6, S9]
- 受限命令执行结果不确定（`outcome_unknown`）时维持人工等待，绝不自动重试放行。 [S1, S2, S7, S8]

## Revisit When

- 跨进程私有文件锁与执行前复核闸门（//TODO 5）引入并发租约优化时。
- 引入新的操作系统沙箱后端（如 Linux bwrap/seccomp 或 Windows AppContainer）时。
- 支持细粒度域名过滤或子网白名单出站控制时。

## Sources

- S1: `specs/permission/requirements.md`
- S2: `specs/permission/design.md`
- S3: `packages/permission/src/index.ts`
- S4: `packages/permission/src/types.ts`
- S5: `packages/permission/src/permission-grant-service.ts`
- S6: `packages/permission/src/grant-matching.ts`
- S7: `packages/runtime/src/runner.ts`
- S8: `packages/runtime/src/transition.ts`
- S9: `packages/storage/src/json-file-sandbox-grant-store.ts`
- S10: `packages/storage/src/json-file-project-permission-mode-store.ts`
