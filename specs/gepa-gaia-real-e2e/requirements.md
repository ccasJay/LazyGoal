# GAIA 真实端到端 GEPA 评测 需求

## 审批摘要

### 目标

使用真实 GAIA validation 数据，先打通单任务真实 Prompt Evaluation，再打通官方 GEPA 的 Working LM、Reflection LM、评分、报告和 GAIA Profile 发布生命周期。

### 范围

- 包含：真实 GAIA validation 任务选择与单任务 Manifest、真实 Docker 评测、真实 Working LM、GAIA authoritative scoring、最小 GEPA train/validation 运行、Reflection LM、生命周期状态与报告、GAIA 专用 Profile 目标和发布验证。
- 不包含：GAIA 全量评测、test split、Level 3 专项策略、默认回归自动调用真实模型、将结果发布到通用 default Profile。

### 核心行为

- 评测前必须由调用方明确提供 validation 任务和数据位置；每个 GEPA 样本只对应一个任务 Manifest，并在模型调用前完成身份、答案和数据文件校验。
- 第一阶段真实冒烟支持指定的 Level 1/2 validation 任务；Level 2 的附件必须位于
  `dataRoot` 内并由隔离环境挂载，通过 Docker、GAIA Worker、ACP/LLM RPC 和真实模型完成评分。
- GAIA 运行必须使用 `gaia-worker-profile` 作为基准 Profile；GEPA 候选只能改变 Prompt 文本，工具白名单、提交协议和其他冻结字段保持不变。
- GEPA 首轮使用互不重复的最小 train/validation 集、固定 seed 和有界 metric 预算；必须先执行只读 `preflight`，再经当次摘要批准后启动真实运行。
- 领域失败、基础设施失败、协议失败和取消必须保持可区分；运行产物不得泄露凭据、完整供应商响应或未授权诊断内容。

### 风险与待确认

- 风险等级：medium；理由：涉及真实模型费用、Docker 执行、Python/Node 跨进程协议和 Profile 发布，但目标限制在 GAIA 专用 Profile，且可通过生命周期确认和摘要保护回滚。
- 关键操作：调用 Working LM 和 Reflection LM、创建隔离容器、向指定 GAIA Profile 发布最佳候选。
- 风险：真实模型、容器镜像、附件准备和 GAIA 数据准备可能失败；模型失败答案不能与基础设施故障混淆；Level 3 能力不在本范围内。
- 待确认：无。

## 引言

本功能把真实 GAIA validation 数据接入 LazyGoal Prompt Evaluation 和官方 GEPA 生命周期。第一阶段验证一个可重复的单任务真实链路，随后以最小有界预算验证双模型 GEPA 运行；所有真实调用均为显式、可审计且不进入默认回归。

## 需求

### 需求 1：真实 GAIA 数据集边界与 Manifest

**用户故事：** 作为评测运行者，我希望明确指定可评分的 GAIA validation 任务，以便每次真实运行都使用可追溯且有标准答案的数据。

#### 验收标准

1. <a id="req-1-1"></a> 当准备真实评测请求时，系统必须只接受调用方明确指定的 GAIA `validation` 任务；使用 `test` split 或未指定任务的自动发现必须在模型调用前拒绝。
2. <a id="req-1-2"></a> 当一个任务被纳入 GEPA trainset 或 validation set 时，其 Manifest 必须只包含一个 task，且 Manifest 内的 `taskId` 必须与样本声明一致。
3. <a id="req-1-3"></a> 当任务用于真实 GEPA 时，Manifest 必须包含非空 `expectedAnswer`、有效的绝对 `dataRoot`，且任务级别必须为 Level 1 或 Level 2；附件（如有）必须是 `dataRoot` 内存在的相对文件。缺失答案、数据根目录、附件文件或越界文件路径时必须在模型调用前失败。
4. <a id="req-1-4"></a> 当系统写入请求、Manifest、结果或报告时，任何文件都不得包含模型凭据、API Key、Authorization 内容或完整供应商响应。

### 需求 2：真实 GAIA 单任务 Prompt Evaluation

**用户故事：** 作为评测维护者，我希望一个真实 GAIA 任务能经过隔离执行和领域评分，以便先证明 GEPA 之前的基础评测链路真实可用。

#### 验收标准

1. <a id="req-2-1"></a> 当真实单任务请求通过校验并被显式执行时，系统必须使用请求解析出的真实 Working LM 配置，不得替换为确定性假模型或内置合成答案。
2. <a id="req-2-2"></a> 当任务进入执行阶段时，系统必须通过独立 Docker 容器、GAIA Worker、ACP 通道和 LLM RPC 完成作答；容器必须保持无网络模式，且只能通过 GAIA 允许的工具完成提交。
3. <a id="req-2-3"></a> 当 Agent 提交答案后，任务状态必须由 GAIA 领域评分决定：答案正确为 `passed`，答案错误为 `failed`；模型的 `complete` 文本或进度事件不得直接决定领域结果。
4. <a id="req-2-4"></a> 当单任务执行结束或被中断时，系统必须保留该任务的 Attempt 记录，以及已成功回收的 Goal Snapshot、Trajectory 和结果定位信息；基础设施失败或取消时不得伪造领域结果。

### 需求 3：GAIA 基准 Profile 与候选冻结

**用户故事：** 作为 GEPA 运行者，我希望 GAIA 候选始终在同一工具和提交契约下比较，以便 Prompt 变化不会悄悄改变评测条件。

#### 验收标准

