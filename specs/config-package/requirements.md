# Config 拆包需求

## 引言

将 LazyGoal Home 与 workspace 路径、TOML/Profile 解析及应用配置加载迁入独立的 `@lazygoal/config`，使这些能力有明确所有者，并由 `@lazygoal/llm` 单向消费已校验的模型连接配置。本次拆包保持现有路径、安全、配置优先级、模型接入和 GEPA 双模型行为，不引入新的配置格式或数据迁移。

## 需求

### 需求 1：独立使用配置能力

**用户故事：** 作为启动入口和 Benchmark 的维护者，我希望直接使用配置包解析 Home 路径与运行配置，以便无需通过模型适配包取得应用配置能力。

#### 验收标准

1. <a id="req-1-1"></a> 当调用方需要 LazyGoal Home 路径、workspace 路径或配置解析能力时，必须能够从 `@lazygoal/config` 获取这些能力，而无需导入 `@lazygoal/llm`。
2. <a id="req-1-2"></a> 当 `@lazygoal/llm` 构造 Adapter 或查询模型目录时，必须能够使用配置包提供的模型连接配置；配置包不得依赖 `@lazygoal/llm`，两包之间不得形成循环依赖。
3. <a id="req-1-3"></a> 拆包完成后，生产调用方必须使用迁移后的单一配置定义与加载入口；`@lazygoal/llm` 不得继续拥有另一套 Home、TOML、Profile 或应用配置加载实现。

### 需求 2：保持 Home 与 workspace 身份语义

**用户故事：** 作为多 workspace 用户，我希望拆包后继续使用同一 Home 和隔离目录，以便现有运行记录仍按原有身份定位。

#### 验收标准

1. <a id="req-2-1"></a> 当 `LAZYGOAL_HOME` 缺失或为空白时，系统必须继续使用当前用户 Home 下的 `.lazygoal`；当提供非空覆盖值时，必须继续要求绝对路径，且 `XDG_CONFIG_HOME` 不改变解析结果。
2. <a id="req-2-2"></a> 当解析 workspace 路径时，系统必须继续以 `realpath(workspaceRoot)` 确定稳定 workspace 身份与现有目录位置；单纯解析路径不得创建文件或目录。
3. <a id="req-2-3"></a> 当创建或读取 workspace 身份清单时，系统必须保持现有格式、原子创建、根路径匹配与损坏时拒绝使用目录的行为，不得把身份不匹配的运行数据用于当前 workspace。
4. <a id="req-2-4"></a> 当启动入口创建或修正 Home、workspace 目录及敏感配置文件时，必须保持现有 POSIX 权限行为；拆包不得改变 Goal、Trajectory、Trace、指标、Benchmark、GEPA 与缓存的默认位置，也不得触发旧数据迁移。

### 需求 3：保持配置读取与错误行为

**用户故事：** 作为配置文件使用者，我希望拆包后相同输入仍产生相同的运行配置和错误，以便现有 CLI 与自动化入口无需改变配置方式。

#### 验收标准

1. <a id="req-3-1"></a> 当读取 `config.toml` 与用户 Profile 时，系统必须继续识别当前支持的 `[llm]`、`[workspace]`、`[profile]`、`[tui]`、`[gepa]` 小节及现有 Profile 字段，并保持当前解析、校验与错误定位行为。
2. <a id="req-3-2"></a> 当生成运行配置时，系统必须继续按“内置默认值 → `config.toml` → `profiles/<profile>.toml` → CLI 临时覆盖”的顺序合并；CLI 覆盖只在本次进程内生效，不写回配置文件。
3. <a id="req-3-3"></a> 当调用方仅提供显式环境变量中的模型配置时，系统必须继续支持现有读取入口、供应商与输出模式校验，并产生可供同一 Adapter 工厂使用的配置。
4. <a id="req-3-4"></a> 当 TOML、Profile、必填凭据、供应商、输出模式或端点配置非法时，系统必须保持现有失败时机、错误类别和关键诊断信息，不得静默切换配置来源或模型供应商。

### 需求 4：保持模型与 GEPA 装配结果

**用户故事：** 作为 Goal 与 GEPA 的操作者，我希望配置所有权迁移不改变模型选择和双模型隔离，以便启动及恢复沿用现有执行语义。

#### 验收标准

1. <a id="req-4-1"></a> 当 Goal Server、Benchmark 或 Prompt Evaluation 装配模型时，相同配置输入必须继续选择相同的供应商、模型、端点与输出模式；Adapter 的请求、取消及错误处理行为不得因拆包改变。
2. <a id="req-4-2"></a> 当加载 GEPA 双模型配置时，Working LM 必须继续固定使用 `profiles/default.toml`，Reflection LM 必须继续使用 `[gepa].reflection_profile` 指定的独立 Profile，并固定为 `prompt_only`。
3. <a id="req-4-3"></a> 当 Reflection Profile 缺失、与 Working Profile 同名或配置非法时，系统必须继续在模型调用前失败，不得回退到活动 Profile 或共用 Working LM 凭据。
4. <a id="req-4-4"></a> 拆包不得改变 CLI 配置参数、当前配置文件与 workspace manifest 格式，也不得改变 Goal Snapshot 或其他运行数据格式。

## 风险与待确认

- 风险等级：high；理由：配置包含模型凭据，Home 路径和 workspace 身份决定持久化数据的寻址与隔离，且迁移涉及多个启动入口及公开类型。
- 关键操作：无；本 Spec 不授权删除或迁移用户数据，也不要求修改已有 Home 内容。
- 已知风险：配置类型迁移可能引入 `config ↔ llm` 循环依赖；路径、权限、错误类别或配置覆盖顺序的变化可能使现有数据不可见或改变启动结果；GEPA 双模型配置若共用加载状态可能破坏凭据隔离。
- 待确认：无；配置类型的具体归属、调用方迁移顺序与验证方式由 Design 阶段确定。
