---
feature: supergoal-mode
status: proposed
risk: high
created_at: 2026-11-15
delivered_at: null
supersedes: []
superseded_by: null
---

# SuperGoal 模式

## 目标与范围

Goal Board 为每个新 Goal 提供普通 Harness 与 SuperGoal 两种固定模式；SuperGoal 由当前交互 Agent 担任 Supervisor，拆解并协调独立 Worker Goal。
本期复用现有服务端 Supervisor、Trigger 与 WorkerScheduler，不增加嵌套 Supervisor，不自动合并 Worker 工作区，也不改变 Run 的 Normal／Plan 模式。

## 用户故事

- **S1** 作为 LazyGoal 用户，我希望为每个新 Goal 选择 Harness 或 SuperGoal，以便按任务需要直接执行或委派给 Worker。
- **S2** 作为 SuperGoal 用户，我希望与同一个交互 Agent 持续沟通并由它编排 Worker Goal，以便异步推进较大的任务。
- **S3** 作为 SuperGoal 用户，我希望查看、交互和控制子 Goal，以便了解委派工作的真实状态。
- **S4** 作为 LazyGoal 维护者，我希望通过配置固定 Worker 模型和实例级并发上限，以便控制子任务的模型选择与资源使用。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | 用户打开新 Goal 草稿或输入 `/supergoal` | 新建区以默认 Harness 的双选 Radio 组暴露 Harness／SuperGoal；`/supergoal` 只切换草稿模式，不提交输入；提交后将选择固定到 Goal，且不改变 Run 的 `normal`／`plan` 语义。 | Goal Board UI harness 覆盖键盘选择、Radio 组、slash 命令、默认值及不自动提交；创建入口集成测试核对持久模式。 |
| R1.2 | S1 | 状态 | Goal 以 Harness 模式创建 | 系统按现有单 Goal Agent Harness 执行，不创建子 Goal；服务端 Supervisor、Trigger 与 WorkerScheduler 仍负责现有入口、路由与进程生命周期。 | Goal Server 集成测试验证 Harness 创建和执行；回归测试核对没有委派关系或额外子 Goal。 |
| R2.1 | S2 | 事件 | SuperGoal 收到需要项目工作的用户输入 | 同一个用户交互 Agent 作为 Supervisor，只能使用沟通与 Worker 编排能力，不获得项目读写工具；它创建带稳定 `parentGoalId` 关系的 Harness 子 Goal，子 Goal 不能再选择 SuperGoal。 | 角色工具注册与委派集成测试验证允许的编排操作、禁止的项目操作、父子身份和不可递归委派。 |
| R2.2 | S2 | 状态 | Supervisor 声明多个独立或有依赖的子任务 | 独立子 Goal 可并行；显式依赖的子 Goal 只有在依赖成功后才派发，依赖失败或取消时保持未派发并唤醒父级重新编排；每个子 Goal 使用独立 worktree。 | 调度测试覆盖并行、依赖成功／失败／取消和父子关联；临时 Git 仓库测试验证 worktree 隔离。 |
| R2.3 | S2、S3 | 事件 | 子 Worker 报告进度或终态 | 复用 Trigger 记录父子身份与结果；进度只更新可见状态，不调用父级模型；终态 Trigger 持久化后唤醒父级一次，由父级决定后续依赖任务或向用户汇总。 | Trigger 与 WorkerScheduler 集成测试覆盖进度不唤醒、终态唤醒一次、父级运行中暂存和结果提交后继续编排。 |
| R3.1 | S3 | 状态 | 用户查看 SuperGoal | 页面显示可导航的子 Goal 与其排队、运行、等待、终态和失败状态；用户可直接打开子 Goal 并通过现有交互 Trigger 回答其等待，不需复制为父级状态。 | UI harness 和 Web E2E 覆盖父子导航、状态更新与对子 Goal 的交互受理。 |
| R3.2 | S2、S3 | 事件 | 子 Worker 仍在运行且父级当前 Run 已结束时，用户向 SuperGoal 发送新消息 | 输入进入同一父 Goal 并创建后继 Run；子 Worker 继续执行，输入不创建替代父 Goal、不取消或改写子任务。 | Web 会话集成测试覆盖活动子 Worker 期间向终态父 Goal 续接并核验原 Worker 绑定不变。 |
| R3.3 | S3 | 事件 | 用户停止当前 SuperGoal Run | 只停止当前父级模型回复；子 Worker 继续运行，用户仍可查看和交互；取消某个子 Worker 必须针对该子 Goal 明确提交现有取消操作。 | 集成测试停止父 Run 后核验子 Worker 仍绑定并继续；单独取消子 Goal 后核验只影响目标 Worker。 |
| R3.4 | S2、S3 | 异常 | Supervisor 或服务端在委派、结果处理期间重启或收到重复 Trigger | 从已提交 Trigger 与 Goal 关系恢复；同一委派不重复创建子 Goal，同一终态结果不重复唤醒或应用，身份不匹配的事件不得推进父级。 | 持久 TriggerStore 的故障注入与重启测试覆盖提交边界、重复投递、过期 Worker generation 和身份错配。 |
| R4.1 | S4 | 事件 | SuperGoal 首次创建 | 从 `config.toml` 的可选 `[supergoal].worker_model` 解析 Worker 模型；未配置时继承父 Goal 创建时的模型选择；生效选择固定到该父 Goal，后续配置变化只影响新 SuperGoal，凭据不写入 Goal 或 Trigger。 | Config 解析、模型绑定和 Snapshot 测试验证覆盖优先级、固定选择、配置错误失败及凭据不落盘。 |
| R4.2 | S4 | 状态 | SuperGoal 请求派发子 Worker | `[supergoal].max_concurrent_workers` 默认 3，为当前 LazyGoal 实例所有 SuperGoal 共用的并发上限；超限子 Goal 按持久 FIFO 排队，释放名额后再派发；非法或非正整数配置快速失败。 | Config 校验与多父 Goal 调度集成测试覆盖全实例计数、FIFO、恢复后续派和非法值拒绝。 |
| R4.3 | S2、S3 | 事件 | 子 Goal 完成后需集成工作区改动 | 项目操作由另一个子 Goal 执行；将其 worktree 合并进项目工作区前必须取得用户对该合并的明确确认，父级不得直接修改或合并项目文件。 | 临时仓库端到端测试验证集成由子 Goal 完成、未确认不合并、确认后才执行；测试不得操作真实用户仓库。 |

