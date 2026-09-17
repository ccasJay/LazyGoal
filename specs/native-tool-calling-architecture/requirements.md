# 原生双通道工具调用架构 需求

## 审批摘要

### 目标

将 LazyGoal 的模型交互机制从全量顶层 JSON Envelope 重构为原生双通道（Dual-Channel）工具调用体系，在单次网络往返（1 RTT）内实现自然语言自由推演与强 Schema 约束动作调用，彻底废除 `strict`、`prompt_only` 和 `two_stage` 模式的显式配置。

### 范围

- 包含：
  - 双通道 LLM 请求与响应协议（自然语言文本通道与结构化工具调用通道解耦）；
  - 全阶段系统决策动作函数化（包含执行阶段 complete/wait/fail/lookup 与准备阶段 question/ready/proposal/probe）；
  - 主流 Provider（OpenAI/Gemini/Anthropic）原生 Function Calling / Tool Use 映射；
  - 思考链（Thinking/CoT）独立入轨与 TUI Transcript 实时流式直出；
  - 删除 `LLM_STRUCTURED_OUTPUT_MODE` 配置与环境变量，全系统自适应开箱即用。
- 不包含：
  - 不修改 Runtime 领域状态机的不可变状态模型与断点恢复逻辑；
  - 不引入单步内多个工具的并发乱序执行；
  - 不改变 TUI 既有的键盘操作与交互抽屉呈现形式。

### 核心行为

- 推进单步决策时，系统在单次网络往返（1 RTT）内同时接收思考文本与工具调用，不再发起第二阶段提取调用。
- 执行阶段与准备阶段的所有决策分流（包括工具调用、只读探测、状态完结与用户提问）均通过挂载受控的系统函数向模型提供。
- 模型在自由文本通道输出的思考内容直接接入流式渲染与 Trajectory 事件流，动作参数严格经由 Contract AST 反序列化。
- 用户仅需配置模型凭据即可启动运行，环境配置与会话快照中不再包含或要求结构化输出模式字段。

### 风险与待确认

- 风险等级：high；理由：涉及 LLM 适配器、Contracts 契约体系及 Agent 单步执行循环的协议级重塑。
- 关键操作：无
- 风险：不同 Provider（尤其 Gemini 与 Anthropic）在 Function Calling 的参数规范与严格模式支持上存在细微方言差异，需由 Adapter 抹平。
- 待确认：无

## 引言

LazyGoal 当前采用将整个决策塞入单一 JSON 封包的设计，导致语法机（CFG）约束在锁死 JSON 格式的同时扼杀了模型的自然语言思考缓冲，进而被迫引入了 `two_stage`（2 RTT 延迟惩罚）与多模式并存的用户配置地雷。本项目旨在对标 OpenAI Codex 等成熟代码 Agent 体系，构建自由思维流与原生 Tool Calling 解耦的双通道架构，恢复 1 RTT 高效推理并实现彻底的开箱即用。

## 需求

### 需求 1：双通道交互协议与 1 RTT 单步决策

**用户故事：** 作为开发者，我希望 Agent 在每一步推进时仅发起 1 次网络请求，以便大幅降低等待延迟并节省 Token 消耗。

#### 验收标准

1. <a id="req-1-1"></a> 当发起单步推进请求时，系统必须向模型同时声明自由文本输出通道与具备参数 Schema 约束的工具集合。
2. <a id="req-1-2"></a> 当模型返回响应时，系统必须允许响应同时包含文本通道内容（自然语言思考/规划）以及 0 个或 1 个规范工具调用。
3. <a id="req-1-3"></a> 当模型在单次请求中完成思考并产生工具调用时，系统必须直接进入动作校验与执行，严禁发起额外的第二阶段抽取调用。
4. <a id="req-1-4"></a> 当模型仅返回文本思考而未产生任何工具调用时，系统必须将其归类为合法的决策缺失协议异常并给出明确诊断。

### 需求 2：全阶段系统决策动作函数化

**用户故事：** 作为 Agent 运行时，我希望所有的阶段转移与外部操作都统一为结构化工具调用，以便消除顶层 JSON 联合分支与特异字段清洗逻辑。

#### 验收标准

1. <a id="req-2-1"></a> 如果处于执行阶段（Executing），系统必须向模型提供已授权的业务工具，以及代表终态或挂起的内置系统函数（`task_complete`、`wait_for_input`、`fail_goal`、`context_lookup`）。
2. <a id="req-2-2"></a> 如果处于需求收集阶段（Gathering），系统必须向模型提供阶段专有的内置系统函数（`ask_clarification`、`context_ready`、`context_lookup` 以及只读探测 `probe_action`）。
3. <a id="req-2-3"></a> 如果处于方案规划阶段（Planning），系统必须向模型提供阶段专有的内置系统函数（`propose_task_plan`、`context_lookup` 以及只读探测 `probe_action`）。
4. <a id="req-2-4"></a> 当模型调用任意内置函数或业务工具时，系统必须通过 `@lazygoal/contracts` 静态 AST 对参数进行确定性反序列化与严格契约校验。

### 需求 3：多 Provider 原生 Function Calling 统一驱动

**用户故事：** 作为平台维护者，我希望主流大模型服务均通过官方原生 Tool Calling 机制驱动，以便获得最高的厂商格式兼容性与速度。

#### 验收标准

1. <a id="req-3-1"></a> 当配置为 OpenAI 或 OpenAI 兼容 Provider 时，适配器必须通过原生 `tools` 列表提供函数定义，并开启参数 `strict: true` 与 `tool_choice: "required"`。
2. <a id="req-3-2"></a> 当配置为 Google Gemini Provider 时，适配器必须通过官方 `functionDeclarations` 挂载工具，并设置 `toolConfig` 强制函数调用模式。
3. <a id="req-3-3"></a> 当配置为 Anthropic 或其他第三方 Provider 时，适配器必须通过官方原生工具协议或 pi-ai tool-use 映射保证单次交互。
4. <a id="req-3-4"></a> 当使用原生推理模型（如 DeepSeek R1、OpenAI o-series、Claude Thinking）时，适配器必须完整捕获其原生产生的思考流，严禁对其重复施加额外阶段强制推演。

### 需求 4：思考流独立入轨与终端流式直出

**用户故事：** 作为终端用户，我希望在交互界面上实时看到 Agent 边推演边决策的动态过程，以便清楚掌握 Agent 的执行意图。

#### 验收标准

1. <a id="req-4-1"></a> 当模型在文本通道流式输出思考内容时，系统必须将思考增量实时同步至 TUI 流式 Transcript 控制器进行终端渲染。
2. <a id="req-4-2"></a> 当单步决策完成提交时，系统必须将完整的思考文本作为结构化审计属性记录入 Trajectory 的决策事件中。
3. <a id="req-4-3"></a> 当思考内容被安全截断或模型未输出思考时，系统必须保证轨迹回放与快照恢复具备完全的向下兼容性。

### 需求 5：废除结构化输出模式显式配置

**用户故事：** 作为用户，我希望启动配置尽可能极简，无需理解或手动切换任何复杂的底层结构化输出模式。

#### 验收标准

1. <a id="req-5-1"></a> 当用户在 `config.toml` 中配置模型时，系统不得要求用户填写 `structured_output_mode` 字段。
2. <a id="req-5-2"></a> 当系统加载配置或环境变量时，必须彻底移除对 `LLM_STRUCTURED_OUTPUT_MODE` 的校验与报错逻辑。
3. <a id="req-5-3"></a> 当生成或校验 Goal 持久化快照时，快照契约不得强制依赖具体的输出模式枚举，实现对历史快照的无缝平滑兼容。

