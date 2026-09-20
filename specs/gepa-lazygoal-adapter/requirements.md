# GEPA LazyGoal Adapter 需求

## 审批摘要

### 目标

提供一个基于官方 GEPA 的 Python adapter，使 GEPA 能把候选 Prompt 交给 LazyGoal 现有 Prompt Evaluation 入口评测，并获得逐样本分数及可用于反思变异的结构化反馈。

### 范围

- 包含：仓库根目录 `prompt-evaluation/gepa/` 下的独立 Python package；精确依赖官方 `gepa==0.1.4`；实现 `GEPAAdapter.evaluate()` 与 `make_reflective_dataset()`；支持 ALFWorld、GAIA；候选组件映射；顺序调用 `lazygoal eval prompt`；严格消费 `prompt-evaluation@1` 的 NDJSON 终态与 `result.json`；默认无 Docker、真实模型和凭据的测试，以及显式真实链路 smoke。
- 不包含：自行实现或修改 GEPA 优化算法；复制官方 GEPA 源码；项目级触发 Skill；反思模型供应商配置；Profile 自动发布或晋升；中断续跑；并发、分布式或跨 benchmark 优化；直接解析 LazyGoal 原始 Trajectory JSONL。

### 核心行为

- 官方 GEPA 拥有候选池、反思变异、选择和优化循环；adapter 只负责把 GEPA 样本及候选转换为 LazyGoal Prompt Evaluation 调用。
- 一次优化运行只使用一个 benchmark；每个 GEPA 样本引用只包含一个任务的 Manifest，并与一个 LazyGoal task 结果一一对应。
- 每个 GEPA 样本显式携带 benchmark ID，且必须与本次运行配置一致。
- GEPA 候选以 `system_prompt` 和连续的 `instruction_000`、`instruction_001` 等组件无损映射为 LazyGoal 的 `systemPrompt` 与 `instructions[]`，未知或断号组件在启动评测前拒绝。
- adapter 仅把权威 `result.json` 中的 `passed` 映射为 `1.0`、`failed` 映射为 `0.0`；协议、基础设施、取消及结果损坏必须终止当前 batch，不得伪造分数。
- 开启 trace 时，adapter 使用权威 task 结果、`domainResult`、错误、用量和 Attempt/产物定位信息构造轻量轨迹；反思数据必须 JSON 可序列化且按请求更新的组件分组。

### 风险与待确认

- 风险等级：medium；理由：新增 Python 与 TypeScript CLI 的跨进程集成及官方第三方接口依赖，但不改变 LazyGoal Runtime、benchmark 评分或持久化所有权。
- 关键操作：无。
- 风险：官方 GEPA API 漂移会破坏 adapter；把基础设施故障降为零分会污染优化；错误的多组件映射会改变 Prompt 语义。
- 待确认：无。

## 引言

本功能把官方 GEPA 优化循环接到 LazyGoal 已有 Prompt Evaluation 公共协议上。adapter 只做候选、样本、结果和反思数据转换，不复制优化算法，也不越过 CLI 协议读取 LazyGoal 内部状态。

## 需求

### 需求 1：使用官方 GEPA 扩展契约

**用户故事：** 作为 Prompt 优化维护者，我希望 adapter 直接实现官方 GEPA 契约，以便复用官方优化能力并避免维护算法分叉。

#### 验收标准

1. <a id="req-1-1"></a> 当安装 adapter package 时，它必须精确依赖官方 `gepa==0.1.4`，且不得包含复制或修改后的 GEPA 算法源码。
2. <a id="req-1-2"></a> 当官方 GEPA 调用 adapter 时，adapter 必须实现当前版本 `GEPAAdapter.evaluate()` 与 `make_reflective_dataset()` 所要求的输入、返回值和逐样本对齐约束。
3. <a id="req-1-3"></a> 当已安装 GEPA 的版本或公开接口与 adapter 声明不一致时，预检必须在启动 LazyGoal 评测前以清晰的兼容性错误终止。

### 需求 2：建立确定的优化样本边界

**用户故事：** 作为 GEPA 运行发起者，我希望每个训练或验证样本稳定对应一个 LazyGoal 任务，以便分数和反思证据不会错配。

#### 验收标准

1. <a id="req-2-1"></a> 当创建一次 adapter 运行时，配置必须指定一个受支持的 benchmark、基准 Profile、模型配置身份、LazyGoal 可执行入口和输出目录，且不得包含模型密钥。
2. <a id="req-2-2"></a> 当加载 ALFWorld 或 GAIA 数据集时，每个 GEPA 样本必须包含稳定样本 ID、benchmark ID、task ID 和一个只描述该任务的 Manifest 路径。
3. <a id="req-2-3"></a> 当 batch 中出现重复样本 ID、重复 task ID、跨 benchmark 样本、缺失 Manifest 或多任务 Manifest 时，adapter 必须在启动对应评测前拒绝该 batch。

### 需求 3：无损转换候选 Prompt

