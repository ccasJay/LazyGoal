# GAIA Benchmark 接入 需求

## 审批摘要

### 目标

将 GAIA benchmark 作为第三个消费者接入统一隔离执行环境，验证通用基础设施对 QA 类（问答类）benchmark 的适配能力，特别是需要宿主代理网络工具的场景。

### 范围

- 包含：`GaiaEnvironmentSpec` 实现、宿主代理网页工具（`web_search`、`web_fetch`）、GAIA Worker 入口与 `submit_answer` 工具、HuggingFace 数据集加载与 Manifest 构建、答案评分（归一化精确匹配）、AttemptRecorder 集成、确定性测试与容器 smoke
- 不包含：多模态文件处理工具实现（PDF/Excel/音频解析由容器内 Python 库完成，不暴露为 LazyGoal 工具）、分布式调度、视觉推理模型集成、GAIA Level 3 专用策略

### 核心行为

- GAIA 使用 managed 镜像模式，在 LazyGoal 基础镜像上声明 Python 文件处理依赖安装层；容器保持 `--network none`
- 网页搜索和网页获取注册为 LazyGoal 宿主工具，通过 ACP 双通道路由到宿主执行；容器内 Agent 不直接访问网络
- Agent 通过 `submit_answer` 工具提交最终答案字符串；每个任务限一次提交
- 评分使用归一化精确字符串匹配，独立 `grade` 入口读取已有提交产物评分，不消耗模型调用
- HuggingFace Gated Dataset 由 CLI 在评测前一次性加载到宿主，任务附件通过 `EnvironmentHandle.copyInto()` 注入容器

### 风险与待确认

- 风险等级：medium；理由：复用已验证的 `IsolatedEnvironment` 和 ACP 链路，新增的宿主代理工具和答案提交为增量扩展
- 关键操作：新增 `web_search`/`web_fetch` 宿主工具需要宿主网络访问权限；HuggingFace Gated Dataset 需要用户持有有效 access token
- 风险：宿主代理网页工具的延迟和可靠性依赖外部搜索服务；GAIA 任务附件涵盖多种格式（PDF、XLSX、DOCX、PNG、MP3 等），文件处理依赖安装层体积可能较大
- 待确认：无

## 引言

GAIA（General AI Assistants）是一个面向 AI 通用助手能力的 QA benchmark，包含 450+ 道需要真实世界推理的问答任务，分三个难度级别。任务通常需要网页搜索、文件处理和多步推理，最终给出一个精确的短答案。本需求将 GAIA 作为第三个 benchmark 接入 LazyGoal 统一隔离执行环境，验证该架构对 QA 类 benchmark 和宿主代理网络工具场景的适配能力。

## 需求

### 需求 1：GAIA 隔离环境适配

**用户故事：** 作为 benchmark 运维者，我希望 GAIA 任务在统一隔离环境中执行，以便复用已验证的安全约束和生命周期管理。

#### 验收标准

1. <a id="req-1-1"></a> GAIA 的 `EnvironmentSpec` 使用 managed 镜像模式，声明 Python 文件处理依赖（openpyxl、python-docx、PyPDF2、pydub 等）的安装命令，容器保持 `--network none`
2. <a id="req-1-2"></a> 任务附件文件在 `prepareEnvironment` 阶段通过 `EnvironmentHandle.copyInto()` 注入容器工作目录，Agent 可通过 `read_file` 工具读取
3. <a id="req-1-3"></a> `preflight` 验证容器内 Python 和关键文件处理库可用，返回版本信息
4. <a id="req-1-4"></a> `collectArtifacts` 回收 Agent 提交的答案和执行日志

### 需求 2：宿主代理网页工具

**用户故事：** 作为 benchmark 运维者，我希望容器内 Agent 能够搜索和获取网页内容，以便完成需要真实世界信息的 GAIA 任务，同时容器自身不具备网络访问权限。

#### 验收标准

