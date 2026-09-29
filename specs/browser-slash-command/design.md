# 浏览器 Slash Command 接入设计

## 审批摘要

### 方案

浏览器复用现有 Slash Command Registry，在消息输入框展示候选，并在结构化安全等待点提供命令入口。`/model` 经受保护的浏览器 API 读取当前 Provider 目录；服务端确认选择并保存到 Goal，随后每次执行前按该 Goal 的选择对齐模型 Binding。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 统一命令入口 | Web 注册现有 `/plan`、`/model` 定义；普通输入框用候选菜单，独立等待表单用命令入口。 | 命令不会成为任务消息，现有等待表单无需改成聊天输入。 |
| 模型目录与权限边界 | 后端复用当前 Provider 目录，仅返回白名单模型字段；模型 ID 在提交时重新校验，所有路由沿用浏览器会话授权。 | 页面不接触凭据；离线来源、不可选原因和错误分类与 TUI 一致。 |
| 模型选择提交时机 | 草稿仅在页面暂存；创建 Goal 时一起保存。等待或终态选择先原子保存 Goal，终态与下一 Run 创建串行化。 | 草稿刷新丢弃；已确认选择跨刷新和重启保留，失败不覆盖旧选择。 |
| 按 Goal 对齐执行绑定 | Web 命令在启动或恢复执行前用最新 Goal 选择重建并发布 Binding，进程内执行仍保持单活动 Goal。 | 不同 Goal 不会沿用别人的模型；模型不可恢复时阻止推进。 |
| 过期与取消处理 | 切换提交绑定 Goal/Run 身份；目录请求可取消，提交后的快照与服务端响应是结果权威。 | 切页、旧响应及并发提交不能覆盖新状态。 |

### 风险与待确认

- 风险等级：medium；理由：新增浏览器公共 API 和终态模型选择提交语义，沿用既有授权与非敏感 Snapshot 字段。
- 关键操作：无。
- 风险：进程共享 Binding 与多 Goal 切换可能错配；创建时保存前的 Binding 发布需在失败时回滚；目录或恢复错误必须脱敏。
- 待确认：无。

## Overview

当前 Web 只注册 `/plan`；模型目录、选择协调器和可替换 Binding 已在本机组合根供 TUI 使用。本设计把同一能力接到浏览器，但不让 `@lazygoal/browser` 依赖 LLM SDK，也不改变 Slash Command 的解析语义。覆盖需求 1–6。

## Architecture

```text
Web MessageComposer / Commands / ModelPicker
        | inspect / dispatch        | authenticated JSON
        v                           v
@lazygoal/slash-command    @lazygoal/browser routes + command service
                                   | catalog / validate / save
                                   v
                        TUI composition root adapters
                          |             |             |
                          v             v             v
                      LLM catalog   GoalStore     Model Binding
                                         |              |
                                         +--> Runtime <--+
```

浏览器命令服务持有单活动执行预约；选模提交也进入此预约边界。模型目录读取不预约执行，但所有写请求重新读取最新 Snapshot。对同一 Goal，终态选模与 `continue` 共用 Runtime 的 Goal 级串行边界，最终模型由先提交的状态决定，不依赖 HTTP 到达顺序。（需求 4、5）

## Key Design Decisions

### 统一命令入口

`MessageComposer` 从共享 Registry 的 `inspect` 结果展示 `/plan`、`/model` 候选；方向键移动，Enter 或点击派发，Escape 关闭候选但保留草稿。提交仍经 Registry `dispatch`，因此 `/` 前缀、未知命令、参数拒绝和 `//` 转义只有一套语义。候选根据当前输入位置标记可用性；禁用项说明原因，服务端仍独立校验。结构化提问与提案表单旁放置 `Commands` 入口，只提供安全等待点可用的 `/model`；Action 审批不显示入口。（需求 1、2、4）

现有 `/plan` 派发继续调用草稿本地模式状态或 `enterPlanMode`；不增加另一种模式写入路径。命令成功后清空命令输入，失败保留或恢复可编辑文本并显示错误；普通消息继续使用现有提交行为。（需求 1、2）

### 模型目录与权限边界

`BrowserGoalApiPort` 增加模型目录读取和选择提交的端口，`@lazygoal/browser` 只定义白名单 DTO、wire 校验与状态码。组合根注入现有 `LlmModelCatalog`、当前 Provider 配置和模型选择协调器；不把 LLM 配置对象交给浏览器包。（需求 3、6）

```ts
type BrowserModelOption = {
  id: string;
  displayName: string;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  reasoning?: boolean;
  vision?: boolean;
  availabilitySource: "live" | "catalog" | "configured";
  metadataSource: "live" | "catalog" | "configured" | "mixed";
  selectable: boolean;
  unavailableReason?: string;
};
type BrowserModelCatalog = {
  provider: string;
  currentModelId: string;
  models: readonly BrowserModelOption[];
};
type BrowserModelSelectionCommand = { runId: string; modelId: string };
```

草稿使用 `GET /api/models` 取得当前进程默认模型；已有 Goal 使用 `GET /api/goals/:goalId/models?runId=...`，服务端从最新 Snapshot 给出该 Goal 当前选择，身份失配返回 `stale_run`。`POST /api/goals/:goalId/model-selection` 只接受上述命令。创建请求增加可选 `modelId`，其余模型能力与 Provider 均由服务端目录和配置决定。所有新路由位于既有 Bearer、Host/Origin 边界内，错误只返回稳定代码；任何 Provider 原始响应、凭据和 baseURL 不进入 DTO。（需求 3、4、6）