组合：创建 SuperGoal，委派独立与有依赖的子 Goal，验证超限排队、Trigger 进度和终态恢复、服务重启、子 Goal 用户交互、子 Worker 运行时父级续聊、父级停止不取消 Worker，以及集成合并确认；运行 `npm run build:web`、`npm run test:web-e2e`、`npm test`、`npm run check:docs`、`npm run check:dependencies` 和 `npm run contracts:generate -- --check`。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| 将 Harness／SuperGoal 作为 Goal 创建时固定的交互模式，与每个 Run 的 `normal`／`plan` 分开；Harness 是默认值。 | 一个 Goal 的父级角色不能随 Run 或 slash 命令隐式变化。 | 将 SuperGoal 表示成第三种 RunMode 或切换实例全局默认。 |
| SuperGoal 是当前用户交互 Agent 的 Supervisor 角色，不在现有服务端 Supervisor 之上增加 Agent 层；现有服务端 Supervisor、Trigger 和 WorkerScheduler 在两种模式中继续负责持久化路由与 Worker 生命周期。 | 保持唯一面向用户的 Supervisor，并复用当前已交付的进程与 Trigger 边界。 | 新建第二个 Supervisor Agent、消息总线或 Worker 调度栈。 |
| 父 Agent 只持有沟通和编排能力；普通 Harness 子 Goal 持有项目工具、授权和隔离 worktree，递归 SuperGoal 禁止；合并由独立子 Goal 完成且须用户确认。 | 防止父级和子级竞争写入项目，并保持现有 Tool、Permission、Sandbox 和取消规则为副作用所有者。 | 父级直接执行项目操作、子 Worker 共用写入目录或自动合并。 |
| 复用 Trigger／TriggerStore 表达 `collaboration` 请求、父子身份、进度、结果与终态唤醒；不新增独立通信通道。 | Trigger 已拥有来源认证、持久路由与重放边界；新语义补齐当前尚未定义的 `collaboration` 载荷和处理行为。 | 将未定义 payload 当成现有委派契约，或依赖仅存在于进程内的通知。 |
| 使用 `[supergoal].worker_model` 与 `[supergoal].max_concurrent_workers`；模型在父 Goal 创建时固定，缺省继承父级；并发默认 3 并由实例内所有 SuperGoal 共用。 | 固定模型选择便于恢复；全实例上限避免多个父 Goal 累加耗尽 Worker 资源。 | 每个 Worker 临时继承进程模型、父级各自累加并发额度或无上限派发。 |

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| high | Supervisor 决策会创建可执行项目操作的 Worker Goal；多 Worker、依赖和终态 Trigger 增加副作用与重复派发风险。 | 子 Goal 仍受既有 Profile、Tool Policy、Approval 与 Sandbox 限制；worktree 合并前须单独取得用户确认。 |
| high | 父子 Goal、Trigger 和 Worker 生命周期跨进程恢复，身份或提交顺序错误可能重复创建、重复恢复或错误关联结果。 | 使用持久身份、generation 校验、幂等创建和故障注入验证；不得凭超时或 PID 不可达重放未知操作。 |
| medium | 新增 Goal 模式与 `config.toml` 字段会改变持久化和配置边界；开发期旧 Snapshot 不保证兼容。 | 不迁移或覆盖旧开发数据；不静默回退非法配置；旧格式按当前协议显式拒绝。 |

