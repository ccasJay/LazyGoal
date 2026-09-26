# Goal 看板单会话后端验证实施计划

- [x] //TODO 1. 接入同源本机浏览器入口与访问授权

  - 实现目标：增加显式浏览器子命令，在回环 HTTP 服务上提供构建页面和受保护的 API/流入口；保留默认 TUI 启动。
  - 成功判据：仅获准的本机页面能读取受限接口；错误 Host、来源或凭据均被拒绝，且默认命令仍进入 TUI。
  - 验证方式：待实现的 `packages/browser/test/browser-entry.test.ts` 与授权路由测试；执行 `npx tsx --test packages/browser/test/browser-entry.test.ts`。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [7.3](./requirements.md#req-7-3)_

- [x] //TODO 2. 投影正式工作区 Goal 列表与已提交会话

  - 实现目标：从正式 Goal Catalog、Snapshot 与提交边界内的 Trajectory 生成白名单看板及会话 DTO。
  - 成功判据：列表和详情只展示真实 Goal、按序提交的消息/步骤及存在的 GoalPlan；缺失、损坏和无计划状态均有正确表现，响应无敏感原始字段。
  - 验证方式：待实现的 `packages/browser/test/browser-projection.test.ts`；执行 `npx tsx --test packages/browser/test/browser-projection.test.ts`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [5.1](./requirements.md#req-5-1), [6.4](./requirements.md#req-6-4)_

- [x] //TODO 3. 实现创建 Goal 与单活动会话的命令受理

  - 实现目标：校验 wire 输入，按稳定 Goal ID 处理创建重试，并将一次受理的长时执行交给现有 Launcher；锁定当前活动 Goal。
  - 成功判据：有效意图产生一个已持久化 Goal；失败不生成假条目；重复或并发请求不创建第二个 Goal，切换查看对象不启动其他 Goal。
  - 验证方式：待实现的 `packages/browser/test/browser-commands.test.ts` 创建和并发场景；执行 `npx tsx --test packages/browser/test/browser-commands.test.ts`。
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.4](./requirements.md#req-1-4), [6.3](./requirements.md#req-6-3)_

- [x] //TODO 4. 接入结构化回答、任务提案和工具动作审批

  - 实现目标：把带当前 Goal/Run、`requestId` 或 `actionId` 的类型化操作映射到 `GoalCoordinator.resume`，只在匹配的等待点接受。
  - 成功判据：回答、提案批准/反馈及动作批准/拒绝分别推进当前 Run；旧请求、重复提交和错配身份保持快照不变，同一 Action 不重复执行。
  - 验证方式：待实现的 `packages/browser/test/browser-interactions.test.ts`；执行 `npx tsx --test packages/browser/test/browser-interactions.test.ts`。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4)_

- [x] //TODO 5. 按 Run 状态接入普通消息与后续任务

  - 实现目标：将普通等待消息交给同一 Run 的 `resume`，将 completed 后的新任务交给 `continue`，拒绝其他状态的文本提交。
  - 成功判据：blocked 等待不生成新 Run；completed 仅在非空输入后生成后继 Run；审批等待、失败、取消和命令忙碌时不接受普通消息。
  - 验证方式：待实现的 `packages/browser/test/browser-messages.test.ts`；执行 `npx tsx --test packages/browser/test/browser-messages.test.ts`。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [ ] //TODO 6. 接入公开实时事件与提交后刷新通知

  - 实现目标：向获准连接发送当前 Goal/Run 的安全实时进展和快照重读通知，限制输出并在断线后从最新提交状态重建。
  - 成功判据：旧 Run、旧连接和 reasoning 事件不进入当前视图；已提交步骤替换对应临时活动，文本流结束及流故障都不伪造 Run 终态。
  - 验证方式：待实现的 `packages/browser/test/browser-stream.test.ts`；执行 `npx tsx --test packages/browser/test/browser-stream.test.ts`。
  - _Requirements: [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [5.3](./requirements.md#req-5-3), [6.4](./requirements.md#req-6-4)_

- [ ] //TODO 7. 用真实会话状态替换原型模拟状态和交互

  - 实现目标：沿用原型主要宽窄屏布局，接入真实列表、会话、实时活动及当前等待表单；隐藏或禁用范围外的模拟操作。
  - 成功判据：宽窄屏均可从卡片进入和返回真实会话；无虚构计划或完成状态，普通文本不能代替回答和审批。
  - 验证方式：待实现的浏览器组件与视口测试，入口 `npm run test:e2e --prefix prototypes/goal-board`；执行 `npm run build --prefix prototypes/goal-board`。
  - _Requirements: [1.5](./requirements.md#req-1-5), [2.4](./requirements.md#req-2-4), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

- [ ] //TODO 8. 固化重启恢复与未知工具结果的处理

  - 实现目标：页面重载和服务重启后仅依据最新已提交状态恢复视图，展示结果未知的动作等待，并阻止连接事件触发工具重放。
  - 成功判据：同一 Goal 的消息、步骤、等待请求和计划可重建；工具执行边界重启后遵守现有重放策略，不可重放动作不被再次执行。
  - 验证方式：待实现的 `packages/browser/test/browser-recovery.test.ts` 与受控工具重启场景；执行 `npx tsx --test packages/browser/test/browser-recovery.test.ts`。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [7.2](./requirements.md#req-7-2)_

- [ ] //TODO 9. 建立隔离工作区的可重复浏览器验收场景

  - 实现目标：增加确定性模型与受控工具的浏览器自动化入口，覆盖完整单会话和授权、审批、断线、重启的组合路径。
  - 成功判据：重复运行产生相同提交事实；非法请求不推进 Goal，步骤和工具动作不重复；既有 TUI/Runtime 入口行为通过回归。
  - 验证方式：待实现的 `npm run test:e2e --prefix prototypes/goal-board`；执行 `npm test`、`npm run build --prefix prototypes/goal-board` 与 `git diff --check`。
  - _Requirements: [3.3](./requirements.md#req-3-3), [6.2](./requirements.md#req-6-2), [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.3](./requirements.md#req-1-3) | 当前工作区真实 Goal 有稳定身份与 Run 状态；不存在和损坏记录分别报错，不残留模拟数据。 | Catalog/详情接口测试与隔离目录数据（待实现） |
| [1.2](./requirements.md#req-1-2)、[1.4](./requirements.md#req-1-4) | 非空创建恰好持久化一个 Goal；失败、重试和切换查看对象不暗中创建或推进其他 Goal。 | 命令并发测试与浏览器流程（待实现） |
| [1.5](./requirements.md#req-1-5) | 宽窄屏保留看板、会话打开和返回路径，界面所示均为真实状态。 | 双视口浏览器断言与截图视觉核对（待实现） |
| [2.1](./requirements.md#req-2-1) | 提交历史按序显示，GoalPlan 缺失时无示例里程碑或完成比例。 | 投影测试与浏览器会话断言（待实现） |
| [2.2](./requirements.md#req-2-2)、[2.3](./requirements.md#req-2-3) | 临时活动与提交步骤分层；跨 Goal、旧 Run 和已过期流不覆盖当前会话，提交后不重复。 | 流桥接测试与断线场景（待实现） |
| [2.4](./requirements.md#req-2-4) | 文本流结束不显示完成；等待、completed、failed、cancelled 按快照状态呈现。 | 状态投影与浏览器断言（待实现） |
| [3.1](./requirements.md#req-3-1)、[3.2](./requirements.md#req-3-2) | 结构化问答和任务提案批准/反馈使用当前请求身份；普通文本无法替代。 | 交互命令与浏览器表单测试（待实现） |
| [3.3](./requirements.md#req-3-3)、[3.4](./requirements.md#req-3-4) | Action 明确批准或拒绝；旧、重复、跨 Goal/Run 操作均不改变事实或重复执行。 | 受控工具计数与非法命令测试（待实现） |
| [4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2)、[4.3](./requirements.md#req-4-3) | 普通等待恢复同一 Run；completed 仅显式非空输入创建后继 Run；其他状态与忙碌命令被拒绝。 | 消息生命周期测试（待实现） |
| [5.1](./requirements.md#req-5-1)、[5.2](./requirements.md#req-5-2) | 刷新及服务重启恢复提交历史和等待点；未知结果动作不自动重复执行。 | 重启进程与受控工具测试（待实现） |
| [5.3](./requirements.md#req-5-3) | 流断开、重连和旧事件后，历史来自最新快照，连接故障不伪造终态。 | 流重连测试与浏览器流程（待实现） |
| [6.1](./requirements.md#req-6-1)、[6.2](./requirements.md#req-6-2) | 仅回环监听；错误 Host、来源、凭据的读取或写入均被拒绝且无模型/工具调用。 | HTTP 授权边界测试（待实现） |
| [6.3](./requirements.md#req-6-3)、[6.4](./requirements.md#req-6-4) | 无效输入和不适用命令不改状态；响应无凭据、非公开推理和无界工具输出。 | wire 校验、响应字段及输出上限测试（待实现） |
| [7.1](./requirements.md#req-7-1)、[7.2](./requirements.md#req-7-2) | 隔离工作区重复浏览器链路结果一致；旧审批、重连和重启无重复提交或不可重放工具动作。 | 确定性浏览器自动化与受控工具计数（待实现） |
| [7.3](./requirements.md#req-7-3) | 默认 CLI/TUI 与既有 Runtime 创建、审批、恢复行为仍可用。 | CLI、TUI、Runtime 定向回归及 `npm test`（待执行） |

### Latest Result

未执行。实施后记录各验收结果、证据位置、测试时间、代码与契约状态及整体时效。