模型提交不相信页面的 `selectable` 或容量字段；服务端重新从当前 Provider 目录解析 ID，要求同 Provider 且可选，再构造完整非敏感 `GoalModelSelection`。目录临时故障沿用现有带来源标记的兜底；鉴权、权限和协议错误维持拒绝。目录请求允许取消，提交请求一旦被服务端受理就不以关闭对话框推断回滚。（需求 3、6）

### 模型选择提交时机

草稿只保留 `modelId` 于组件状态；首条普通消息将其与 Goal ID、意图、模式一并提交。浏览器创建服务验证模型、构造候选 Binding，并将选择传入 Launcher，使初始 Snapshot 与首个模型调用使用同一选择。即使用户未显式选模，也把进程默认选择传入 Launcher，避免 Web 初始 Snapshot 与实际 Binding 不一致。相同 Goal ID 的重试必须连同模型 ID 比较，冲突时拒绝。（需求 4、5）

已有 Goal 的选择由扩展后的 `GoalModelSelectionCoordinator` 负责：等待状态仍要求无 `pendingAction`、无停止原因；终态只接受 `completed` 或 `failed`，并要求请求 `runId` 匹配最新 Run。终态更新与 `continue` 共用 Goal 级串行门；选择先提交则下一 Run 继承新模型，Run 先提交则旧请求因身份失配被拒绝。选择仅更新 Goal 级 `modelSelection`，不创建消息、Step 或新 Run，也不改变 `/plan` 的一次性模式状态。保存失败保留原 Snapshot。此时不立即发布进程 Binding；下一次执行前统一对齐。（需求 1、4、5）

### 按 Goal 对齐执行绑定

Web 服务在 `create`、`message`、会恢复执行的 `interact` 预约后、调用 Launcher 或 Coordinator 前，读取或确认目标 Goal 的选择，构造完整 Binding，再发布为当前代。Binding 构造失败时不推进 Goal，页面收到稳定的模型恢复错误；不静默使用进程默认模型。执行预约直到该 Goal 推进结束才释放，因此另一个 Web Goal 不能在模型或 Tool 调用中途替换 Binding。每个 Think/Decide 调用仍按现有执行器在开始时读取不可变代。（需求 5）

新 Goal 尚无 Snapshot，故在 Launcher 保存前须先发布草稿选择的候选 Binding；若创建在首个 Snapshot 保存前失败，服务在同一执行预约中恢复此前 Binding。Snapshot 一旦成功保存，恢复权威即为该 Goal 的选择，后续失败按已保存 Goal 处理。等待与终态选模只保存 Snapshot，避免保存失败后 Binding 已改变。TUI 现有换模路径继续保持原行为，组合根复用同一选择构造逻辑，避免两处能力计算漂移。（需求 4、5）

### 过期与取消处理

ModelPicker 保存打开时的 Goal ID、Run ID 与本地请求代数。切换会话、关闭对话框或再次打开时取消目录请求并递增代数；迟到响应不更新列表。提交模型后等服务端确认并刷新正式会话，关闭对话框不承诺撤销已受理的提交。`stale_run`、忙碌与恢复错误均刷新最新 Snapshot 或保留可重试入口；页面不能仅凭本地选中状态显示成功。结构化等待表单的已有内容留在原组件状态，不因打开选模而提交。（需求 3–5）

## Error Handling

| 情况 | 服务端结果 | 页面处理 |
|---|---|---|
| 未授权、非法 wire 输入或跨 Provider ID | 401/400 或稳定拒绝码；不读写 Goal | 显示授权或选择错误 |
| 目录鉴权、权限或协议失败 | 脱敏目录错误；不兜底为成功 | 保留原选择，允许用户重试 |
| Goal/Run 身份过期或状态不安全 | `stale_run` / `model_switch_not_allowed` | 刷新会话，不显示成功 |
| 另一个 Goal 正在执行 | `goal_busy` | 保留当前选择，等待安全点重试 |
| Binding 构造或 Snapshot 保存失败 | 稳定失败码；不推进执行 | 保留旧选择并显示错误 |

## Testing Strategy

- 用浏览器组件测试覆盖候选键盘/鼠标操作、`//`、普通消息、非法命令、草稿丢弃、结构化等待入口、选模取消与迟到目录结果。（需求 1–4）
- 用路由与命令服务测试覆盖授权、DTO 白名单、非法模型 ID、离线目录分类、旧 Run、终态选模与 `continue` 竞态、重试身份和保存失败。（需求 3–6）
- 用组合根集成测试以假 Adapter 记录实际模型：分别创建、等待恢复、终态续写与两个 Goal 交替执行，核验 Snapshot、Binding、调用模型和预算一致；模拟创建保存失败与重启恢复，不进行真实付费调用。（需求 4–6）
- 运行浏览器、Slash Command、Runtime、TUI 的相关回归与依赖边界检查；在真实 `lazygoal web` 本机入口人工检查命令菜单、模型选择和失败提示。（需求 1–6）
