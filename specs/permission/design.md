# 统一 Permission 设计

## 审批摘要

### 方案

新增独立的 `@lazygoal/permission` package，统一评估项目模式、Tool 授权和 Sandbox 能力授权。Runtime 仍拥有 Goal／Action 状态转换和恢复；`@lazygoal/sandbox` 只执行已核准的文件与网络边界。Browser 与 TUI 使用同一权限投影及审批命令。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 独立 Permission 边界 | package 拥有模式、授权匹配和审批请求契约；Runtime 持有 Action 生命周期，Sandbox 持有强制执行。 | 两类权限共享判断入口，但模型和 UI 无法自行签发能力；新增 package 及依赖调整。 |
| 分账本统一管理 | 保留现有 Tool Grant 文件格式；Sandbox Grant 使用独立账本。Permission 统一查询、匹配和撤销，不把两类能力混为一条 Grant。 | 现有 Tool 持续授权无需迁移；不同能力不能相互匹配。 |
| 项目模式与并发 | 模式保存在受沙箱保护的项目私有状态中；缺省为 Default。模式变更使用修订号和跨进程串行闸门，每个新 Action 决策重新读取。 | Browser／TUI 的本机交互 Goal 共享持久模式；过期页面被拒绝，Benchmark 策略不变。 |
| Action 审批与执行闸门 | Profile／输入校验先行，再评估 Tool 与 Sandbox；审批、持续授权激活及执行开始前的复核沿用可恢复 Action 检查点。 | 模式切换不追认旧审批；撤销不重放或停止已开始的 Action，结果不确定继续人工等待。 |
| 能力范围与展示 | Tool 按现有精确输入或写入目标匹配；Sandbox 按命令和可强制能力匹配。UI 使用实际能力范围生成文案。 | 整网出站含回环必须明示；写入同一路径可换内容，批准一条 Bash 命令不放行其他命令。 |
| 双端 Permission 入口 | Browser 与 TUI 的聊天框左下角展示可操作的 Permission 入口，模式选择及 Grant 管理由服务端确认状态驱动。 | Browser 新增 YOLO 切换，TUI 现有 Shift+Tab／Ctrl+G 只作快捷入口；不再通过切换自动批准等待中的 Action。 |

### 风险与待确认

- 风险等级：high；理由：项目级 YOLO、跨 Goal 持续授权、并发撤销与执行开始的顺序都影响权限边界。
- 关键操作：实际批准项目外文件、受保护路径或整网访问时，必须显示并遵守真实能力及期限；本设计阶段不执行这些操作。
- 风险：项目模式持久化后，新 Goal 也可能在 YOLO 下自动执行 Tool；跨进程锁失效或未复核 Grant 会造成越权。模式或账本损坏时须失败关闭，不能降级为未受控执行。
- 待确认：无设计决策待确认。

## Overview

本设计覆盖 [需求 1–7](requirements.md)。用户已决定独立 Permission package 与分开的 Tool／Sandbox 账本。项目模式仅作用于 Browser／TUI 的本机交互 Goal；Benchmark 组合根继续其独立策略。现有 [Sandbox 设计](../macos-seatbelt-sandbox/design.md) 中的能力解析和 Seatbelt 策略仍由 Sandbox／Runtime 执行，授权匹配、Grant 管理和审批视图改由本设计统一定义。

## Architecture

```text
Browser / TUI
      | mode, review, list, revoke
      v
Browser service / TUI controller -> GoalCoordinator / Runner
                                      | validated Action + effective capability
                                      v
                              @lazygoal/permission
                              | mode | Tool Grant | Sandbox Grant
                              v      v              v
                         workspace-private Storage stores
                                      |
                           approved execution intent
                                      v
                         Tool / @lazygoal/sandbox
```

`@lazygoal/permission` 不读模型原文、不执行 Tool，也不写 Goal Snapshot。Runtime 在进入 Permission 前完成 Profile、Contract、Tool 输入和执行策略校验，并用 Sandbox 的路径与可执行范围契约构造规范化的实际能力；Permission 只比较这一范围与有效授权。依赖方向为 Runtime → Permission → Sandbox 的能力类型，Storage 实现 Permission 的 Port；Sandbox 不依赖 Permission 或 Runtime。

## Components and Interfaces

