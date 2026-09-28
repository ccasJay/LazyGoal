# Runtime 错误恢复与 Tool 授权审批实施任务

- [x] //TODO 1. 接入按操作匹配的 Tool 授权查询

  - 实现目标：在 Runtime 的 Tool 准备与 Policy 检查后接入 Grant 匹配器和工作区授权读取；规范化 `bash` 输入、写入目标路径及其他 Tool 输入，并保持无 Grant 时的现有审批行为。
  - 成功判据：`read_file`、`grep` 仍自动放行；获准写入同一路径的不同内容可复用权限，而另一条 `bash` 命令、改指向的路径、跨 Goal／工作区或撤销的 Grant 仍等待审批；Profile、输入或 Policy 拒绝不能被 Grant 覆盖。
  - 验证方式：待实现的 Grant 匹配及 Runner 授权测试；运行 `npx tsx --test packages/runtime/test/runner.test.ts` 和新增测试入口。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [1.5](./requirements.md#req-1-5)_

- [x] //TODO 2. 持久化三档审批并接通恢复与撤销命令

  - 实现目标：扩展 Coordinator、当前 Goal Snapshot／Trajectory 与工作区 Grant Store，接入单次、会话和项目授权的审批、列举、撤销及待生效 Grant 的恢复顺序。
  - 成功判据：同一 Action 的批准可靠提交后才执行；会话 Grant 跨 Run、项目 Grant 跨 Goal 且重启后范围不扩大；拒绝不创建 Grant；提交中断、过期身份、重复冲突、损坏记录或已撤销 Grant 均不能放行新 Action。
  - 验证方式：待实现的 Storage／Coordinator 失败注入与恢复测试；运行 `npx tsx --test packages/runtime/test/goal-coordinator.test.ts packages/runtime/test/goal-multi-run-recovery.test.ts` 和新增测试入口。
  - _Requirements: [1.2](./requirements.md#req-1-2), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [6.4](./requirements.md#req-6-4)_

- [x] //TODO 3. 接入浏览器审批、授权查看与撤销

  - 实现目标：扩展 Browser 命令、投影与 Goal Board 审批面板，按当前 Action 身份提供完整输入详情、三档选择和当前范围的 Grant 列表／撤销入口。
  - 成功判据：界面能审阅完整命令或写入目标，并明确提示同路径不同内容的后续写入会自动获准；提交过期 Action 或跨工作区查询被拒绝；撤销后下一个匹配 Action 再次等待审批。
  - 验证方式：待实现的 Browser 路由／投影测试及 Goal Board 自动化交互测试；运行 `npx tsx --test packages/browser/test/browser-commands.test.ts packages/browser/test/browser-interactions.test.ts` 和新增测试入口。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.4](./requirements.md#req-2-4)_

- [x] //TODO 4. 接入 TUI 审批、授权查看与撤销

  - 实现目标：扩展 TUI Controller 与 Confirm 面板，显示完整待执行输入、三档授权期限及当前范围 Grant 的列举／撤销，保留 YOLO 和结果不确定时的既有操作边界。
  - 成功判据：非 YOLO 用户能明确选择期限并看见写入路径授权后果；YOLO 自动批准不产生持续 Grant；撤销后下一个 Action 重新审批；`outcome_unknown` 仍只接受该 Action 的人工恢复选择。
  - 验证方式：待实现的 TUI Controller／屏幕交互测试；运行 `npx tsx --test packages/tui/test/session-controller.test.ts packages/tui/test/session-screen.test.tsx packages/tui/test/tool-policy.test.ts`。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.4](./requirements.md#req-2-4), [1.4](./requirements.md#req-1-4), [5.3](./requirements.md#req-5-3)_

- [x] //TODO 5. 分类并有限重试模型临时故障

  - 实现目标：在 LLM 适配边界和 Runner 接入类型化故障分类、独立三次调用上限、可中止退避及尝试事实；确认不会与适配器内部重试叠加。
  - 成功判据：429、暂时性 5xx、连接和超时可重试且遵守中止；鉴权、配置、协议、存储及未知异常明确失败；上限耗尽时保留各次稳定原因，不再发起第四次调用。
  - 验证方式：适配器故障分类、SDK 无内部重试、Runner 三次上限／阶段不重复计数／退避取消测试通过；运行 `npx tsx --test packages/runtime/test/runner.test.ts packages/llm/test/model-request-failure.test.ts packages/llm/test/openai-compatible.test.ts packages/llm/test/gemini.test.ts packages/llm/test/pi-ai.test.ts` 与 `npx tsc --noEmit`。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.4](./requirements.md#req-3-4), [5.4](./requirements.md#req-5-4)_

- [x] //TODO 6. 将可纠正输出错误封装为 RuntimeFeedback

  - 实现目标：在 Agent 阶段执行器与 Runtime 校验点接入类型化阶段错误及 `RuntimeFeedback`，向原阶段传递有界、可定位且不含原始敏感输出的修复信息。
  - 成功判据：解析、输出契约、Tool 选择／输入和 Evidence 错误在副作用前生成对应阶段反馈；反馈不进入真实用户消息，纠正后的 Action 仍经过 Profile、输入、Policy 和证据校验，且不降级原输出模式。
  - 验证方式：Agent 阶段反馈、Runtime 校验边界与反馈字段上限测试通过（114 项）；`npx tsc --noEmit` 和 `npm run check:dependencies` 通过。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 7. 持久化阶段纠错链并恢复已完成工作

  - 实现目标：扩展 Runner 的 Decide／Think 阶段循环与当前恢复协议，提交每次尝试及反馈指针，按原阶段续跑并限制每条无效输出链为三次调用。
  - 成功判据：Decide 纠错复用已提交 Think，Think 纠错保留原目标；中断后仅从已提交事实恢复，未提交响应不生效；尝试不重复增加 `stepCount`，耗尽后明确失败，正常多轮 `request_think` 不受该上限约束。
  - 验证方式：待实现的阶段中断／恢复及调用计数测试；运行 `npx tsx --test packages/runtime/test/think-decision-recovery.test.ts packages/runtime/test/model-output-runtime-boundary.test.ts` 和新增测试入口。
  - _Requirements: [4.2](./requirements.md#req-4-2), [4.4](./requirements.md#req-4-4), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

- [ ] //TODO 8. 接入可安全重放 Tool 的有限重试与人工等待

  - 实现目标：在现有 `pendingAction` 边界按 `replayPolicy` 和已提交授权重试同一 Action；将已知业务失败交给 Observation，将缺资料、审批与 `manual` 结果未知保持为可恢复等待。
  - 成功判据：安全 Tool 临时故障沿用 Action ID 和授权、最多三次且不增加 Step；`retryable` 标志不能单独触发重放；业务失败后模型可提出新 Action 并重新验权；未知结果或用户输入缺失时不继续模型／Tool 调用。
  - 验证方式：待实现的 Tool 故障、Observation 与中断注入测试；运行 `npx tsx --test packages/runtime/test/runner.test.ts packages/runtime/test/goal-multi-run-recovery.test.ts` 和新增测试入口。
  - _Requirements: [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [5.1](./requirements.md#req-5-1), [5.3](./requirements.md#req-5-3), [6.2](./requirements.md#req-6-2)_

- [ ] //TODO 9. 投影恢复状态与最终已提交结果

  - 实现目标：扩展执行流、Browser 与 TUI 的运行状态和尝试记录投影，区分系统重试、模型纠错、人工等待与最终失败，并只将已提交结果放入完成时间线。
  - 成功判据：两端都能查看等待原因、最终稳定错误及相关尝试；纠错成功时仅显示最终有效回复和已提交 Tool 结果；未通过验证的原始 JSON 不作为最终回答展示。
  - 验证方式：待实现的 Browser／TUI 投影与时间线测试；运行 `npx tsx --test packages/browser/test/browser-projection.test.ts packages/browser/test/browser-recovery.test.ts packages/tui/test/session-controller-timeline.test.ts` 和新增测试入口。
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

- [ ] //TODO 10. 增加跨边界授权与恢复回归测试

  - 实现目标：补充当前协议的端到端测试与故障注入，在 Grant 待生效、Action 批准、Tool 开始、Observation 提交和撤销边界覆盖跨进程恢复。
  - 成功判据：任一注入点恢复后都不凭未提交授权执行、不重复已提交 Tool 或 Step、不跨项目复用 Grant；过期浏览器命令和无效模型输出不会进入已完成时间线。
  - 验证方式：待实现的 Runtime／Storage／Browser 自动化集成测试；运行 `npx tsx --test packages/runtime/test/goal-multi-run-recovery.test.ts packages/browser/test/browser-recovery.test.ts` 和新增测试入口，再运行 `npm test` 与 `npm run check:dependencies`。
  - _Requirements: [2.2](./requirements.md#req-2-2), [3.3](./requirements.md#req-3-3), [6.1](./requirements.md#req-6-1), [6.4](./requirements.md#req-6-4), [7.3](./requirements.md#req-7-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
| --- | --- | --- |
| [1.1](./requirements.md#req-1-1)、[1.3](./requirements.md#req-1-3)、[1.4](./requirements.md#req-1-4)、[1.5](./requirements.md#req-1-5) | 默认只读自动放行；Bash 仅同命令匹配、写入仅同目标匹配；Profile／Policy 拒绝、跨工作区与撤销仍阻止执行 | Grant 匹配与 Runner 授权测试（待实现） |
| [1.2](./requirements.md#req-1-2)、[2.2](./requirements.md#req-2-2)、[2.3](./requirements.md#req-2-3) | 三档授权按 Action／Goal／workspace 生效；审批先可靠提交，拒绝与过期命令不授权 | Coordinator／Storage 持久化及失败注入测试（待实现） |
| [2.1](./requirements.md#req-2-1)、[2.4](./requirements.md#req-2-4) | Browser／TUI 能查看完整本次输入与同路径写入后果，选择期限、列举和撤销当前范围 Grant | Browser 自动化交互及 TUI 屏幕／Controller 测试（待实现） |
| [3.1](./requirements.md#req-3-1)、[3.4](./requirements.md#req-3-4)、[5.4](./requirements.md#req-5-4) | 暂时性模型故障有限退避；中止停止调用；鉴权、配置、存储与未知故障不误重试，耗尽保留原因 | 适配器／Runner 定向测试与 `npx tsc --noEmit` 通过；覆盖 OpenAI、Gemini、pi-ai 分类入口及三次调用上限 |
| [3.2](./requirements.md#req-3-2)、[3.3](./requirements.md#req-3-3)、[5.1](./requirements.md#req-5-1) | 仅获准的 safe Tool 重放同一 Action；业务失败形成 Observation，新 Action 重验权限，manual 未知结果不重放 | Tool 执行与恢复测试（待实现） |
| [4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2)、[4.3](./requirements.md#req-4-3)、[5.2](./requirements.md#req-5-2) | 错误定位反馈进入原模型阶段；已提交 Think 保留，纠正输出重新通过全部校验且不执行无效 Tool | Agent 阶段与 Runtime Evidence／Tool 边界测试（待实现） |
| [4.4](./requirements.md#req-4-4)、[6.2](./requirements.md#req-6-2)、[6.3](./requirements.md#req-6-3) | 三次无效输出停止该链；正常 Think 循环可继续；恢复不重跑已提交 Think／Tool，不重复 Step | 阶段恢复与计数测试（待实现） |
| [5.3](./requirements.md#req-5-3)、[6.1](./requirements.md#req-6-1)、[6.4](./requirements.md#req-6-4) | 缺资料、审批及 manual 未知结果可恢复等待；中断时未提交事实不生效，损坏或错配授权失败封闭 | Goal／Grant 故障注入及重启测试（待实现） |
| [7.1](./requirements.md#req-7-1)、[7.2](./requirements.md#req-7-2)、[7.3](./requirements.md#req-7-3) | 两端区分重试、纠错与等待；终态有原因和尝试记录；无效原文不显示为已完成答复 | Browser／TUI 投影和时间线测试（待实现） |
| 组合流程：审批→执行→暂时故障→恢复→撤销 | Grant 提交边界故障不会提前执行；同 Action 安全重试沿用授权；撤销只影响未来 Action | Runtime／Storage／Browser 集成与故障注入测试（待实现） |
| 影响边界：当前协议与回归 | 当前 Snapshot／Trajectory 可严格解码；既有审批、YOLO、`request_think` 与完成时间线行为保持约束 | `npm test`、`npm run check:dependencies`、`npx tsc --noEmit`；相关架构文档与实现一致性检查 |

### Latest Result

当前部分结果（2026-09-28）：TODO 1–6 已提交。TODO 6 的定向测试共 114 项通过，`npx tsc --noEmit` 与 `npm run check:dependencies` 通过；验证对应当前 worktree 提交后的代码状态。其余 Feature Verification 待后续 TODO 完成后执行。