## 任务

- [ ] //TODO 1. 持久化 Goal 级 Harness／SuperGoal 模式并贯通创建边界 → R1.1、R1.2；检查：Goal 创建与当前 Snapshot 编解码基础测试。
- [ ] //TODO 2. 在新 Goal 输入区实现双选 Radio 与 `/supergoal` 草稿命令 → R1.1；检查：Goal Board UI harness 基础交互测试。
- [ ] //TODO 3. 装配只具备沟通和编排工具的 SuperGoal Agent，并创建不可递归的 Harness 子 Goal → R2.1；检查：角色工具与委派基础集成测试。
- [ ] //TODO 4. 通过 Trigger 持久化父子身份、委派收据与幂等恢复 → R2.3、R3.4；检查：重复投递及服务重启基础测试。
- [ ] //TODO 5. 实现显式依赖调度、独立 worktree 和实例级 Worker 并发队列 → R2.2、R4.2、R4.3；检查：临时仓库与队列基础测试。
- [ ] //TODO 6. 解析并固定 Worker 模型配置及其父级继承规则 → R4.1；检查：配置解析与模型绑定基础测试。
- [ ] //TODO 7. 把进度与终态 Trigger 接入父级观察、唤醒和续编排 → R2.3、R3.4；检查：一次终态只唤醒一次的集成测试。
- [ ] //TODO 8. 显示父子 Goal 状态并支持子 Goal 导航、交互、父级续聊和定向取消 → R3.1、R3.2、R3.3；检查：UI harness 与子 Worker 取消基础测试。
- [ ] //TODO 9. 同步受影响的 Goal Server、Runtime、Config、Trigger 和 Goal Board 契约说明 → R1.1、R2.1、R2.3、R4.1、R4.2；检查：`npm run check:docs` 与 `npm run check:dependencies`。

## 执行记录

- 状态：未执行
- 验证：-
- 结果：-
- 未决：无