| 边界 | 责任 |
|---|---|
| `@lazygoal/permission` | 定义项目模式、两类 Grant 和审批请求；规范化 Tool matcher，比较实际 Sandbox 能力，返回 `allow`／`approval_required`／`deny`，对两类 Grant 提供统一列表与撤销入口。 |
| Runtime Runner／Coordinator | 提供可信的 workspace、Goal、Run、Action 身份；保存 pending Action 与批准事实；只在允许的检查点执行或恢复 Action。 |
| `@lazygoal/sandbox` | 提供路径与可执行范围契约；按 Runtime 核准的实际能力生成 Seatbelt 规则并受限启动，不接受来自 UI 或模型的“已批准”标志。 |
| Storage | 继续使用 `tool-grants.json`；分别保存 Sandbox Grant 和项目模式；对项目模式、Grant 变更与执行开始提供本机跨进程串行闸门。私有状态位于 LazyGoal Home 的项目目录，不落在可由沙箱命令修改的仓库树内。 |
| Browser／TUI | 展示服务端确认的模式、沙箱状态、审批与 Grant；只提交带当前身份和修订号的用户选择，不自行判断某项能力已生效。 |

## Data Models

```ts
type PermissionMode = "default" | "yolo";
type PermissionScope = "action" | "goal" | "workspace";

interface ProjectPermissionMode {
  workspaceId: string;
  mode: PermissionMode;
  revision: number;
}

type PermissionRequest =
  | { kind: "tool"; source: ActionRef; matcher: ToolGrantMatcher; display: ToolReview }
  | { kind: "sandbox"; source: ActionRef; matcher: SandboxGrantMatcher; display: EffectiveSandboxReview };

type PermissionDecision =
  | { kind: "allow"; source: "policy" | "yolo" | "grant"; grantRef?: GrantRef }
  | { kind: "approval_required"; request: PermissionRequest }
  | { kind: "deny"; code: PermissionErrorCode };
```

`ActionRef` 固定 workspaceId、goalId、runId、actionId 和经校验的输入摘要；`GrantRef` 带类别、ID 与已审阅状态的摘要。两类 Grant 均使用 `pending`／`active`／`revoked`，但保持各自 matcher 与账本。单次批准只附着在 pending Action，不创建持续 Grant。项目模式记录不存在时使用 Default；记录损坏或无法读取时禁止新的 Tool 执行并显示权限故障，不静默退回某种模式。

## Key Design Decisions

### 独立 Permission 边界

从 Runtime 移出 `ToolGrant`、matcher 和 Grant Port 的类型及纯匹配逻辑，保持持久 Tool Grant 记录格式。Permission 只接收 Runtime 已验证的 canonical Tool 输入与规范化的 `EffectiveSandboxScope`，并从可信 workspace 身份构建请求。Runtime 仍决定 Action 是否可以进入等待、批准或执行状态；Permission 的 `allow` 不是进程启动凭证。此边界对应需求 2、3、4、6。

### 分账本统一管理

`PermissionGrantService` 聚合现有 Tool Grant Store 与新 Sandbox Grant Store。统一列表使用带 `kind` 的投影，撤销必须携带类别、Grant ID、来源和当前状态摘要，防止过期 UI 撤销另一条记录。Tool 账本维持现有文件表示，Sandbox 账本使用独立文件与更严格的能力 matcher；不提供任意“Tool Grant = Sandbox Grant”的转换。任何损坏或读取失败都不能按“无授权但 YOLO 可放行”处理。对应需求 4、5、6。

### 项目模式与并发

`ProjectPermissionModeStore` 保存 `workspaceId + mode + revision`。界面提交切换时须带已读 revision；写入在项目级跨进程闸门内比较修订号、原子持久化并递增 revision，冲突返回当前值。闸门同时保护 Grant 撤销、批准激活和 Action 开始前的最终权限检查；使用 LazyGoal Home 的私有本机锁，无法建立或确认锁所有权时失败关闭。读取不缓存用于授权的模式或 Grant；每次新 Action 决策重新读取。当前进程主动更新 UI，其他进程在活跃界面刷新状态，但执行判断不依赖 UI 同步。对应需求 1、5、6。

### Action 审批与执行闸门

