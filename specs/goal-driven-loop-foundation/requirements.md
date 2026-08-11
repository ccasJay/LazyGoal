# 最小 Goal-driven Loop 基础设施需求文档

## 简介

本阶段只为未来的长时间运行 Goal-driven Agent 建立最小核心。它负责表达 Goal 和 Run、一次推进一个状态，并提供简单的状态保存边界。

本阶段不实现完整 loop，也不调用 LLM 或 Tool。Runtime 生产代码由用户使用 TypeScript 手写；Agent 可以编写自动化测试用例，并继续维护 Spec 或提供用户明确请求的讲解和评审。

## 需求

### 需求 1：保持最小范围

**用户故事：** 作为项目作者，我希望第一版只包含 loop 最核心的概念，以便我能亲自理解和实现它。

#### 验收标准

1. 核心 Runtime 必须在 `main` worktree 中使用 TypeScript 实现。
2. Agent 不得创建或修改 Runtime 生产代码。
3. Agent 可以创建和修改自动化测试用例，但不得在测试文件中承载 Runtime 生产实现。
4. 核心 Runtime 不得依赖 LangChain、LangGraph 或其他 Agent loop 框架。
5. 本阶段不得实现自动连续运行的完整 loop、Planner、Tool Runtime、LLM 编排或多 Agent 协作。

### 需求 2：表达 Goal 与 Run

**用户故事：** 作为 Runtime 作者，我希望保存目标和当前运行状态，以便后续 step 知道自己正在完成什么。

#### 验收标准

1. 当创建 Goal 时，系统必须保存 Goal 标识、目标描述和完成条件。
2. 当创建 Run 时，系统必须保存 Run 标识、关联的 Goal、当前状态、step 计数和最近一次结果。
3. Run 必须支持 `created`、`running`、`waiting`、`completed`、`failed` 和 `cancelled` 状态。
4. Goal 和 Run 状态必须能够被序列化和恢复。

### 需求 3：一次只推进一个 step

**用户故事：** 作为 Runtime 作者，我希望核心逻辑一次只处理一个输入，以便状态转换保持简单、可测试。

#### 验收标准

1. 当 Runtime 接收当前 Run 状态和一个输入时，系统必须至多完成一次状态转换并返回。
2. 输入必须至少能够表达启动、step 结果、恢复和取消。
3. step 结果必须能够表达继续、等待、完成或失败。
4. 当 step 结果为继续时，Runtime 只能返回新的 `running` 状态，不得自行执行下一 step。
5. 当 step 结果为等待时，Runtime 必须进入 `waiting`，并能够在收到恢复输入后回到 `running`。
6. 当输入不符合当前状态时，Runtime 必须返回错误并保持原状态不变。
7. 状态转换核心不得直接执行 LLM、Tool、文件系统或网络 I/O。

### 需求 4：保存状态并验证核心行为

**用户故事：** 作为 Runtime 作者，我希望状态可以通过简单边界保存和加载，以便以后增加 checkpoint 与进程恢复能力。

#### 验收标准

1. Runtime 必须定义保存和加载 Run 状态的简单边界。
2. 具体存储方式必须与状态转换核心分离。
3. 自动化测试必须覆盖 `created → running → waiting → running → completed` 状态路径。
4. 自动化测试必须覆盖非法状态转换和状态保存、加载。
5. 核心测试不得依赖真实 LLM、Tool 或网络服务。

## 不在第一版范围内

- 自动连续执行的 loop
- 事件日志、事件重放和重复事件处理
- 原子 checkpoint 与崩溃恢复
- 完成证据校验和自动 Verifier
- step、时间、Token 或成本预算
- Planner、Replanner、Tool Runtime 和 Prompt 管理
- 并发、后台 Worker、分布式执行和多 Agent
- UI、监控平台与生产级存储
