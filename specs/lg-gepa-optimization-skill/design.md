# lg-gepa-optimization 项目级 Skill 设计

## 审批摘要

### 方案

新增一个精简、自包含的 `.agents/skills/lg-gepa-optimization/SKILL.md`，把 Codex 的新建、查询、停止、恢复和报告意图路由到 `gepa-run-lifecycle` 的稳定 CLI；Skill 不包含执行脚本，也不解析 GEPA 内部状态。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 仓库级自动发现 | 放在 `.agents/skills/lg-gepa-optimization/` 并保持默认隐式发现 | 只影响 LazyGoal 项目，不注册用户全局 Skill |
| CLI 是唯一控制边界 | 所有操作只调用生命周期公开命令 | Skill 不拥有进程、checkpoint、模型或 Profile 写入逻辑 |
| 当前摘要确认 | 每次 `start/resume` 对当次 preflight/status 摘要单独确认 | 防止复用旧批准触发费用或发布 |
| 精确 Run 定位 | stop/resume/status/report 必须使用明确 `runId` | 不以“最近运行”猜测破坏其它任务 |
| 自包含 SKILL.md | 首版无 scripts、references、assets 或 UI metadata | 减少维护面；协议细节链接到 Spec 和 CLI help |

### 风险与待确认

- 风险等级：medium；理由：文字工作流可触发有费用和持久写入的生命周期命令，但所有副作用均由 CLI 确认门、Run ID 和发布保护约束。
- 关键操作：每次 `start`、`resume` 前取得针对当前摘要的明确用户批准。
- 风险：描述过宽可能误触发；状态措辞错误可能把后台接管误报为优化完成。
- 待确认：无

## Overview

该 Skill 是 Codex 到 GEPA 生命周期的项目级操作指南。它不实现通用 Prompt 工程知识，也不复制生命周期协议；其价值是保存 LazyGoal 特有的目标 Profile、双模型边界、确认要求和终态解释。（需求 1、3、6）

## Architecture

```text
用户意图
  |
  v
lg-gepa-optimization/SKILL.md
  |-- 新运行  -> preflight -> 用户确认 -> start
  |-- 查询    -> status
  |-- 停止    -> exact runId -> stop
  |-- 恢复    -> status -> 用户确认 -> resume
  `-- 报告    -> report
                         |
                         v
             gepa-run-lifecycle CLI