1. <a id="req-2-1"></a> `web_search` 工具接收查询字符串，通过 ACP 路由到宿主执行搜索，返回有界结果列表（标题、URL、摘要）
2. <a id="req-2-2"></a> `web_fetch` 工具接收 URL，通过 ACP 路由到宿主获取页面内容，返回有界纯文本
3. <a id="req-2-3"></a> 两个工具在 Worker 工具注册表中注册，容器无网络时仍可正常使用
4. <a id="req-2-4"></a> 宿主代理工具的请求和响应通过 ACP 通道传递，不绕过 `IsolatedEnvironment` 的安全约束

### 需求 3：GAIA Worker 与答案提交

**用户故事：** 作为 benchmark 运维者，我希望 GAIA Worker 具有专用工具集和答案提交机制，以便 Agent 能够处理文件、搜索网页并提交最终答案。

#### 验收标准

1. <a id="req-3-1"></a> GAIA Worker 入口独立于 SWE-bench 和 ALFWorld，注册文件读取、网页搜索、网页获取和答案提交工具
2. <a id="req-3-2"></a> `submit_answer` 工具接收最终答案字符串，每个任务只允许提交一次；重复提交返回拒绝
3. <a id="req-3-3"></a> 答案提交后 Worker 结束当前 ACP Session

### 需求 4：HuggingFace 数据集加载

**用户故事：** 作为 benchmark 运维者，我希望 CLI 能够从 HuggingFace 加载 GAIA 数据集并构建评测 Manifest，以便批量执行评测任务。

#### 验收标准

1. <a id="req-4-1"></a> CLI 的 `load` 子命令下载 GAIA Gated Dataset 到指定目录，需要用户提供 HuggingFace access token
2. <a id="req-4-2"></a> 下载完成后按 validation/test split 和 Level 1/2/3 构建 `GaiaManifest`，每条记录包含 taskId、question、expectedAnswer（validation 有、test 无）、level、附件路径列表
3. <a id="req-4-3"></a> 附件文件与 Manifest 存储在同一目录结构下，路径可由 `GaiaEnvironmentSpec` 直接消费

### 需求 5：答案评分

**用户故事：** 作为 benchmark 运维者，我希望对 Agent 提交的答案进行归一化精确匹配评分，以便量化 GAIA 评测成绩。

#### 验收标准

1. <a id="req-5-1"></a> 评分对 Agent 答案和标准答案执行相同的归一化处理（去除冠词、标点、多余空格，统一大小写，数字标准化）后进行精确匹配
2. <a id="req-5-2"></a> 独立 `grade` 入口读取已有 Attempt 记录和提交答案执行评分，不触发模型调用
3. <a id="req-5-3"></a> 评分结果写入 Attempt 记录的 `domainResult`，包含 `correct`（布尔）、`normalizedAnswer`、`normalizedExpected`

### 需求 6：AttemptRecorder 集成与报告

**用户故事：** 作为 benchmark 运维者，我希望 GAIA 评测使用统一的 Attempt 增量落盘机制，以便中途退出时保留已完成的作答记录。

#### 验收标准

1. <a id="req-6-1"></a> 每个 GAIA 任务的 Attempt 通过共享 `AttemptRecorder` 原子写入，`domainResult` 包含 `submittedAnswer`、`correct`、`level`
2. <a id="req-6-2"></a> 中途退出后已完成的 Attempt 记录可读取且完整
3. <a id="req-6-3"></a> 汇总报告按 Level 和 split 分组统计正确率

### 需求 7：测试与验证

**用户故事：** 作为 benchmark 运维者，我希望 GAIA 接入有充分的确定性测试和容器 smoke 覆盖，以便保证集成质量。

#### 验收标准

1. <a id="req-7-1"></a> 确定性测试覆盖 `GaiaEnvironmentSpec`、宿主代理工具协议、答案提交逻辑、评分归一化和 Manifest 构建，不依赖 Docker 或外部网络
2. <a id="req-7-2"></a> 容器 smoke 测试使用固定任务验证完整链路（环境准备 → 预检 → ACP 作答 → 答案提交 → 产物回收）
3. <a id="req-7-3"></a> 依赖检查确认 `benchmarks/gaia` 不导入 `benchmarks/swebench` 或 `benchmarks/alfworld` 的模块
