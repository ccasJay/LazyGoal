# lg-gepa-optimization 项目级 Skill 需求

## 审批摘要

### 目标

在 LazyGoal 仓库内提供可自动发现的 `lg-gepa-optimization` Skill，使 Codex 能通过稳定生命周期 CLI 预检、启动、停止、恢复、查询和汇报 GEPA Prompt 进化，而不是要求用户手工拼装命令。

### 范围

- 包含：`.agents/skills/lg-gepa-optimization/SKILL.md`；项目级发现描述；运行输入准备；费用与发布确认；生命周期命令路由；状态和报告解释；失败与恢复指引；结构验证。
- 不包含：注册全局 Skill；Plugin、MCP、scheduler 或 heartbeat；直接调用模型；解析 GEPA 私有 checkpoint；实现生命周期；自动选择 benchmark 数据；强制覆盖 Profile；长期 Memory 写入。

### 核心行为

- Skill 只调用 `gepa-run-lifecycle` 提供的 `preflight/start/status/stop/resume/report`，不绕过控制面。
- 新运行和恢复在调用前必须向用户展示 benchmark、预算、Working/Reflection 模型、目标 Profile 与成功后发布副作用，并取得明确确认。
- 查询和报告是只读操作；停止必须绑定精确 `runId`，不能杀进程或删除产物。
- Skill 汇报稳定 Run 身份、预算、候选、最佳分数、Worker 健康、发布状态及下一步，不暴露凭据或原始反思内容。

### 风险与待确认

- 风险等级：medium；理由：Skill 本身只编排本地 CLI，但可触发付费模型、容器执行和 default Agent Profile 更新；风险由预检、确认门和精确 Run 定位约束。
- 关键操作：调用 `start` 或 `resume` 前必须取得用户对当前预检摘要的明确确认。
- 风险：过宽触发会意外启动高成本流程；绕过 CLI 或错误复用旧确认会破坏生命周期安全边界。
- 待确认：无

## 引言

本功能把已实现的 GEPA 生命周期包装为 LazyGoal 仓库专用 Codex 工作流。Skill 负责意图识别、确认和可读汇报，不拥有优化状态、模型配置或 Profile 写入。

## 需求

### 需求 1：作为项目级 Skill 被准确发现

**用户故事：** 作为 LazyGoal 开发者，我希望 Codex 在处理本仓库的 Prompt 进化请求时自动发现专用能力，以便无需安装或维护全局 Skill。

#### 验收标准

1. <a id="req-1-1"></a> 当 Codex 从 LazyGoal 仓库根目录或其子目录工作时，Skill 必须位于 `.agents/skills/lg-gepa-optimization/SKILL.md`，且 frontmatter 名称与目录名一致。
2. <a id="req-1-2"></a> 当用户明确提到 GEPA、Prompt 自进化、优化 default Agent Profile 或管理已有 GEPA Run 时，Skill description 必须足以触发该工作流。
3. <a id="req-1-3"></a> 当请求只是普通 benchmark 评测、手工编辑 Prompt、全局 Skill 安装或 GEPA 算法开发时，Skill 必须明确不接管这些任务。

### 需求 2：预检新运行输入

**用户故事：** 作为优化发起者，我希望 Codex 在产生费用前验证数据、模型和目标 Profile，以便先修复配置问题再启动长任务。

#### 验收标准

1. <a id="req-2-1"></a> 当用户要求开始新的优化时，Skill 必须收集或确认单一 benchmark、train/validation 单任务 Manifest 集合、正数 metric 预算及可选随机种子，不得自行编造数据路径。
2. <a id="req-2-2"></a> 当输入足以构造当前 `gepa-run@1` 请求时，Skill 必须先调用 `lazygoal gepa preflight --request <path>`，不得直接启动 Worker。
3. <a id="req-2-3"></a> 当 preflight 失败时，Skill 必须报告失败分类、相关路径或配置和最小修复动作，并停止启动流程。

### 需求 3：确认并触发关键操作

**用户故事：** 作为付费资源所有者，我希望在启动或恢复前看到本次真实影响并明确确认，以便控制费用和 Profile 自动发布。

#### 验收标准

1. <a id="req-3-1"></a> 当 preflight 成功时，Skill 必须展示 benchmark、train/validation 数量、metric 预算、Working LM、Reflection LM、目标 `.lazygoal/profiles/default.json` 以及成功后会更新全部 Prompt 组件。
2. <a id="req-3-2"></a> 当用户尚未明确批准当前摘要时，Skill 不得调用带 `--yes` 的 `start` 或 `resume`；历史 Run 或旧摘要的批准不得复用。
3. <a id="req-3-3"></a> 当用户批准新运行时，Skill 必须调用 `start --request <path> --yes` 并返回 CLI 给出的 `runId`、状态和运行目录，不得把后台启动描述为优化已完成。
4. <a id="req-3-4"></a> 当用户批准恢复指定 Run 时，Skill 必须先读取该 Run 当前状态与恢复影响，再调用 `resume --run <runId> --yes`。

### 需求 4：管理已有 Run

**用户故事：** 作为长任务操作者，我希望 Codex 能准确查询和控制指定 Run，以便在不同会话中继续管理优化。

#### 验收标准

1. <a id="req-4-1"></a> 当用户查询进展时，Skill 必须调用 `status --run <runId>`，并区分运行中、停止请求、已停止、成功、发布阻塞、失败和 Worker 失联。
2. <a id="req-4-2"></a> 当用户要求停止时，Skill 必须先解析精确 `runId`，再调用 `stop --run <runId>`；不得直接发送进程信号、删除 Run 目录或把 `stop_requested` 描述为已经停止。
3. <a id="req-4-3"></a> 当用户未提供 `runId` 且上下文无法唯一确定目标时，Skill 必须请求用户指定，不能猜测或操作最近目录。

### 需求 5：汇报结果和下一步

**用户故事：** 作为 Prompt 维护者，我希望得到简洁、可行动的优化报告，以便判断最佳 Prompt 是否已发布以及是否需要处理异常。

#### 验收标准

1. <a id="req-5-1"></a> 当用户请求报告或 Run 到达终态时，Skill 必须调用 `report --run <runId>`，不得解析 GEPA checkpoint、日志文本或内部 state pickle 推导结果。
2. <a id="req-5-2"></a> 当报告可用时，Skill 必须汇报 benchmark、预算消耗、候选数量、最佳分数、最佳 Profile 产物位置、目标发布状态及错误分类，并明确区分优化完成与发布完成。
3. <a id="req-5-3"></a> 当 publication 为 `publish_blocked` 时，Skill 必须指出目标 Profile 在运行期间发生变化并提供最佳产物位置，不得建议绕过摘要保护强制覆盖。

### 需求 6：保持权限和信息边界

**用户故事：** 作为仓库维护者，我希望 Skill 不扩大用户授权或泄露运行敏感信息，以便安全地将其用于外部 Agent 编排。

#### 验收标准

1. <a id="req-6-1"></a> 当执行任一工作流时，Skill 不得读取、回显或写入 API key、Authorization 头、完整供应商响应、thinking 或完整 Diagnostic Trace。
2. <a id="req-6-2"></a> 当生命周期 CLI 返回错误、未知字段或损坏输出时，Skill 必须原样保留 Run 目录并报告阻塞，不得自行修补状态、重跑模型或修改 default Agent Profile。
3. <a id="req-6-3"></a> 当验证 Skill 时，检查必须覆盖 frontmatter、项目级位置、触发边界、确认门和全部命令路由，且不得实际启动付费 GEPA Run。