```

Skill 不直接进入 `.lazygoal/gepa/runs/` 读取内部文件。CLI 返回的 artifact locator 可以展示给用户，但状态、分数和发布结果只以 CLI JSON 为准。（需求 4、5、6）

## Components and Interfaces

### SKILL.md frontmatter

名称固定为 `lg-gepa-optimization`。description 同时覆盖两类意图：启动 LazyGoal 的 GEPA/Prompt 自进化，以及管理已有 GEPA Run；并明确普通 benchmark、手工 Prompt 编辑、GEPA 算法开发和全局 Skill 安装不适用。（需求 1）

保持默认自动发现，不创建 `agents/openai.yaml`。项目 `.agents/skills` 已是仓库级发现入口，首版也不需要 scripts 或 references；生命周期命令本身承担确定性实现。（需求 1.1、6.3）

### 意图路由

SKILL.md 使用最小决策表：

| 用户意图 | 必需输入 | 调用 | 是否确认 |
|---|---|---|---|
| 检查新运行 | request 文件或足以构造它的数据 | `preflight` | 否 |
| 启动新运行 | 当前成功 preflight | `start --yes` | 是 |
| 查看进度 | 精确 runId | `status` | 否 |
| 请求停止 | 精确 runId | `stop` | 否；只写优雅停止标记 |
| 恢复运行 | 精确 runId 与当前 status | `resume --yes` | 是 |
| 查看结果 | 精确 runId | `report` | 否 |

只有用户提供的数据路径可进入 request；Skill 可以把用户给出的样本集合转成临时 `gepa-run@1` JSON，但不能扫描并猜测数据集。临时文件应位于项目 `.lazygoal/gepa/requests/` 或系统临时目录，不包含凭据。（需求 2）

### 确认摘要

`preflight` 成功后，Skill 从 CLI JSON 投影一段短摘要：benchmark、train/validation 数、metric 预算、Working model、Reflection model、目标 default Agent Profile，以及成功后会整体替换 `systemPrompt + instructions`。只有紧接该摘要的明确批准才允许添加 `--yes`。（需求 3）

恢复确认基于当前 `status` 与冻结 Run 摘要；不能沿用 start 时或另一个 Run 的批准。查询、报告和 stop 不产生新的模型调用；stop 的反馈必须保持 `stop_requested` 与 `stopped` 的区别。（需求 3、4）

### 汇报格式

运行中汇报：`runId`、状态、Worker health、metric calls 已用/上限、候选数、当前最佳分数和停止请求。终态汇报再增加 best Profile locator、publication 状态、错误分类和一个紧邻下一步。（需求 4.1、5）

`succeeded` 只用于优化完成且发布为 `published/unchanged`；`publish_blocked` 必须说明优化结果仍在 artifacts，但当前 default Profile 未被覆盖。Skill 不展示完整 Prompt、reflection prompt 或原始 trajectory，除非用户随后明确请求读取非敏感 artifact，且该读取不改变生命周期事实。（需求 5、6）

## Error Handling

- 缺少唯一 runId：停止并请求精确 ID，不执行命令。
- preflight 无效：报告 CLI 的分类和最小修复，不构造 `start`。
- CLI JSON 无法解析或 schema 未知：报告协议阻塞，保留文件，不从 stdout/stderr 猜状态。
- Worker stale/lost：报告当前权威状态和恢复前置条件，不自动 resume。
- publish conflict：给出 best Profile locator，禁止强制覆盖建议。
- 权限、环境或依赖缺失：报告缺失条件，不把它改写成 Prompt 失败。（需求 2.3、4.3、5.3、6）

## Key Design Decisions

### 仓库级自动发现

`lg-` 前缀和项目 `.agents/skills` 路径使该工作流只在 LazyGoal 上下文出现，同时保留自然语言与显式 `$lg-gepa-optimization` 两种触发方式。（需求 1）

### CLI 是唯一控制边界

生命周期 CLI 已拥有锁、checkpoint、状态和发布语义。让 Skill 直接读写 Run 文件会产生第二个状态所有者，也会绑定官方 GEPA 私有格式。（需求 4、5、6.2）

### 当前摘要确认

费用、数据集和待发布 Profile 都可能随请求变化，因此批准必须绑定当前 preflight/status，而不能是对“允许 GEPA”的永久授权。（需求 3）

### 精确 Run 定位

后台运行可能并存。强制明确 ID 比维护隐式“最近 Run”状态更可恢复，也避免 stop/resume 操作错误目标。（需求 4）

### 自包含 SKILL.md

首版只有六个稳定命令和一个固定目标，不需要额外脚本或参考层。后续只有当命令模式或报告 schema 显著扩展时才拆 references。（需求 6.3）

## Testing Strategy

- 使用 Skill validator 检查 frontmatter、命名和未完成占位符，并人工核对项目路径与 description 触发边界。（需求 1、6.3）
- 以 fake lifecycle CLI 的确定 JSON transcript 覆盖新运行、preflight 失败、未批准、批准启动、运行中查询、stop_requested、恢复和 publish_blocked；测试不产生模型调用。（需求 2–6）
- 检查 Skill 全文不包含全局安装指令、直接 GEPA checkpoint 解析、进程 kill、强制覆盖、凭据输出或绕过 `--yes` 的路径。（需求 1.3、4.2、5.3、6）
- 在 `gepa-run-lifecycle` Feature Verification 通过后，使用一次无费用 fake 端到端会话验证 Codex 能按 Skill 生成请求、确认、启动并汇报 Run ID；不以真实付费运行作为默认验收。（需求 2、3、5、6.3）
