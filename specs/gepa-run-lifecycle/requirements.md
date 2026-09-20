# GEPA Run Lifecycle 需求

## 审批摘要

### 目标

为 LazyGoal 提供可持久化、可停止和可恢复的 GEPA 优化运行：使用项目 `.lazygoal/profiles/default.json` 作为 Working Profile 和优化目标，使用独立 Reflection LM 生成候选，并在成功后安全发布最佳 `systemPrompt` 与 `instructions`。

### 范围

- 包含：`preflight/start/status/stop/resume/report` 机器接口；后台单 Worker 生命周期；官方 GEPA `run_dir` 续跑；Working LM 与 Reflection LM 独立配置；默认 Agent Profile 的完整 Prompt 组件优化；状态、报告、停止和原子发布。
- 不包含：项目级 Codex Skill；新增、删除或重排 instructions；优化 `toolIds` 或其它 Profile 字段；跨 benchmark、分布式或并发优化；自动选择数据集；修改官方 GEPA 算法；历史协议兼容层。

### 核心行为

- Working Agent 始终由当前项目 `.lazygoal/profiles/default.json` 派生；`systemPrompt` 和现有全部 `instructions` 都是 GEPA 候选组件，其他字段冻结。
- Working LM 使用 XDG `profiles/default.toml`，Reflection LM 使用 `config.toml` 的 `[gepa].reflection_profile` 指向的独立 LLM Profile；两者不得混用。
- `start` 在预检后启动一个后台 Worker 并立即返回 `runId`；调用方可通过稳定 JSON 接口查询、停止、恢复和读取报告。
- 停止与恢复复用官方 GEPA checkpoint 和 `gepa.stop`；同一 Run 任一时刻最多有一个 Worker。
- 只有正常完成且目标 Profile 未被外部改写时，最佳 `systemPrompt` 与完整 `instructions` 才一起原子写回原文件。

### 风险与待确认

- 风险等级：medium；理由：新增 Python/TypeScript 跨进程生命周期、后台进程、持久状态和 Profile 写回，并会触发付费模型及容器执行，但影响限于显式 GEPA Run 和单个目标 Profile，可通过快照恢复。
- 关键操作：`start`、`resume` 会产生模型或容器费用，并可能在成功后更新 `.lazygoal/profiles/default.json`，必须由调用方显式确认。
- 风险：Worker 异常退出可能留下停滞状态；错误的模型边界会污染反思；运行期间人工修改 Profile 必须阻止自动覆盖。
- 待确认：无

## 引言

本功能在既有 LazyGoal GEPA Adapter 之上增加正式优化控制面，使一次 Prompt 进化可以在外部 Agent 退出后继续运行，并能以同一 Run 身份停止、恢复、审计和发布结果。

## 需求

### 需求 1：固定优化目标和模型边界

**用户故事：** 作为 Prompt 优化发起者，我希望 Working Agent、Working LM 和 Reflection LM 的职责确定且互相独立，以便优化结果真正作用于目标 Profile 而不会混淆模型角色。

#### 验收标准

1. <a id="req-1-1"></a> 当预检一次 GEPA Run 时，系统必须从当前项目 `.lazygoal/profiles/default.json` 读取基准 Agent Profile，并把其 `systemPrompt` 与按原顺序排列的全部 `instructions` 转换为 seed candidate。
2. <a id="req-1-2"></a> 当评测任一候选时，系统必须只替换候选的 `systemPrompt` 与对应 `instructions` 文本，并保持 Profile ID、名称、描述、`toolIds`、instruction 数量和顺序不变。
3. <a id="req-1-3"></a> 当解析模型配置时，系统必须使用 XDG `profiles/default.toml` 解析 Working LM，并使用主配置 `[gepa].reflection_profile` 指向的另一个 LLM Profile 解析 Reflection LM。
4. <a id="req-1-4"></a> 当目标 Profile、Working LM、Reflection LM、GEPA 兼容性、数据集或预算任一项无效时，`preflight` 和 `start` 必须在创建 Run、启动 Worker、调用模型或启动 benchmark 环境前返回可定位错误。

### 需求 2：启动持久化后台运行

**用户故事：** 作为外部自动化调用方，我希望启动优化后立即获得稳定 Run 身份，以便不必持续占用调用会话也能管理长时间运行。

#### 验收标准

1. <a id="req-2-1"></a> 当调用 `preflight --request <path>` 时，系统必须严格校验当前版本运行请求、单一 benchmark、train/validation 样本、正数 metric 预算和本地资源，并输出不含凭据的 Working/Reflection 模型身份、目标 Profile 摘要及预计副作用。
2. <a id="req-2-2"></a> 当调用 `start --request <path>` 且未提供明确的费用与发布确认时，系统必须拒绝启动；确认存在时，系统必须重新执行同等预检后再创建运行。
3. <a id="req-2-3"></a> 当启动请求有效时，系统必须在 `.lazygoal/gepa/runs/<runId>/` 写入冻结运行清单，启动一个脱离调用进程的 Worker，并以单个 JSON 响应返回 `runId`、初始状态和运行目录。
4. <a id="req-2-4"></a> 当同一 Run 已存在存活 Worker 时，任何重复启动或恢复尝试都必须拒绝，且不得启动第二个优化循环。

### 需求 3：执行官方 GEPA 优化与独立反思

**用户故事：** 作为优化维护者，我希望生命周期层只编排官方 GEPA、现有 Adapter 和独立 Reflection LM，以便不产生第二套进化算法或评测事实。

#### 验收标准

