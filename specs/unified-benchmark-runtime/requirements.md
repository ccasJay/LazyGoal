# 统一 Benchmark 运行基础设施 需求

## 审批摘要

### 目标

将所有 benchmark 的 Agent、工具和交互环境统一为在独立容器内运行，宿主通过 ACP 驱动；任务准备和评分规则由各 benchmark 自己提供。消除跨 benchmark 的通信、超时、取消、产物回收和错误分类的重复维护。

### 范围

- 包含：从 SWE-bench 提取共享 ACP 通信、LLM 代理、Worker 构建和进程生命周期到 benchmark 公共层；由 LazyGoal 提供统一隔离执行环境，各 benchmark 通过声明式配置适配；将 ALFWorld 迁移到容器执行并验证公共边界；统一 Attempt 增量记录与落盘；分离环境准备、作答与评分使已有产物可独立重评分。
- 不包含：分布式调度、容器池或容器断点恢复；动态工具插件加载器；将所有 benchmark 统一为相同工具集；将评分器包装为 ACP Agent；第三个 benchmark 的实际接入。

### 核心行为

- SWE-bench 和 ALFWorld 必须消费同一套共享 ACP 通信、LLM 代理、Worker 构建和容器生命周期设施，且彼此没有目录级依赖。
- LazyGoal 必须提供统一的隔离执行环境，拥有容器安全、通信、Worker 注入和生命周期保障；各 benchmark 通过声明式配置在该环境中适配自己的镜像、工作目录和领域工具，共享层不得假设 Conda、pytest 或 `/testbed`。
- ALFWorld 评测必须在独立 Docker 容器内通过 ACP Supervisor 运行 Headless Root、专用工具和 Python sidecar，且宿主未安装 ALFWorld Python 环境时仍可运行。
- 每个 Attempt 的任务身份、执行状态、用量、阶段错误和产物位置必须在阶段结束后原子落盘；评测中途退出时已完成的 Attempt 保持完整可读。
- 已有提交产物可独立重评分且不消耗模型调用；ACP 约束正式作答路径，评分不走 ACP。
- 现有 SWE-bench 评测语义、CLI 参数、单次作答、退出码和官方 `resolved` 评分来源保持不变。

### 风险与待确认

- 风险等级：high；理由：修改已验证的 SWE-bench ACP 执行路径、跨 benchmark 创建共享基础设施、ALFWorld 从宿主执行根本性迁移到容器隔离环境。
- 关键操作：重构已在工作的 SWE-bench 共享设施路径，ALFWorld 容器化涉及新的 Docker 镜像构建和 Python sidecar 容器化。
- 风险：提取共享设施时可能改变取消和部分启动失败的行为；ALFWorld 容器化的镜像构建与数据准备成本需实测验证；Python sidecar 容器化可能引入新的环境兼容性问题。
- 待确认：无。

## 引言

当前 ACP 容器执行链路已在 SWE-bench 上验证，但通用设施（Mux、LLM RPC、Worker 构建、进程生命周期）仍集中在 SWE-bench 目录下，ALFWorld 仍在宿主直接运行。新增 benchmark 需要复制这套代码并重复维护。本功能将共享设施提取为 benchmark 公共层，以 ALFWorld 容器迁移验证通用性，并统一 Attempt 记录和评分独立性。

## 需求

### 需求 1：共享 ACP 评测基础设施

**用户故事：** 作为 benchmark 维护者，我希望所有 benchmark 复用同一套 ACP 通信、LLM 代理和 Worker 构建设施，以便新增 benchmark 不需要复制通信与生命周期代码。

#### 验收标准

1. <a id="req-1-1"></a> 当两个或以上 benchmark 运行评测时，它们必须消费同一套通信复用、LLM 代理转发、Worker 构建和进程生命周期代码，不得各自维护独立实现。
2. <a id="req-1-2"></a> 当一个 benchmark 访问共享设施时，它不得从另一个 benchmark 的目录导入代码；共享设施与各 benchmark 之间的依赖必须是单向的。
3. <a id="req-1-3"></a> 当共享通信或生命周期代码变更时，确定性回归必须同时覆盖所有消费该设施的 benchmark。

### 需求 2：LazyGoal 提供通用隔离执行环境

**用户故事：** 作为新 benchmark 接入者，我希望 LazyGoal 提供标准的隔离执行环境，我只需声明本环境的镜像和领域需求，以便复用已有的安全保障和生命周期管理。

#### 验收标准

