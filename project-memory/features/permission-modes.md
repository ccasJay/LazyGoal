---
feature: permission-modes
status: active
summary: 授权收敛为 workspace 级三轴权限档位，sandbox 档位执行期决定资源边界，approvals 与 reviewer 只裁决越界 Action，Tool 级授权与逐 Goal 沙箱上限退役，仅保留边界越界豁免
source_spec: specs/permission-modes/
distilled_at: 2026-11-16
reviewed_at: 2026-11-16
tags: [permission, sandbox, boundary, approval, exemption, seatbelt, workspace-profile, security, runtime]
authorities: [packages/permission/src/types.ts, packages/permission/src/permission-profile.ts, packages/permission/src/permission-boundary.ts, packages/permission/src/sandbox-authorization.ts, packages/storage/src/permission-profile-file.ts, packages/runtime/src/runner.ts, apps/goal-board/src/components/PermissionControl.tsx, packages/runtime/test/permission-profile-authorization.test.ts]
supersedes: [project-memory/features/permission.md]
---

# 权限档位与执行期资源边界

## Purpose

- 资源授权收敛为 workspace 级权限档位：profile 以 `sandbox`／`approvals`／`reviewer` 三轴加 `writableRoots` 表达，sandbox 边界三档（`read-only`／`workspace-write`／`danger-full-access`）在执行期为每个 Action 判定，边界内自动执行，越界才进入裁决；Tool 级审批、Tool Grant 账本与逐 Goal 沙箱上限冻结退役，唯一保留的持续授权是 sandbox 边界越界豁免。 [S1, S2, S3, S8]

## Durable Decisions

- D1 — 边界与裁决正交：`sandbox` 轴决定内核强制的文件与网络边界，`approvals`／`reviewer` 只决定越界 Action 的裁决方式；profile 在每个 Action 决策期重新读取，创建 Goal 不再冻结沙箱上限（`triggerContext.authorization.sandbox` 退役），审批不充当资源边界的替代。 [S1, S2, S6, S7]
- D2 — 边界 baseline 固定：工作区树读写、`.git` 读取、`writableRoots` 与常规本机命令属边界内；`.git` 写入、工作区外访问、出站网络属越界；`.lazygoal` 内部状态在任何档位都拒绝写入。 [S1, S4, S9]
- D3 — 越界裁决三态：`on-request` + `user` 暂存 `approvalKind: "sandbox"` 等待人工并展示真实范围，批准仅覆盖当次 Action，拒绝以有界原因回灌模型且 Goal 可继续推进；`on-request` + `auto_review` 使用确定性规则表（工作区外写入、出站网络、破坏性命令），命中才等待人工，未命中自动放行并记录裁决事实，不调用模型；`never` 直接拒绝且不产生等待。无人工 reviewer 的宿主（Worker／Benchmark）中 `user` 审阅退化为 `auto_review` 规则裁决，不产生无人可答的等待。 [S1, S2, S5, S9]
- D4 — 暂存决定冻结：审批暂存时绑定当时的 `sandbox`、`reviewer`、revision 与真实范围，恢复执行不重算；切换档位或修改 `writableRoots` 只影响之后的新 Action。 [S1]
- D5 — 档位持久化与失败关闭：profile 以递增 revision 并发保护，冲突返回当前 revision 的值不静默覆盖；记录损坏、版本不支持或读取失败时拒绝新的受限 Action 并报告权限故障，不退回任何默认档，也不据旧缓存放行。 [S1, S6]
- D6 — 授权入口与退役边界：`danger-full-access` 放开工作区外读写与出站网络但 `.lazygoal` 写入仍拒绝；权限入口只展示真实生效的档位、三轴取值与边界豁免，不再展示 Tool 级授权，撤销豁免后同一越界重新进入裁决；Worker 模型代审退役，Web 与无界面宿主共用同一判定实现。 [S1, S7, S8]

## Guardrails

- 拒绝以 `TOOL_NOT_AUTHORIZED` 作为可修复反馈交回模型，不降级为 `TOOL_EXECUTION_ERROR`，也不导致 Run 进入 failed。 [S1, S9]
- 审批与 auto_review 裁决只决定是否放行，不得改写 Action 输入、路径或网络范围。 [S1]
- 档位已选不等于实际强制：平台或环境无法强制该档位的文件与网络边界时，必须显式报告未强制及其范围，不得声称已隔离；审批与规则裁决照常生效。 [S1]

## Revisit When

- 新增越界裁决类型、`reviewer` 取值、审批策略或操作系统沙箱后端，或平台能力探测语义变化时。
- 边界 baseline、`writableRoots` 或 `.lazygoal` 保护范围调整时。
- 需要恢复 Tool 级授权或 Tool Grant 账本时——三档加边界豁免的收敛已取代旧的 Tool／Sandbox 双账本授权模型，任何回退须先修订本决定。
- Worker／Benchmark 宿主的权限往返或无人裁决语义变化时。

## Sources

- S1: `specs/permission-modes/spec.md`
- S2: `packages/permission/src/types.ts`
- S3: `packages/permission/src/permission-profile.ts`
- S4: `packages/permission/src/permission-boundary.ts`
- S5: `packages/permission/src/sandbox-authorization.ts`
- S6: `packages/storage/src/permission-profile-file.ts`
- S7: `packages/runtime/src/runner.ts`
- S8: `apps/goal-board/src/components/PermissionControl.tsx`
- S9: `packages/runtime/test/permission-profile-authorization.test.ts`