1. <a id="req-3-1"></a> 当 Worker 执行时，它必须用冻结 seed、trainset、valset、预算和随机种子调用官方 `gepa.optimize()`，并把该 Run 的官方状态目录作为 `run_dir`。
2. <a id="req-3-2"></a> 当 GEPA 请求反思时，Reflection LM 调用必须通过 LazyGoal LLM Adapter 使用独立 Reflection Profile、专用 reflection prompt 和有界 reflective dataset，不得进入 Working Agent 工具循环。
3. <a id="req-3-3"></a> 当 GEPA 评测候选时，Worker 必须复用既有 LazyGoal GEPA Adapter 和 `prompt-evaluation@1`，让 Working LM 使用该候选 Profile 执行指定 benchmark；一次 Run 不得混入第二种 benchmark。
4. <a id="req-3-4"></a> 当评测、反思、协议或基础设施失败时，Worker 必须保留已提交的官方 GEPA 与 LazyGoal 产物，记录分类错误并将 Run 置为可报告的失败状态，不得伪造分数或发布候选。

### 需求 4：查询状态和报告

**用户故事：** 作为外部自动化调用方，我希望只通过稳定机器接口了解运行进展和最终结果，以便无需解析 Python 日志或 GEPA 私有 checkpoint。

#### 验收标准

1. <a id="req-4-1"></a> 当调用 `status --run <runId>` 时，系统必须以单个 JSON 对象返回当前生命周期状态、Worker 存活性、benchmark、预算消耗、候选数量、当前最佳分数、停止请求和发布状态；查询不得调用模型或修改运行状态。
2. <a id="req-4-2"></a> 当调用 `report --run <runId>` 时，系统必须返回稳定报告，至少包含冻结模型与 Profile 身份、数据集摘要、总 metric calls、候选与最佳分数摘要、最佳 Profile 产物定位、终态、错误分类和发布结果。
3. <a id="req-4-3"></a> 当 Run 不存在、状态文件损坏、Worker 失联或报告尚未形成时，查询接口必须区分这些情况并返回可行动诊断，不得把未知状态报告为成功。

### 需求 5：停止并恢复同一运行

**用户故事：** 作为长任务操作者，我希望优雅停止并从官方 checkpoint 恢复同一 Run，以便控制成本且不丢失已经完成的进化工作。

#### 验收标准

1. <a id="req-5-1"></a> 当调用 `stop --run <runId>` 时，系统必须只为该 Run 创建官方 `gepa.stop` 标记并返回 `stop_requested`；不得向无关进程发送信号或删除已生成产物。
2. <a id="req-5-2"></a> 当 Worker 观察到停止标记时，它必须在官方 GEPA 安全边界退出、保留 checkpoint 并把 Run 置为 `stopped`，且不得发布当前候选。
3. <a id="req-5-3"></a> 当调用 `resume --run <runId>` 且提供明确确认时，系统必须验证不存在存活 Worker、冻结请求和模型身份仍可解析、目标 Profile 摘要未变化，再移除停止标记并以同一 `run_dir` 启动新 Worker。
4. <a id="req-5-4"></a> 当恢复前置条件不成立或 Run 已成功发布时，系统必须拒绝恢复并保持现有 checkpoint、报告和目标 Profile 不变。

### 需求 6：安全发布最佳 Profile

**用户故事：** 作为 LazyGoal 使用者，我希望优化完成后直接使用最佳 Prompt，同时能够证明写入来源并避免覆盖人工修改。

#### 验收标准

1. <a id="req-6-1"></a> 当官方 GEPA 正常完成时，系统必须从 `GEPAResult.best_candidate` 构造保留原冻结字段的完整最佳 Profile，并在 Run 目录保存基准与最佳 Profile 产物。
2. <a id="req-6-2"></a> 当当前 `.lazygoal/profiles/default.json` 的内容摘要仍等于启动时摘要时，系统必须以同目录临时文件和原子替换写回最佳 `systemPrompt` 与完整 `instructions`，并记录 `published` 或 `unchanged`。
3. <a id="req-6-3"></a> 当目标 Profile 在运行期间被修改、最佳候选形状非法或原子写入失败时，系统必须保留最佳 Profile 产物并进入 `publish_blocked` 或失败状态，不得覆盖当前 Profile 或报告已经发布。
4. <a id="req-6-4"></a> 当 Run 被停止或优化失败时，系统不得修改 `.lazygoal/profiles/default.json`。

### 需求 7：保护敏感信息并验证生命周期

**用户故事：** 作为仓库维护者，我希望默认回归不消耗真实资源且运行产物不泄露凭据，以便安全维护跨进程优化功能。

#### 验收标准

1. <a id="req-7-1"></a> 当持久化运行清单、状态、报告、进程诊断或反思桥接产物时，系统不得写入 API key、Authorization 头、完整供应商响应、thinking 或完整 Diagnostic Trace。
2. <a id="req-7-2"></a> 当运行默认测试时，系统必须使用 fake Working CLI、fake Reflection LM 和临时目录覆盖启动、查询、停止、恢复、失败及发布冲突，不得要求 Docker、网络或供应商凭据。
3. <a id="req-7-3"></a> 当运行跨语言集成测试时，测试必须证明独立 Reflection Profile 被加载、候选经现有 Adapter 评测、官方 checkpoint 可恢复，并且成功结果原子更新同一 default Agent Profile。
4. <a id="req-7-4"></a> 当运行显式真实 smoke 时，系统必须在启动前提示可能产生模型与容器费用；该 smoke 不得进入默认回归。