1. <a id="req-2-1"></a> 当 benchmark 启动评测时，LazyGoal 的隔离环境必须统一负责容器创建、安全约束、Worker 注入、通信建立、文件回收和容器销毁，benchmark 不得直接操作容器管理 API。
2. <a id="req-2-2"></a> 当 benchmark 需要领域特定设置时，benchmark 必须通过声明式配置提供基础镜像、工作目录、环境准备逻辑、额外预检和提交产物定义，由隔离环境统一执行。
3. <a id="req-2-3"></a> 当容器正式运行时，隔离环境必须保持每次 Attempt 独立容器、无宿主凭据、无 Docker socket、作答时无网络，以及有界回收后销毁的约束。
4. <a id="req-2-4"></a> 当领域层引用 Conda、pytest、`/testbed` 或其他 benchmark 特定概念时，隔离环境不得要求或假设这些概念的存在。

### 需求 3：ALFWorld 容器执行验证

**用户故事：** 作为 ALFWorld 评测运行者，我希望评测在隔离的 Docker 容器内运行完整 LazyGoal 执行链和 Python sidecar，以便评测结果覆盖容器化环境且不依赖宿主 Python 安装。

#### 验收标准

1. <a id="req-3-1"></a> 当 ALFWorld 评测运行时，每个任务必须在独立 Docker 容器内通过 ACP Supervisor 运行 Headless Root，并使用 ALFWorld 专用工具和 Python sidecar。
2. <a id="req-3-2"></a> 当宿主未安装 ALFWorld 的 Python 环境时，容器评测必须仍可正常运行。
3. <a id="req-3-3"></a> 当 ALFWorld Worker 需要游戏数据与 Python 环境时，这些资源必须在容器内准备，不得依赖宿主文件路径。
4. <a id="req-3-4"></a> 当多个 ALFWorld 任务顺序执行时，每个任务的容器、环境和状态必须相互隔离，不得污染或共享。

### 需求 4：统一 Attempt 记录与增量落盘

**用户故事：** 作为评测结果审阅者，我希望每个 Attempt 的执行事实在阶段结束后立即持久化，以便评测中途退出时已有结果不丢失，且不同 benchmark 的结果保留各自的领域字段。

#### 验收标准

1. <a id="req-4-1"></a> 当一个 Attempt 阶段结束时，系统必须原子落盘该 Attempt 的任务身份、Goal/Run 标识、环境与 Worker 摘要、执行状态、用量、阶段错误和产物位置。
2. <a id="req-4-2"></a> 当评测在执行过程中被中断时，已完成阶段的 Attempt 记录必须保持完整可读取。
3. <a id="req-4-3"></a> 当任务重试时，系统必须创建新 Attempt、新容器和新 Goal；报告必须显示重试次数，且任务分母固定为完整 Manifest。
4. <a id="req-4-4"></a> 当记录领域特定结果时，SWE-bench 的 patch 与 `resolved`、ALFWorld 的环境步数与 `won` 必须保留在各自的结果字段中，不得强行压入相同的公共字段。

### 需求 5：独立评分入口

**用户故事：** 作为评测维护者，我希望已有提交产物可以独立重评分，以便评分失败或规则变更后不需要重新消耗模型调用。

#### 验收标准

1. <a id="req-5-1"></a> 当已有提交产物可用时，系统必须允许读取这些产物执行评分，且不触发新的模型调用。
2. <a id="req-5-2"></a> 当评分执行时，必须按各 benchmark 自己的规则在隔离环境中运行，不受其他 benchmark 评分逻辑影响。
3. <a id="req-5-3"></a> 当正式评测路径通过 ACP 约束作答过程时，评分过程不得包装为 ACP Agent；ACP 只约束正式作答路径。

### 需求 6：保持现有评测语义

**用户故事：** 作为 SWE-bench 评测运行者，我希望共享基础设施替换后现有评测行为完全保持，以便验证基础设施变更未引入行为回归。

#### 验收标准

1. <a id="req-6-1"></a> 当共享基础设施替换 SWE-bench 现有设施后，SWE-bench 评测必须继续产生正确结果，且官方 `resolved` 仍为唯一成功事实。
2. <a id="req-6-2"></a> 当正式 eval 路径变更时，现有 CLI 参数、单次作答语义、无自动重试、退出码行为和进程生命周期必须保持不变；普通 TUI 和其他未受影响的功能不得被加载或修改。
3. <a id="req-6-3"></a> 当确定性测试运行时，必须覆盖取消、断线、复制失败和清理失败场景，且 SWE-bench 和 ALFWorld 分别通过真实容器 smoke 测试；默认回归不得依赖 Docker 或外部供应商。
