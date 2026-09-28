# 浏览器 Slash Command 接入实施计划

- [x] //TODO 1. 在浏览器消息输入框接入共享命令候选

  - 实现目标：先为已接入的 `/plan` 加入共享 Registry 候选菜单、键盘和鼠标选择，同时保持普通输入与 `//` 转义。
  - 成功判据：输入 `/p` 只出现 `/plan`；Escape 后原文本可继续编辑，普通消息和转义文本仍按原语义发送。
  - 验证方式：扩展浏览器 E2E 测试（待实现）；执行 `npm run test:e2e --prefix prototypes/goal-board`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.5](./requirements.md#req-1-5)_

- [ ] //TODO 2. 将浏览器命令派发与现有 Plan Mode 流程连接

  - 实现目标：命令在草稿和已有 Goal 中只触发对应控制操作，未知命令和非法参数留在输入界面报错。
  - 成功判据：草稿 `/plan` 不创建 Goal，首条任务创建 Plan Run；终态 `/plan` 仅作用于下一 Run，拒绝请求不生成消息或 Step。
  - 验证方式：扩展浏览器命令测试及 E2E 测试（待实现）；执行 `npx tsx --test packages/browser/test/browser-commands.test.ts` 和浏览器 E2E。
  - _Requirements: [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3)_

- [ ] //TODO 3. 提供受授权保护的浏览器模型目录读取

  - 实现目标：通过浏览器 API 返回当前 Provider 的白名单目录、当前选择、来源和脱敏错误。
  - 成功判据：未授权请求不返回目录；在线、离线兜底和鉴权失败分别呈现正确分类，响应中不存在凭据或原始 Provider 响应。
  - 验证方式：新增目录路由测试（待实现），执行 `npx tsx --test packages/browser/test/browser-models.test.ts` 与 `npm run check:dependencies`。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.6](./requirements.md#req-3-6), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2)_

- [ ] //TODO 4. 实现等待状态的模型选择提交

  - 实现目标：浏览器提交模型 ID 时由服务端重新验证目录和 Goal/Run 安全状态，保存非敏感选择，并在恢复执行前对齐 Binding。
  - 成功判据：合法等待点保存一次且后续调用使用新模型；不可选、跨 Provider、Action 审批和旧 Run 请求均被拒绝，原选择与等待状态不变。
  - 验证方式：扩展模型协调器测试及新增浏览器选模命令测试（待实现），执行对应 `npx tsx --test` 定向测试。
  - _Requirements: [3.3](./requirements.md#req-3-3), [4.4](./requirements.md#req-4-4), [4.5](./requirements.md#req-4-5), [6.3](./requirements.md#req-6-3)_

- [ ] //TODO 5. 扩展终态预选与下一 Run 的串行提交

  - 实现目标：允许 completed/failed Goal 保存新模型，并与 `continue` 共用 Goal 级提交顺序。
  - 成功判据：先保存的选择被下一 Run 使用；若新 Run 已先提交，旧 Run 的选择请求被拒绝且不会覆盖新状态。
  - 验证方式：扩展 `packages/runtime/test/goal-model-selection-coordinator.test.ts` 和浏览器命令竞态测试（待实现）；执行对应 `npx tsx --test` 定向测试。
  - _Requirements: [4.3](./requirements.md#req-4-3), [5.5](./requirements.md#req-5-5)_

- [ ] //TODO 6. 在创建 Goal 时保存草稿模型并对齐首次执行

  - 实现目标：创建请求携带可选模型 ID，服务端验证后将完整选择交给 Launcher，并在首次保存失败时恢复旧 Binding。
  - 成功判据：首条任务使用草稿预选模型；未选模时 Snapshot 使用进程默认选择；创建失败不留下错误 Binding，相同 ID 的冲突重试被拒绝。
  - 验证方式：扩展浏览器创建测试与组合根模型测试（待实现）；执行对应 `npx tsx --test` 定向测试。
  - _Requirements: [4.1](./requirements.md#req-4-1), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 7. 接入浏览器 ModelPicker 与结构化等待入口

  - 实现目标：注册 `/model`，在草稿、消息输入框和安全等待表单提供入口，展示目录、来源、当前模型、不可选原因与提交结果。
  - 成功判据：取消和切页不会让迟到目录覆盖新状态；提交失败保留原模型及表单内容，页面只显示脱敏错误。
  - 验证方式：扩展 `prototypes/goal-board/e2e/board.test.mjs`（待实现），执行 `npm run test:e2e --prefix prototypes/goal-board`。
  - _Requirements: [1.3](./requirements.md#req-1-3), [3.4](./requirements.md#req-3-4), [3.5](./requirements.md#req-3-5), [4.2](./requirements.md#req-4-2), [6.4](./requirements.md#req-6-4)_

- [ ] //TODO 8. 验证每次 Web 推进前的 Goal 模型恢复与隔离

  - 实现目标：在创建、继续和恢复执行前按目标 Goal 对齐 Binding，并验证刷新、重启和多 Goal 交替执行。
  - 成功判据：假 Adapter 记录的实际模型及预算始终与目标 Goal Snapshot 一致；无法重建 Binding 时停止推进，不回退到其他 Goal 或环境默认模型。
  - 验证方式：扩展组合根模型测试与浏览器 Runtime E2E（待实现），执行 `npx tsx --test packages/tui/test/composition-root-model-switching.test.ts`、浏览器 E2E 和 `npm test`。
  - _Requirements: [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2)、[1.5](./requirements.md#req-1-5) | `/` 过滤候选；键盘、鼠标和 Escape 可用；普通文本与 `//` 保持原语义 | 浏览器 E2E（待扩展） |
| [1.3](./requirements.md#req-1-3)、[1.4](./requirements.md#req-1-4)、[2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2)、[2.3](./requirements.md#req-2-3) | 命令不写消息或 Step；草稿与终态 `/plan` 正确生效，非法状态清晰拒绝 | 命令服务测试与浏览器 E2E（待扩展） |
| [3.1](./requirements.md#req-3-1)、[3.2](./requirements.md#req-3-2)、[3.6](./requirements.md#req-3-6)、[6.1](./requirements.md#req-6-1)、[6.2](./requirements.md#req-6-2) | 当前 Provider 目录包含状态、来源；离线兜底与鉴权故障分开；未授权请求和响应均无凭据泄漏 | 路由、目录与授权测试（待实现） |
| [3.3](./requirements.md#req-3-3)、[4.4](./requirements.md#req-4-4)、[4.5](./requirements.md#req-4-5)、[6.3](./requirements.md#req-6-3) | 服务端拒绝不可选、跨 Provider、审批中和旧 Run 的切换，不修改已保存选择 | 协调器与浏览器命令测试（待扩展） |
| [4.3](./requirements.md#req-4-3)、[5.5](./requirements.md#req-5-5) | 终态预选与下一 Run 并发按提交顺序判定，旧请求不能覆盖新 Run | Runtime 与浏览器竞态测试（待扩展） |
| [4.1](./requirements.md#req-4-1)、[5.1](./requirements.md#req-5-1)、[5.2](./requirements.md#req-5-2) | 草稿刷新丢弃；创建时模型与 Snapshot、首次调用一致，保存失败回滚 | 浏览器 E2E、创建服务与组合根测试（待扩展） |
| [3.4](./requirements.md#req-3-4)、[3.5](./requirements.md#req-3-5)、[4.2](./requirements.md#req-4-2)、[6.4](./requirements.md#req-6-4) | 选择器取消、迟到响应、结构化等待和错误提示不改变原等待内容或泄漏凭据 | 浏览器 E2E（待扩展） |
| [5.3](./requirements.md#req-5-3)、[5.4](./requirements.md#req-5-4) | 重启与多 Goal 交替执行始终使用对应 Snapshot 模型和预算，恢复失败阻止推进 | 组合根测试与浏览器 Runtime E2E（待扩展） |
| [4.1](./requirements.md#req-4-1)、[4.3](./requirements.md#req-4-3)、[5.3](./requirements.md#req-5-3)、[5.4](./requirements.md#req-5-4) | 在真实本机 UI 中从 `/model` 选模，再分别创建和续写 Goal，界面与实际调用一致 | 人工检查 `lazygoal web`，核对脱敏 Trace 与 Snapshot；如自动证据已覆盖则记录等价证据 |
| 依赖与架构边界 | `@lazygoal/browser` 不依赖 LLM SDK；当前浏览器架构文档与实现一致 | `npm run check:dependencies`、`npm test`、架构文档与源码核对 |

### Latest Result

未执行。实施后记录逐项结果、证据位置、验证时间、被测代码与需求版本、整体状态及时效。
