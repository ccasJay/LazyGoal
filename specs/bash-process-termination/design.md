# Bash 进程终止保障 设计

## 审批摘要

### 方案

在 POSIX 上以独立进程组启动 bash 命令,超时/中止时对整组执行 SIGTERM → 固定宽限 → SIGKILL 双阶段终止,使命令连同后台派生进程在确定上限内被清理;对外观察契约全部不变。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 进程组边界 | `spawn` 以 `detached: true` 创建新进程组,终止信号发往 `-pid` 整组;后台派生进程天然在组内,无需逐个追踪 | `setsid` 等主动脱组命令不受管(req-2-2 已知边界);Windows 不启用 detached,维持现状 |
| 双阶段终止 | SIGTERM 后启动 2 秒固定宽限计时,`close` 先到则取消升级,否则对整组 SIGKILL;忽略 SIGTERM 的命令也能按时结束 | 最迟 `timeoutMs + 2s` 返回;宽限常量内部固定,不扩输入面 |
| 管道悬置消除 | SIGKILL 杀整组后管道写端关闭,`close` 必然触发;不需要引入 `exit` 事件或额外排空逻辑 | bash 已退出但后台进程持管道的场景同样按时返回 `COMMAND_TIMEOUT` |
| abort 共用终止路径 | 中止与超时走同一双阶段状态机,仅触发源不同 | abort 后仍由既有 `throwIfAborted` 抛 `ExecutionAbortedError`,语义不变 |
| 状态与输出收集不变 | `CommandOutcome`、TailCollector、`COMMAND_TIMEOUT`/`COMMAND_FAILED` 判定顺序、`manual` 重放全部保留 | 现有测试与调用方无感;变更收敛在 `runShellCommand` 内部 |

### 风险与待确认

- 风险等级:medium;理由:触及进程生命周期与中止恢复边界,但对外契约不变、变更局部可逆。
- 关键操作:无。
- 风险:宽限计时叠加高负载 CI 可能使时长断言偏紧,测试用宽松上界缓解;`process.kill(-pid)` 的 ESRCH 需静默忽略。
- 待确认:无。

## Overview

当前 `runShellCommand` 只对直接子进程发一次 SIGTERM 后等待 `close`;命令忽略信号或后台进程持有 stdio 管道时,`close` 永不触发,超时上限失守并遗留进程。本设计把终止路径改为进程组级双阶段状态机,触发源(超时计时器、abort 监听)与结算路径(`close` → `CommandOutcome`)保持不变。

## Key Design Decisions

### 进程组边界与创建方式

POSIX 上 `spawn(command, { detached: true, ... })` 使子进程成为新进程组组长(组 ID = 子进程 PID)。终止时 `process.kill(-child.pid, signal)` 对整组发信号,后台派生进程与持管道进程天然在组内。不调用 `child.unref()`,Node 生命周期管理保持现状。

```text
LazyGoal 进程
  └── bash -c <command>          (进程组长, pid=PGID)
        ├── 前台命令进程
        └── 后台派生进程 (sleep 600 &)
终止: kill(-PGID, SIGTERM) → 2s 宽限 → kill(-PGID, SIGKILL)
```

Windows 平台不设置 `detached`(其语义为新建控制台而非进程组),`child.kill(signal)` 单进程路径与现有行为一致;不引入平台分支的新对外承诺。

### 双阶段终止状态机

`runShellCommand` 内部以 `terminationStarted` 标志保证幂等,超时与 abort 共用同一转换:

```text
running ──(timeout | abort)──► SIGTERM(整组) ──启动宽限计时──► grace
grace ──close 先到──────────► settle(现有结算路径)
grace ──2s 到期────────────► SIGKILL(整组) ──► 等待 close → settle
```

- 宽限常量 `BASH_TERMINATION_GRACE_MS = 2_000`,内部 `const`,不进入输入 Contract。
- SIGTERM 阶段若 `close` 在宽限内到达,清除宽限计时并按现有路径 settle;`timedOut` 仍由超时计时器置位,`COMMAND_TIMEOUT` 判定不变。
- `process.kill` 对已消失进程组抛 `ESRCH`,捕获后静默忽略;其余 `error` 事件语义不变。
- SIGKILL 后不再设第二层宽限:整组被杀后管道写端关闭,`close` 必然触发;仅 `setsid` 脱组的外部进程可能拖延,属 req-2-2 已知边界。

### 结算事实与输出收集

`settle` 仍以 `close` 为唯一命令结算事件(保证 TailCollector 已消费完流数据),`CommandOutcome`、`combineOutput`、`COMMAND_TIMEOUT`/`COMMAND_FAILED`/成功判定的顺序与文案不变。abort 触发终止后,由 `execute` 内既有的 `throwIfAborted(control)` 抛出 `ExecutionAbortedError`,中断路径不产生失败 Observation,`outcome_unknown` 恢复语义不变。

### 变更收敛范围

全部变更位于 `packages/tools/src/bash.ts` 的 `runShellCommand` 与其常量区:新增 `detached` 平台分支、终止状态机与宽限常量;不新增导出符号、不修改 `BashTool` 公共接口、不触碰 Contract 与 Policy 层。

## Testing Strategy

在 `packages/tools/test/bash.test.ts` 扩充(沿用 `node:test`,POSIX 环境执行):

- 忽略 SIGTERM:`trap "" TERM; sleep 30` + 小 `timeoutMs`,断言返回 `COMMAND_TIMEOUT` 且耗时不超过 `timeoutMs + 宽限 + 余量`。
- 后台派生进程:`sleep 30 & sleep 30`(后台进程持 stdout)超时后按时返回;返回后以进程组存活检查(如 `process.kill(-pid, 0)` 预期 ESRCH,或等待短暂后 `ps` 断言)验证无遗留受管进程。
- 管道悬置:bash 秒退但后台进程持管道(如 `sleep 30 & disown; exit 0` 前台无等待),断言超时路径确定返回而非挂起。
- abort:长命令运行中触发 AbortController,断言及时抛出 `ExecutionAbortedError` 且子进程被清理。
- 回归:现有正常退出、非零退出码、输出截断、超时、abort 用例全部保留通过;Windows 平台不新增断言(维持现状,不在 CI 覆盖范围)。

时长断言统一使用宽松上界(宽限 + 1000ms 余量)避免高负载 flake;测试命令统一使用 `sleep` 等 POSIX 基础工具。
