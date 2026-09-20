# TUA-Bench 评测接入 需求

## 审批摘要

### 目标

将 TUA-Bench（通用终端代理评测基准）作为新的 benchmark 接入 LazyGoal 统一隔离执行环境，使 LazyGoal Agent 能在 ACP 容器沙箱内通过 bash 命令执行完成 TUA-Bench 全部 120 个终端任务，并使用官方确定性验证脚本评分。

### 范围

- 包含：TUA-Bench 任务定义解析与 Manifest 构建、`TuaBenchEnvironmentSpec` 实现（custom 镜像模式）、ACP Worker 入口与 bash 执行工具、官方评分脚本集成、`BenchmarkAttemptRecord` 与 `BenchmarkAdapter` 实现、headless 评测入口
- 不包含：修改 TUA-Bench 上游仓库或 Harbor 框架、自定义评分逻辑（复用官方验证脚本）、并发调度优化、TUI 专属界面、网络访问类宿主代理工具

### 核心行为

- TUA-Bench 使用 custom 镜像模式，直接使用官方预构建 Docker 镜像；每个任务在独立容器中运行确定性 setup 脚本初始化环境
- ACP Worker 在容器内提供 bash 执行工具，Agent 通过 shell 命令完成文档编辑、邮件管理、网页信息检索、科学与工程工作流等任务
- 任务完成后，在容器内调用 TUA-Bench 官方确定性验证脚本评分，评分结果映射为 `BenchmarkAttemptRecord` 的领域字段
- 评分独立入口可对已有执行产物重评分，不消耗模型调用
- headless 评测入口从本地 TUA-Bench 仓库克隆加载任务定义，构建 Manifest 后批量执行

### 风险与待确认

- 风险等级：medium；理由：复用已验证的 `IsolatedEnvironment`、ACP 链路和共享基础设施，新增内容为增量适配层
- 关键操作：需要本地克隆 TUA-Bench 仓库并执行 `uv run setup-env` 下载任务资产；custom 镜像模式需要拉取 TUA-Bench 官方 Docker 镜像
- 风险：TUA-Bench 官方镜像体积和拉取时间依赖网络条件；部分科学/工程工作流任务可能需要特殊软件（如 OpenFOAM、CellProfiler），镜像依赖较重
- 待确认：无

## 引言

TUA-Bench 是 Meta AI、Duke 和 Stanford 联合发布的通用终端代理评测基准，包含 120 个跨五大任务族的真实终端任务。与 SWE-bench（代码修复）和 ALFWorld（文本游戏）不同，TUA-Bench 测试 Agent 在命令行环境下完成非编码类日常和专业工作流的能力。本功能将 TUA-Bench 作为新的 benchmark 接入 LazyGoal 已有的统一隔离执行环境，复用 ACP 密钥隔离和容器安全保障。

## 需求

### 需求 1：TUA-Bench 任务加载与 Manifest 构建

**用户故事：** 作为 benchmark 运维者，我希望从本地 TUA-Bench 仓库加载任务定义并构建评测 Manifest，以便批量执行全部 120 个终端任务。

#### 验收标准

1. <a id="req-1-1"></a> 当用户指定本地 TUA-Bench 仓库路径时，系统必须解析 `tasks/` 目录下的任务定义文件，提取每个任务的标识符、指令文本、所属任务族、Docker 镜像引用和评分验证脚本路径
2. <a id="req-1-2"></a> 解析完成后，系统必须构建 `TuaBenchManifest`，按任务族分组记录全部可用任务，每条记录包含 taskId、instruction、taskFamily、imageRef、setupScript 和 verifierPath
3. <a id="req-1-3"></a> 如果任务定义文件缺少必要字段或格式不符预期，系统必须跳过该任务并记录警告，不中断整体 Manifest 构建

### 需求 2：TUA-Bench 隔离环境适配

**用户故事：** 作为 benchmark 运维者，我希望 TUA-Bench 任务在统一隔离环境中执行，以便复用已验证的容器安全约束和 ACP 生命周期管理。

#### 验收标准

1. <a id="req-2-1"></a> TUA-Bench 的 `EnvironmentSpec` 必须使用 custom 镜像模式，直接引用 TUA-Bench 官方预构建 Docker 镜像，不在其上叠加 managed 安装层
2. <a id="req-2-2"></a> 当容器启动后，`prepareEnvironment` 阶段必须在容器内执行任务的确定性 setup 脚本，将容器状态初始化到任务起始点
3. <a id="req-2-3"></a> `preflight` 必须验证容器内 setup 脚本执行成功且评分验证脚本可达，返回检查结果
4. <a id="req-2-4"></a> `collectArtifacts` 必须从容器中回收评分验证脚本的输出产物和执行日志

### 需求 3：ACP Worker 与 Bash 执行工具

**用户故事：** 作为 benchmark 运维者，我希望容器内 Agent 通过 bash 命令与终端环境交互，以便完成文档编辑、邮件处理、信息检索等真实终端任务。

#### 验收标准

1. <a id="req-3-1"></a> TUA-Bench Worker 入口必须独立于现有 benchmark Worker，注册 bash 执行工具作为 Agent 的主要交互手段
2. <a id="req-3-2"></a> bash 执行工具必须接收命令字符串，在容器内执行并返回 stdout、stderr 和 exit code，支持有界超时
3. <a id="req-3-3"></a> Agent 的 LLM 调用必须通过 ACP `llm` 通道代理到宿主，容器内不持有 API 密钥
4. <a id="req-3-4"></a> 当 Agent 决定任务完成时，Worker 必须结束当前 ACP Session 并进入产物回收阶段

### 需求 4：评分集成

**用户故事：** 作为 benchmark 运维者，我希望使用 TUA-Bench 官方确定性验证脚本对 Agent 执行结果评分，以便评分结果与 TUA-Bench 官方基线可直接对比。

#### 验收标准

1. <a id="req-4-1"></a> 当 Agent 执行完成后，系统必须在同一容器内调用该任务的官方验证脚本，获取通过/未通过的评分结果
2. <a id="req-4-2"></a> 评分结果必须映射为 `BenchmarkAttemptRecord` 的领域字段，包含 taskId、taskFamily、passed（布尔值）和验证脚本的原始输出
3. <a id="req-4-3"></a> 独立 `grade` 入口必须能对已有执行产物重新评分，不消耗模型调用

### 需求 5：Headless 评测入口

**用户故事：** 作为 benchmark 运维者，我希望通过 headless 入口批量运行 TUA-Bench 评测任务，以便自动化执行全部或指定子集的任务并收集结果。

#### 验收标准

1. <a id="req-5-1"></a> headless 入口必须接收 TUA-Bench 仓库路径和可选的任务族/任务 ID 过滤参数，从 Manifest 中筛选目标任务
2. <a id="req-5-2"></a> 对每个目标任务，系统必须创建独立的 Goal、容器和 ACP Session，任务之间互不共享状态
3. <a id="req-5-3"></a> 当全部目标任务执行完成后，系统必须输出汇总报告，包含各任务族的通过率和整体通过率
4. <a id="req-5-4"></a> 当评测中途被中断时，已完成任务的 Attempt 记录必须保持完整可读取
