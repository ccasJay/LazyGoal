# macOS Seatbelt 项目沙箱实施计划

本计划只实现受限命令的实际能力与执行边界；Tool／Sandbox Grant、项目模式、审批 UI 和撤销由 [Permission Tasks](../permission/tasks.md) 实施。额外能力的端到端执行须在两份 Spec 的接口完成后共同验证。

- [x] //TODO 1. 建立独立 Sandbox package 并迁入文件 Tool 项目路径边界

  - 实现目标：新增 `@lazygoal/sandbox`，让四个文件 Tool 使用同一真实项目路径判断，并保留原领域错误与中止映射。
  - 成功判据：项目内路径可访问；绝对路径、父目录和越界符号链接仍按原规则拒绝，Sandbox 不依赖 Runtime 或 Permission。
  - 验证方式：待实现的 `packages/sandbox/test/workspace-sandbox.test.ts`；现有文件 Tool 测试；`npm run check:dependencies`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.2](./requirements.md#req-2-2)_

- [ ] //TODO 2. 让默认 Bash 在 macOS Seatbelt 中安全执行

  - 实现目标：完成默认拒绝策略、固定 `sandbox-exec` 启动、私有临时目录、凭据筛选与 macOS 默认 Bash Tool 策略接入。
  - 成功判据：符合 Profile 的默认 Bash 自动执行并仅访问项目普通文件与必要运行文件；项目外文件、Git 元数据写入、回环和外网被实际阻止，子进程同样受限；策略或启动失败不回退普通 shell。
  - 验证方式：待实现的 `packages/sandbox/test/macos-seatbelt-default.test.ts` 与 `packages/tools/test/bash-sandbox-default.test.ts`，在真实 macOS 启动子进程；现有 Tool Policy／Bash 回归。
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [3.1](./requirements.md#req-3-1), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [6.1](./requirements.md#req-6-1)_

- [ ] //TODO 3. 将额外文件与网络申请变为可强制的本次执行范围

  - 实现目标：扩展 Bash 输入与实际能力解析，为经核准的文件、目录子树、受保护元数据和 `all_outbound` 生成受限策略；向 Permission 提供规范化范围，Sandbox 本身不判断 Grant。
  - 成功判据：模型的目标和用途文本不产生权限；未获核准的计划拒绝启动，核准后只允许实际路径、读写方向及任意目标出站范围，回环随出站开放而入站不开放；不能把域名说明当作隔离规则。
  - 验证方式：待实现的 `packages/tools/test/bash-sandbox-input.test.ts`、`packages/sandbox/test/macos-seatbelt-capability.test.ts` 与 `packages/runtime/test/sandbox-scope.test.ts`；真实 macOS 文件和网络连接检查。
  - _Requirements: [2.4](./requirements.md#req-2-4), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 4. 接入 Permission 核准后的执行计划与恢复故障反馈

  - 实现目标：Runner 在 Action 执行前以当前 Permission 结果重建计划；Bash 只消费本次可信计划，并把边界拒绝、启动故障及结果不确定交回 Runtime。
  - 成功判据：撤销或失配后未开始的命令不能凭旧计划执行；重启后重新核准并构建范围，执行结果不明时维持人工等待；边界拒绝与启动故障可区分且诊断不泄露密钥或未获准文件内容。
  - 验证方式：待实现的 `packages/runtime/test/sandbox-permission-execution.test.ts`、`packages/runtime/test/sandbox-plan-recovery.test.ts` 与 `packages/tools/test/bash-sandbox-errors.test.ts`；与 Permission Spec 的审批／撤销测试联合运行。
  - _Requirements: [4.3](./requirements.md#req-4-3), [5.3](./requirements.md#req-5-3), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4), [7.1](./requirements.md#req-7-1)_

- [ ] //TODO 5. 准确报告不受 macOS Seatbelt 保护的执行路径

  - 实现目标：保留 Linux／Windows 当前 Bash 调用，提供明确的平台后端接入点和保护状态；Benchmark 容器与独立 `web_fetch` 不进入 Seatbelt 命令路径。
  - 成功判据：非 macOS 状态不声称受 Seatbelt 保护且原有命令行为不变；Benchmark 和 `web_fetch` 保持自身执行与授权策略，不显示虚假沙箱状态。
  - 验证方式：待实现的 `packages/runtime/test/sandbox-platform-status.test.ts`；现有 Benchmark 与 `web_fetch` 回归；`npm run check:dependencies`。
  - _Requirements: [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1), [2.2](./requirements.md#req-2-2) | 四个文件 Tool 迁入 Sandbox 后，项目内与越界路径行为保持一致。 | 文件 Tool 回归与 Sandbox 路径测试（待实现）。 |
| [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.3](./requirements.md#req-2-3) | macOS 默认 Bash 自动且真正受限；子进程、临时目录及必要系统读取符合默认策略。 | 真实 macOS 受限进程集成测试（待实现），不能只检查策略文本。 |
| [2.4](./requirements.md#req-2-4), [3.1](./requirements.md#req-3-1), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2) | Git 元数据与内部状态受保护；默认断外网和回环，子进程无模型密钥，YOLO／Tool Grant 不扩大边界。 | 实际文件、网络与环境检查（待实现）；Permission 策略回归。 |
| [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4) | 模型可申请但不能自授权；`all_outbound` 核准后可出站含回环，入站仍拒绝，域名说明不构成限制。 | Scope 解析和真实连接测试（待实现）；Permission 审批范围联测。 |
| [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3) | 外部文件按真实路径、文件／目录子树及读写方向限制；旧计划或其他命令的批准不能扩权。 | 受限进程与 Permission 范围集成测试（待实现）。 |
| [5.3](./requirements.md#req-5-3), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4), [7.1](./requirements.md#req-7-1) | 策略／启动失败关闭；恢复重建计划；结果不明不重放；诊断准确且不泄露未获准内容。 | 故障注入、跨重启与 Runtime 状态测试（待实现）。 |
| [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3) | Linux／Windows 报告无 Seatbelt；Benchmark 与 `web_fetch` 沿各自路径运行。 | 平台分支、Benchmark 与独立 Tool 回归（待实现）。 |

完成实施后运行 `npm test` 全量回归；真实 macOS Seatbelt 的文件与网络拒绝／放行是必需证据，不能由模拟结果替代。

### Latest Result

未执行。后续按被测提交和 Spec 版本记录逐项结果、证据、未解决问题、整体状态与时效。
