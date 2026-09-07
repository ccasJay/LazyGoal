# Bash 进程终止保障 实施计划

- [ ] //TODO 1. 在 runShellCommand 实现进程组双阶段终止

  - 实现目标:POSIX 上以 `detached: true` 创建进程组,超时与 abort 共用 SIGTERM(整组)→ 2 秒宽限 → SIGKILL(整组)状态机;`terminationStarted` 保证幂等,`process.kill(-pid)` 的 ESRCH 静默忽略;不对主动脱组进程额外追杀;Windows 不启用 detached,维持现有单进程路径
  - 成功判据:宽限内 `close` 先到则不升级;超时/abort 触发的终止最迟在宽限后完成清理
  - 验证方式:`npx tsx --test packages/tools/test/bash.test.ts` 现有用例全部通过(正常退出、非零退出码、超时、abort、输出截断)
  - _Requirements: [1.1](./requirements.md#req-1-1), [3.1](./requirements.md#req-3-1), [2.2](./requirements.md#req-2-2), [4.3](./requirements.md#req-4-3)_

- [ ] //TODO 2. 超时上限与忽略信号测试

  - 实现目标:新增用例——`trap "" TERM; sleep 30` 配 `timeoutMs: 200` 返回 `COMMAND_TIMEOUT` 且耗时不超过 `timeoutMs + 3000`;bash 秒退但后台进程持有 stdout 管道的场景同样按时返回而非挂起
  - 成功判据:两个用例均在宽松上界内确定返回,超时后命令进程组无存活成员
  - 验证方式:待实现的测试用例,加入 `packages/tools/test/bash.test.ts`
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3)_

- [ ] //TODO 3. 后台派生进程清理测试

  - 实现目标:新增用例——`sleep 30 & sleep 30` 超时后返回 `COMMAND_TIMEOUT`,随后以 `process.kill(-pgid, 0)` 预期 ESRCH 验证整组(含后台派生进程)已清理
  - 成功判据:返回后无遗留受管进程
  - 验证方式:待实现的测试用例,加入 `packages/tools/test/bash.test.ts`
  - _Requirements: [2.1](./requirements.md#req-2-1)_

- [ ] //TODO 4. abort 双阶段终止测试

  - 实现目标:新增用例——长命令运行中触发 AbortController,断言及时抛出 `ExecutionAbortedError`,中止前已有输出按现有语义不产生失败 Observation,进程组已清理
  - 成功判据:中止在宽限期内完成终止;忽略 SIGTERM 的长命令中止同样按时返回
  - 验证方式:待实现的测试用例,加入 `packages/tools/test/bash.test.ts`
  - _Requirements: [3.1](./requirements.md#req-3-1)_

- [ ] //TODO 5. TSDoc 契约更新与全量回归

  - 实现目标:更新 `BashTool` 类 TSDoc 的终止语义描述(最迟 `timeoutMs` 加固定宽限返回、进程组为受管边界、Windows 兼容降级);运行 tools 包全部测试
  - 成功判据:TSDoc 与实现行为一致;`packages/tools/test/` 全部测试通过
  - 验证方式:`npx tsx --test packages/tools/test/*.test.ts`
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2)_

## Feature Verification

风险依据:[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) | 超时命令最迟 `timeoutMs`+宽限+余量内返回 `COMMAND_TIMEOUT` | bash.test.ts 超时用例(待实现,TODO 2) |
| [1.2](./requirements.md#req-1-2) | `trap "" TERM` 忽略 SIGTERM 的命令被强制结束并按时返回 | bash.test.ts 忽略信号用例(待实现,TODO 2) |
| [1.3](./requirements.md#req-1-3) | 后台进程持管道悬置时仍按时返回 | bash.test.ts 管道悬置用例(待实现,TODO 2) |
| [2.1](./requirements.md#req-2-1) | 后台派生进程随组终止,返回后无遗留受管进程 | bash.test.ts 进程组清理用例(待实现,TODO 3) |
| [2.2](./requirements.md#req-2-2) | `setsid` 脱组进程不追杀,主命令仍按时终止 | 设计边界声明,代码走查确认无追杀逻辑(不自动化,避免 CI 遗留进程) |
| [3.1](./requirements.md#req-3-1) | abort 走同一双阶段终止并抛 `ExecutionAbortedError` | bash.test.ts abort 用例(待实现,TODO 4) |
| [4.1](./requirements.md#req-4-1) | 正常/非零退出与输出截断语义不变 | 现有 bash.test.ts 回归用例(TODO 5) |
| [4.2](./requirements.md#req-4-2) | `manual` 重放与 `outcome_unknown` 语义不变 | 现有测试回归 + 未改动 replayPolicy 声明的代码走查(TODO 5) |
| [4.3](./requirements.md#req-4-3) | Windows 维持现有单进程行为,无新增平台承诺 | 代码走查:平台分支仅控制 `detached`(TODO 1) |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。