1. <a id="req-3-1"></a> 当请求选择 GAIA benchmark 时，系统必须使用 `gaia-worker-profile` 作为基准 Profile；请求引用其他 Profile 身份时必须在创建模型调用前拒绝。
2. <a id="req-3-2"></a> 当候选 Profile 被派生或传入 Worker 时，候选只能改变 `systemPrompt` 和 `instructions`；Profile 身份、工具白名单、答案提交协议、结构化输出模式和其他冻结字段必须与 GAIA 基准保持一致。
3. <a id="req-3-3"></a> 当 GEPA 指定 GAIA 目标 Profile 时，系统必须冻结目标文件路径和内容摘要，并在运行期间检测目标文件漂移；未获得当次生命周期保护的文件不得被覆盖。
4. <a id="req-3-4"></a> 当生成或加载 GAIA 目标 Profile 时，文件内容必须与 Worker 内置的 `GAIA_WORKER_PROFILE` 在身份、工具和 Prompt 约束上保持一致；不一致时必须在 preflight 阶段失败。

### 需求 4：GEPA 样本边界与只读 Preflight

**用户故事：** 作为 GEPA 运行发起者，我希望在产生费用和容器副作用前看到完整的运行摘要，以便确认数据、模型和发布影响。

#### 验收标准

1. <a id="req-4-1"></a> 当构造 GEPA 请求时，`benchmark` 必须为 `gaia`，trainset 必须非空，且每个样本必须包含唯一 `sampleId`、唯一 `taskId` 和一个单任务 Manifest；validation set 如提供也必须满足相同约束并与 trainset 任务不重复。
2. <a id="req-4-2"></a> 当执行 `preflight` 时，系统必须校验请求协议、Manifest 存在性、单任务边界、任务身份、GAIA benchmark 身份、目标 Profile 和两侧模型配置；校验失败时不得创建 Worker、容器或模型调用。
3. <a id="req-4-3"></a> 当 `preflight` 成功时，输出摘要必须包含 benchmark、train/validation 数量、`maxMetricCalls`、Working LM、Reflection LM、GAIA 目标 Profile 路径和预计副作用。
4. <a id="req-4-4"></a> 当请求包含空 validation set、非正 metric 预算、重复样本、跨 benchmark 样本或多任务 Manifest 时，系统必须返回可定位的协议错误，并保持目标 Profile 不变。

### 需求 5：最小真实 GEPA 生命周期

**用户故事：** 作为 Prompt 优化维护者，我希望用一个有界的真实运行验证官方 GEPA 能完成评测、反思、候选选择和报告，以便确认双模型接入不是只通过离线替身测试。

#### 验收标准

1. <a id="req-5-1"></a> 当用户批准当前 `preflight` 摘要并启动首轮真实 GEPA 时，系统必须使用一个 train 任务和一个不同的 validation 任务、固定 seed `0`、`reflectionMinibatchSize` 为 `1`，且 `maxMetricCalls` 不超过首轮约定的有界预算 `4`。
2. <a id="req-5-2"></a> 当 GEPA 评估候选时，每个候选必须通过公开 Prompt Evaluation 边界执行 GAIA 任务，并只将 GAIA 的 `passed` 或 `failed` 转换为有效分数；协议、模型、容器、持久化和取消错误不得转换为零分。
3. <a id="req-5-3"></a> 当生命周期运行中查询状态时，系统必须通过公开 `status` 入口报告唯一 `runId`、生命周期状态、Worker 健康、metric 使用量、候选数量、最佳分数和发布状态，不得要求调用方读取内部 checkpoint 或 Worker 日志。
4. <a id="req-5-4"></a> 当生命周期进入终态时，公开 `report` 必须同时说明 GAIA 数据规模、metric 预算消耗、最佳候选、终态、发布状态、目标 Profile 路径和错误分类；只有优化终态成功且发布为 `published` 或 `unchanged` 时，才可判定整条 GEPA 链路成功。

### 需求 6：真实运行的副作用与失败隔离

**用户故事：** 作为项目维护者，我希望真实 E2E 测试不会悄悄改变日常开发状态，也不会把外部故障学习成 Prompt 缺陷，以便安全复查和重复运行。

#### 验收标准

1. <a id="req-6-1"></a> 当未显式请求真实 E2E 或 GEPA 生命周期时，默认回归必须不调用真实模型、不创建真实 GAIA 容器，也不访问外部 GAIA 数据服务。
2. <a id="req-6-2"></a> 当真实运行发生数据、Profile、模型配置、容器、Worker、协议、产物回收或持久化错误时，系统必须保留已提交产物并返回明确的基础设施或协议分类，不得发布不完整候选。
3. <a id="req-6-3"></a> 当真实运行发生 GAIA 答案错误时，系统必须将其记录为领域 `failed`，而不是基础设施错误；当发生容器或模型故障时，系统必须保持领域结果为 `null` 或等价的非领域状态。
4. <a id="req-6-4"></a> 当目标 GAIA Profile 在运行期间发生外部修改时，系统必须阻止覆盖并将终态标记为发布阻塞；不得通过强制替换绕过摘要保护。

### 需求 7：GAIA Level 1/2 验收边界

**用户故事：** 作为验收人员，我希望首轮真实测试规模小、结果明确且可重复，以便先确认核心链路再扩展 GAIA 能力范围。

#### 验收标准

1. <a id="req-7-1"></a> 当使用指定的 Level 1 或 Level 2 GAIA validation 任务执行真实冒烟时，系统必须完成数据校验、真实 Prompt Evaluation、GAIA 评分和产物回收全链路。
2. <a id="req-7-2"></a> 当单任务链路通过后，使用一条 train 任务和一条独立 validation 任务的最小 GEPA 运行必须能够产生可读取的终态报告；领域答案错误不得被解释为生命周期协议成功。
3. <a id="req-7-3"></a> 当 Level 1/2 验收尚未完成时，系统不得把 GAIA 全量数据、test split 或 Level 3 任务加入默认验收集合；这些能力必须作为后续独立范围处理。