Runner 在验证后进入项目闸门，按 `Tool Policy → Tool Grant／YOLO → Sandbox 默认范围／Sandbox Grant` 计算结果：Profile、输入或 Tool Policy 拒绝直接停止；macOS 默认沙箱内 Bash 的 Tool 部分为 `allow`；YOLO 只能放行 Tool 部分。需要审批时提交带稳定请求身份与规范化能力的 `pendingAction`，不启动 Tool。批准持续授权时先将 Grant 记为 `pending`，再提交 Goal 批准快照，之后激活 Grant；激活前不可执行。单次批准保存在 Action 检查点。结果未知只接受既有人工恢复流程，不能改为新的持续授权。

在 Tool 真正开始前，Runner 在同一项目闸门内重读持续 Grant，检查撤销与范围，重建 Sandbox 执行计划，并持久化 `attemptsStarted`。若 Grant 已失效，改回可恢复审批等待而不调用 Tool；闸门不覆盖整个 Tool 运行。模式修订号记录在批准事实中，切换模式不追认或撤销已提交的 Action 批准；同一 Action 的安全重试沿用该批准，但每次开始前仍复核持续 Grant。对应需求 1、2、3、6。

### 能力范围与展示

Tool matcher 沿用现有规则：Bash 与其他非写入 Tool 绑定 canonical 完整输入，`write_file`／`edit_file` 分别绑定真实目标路径，不比较后续内容。Sandbox matcher 绑定规范化 Bash 命令、能力类别、实际文件路径或目录子树、读写方向、`all_outbound` 网络能力、workspace／Goal 和规则版本。网络目标说明只作审阅背景；UI 从 `EffectiveSandboxScope` 生成“任意出站目标，含本机回环”的实际范围，不声称域名隔离。审批预览截断时，持续授权选择保持禁用，直到完整输入已被读取。对应需求 2、3、4、7。

### 双端 Permission 入口

Browser 将 composer 左下角的运行标记改为 Permission 按钮，打开模式选择和统一 Grant 管理；审批卡片沿用当前 Action 面板，但依据 `kind` 展示 Tool 或 Sandbox 能力。Browser 的项目模式读取／更新、Grant 列表／撤销和审批接口继续使用本机会话认证；服务端从会话绑定项目，不信任客户端传入的 workspaceId，写命令校验 revision 与 Goal／Run／Action 身份。响应只含有界的命令预览、实际能力与状态，不含模型密钥或环境原值。

TUI 在输入区左下角提供同名入口并支持键盘操作；Shift+Tab 作为模式选择快捷键，Ctrl+G 进入统一 Grant 管理。Controller 不再保有可独立放行 Tool 的本地 `executionMode`，也不在切到 YOLO 时自动提交等待中的 `approve_action`；它只渲染和提交服务端模式。两端对于模式保存失败、审批冲突和撤销冲突都重新读取状态并显示具体原因。对应需求 1、3、5、7。

## Error Handling

- 模式或任一需要读取的 Grant 账本损坏、项目锁不可用、身份不匹配时，Permission 返回稳定错误；Runtime 不执行该 Action，也不以 YOLO 或无沙箱模式回退。
- 审批拒绝与沙箱边界拒绝分别产生有界反馈，交给 Runtime 的既有 Observation／反馈流程；不得暴露未获准文件内容或凭据。
- 审批、撤销、模式切换使用请求身份与修订检查。过期请求返回冲突及当前服务端状态；UI 不先展示虚假的授权成功。
- 重启后只恢复已提交的项目模式、Action 审批和已激活 Grant；待激活 Grant 由已提交批准事实幂等完成。结果不确定的 Action 保持人工等待。

## Testing Strategy

- 覆盖需求 1、7：Browser／TUI 左下角入口、项目模式持久化与跨 Goal 可见、快捷键不追认待审 Action，Benchmark 模式保持独立；浏览器响应不包含密钥。
- 覆盖需求 2–4：Default／YOLO 与 Profile 组合、沙箱内 Bash 自动执行、越界能力仍审批、精确 Bash 与同路径写入匹配、整网出站文案对应实际 Seatbelt 范围。
- 覆盖需求 3–6：三个授权期限、完整输入审阅、跨 Run／Goal 复用、撤销与过期请求、批准快照和 Grant 激活之间的崩溃恢复、结果未知不重放。
- 对两个本机进程并发切换模式、撤销 Grant 和启动 Action 做集成验证：成功提交的先后顺序必须与实际放行一致；损坏模式记录和锁不可用均失败关闭。真实 macOS Seatbelt 边界仍由 Sandbox Spec 的系统级验证覆盖。