**用户故事：** 作为优化运行发起者，我希望 GEPA 的多组件候选稳定映射到 LazyGoal Profile Prompt，以便每次评分准确评估被选择的文本。

#### 验收标准

1. <a id="req-3-1"></a> 当候选包含 `system_prompt` 与从 `instruction_000` 开始连续编号的组件时，adapter 必须按编号顺序转换为一个 `systemPrompt` 和 `instructions[]`，且文本内容保持不变。
2. <a id="req-3-2"></a> 当候选缺少 `system_prompt`、包含未知组件、指令编号断号或组件值不是字符串时，adapter 必须在创建 Prompt Evaluation 请求前返回可定位到组件的校验错误。
3. <a id="req-3-3"></a> 当相同候选被重复评测时，adapter 必须基于规范化组件内容生成相同候选身份，同时为每次调用创建独立的评测产物目录。

### 需求 4：通过公共协议执行并读取权威结果

**用户故事：** 作为 LazyGoal 维护者，我希望 adapter 只通过公开 Prompt Evaluation 协议调用评测，以便 Python 集成不依赖 TypeScript 内部实现。

#### 验收标准

1. <a id="req-4-1"></a> 当评测一个样本时，adapter 必须以无 shell 的参数列表执行 `lazygoal eval prompt --request <request.json>`，并提交当前 `prompt-evaluation@1` 单候选、单 benchmark、单任务请求。
2. <a id="req-4-2"></a> 当子进程结束时，adapter 必须严格解析有界 stdout 中的 NDJSON，仅用终态事件取得 `resultPath`，并以该路径指向的 `result.json` 作为分数、输出和反馈事实来源。
3. <a id="req-4-3"></a> 当 `result.json` 包含且仅包含与样本 task ID 匹配的权威结果时，adapter 必须保持 batch 输入顺序返回等长的 outputs 和 scores；开启 trace 时还必须返回等长 trajectories。

### 需求 5：区分任务表现与运行故障

**用户故事：** 作为 GEPA 优化器，我希望只把真实 benchmark 成败转换为适应度，以便运行故障不会被错误学习为 Prompt 缺陷。

#### 验收标准

1. <a id="req-5-1"></a> 当权威 task 状态为 `passed` 时，adapter 必须返回分数 `1.0`；当状态为 `failed` 时，必须返回分数 `0.0`，并保留对应 `domainResult` 作为输出事实。
2. <a id="req-5-2"></a> 当 CLI 报告无效请求、基础设施失败或取消，或退出码、终态事件、`resultPath`、结果协议、task 身份相互矛盾时，adapter 必须抛出分类明确的异常并终止 batch，不得返回该样本分数。
3. <a id="req-5-3"></a> 当 batch 在某个样本失败或被取消时，adapter 必须停止启动后续样本，同时保留此前已经提交的请求、结果和 Attempt 产物。

### 需求 6：生成可反思且有界的反馈

**用户故事：** 作为 GEPA 反思变异器，我希望收到与每个候选组件相关的结构化执行反馈，以便基于真实失败改写 Prompt。

#### 验收标准

1. <a id="req-6-1"></a> 当 `evaluate(..., capture_traces=True)` 成功时，每条轻量 trajectory 必须包含样本身份、候选身份、task 状态、分数、`domainResult`、有界错误与用量摘要，以及 Attempt 和产物定位信息；不得读取或复制原始 Trajectory JSONL。
2. <a id="req-6-2"></a> 当 GEPA 请求为指定组件构造 reflective dataset 时，adapter 必须为每个请求组件返回逐样本 JSON 可序列化记录，至少包含输入、生成结果、反馈和分数。
3. <a id="req-6-3"></a> 当请求组件不属于被评测候选或评测结果没有 capture traces 时，adapter 必须返回清晰错误，不得生成缺少来源的反思记录。

### 需求 7：隔离产物并验证完整接入

**用户故事：** 作为 LazyGoal 维护者，我希望 adapter 的默认测试可重复且不会产生外部费用，同时保留真实链路验证入口。

#### 验收标准

1. <a id="req-7-1"></a> 当运行默认 adapter 测试时，测试必须使用 fake LazyGoal CLI 和 fake reflection LM，且不得要求 Docker、真实模型、网络访问或供应商凭据。
2. <a id="req-7-2"></a> 当集成测试调用官方 `gepa.optimize()` 时，测试必须证明 seed candidate 经 adapter 产生 LazyGoal 请求、读取模拟权威结果、形成反思数据并返回可观察的候选优化结果。
3. <a id="req-7-3"></a> 当运行显式 smoke 时，至少一个 ALFWorld 或 GAIA 单任务 Manifest 必须通过真实 `lazygoal eval prompt` 完成 adapter 到权威结果的链路；该 smoke 不属于默认回归。
4. <a id="req-7-4"></a> 当 adapter 写入请求、捕获的进程输出和运行元数据时，所有文件必须位于配置的 adapter 输出目录内，且不得写入模型密钥或完整 Diagnostic Trace。
