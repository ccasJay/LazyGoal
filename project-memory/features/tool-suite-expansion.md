---
feature: tool-suite-expansion
status: active
summary: "为工作区任务提供有界文件、补丁、网页、长进程与本地 Git 工具，并沿用 Runtime 授权和恢复边界"
source_spec: specs/tool-suite-expansion/
distilled_at: 2026-10-04
reviewed_at: 2026-10-04
tags: [tools, filesystem, patch, web, process, git, sandbox, recovery]
authorities: [docs/architecture/runtime.md, docs/architecture/sandbox.md, packages/tools/src/default-tools.ts, packages/tools/src/apply-patch.ts, packages/tools/src/process-manager.ts, packages/storage/src/json-file-process-session-store.ts, packages/tools/src/internal/git-sandbox-access.ts, packages/sandbox/src/git-runner.ts]
---

# Tool Suite Expansion

## Purpose

- 为工作区任务扩展有界的文件发现与修改、网页读取、长进程观察和本地 Git 工作流；工具仍通过 Runtime 的可信身份、授权判断与已提交执行证据推进 Goal。 [S1, S2, S4, S6]

## Durable Decisions

- D1 — 新工具从统一默认注册入口加入默认 Profile；显式或冻结 Profile 不自动扩大。Runtime 注入 Goal/Run 身份，直接调用与 execute_program 子调用经过同一工具授权和沙箱流程。 [S2, S3, S4, S6, S25]
- D2 — 文件发现、分段读取与文本搜索返回有界结构化结果，并在适用时提供绑定查询的续读游标；跨次读取不承诺文件快照一致。 [S1, S2, S7, S8, S9, S10]
- D3 — apply_patch 在首次写入前验证全部路径与 hunk，仅接受完整上下文的唯一匹配，不使用 fuzz；已知部分写入如实报告，结果未知时进入人工恢复而不自动重放。 [S1, S2, S11, S12]
- D4 — 网页搜索和抓取复用已有后端，结果包含有界来源与文本；外部请求仍需要 Runtime 派生并获批的网络能力，不增加浏览器交互。 [S1, S2, S13, S14, S15]
- D5 — 受管进程按 Goal 隔离并由宿主统一关闭；同一宿主内可跨 Run 观察，正常关闭会终止受管进程组，重启只把旧记录投影为 interrupted，不重连或重启旧 PID。 [S1, S2, S3, S16, S17, S18]
- D6 — 本地 Git 通过固定 argv 的专用 Seatbelt 执行器提供查询与本地写操作；访问范围从磁盘上的真实 gitdir/common-dir/worktree 拓扑派生，并在启动前与当前 Action 计划核对。模型不能提供 Git 元数据路径，Git 范围不得由 Bash 或 Process 复用；只读查询关闭 hooks 与外部 diff/textconv，写操作保留 hooks 并运行于受限沙箱。 [S1, S2, S5, S19, S20, S21, S22, S24]

- D7 — 分支与 worktree 操作保持本地并保护用户文件；worktree 删除前检查目标，拒绝主工作树、dirty、untracked 或 ignored 内容、locked/submodule 及无法完整检查的目标，不使用 force/clean，也不执行远端或历史改写。 [S1, S2, S23, S25, S26]

## Guardrails

- 只有查询操作可安全重放；补丁、进程启动/停止与 Git 写操作使用 manual 恢复，已知或未知结果都不得被伪装成成功或自动重复副作用。 [S2, S3, S11, S12, S16, S20, S22]
- worktree 移除不得忽略 ignored、untracked 或其他未保存内容；主工作树、locked、submodule 或无法完整检查的目标必须保留。 [S1, S2, S23, S26]
- 进程管理权限按 Goal 归属，正常关闭负责终止受管进程；进程记录不是 Goal 完成证据。 [S1, S2, S4, S16, S17, S18]
- 默认工具集的扩展不得隐式改变用户显式声明的 Profile。 [S1, S2, S6, S25]

## Revisit When

- 增加远端 Git 操作、强制或历史改写命令、交互式终端，或跨宿主进程管理保证时。
- Git/worktree 拓扑或操作系统沙箱后端变化时。

## Sources

- S1: `specs/tool-suite-expansion/requirements.md`
- S2: `specs/tool-suite-expansion/design.md`
- S3: `specs/tool-suite-expansion/tasks.md`
- S4: `docs/architecture/runtime.md`
- S5: `docs/architecture/sandbox.md`
- S6: `packages/tools/src/default-tools.ts`
- S7: `packages/tools/src/list-directory.ts`
- S8: `packages/tools/src/find-files.ts`
- S9: `packages/tools/src/read-file.ts`
- S10: `packages/tools/src/grep.ts`
- S11: `packages/tools/src/apply-patch.ts`
- S12: `packages/runtime/test/apply-patch-recovery.test.ts`
- S13: `packages/tools/src/web-search.ts`
- S14: `packages/tools/src/web-fetch.ts`
- S15: `packages/runtime/test/web-tool-permission.test.ts`
- S16: `packages/tools/src/process-manager.ts`
- S17: `packages/storage/src/json-file-process-session-store.ts`
- S18: `packages/tui/test/process-lifecycle.integration.test.ts`
- S19: `packages/tools/src/internal/git-sandbox-access.ts`
- S20: `packages/sandbox/src/git-runner.ts`
- S21: `packages/tools/src/git-read-tools.ts`
- S22: `packages/tools/src/git-write-tools.ts`
- S23: `packages/tools/src/git-worktree-tools.ts`
- S24: `packages/runtime/test/git-sandbox-authorization.test.ts`
- S25: `packages/tui/test/tool-suite.integration.test.ts`
- S26: `packages/tools/test/git-worktree-tools.test.ts`
