---
status: delivered
created_at: 2026-10-17
delivered_at: 2026-10-17
---

# LLM 能力拆包与默认装配收敛 Spec

## 目标与范围

将现有 `packages/llm` 拆为五个可独立消费的私有能力包：`llm-core`、`llm-openai`、`llm-google`、`llm-pi-ai`、`model-catalog`。`llm` 仅保留默认 Adapter 工厂与阶段装配。调用契约、供应商实现、模型发现和默认实现选择分别拥有明确入口，消费者可以直接使用其中一种能力，无需经过默认装配或构造 Agent、Runtime 与 HTTP 服务。

`LLMConfig`、`LLMProvider`、`StructuredOutputMode` 和 `LLMConfigurationError` 的唯一定义由 `config` 迁入 `llm-core`；环境、TOML/Profile 解析、配置合并和校验行为仍归 `config`。`config` 改为单向依赖 core，供应商实现和模型目录不再依赖应用配置包。

迁移全部受影响的当前源码、测试、脚本、命令及构建引用，验证 goal-server、共享 Headless Composition Root、模型反思与 Context 评测的真实消费。保留现有请求、响应、流、strict 投影、用量、取消、错误分类、模型目录和配置行为；移除旧 LLM 实现路径与转发文件。

不新增 SDK、供应商、模型协议、重试、降级策略、后台服务、凭据来源、插件注册平台或发布机制；不升级供应商 SDK，不改变 Snapshot、Trajectory、工具授权或模型切换安全点，不迁移 Benchmark Runtime 装配。包保持 `packages/<pkg>` 扁平结构和当前源码消费方式，不引入分组层级或独立构建产物。

本 Spec 独立于 [Runtime 组件提炼](../runtime-sdk-extraction/spec.md)、[Agent 能力拆包](../agent-component-extraction/spec.md) 和 [进程组件提炼](../process-runtime-extraction/spec.md)。三者不是本轮实现前置，接入与验收归属见后文。

## 需求与验收标准

### 需求 1：能力经所属包独立消费

作为嵌入调用方，我希望直接取得调用契约、指定供应商实现或模型目录，而无需默认装配整套执行链。

- <a id="spec-req-1-1"></a>**验收标准 1.1**：当从五个能力包各自的 `src/index.ts` 消费其公开能力时，应能完成类型引用、直接构造指定 Adapter 或执行模型目录查询；不要求创建 Goal、Runner、工具注册表、HTTP 服务或默认工厂。
- <a id="spec-req-1-2"></a>**验收标准 1.2**：当消费者使用模型配置契约、调用模式、共享配置错误或归一化用量时，应从 `llm-core` 取得唯一实现或定义；Config 的解析错误、工厂配置错误和 pi-ai 配置错误使用同一 `LLMConfigurationError` 构造器，保留现有 code、name、missing 和消息语义。
- <a id="spec-req-1-3"></a>**验收标准 1.3**：当仅引用 core 或直接使用一个供应商包时，不应经 LazyGoal 的源码依赖链加载默认工厂、其它供应商适配包或应用配置加载器；core 不包含任何供应商 SDK 的运行时或类型依赖，供应商包之间不互相依赖。
- <a id="spec-req-1-4"></a>**验收标准 1.4**：当导入公共入口或构造 Adapter、工厂和目录实例时，不应读取隐式环境/凭据、发出网络请求、创建存储、注册宿主进程信号或退出进程；现有离线目录解析和构造失败保持，显式模型调用与目录查询才产生相应网络行为。

### 需求 2：默认装配与模型协议行为保持

作为现有消费者，我希望拆包后仍得到相同的 Adapter 选择与供应商请求。

- <a id="spec-req-2-1"></a>**验收标准 2.1**：当使用相同已校验配置调用 `createLlmAdapter`、`createLlmStageAdapters` 或 `createReflectionLlmAdapter` 时，应保持当前供应商、模型、端点、容量检查、实际输出模式和拒绝行为；阶段工厂继续固定 Think/Decide 选择，反思工厂保留当前原生优先规则。
- <a id="spec-req-2-2"></a>**验收标准 2.2**：当直接调用 OpenAI、Google 或 pi-ai Adapter 时，应保持消息角色、顺序、system 处理、工具定义、toolChoice、输出上限及 strict/prompt_only 参数映射；现有模式不匹配仍在派发前失败，不因拆包增加请求或自动改用其它模式。
- <a id="spec-req-2-3"></a>**验收标准 2.3**：当回传原生工具结果或公开 reasoning、continuation 时，应保持工具 callId、供应商/端点/模型/协议身份和已有原生载荷语义；不同身份仍按现有规则拒绝，正文与公开 reasoning 不混合，不新增对话格式或回放协议。
- <a id="spec-req-2-4"></a>**验收标准 2.4**：当使用既有 Gemini strict 契约或 pi-ai 消息与响应样本时，应保持 Schema 投影、nullable/required、哨兵恢复、证据处理、非法输出交付边界和 pi-ai 正常结束条件；不通过修改输出样本、放宽校验或重写基线掩盖语义变化。

### 需求 3：流、取消、用量与错误保持

作为调用与指标消费者，我希望拆包不会改变一次调用的观察结果或失败后果。

- <a id="spec-req-3-1"></a>**验收标准 3.1**：当使用现有 `generate` 或支持 `stream` 的 Adapter 时，应保持当前增量事件、完成响应、工具调用与 reasoning 的转换及返回条件；不凭空为未实现流接口的 Adapter 增加流，也不把部分输出伪装为完整成功。
- <a id="spec-req-3-2"></a>**验收标准 3.2**：当调用前、请求期间或返回后收到取消时，应保持现有信号传递、`ExecutionAbortedError` 身份和后续处理边界；调用组件只借用信号与依赖，不关闭宿主资源，不新增 Adapter 生命周期管理器。
- <a id="spec-req-3-3"></a>**验收标准 3.3**：当供应商返回可分类暂时故障、鉴权/额度错误或未知错误时，应保持现有暂时故障类型、分类、Retry-After 与原始错误传播；原生 SDK 内部重试保持关闭，适配包和 core 不自行重试、不重新制定 Runtime 的重试上限。
- <a id="spec-req-3-4"></a>**验收标准 3.4**：当原生供应商返回有效、缺失或非法用量时，应保持 `providerMetadata.usage` 的字段与缺省语义，缓存计数缺失仍省略；pi-ai 的非权威 `piUsage` 不转为正式用量，不以零或估算值填补缺失计数。
- <a id="spec-req-3-5"></a>**验收标准 3.5**：当 Agent、反思调用或 Context 评测读取归一化用量及调用结果时，应从 core 使用同一公共入口，保持原有累计、缺失调用计数、诊断与恢复事实的区分；供应商原始用量类型与提取函数分别归所属适配包，core 不为读取用量加载 SDK。

### 需求 4：模型目录独立且选择结果保持

作为模型选择调用方，我希望查询模型目录无需加载生成适配器，并保持现有选择与故障规则。

- <a id="spec-req-4-1"></a>**验收标准 4.1**：当从 `model-catalog` 调用现有目录工厂、查询接口或默认在线 Fetcher 时，应取得相同的模型描述、能力补全、来源标记、去重、排序与可选择性结果；不经 `llm` 工厂或供应商生成适配包，不拥有模型 Binding 或 Goal 状态。
- <a id="spec-req-4-2"></a>**验收标准 4.2**：当六类现有 Provider 在线发现、分页、超时或取消时，应保持各自端点、鉴权头、分页递进检查及默认 5000ms 共享查询期限；注入 Fetcher/fetch 的既有替换方式保持，不增加查询后台任务或缓存真相。
- <a id="spec-req-4-3"></a>**验收标准 4.3**：当发现端点不可用、超时或不支持时，应按当前规则使用静态目录/配置兜底；鉴权、权限、非法协议与取消继续明确失败，不扩大兜底范围，不泄露凭据、认证头或敏感响应正文。
- <a id="spec-req-4-4"></a>**验收标准 4.4**：当使用字符或 Token 预算模式、strict 模式或自定义兼容模型时，应保持当前分支的容量和可选择性判断；现有配置兜底与在线查询分支分别按原行为验证，不借拆包统一它们的差异或改变模型切换后的恢复规则。

### 需求 5：当前消费者与配置入口完整迁移

作为维护者，我希望当前运行入口全部消费新的权威位置，不保留隐藏旧路径或并行实现。

- <a id="spec-req-5-1"></a>**验收标准 5.1**：当环境、TOML/Profile、CLI 覆盖或 GEPA 双模型配置被解析时，`config` 应返回 core 的现有 `LLMConfig`，并保持字段值域、默认值、优先级和错误时机；`StructuredOutputMode` 保留三个既有值，不因迁移改变环境与 TOML 对 `two_stage` 的既有差异或直接构造器的已覆盖行为。
- <a id="spec-req-5-2"></a>**验收标准 5.2**：当 goal-server 与共享 Headless Composition Root 经现有装配执行确定性场景时，应消费所属包入口并保持模型执行、等待/恢复、模型切换和记录结果；旧 Agent 或已拆出的调用/执行包均不经 `llm` 门面取得底层契约，也不直接依赖具体供应商。
- <a id="spec-req-5-3"></a>**验收标准 5.3**：当运行当前反思桥、Context 评测、Worker、本地确定性测试及维护命令时，应不存在迁出能力的旧 LLM 路径或 Config 旧契约导出依赖；构建中实际引用的路径与资源一并迁移，不扩展 Benchmark 编排、评分或远程调用协议。
- <a id="spec-req-5-4"></a>**验收标准 5.4**：当迁移完成后，`llm/src/index.ts` 应只提供三个默认工厂和自有阶段装配结果类型，不转导出 core、供应商或目录能力；原 core、Adapter、目录和旧工厂路径均不留兼容转发。当前消费者直接改为所属入口，历史 Spec、Memory 与明确的历史基线不批量重写。

### 需求 6：目录、依赖与验证发现受到约束

作为维护者，我希望机器能识别禁止依赖、SDK 泄漏、入口穿透与漏扫，且组件独立性有实际调用证据。

- <a id="spec-req-6-1"></a>**验收标准 6.1**：当五个新包加入仓库时，应各有私有 manifest、`src/index.ts`、所属模块说明及适用测试；OpenAI、Google、pi-ai 运行依赖归实际消费者，保持当前版本约束及 pi-ai 锁定版本，core 和 config 的生产依赖不直接或经新 LLM 包间接加载供应商 SDK。
- <a id="spec-req-6-2"></a>**验收标准 6.2**：当出现禁止包依赖、core 的供应商 SDK 类型/运行时引用、跨能力包生产入口穿透、旧路径转发或项目旧产物引用时，依赖检查应定位失败；覆盖普通/类型 import/export、import 类型表达式、侧效导入和字面量 dynamic import，保留其它 Spec 已有约束。
- <a id="spec-req-6-3"></a>**验收标准 6.3**：当在无项目旧生成产物的临时源码副本执行组件及消费者验证时，应解析当前源码并实际发现新包测试；直接调用一个供应商包、core 的替身 Adapter 和独立目录查询均有可观察结果，不能只以目录存在、类型通过或测试总数证明拆分完成。
- <a id="spec-req-6-4"></a>**验收标准 6.4**：当公共契约及职责位置变化时，应同步中文契约 TSDoc、最小示例、各包 README/overview/semantics、根导航和仓库布局；现有类型、依赖、文档和确定性回归覆盖新目录。付费 smoke 继续显式触发，未执行不报告真实供应商验证通过。

## 架构与核心决策

### 包角色与允许依赖

下表列出各包允许的 LazyGoal 出站目标；只在实际需要时导入，不因允许关系预建接线。Node 内置模块与所属第三方依赖另按实际用途引入。

| 包 | 唯一职责 | 允许的 LazyGoal 依赖 |
| --- | --- | --- |
| `llm-core` | 请求/响应/流、Adapter、共享模型配置和错误、归一化用量读取、现有无 SDK 的暂时故障分类 | `contracts`、`model-contracts`、`execution-control` |
| `llm-openai` | 当前 OpenAI/OpenAI-compatible 原生 Chat Completions 映射、对话身份与用量提取 | `llm-core`、`model-contracts`、`execution-control` |
| `llm-google` | 当前 Gemini 原生生成、Schema 投影与恢复、对话身份及用量提取 | `llm-core`、`contracts`、`model-contracts`、`execution-control` |
| `llm-pi-ai` | 当前 pi-ai prompt_only Adapter、离线模型解析与增量转换 | `llm-core`、`execution-control` |
| `model-catalog` | 目录契约、在线发现、静态能力补全、排序与可选择性判断 | `llm-core` |
| `llm` | 三个既有默认工厂与阶段 Adapter 对装配 | `llm-core`、`llm-openai`、`llm-google`、`llm-pi-ai` |
| `config` | 既有 Home、环境/TOML/Profile 解析、配置合并与校验 | `llm-core` |

```text
应用装配 / 评测入口 → config → llm-core
应用装配 / 反思工厂调用方 → llm → 三个供应商适配包 → llm-core
模型选择调用方 → model-catalog → llm-core
Agent 请求 / 调用 / 响应 / 执行组件 → llm-core
```

core 不导入 config、llm 门面、供应商实现、目录、Agent、Runtime、Storage、应用或任何供应商 SDK。供应商包不互相依赖，不导入目录、config 或 llm。目录可以直接使用当前 pi-ai 静态目录 SDK，不能通过 `llm-pi-ai` 获得目录；两者共同消费同一锁定版本，不复制静态模型数据、不新建目录注册平台。

`llm` 不依赖 `model-catalog` 或 `config`，只接收显式配置完成默认选择。具体模型选择与切换仍由宿主协调；生成模型工厂不自动发起在线发现。现有底层调用方迁移到 core；仅默认装配调用方依赖 llm，独立适配消费者依赖目标供应商包。

### 源码与公共入口归属

以下路径是当前迁移来源，能力迁移后只保留一份实现；目标包内部文件名由 Plan 按依赖组织，跨包统一经 `src/index.ts` 消费。

| 目标 | 当前来源与迁移内容 |
| --- | --- |
| `llm-core` | `llm/src/core/adapter.ts`、`types.ts`、`model-request-failure.ts`；`core/usage.ts` 中 `NormalizedUsage`、通用数值守卫与 `readNormalizedUsage`；`config/src/llm-config.ts` 中 `LLMConfig`、`LLMProvider`、`StructuredOutputMode`、共享配置错误及其必要内部类型 |
| `llm-openai` | `llm/src/openai-compatible.ts`，以及 `core/usage.ts` 的 OpenAI 原始用量提取与 SDK 类型 |
| `llm-google` | `llm/src/gemini.ts`，以及 `core/usage.ts` 的 Gemini 原始用量提取与 SDK 类型 |
| `llm-pi-ai` | `llm/src/pi-ai.ts`；保留现有 `PiAiProviderError`，不扩大为其它供应商的共同错误 |
| `model-catalog` | `llm/src/model-catalog.ts`、`provider-fetchers.ts`；目录错误、描述类型、Fetcher 契约与静态补全均在本包内 |
| `llm` | 重建 `src/index.ts` 与默认装配实现，保留三个现有工厂函数及其自有 `LlmStageAdapters` 契约 |
| `config` | 保留 `readLLMConfig` 与其它加载/解析实现，改为导入 core 契约；移除已迁出类型与错误的旧导出，所有当前读取者改引实际所有者 |

`llm/src/adapter.ts` 的类型门面和迁出文件删除，不以原路径重导出规避迁移。新包入口只暴露真实调用方所需能力；供应商原始用量转换若无独立消费者可留在包内，不为搬迁而扩大公共 API。core 共享数值规则由供应商提取及通用读取复用，不把 SDK 类型藏在条件类型、声明文件或间接转导出中。

供应商无关的消息、原生身份与 continuation 继续引用 `model-contracts`，JSON/Schema 类型继续归 `contracts`；不在 core 复制对话或决策协议。暂时故障与取消错误身份仍归 `execution-control`，core 只拥有既有分类算法，不建立第二套故障类型或重试规则。分类实现的实际匹配行为及现有测试作为迁移对照，不借拆包修改注释与实现之间的既有差异。

### 配置契约与默认选择

共享连接配置是无 I/O 的数据契约，迁入 core 不表示 core 读取环境或承担配置加载。保留字段、判别联合、三个模式值及错误构造参数；`LLMConfigurationError` 只有一个类定义，解析器、工厂与 pi-ai 直接引用同一入口，不增加兼容子类。

`two_stage` 继续是现有配置与工厂策略值，阶段工厂将其落实为实际 Adapter 选择。本轮不收窄既有构造参数类型、不新增直接构造器模式拒绝；尤其保留 [Gemini 已覆盖的直接 two_stage 行为](../../packages/llm/test/gemini.test.ts)，避免将注释中的阶段解释误当成新行为规范。环境和 TOML 对部分供应商 two_stage 的现有接受差异也保持，由 [Config](../../packages/config/notes/overview.md) 与 [阶段配置测试](../../packages/llm/test/two-stage-config.test.ts) 对照。

| 工厂 | 保留的默认行为 |
| --- | --- |
| `createLlmAdapter` | prompt_only 使用 pi-ai；原生 strict 使用当前 OpenAI/Google 实现；two_stage 按供应商选择对应 Decide 模式，不支持的显式 strict 仍拒绝 |
| `createLlmStageAdapters` | 同一选择构造 Think/Decide 对；Think 固定 prompt_only，Decide 对原生供应商固定 strict，其余固定 prompt_only；具体原生/网关选择保持当前分支 |
| `createReflectionLlmAdapter` | OpenAI/OpenAI-compatible/Google 优先当前原生实现，其余复用现有默认适配；不引入新供应商或网络目录校验 |

`llm` 的公共参数继续使用 core 的 `LLMConfig`；不重新导出这些类型。`LlmStageAdapters` 是装配结果的自有契约，可保留其公开导出。默认工厂无需新建注册器、插件配置或统一客户端类。

### 供应商与目录的行为对照

OpenAI SDK、Google SDK 分别由所属适配包声明；pi-ai 由 `llm-pi-ai` 和实际使用静态目录的 `model-catalog` 声明，沿用现有版本及锁文件策略。`llm` 不再直接声明三种生成 SDK；验证源码模块加载边界，不将“拆为包”宣称为已具备独立 npm 安装、发布或全部第三方传递依赖隔离。

生成调用保持现有 schema/工具请求映射、SDK 重试设置、异常分类、取消及身份规则。Gemini 的 Provider 特定 Schema 转换留在 `llm-google`，Agent 的业务输出解码继续归现有 Agent 或 `model-response`；目录对可选择性的判断不取得模型输出校验职责。pi-ai 的内部流聚合和已公开的可选流接口分别保持，不引入通用事件总线。

目录的默认工厂继续创建默认在线 Fetcher；直接构造目录时省略 Fetcher 的既有离线路径也保留。目录描述、错误和 Fetcher 契约由目录包统一拥有，避免默认 Fetcher 与目录实现互相穿透公共入口形成循环。目录与 Adapter 使用同一 SDK 版本不意味着共享可变模型注册表，不引入全局模型客户端或跨实例缓存。

### 消费迁移与跨 Spec 验收归属

| 当前消费位置 | 本轮迁移责任 |
| --- | --- |
| [goal-server 装配](../../apps/goal-server/src/composition-root.ts) 与 CLI | 配置读取仍从 config；共享契约/错误改引 core；默认工厂从 llm；目录从 model-catalog；保留模型切换安全点、Snapshot 先保存后发布 Binding 和恢复失败规则 |
| [Headless Composition Root](../../benchmarks/src/headless-composition-root.ts)、LLM RPC 与各评测 CLI | 迁移 LLM 类型、工厂和用量读取，保留实际 Adapter 注入、调用包装、远程协议、记录及现有评测控制 |
| [反思桥](../../benchmarks/src/prompt-evaluation/reflection-bridge.ts) 与 Context 评测 | 分别消费 llm 工厂与 core 契约/用量读取；配置仍由 config 加载，不修改 GEPA 预算或付费操作授权 |
| 当前 Agent 或九个新 Agent 能力包 | 只迁移所需 core 引用和依赖规则；默认生成实现选择仍由应用装配负责，不让请求、响应或单次调用包依赖具体供应商 |
| 当前测试、维护脚本、Worker 构建和入口命令 | 按实际引用迁移，保留命令语义、测试断言、既有派生资源构建与发现规则 |

本轮可在前三份 Spec 实施前或后接入：若 Agent 九包尚未存在，迁移现有 Agent 引用；若已存在，迁移其实际消费包。相同组件不保留两套路径适配。Agent Spec 负责请求/调用/响应/执行的提炼与默认执行器，本 Spec 负责它们所消费的底层 LLM 契约与供应商实现；本轮批准后，相关 LLM 契约依赖按本 Spec 改引 core，不改变 Agent 的行为与其它能力依赖。

Runtime Spec 拥有无界面装配、受理和关闭，Process Spec 拥有进程启动/输出/清理。本 Spec 只调整当时实际装配位置的模型导入、工厂引用与目录引用，保留已有生命周期和进程接线；不移动整个组合根，不以模型取消测试代替 Runtime 的有界关闭验收。共享依赖门、导航和锁文件增量维护，保留其它 Spec 的条目，不自动创建联合编排或修改已批准的三份文件。

### 独立调用与验证方式

| 场景 | 输入与可观察结果 | 独立性要求 |
| --- | --- | --- |
| core 消费 | 用 core 类型实现确定性 Adapter，读取正常/缺失用量并分类既有故障样本 | 无供应商 SDK 类型或模块加载，不构造应用 |
| 指定供应商 | 经目标包入口构造 Adapter，以现有 SDK 替身或本机模拟端点捕获请求与最终响应 | 不加载其它 LazyGoal 供应商包或默认工厂；保留正常、拒绝、取消及原生回传断言 |
| 独立目录 | 注入现有 Fetcher/fetch 查询多页结果，验证补全、兜底和明确失败 | 不构造生成 Adapter、Binding 或 Goal，不访问真实 Provider |
| 默认装配 | 相同配置经三个工厂得到既有模式与实现，和直接构造路径对照请求/结果 | 构造不发请求，不新增全局客户端或默认配置读取 |
| 真实消费者 | goal-server、Headless、反思桥和 Context 用受控响应验证执行与记录 | 保留宿主既有恢复、权限、付费授权和调用次数规则 |

现有单供应商测试归对应包，目录测试归目录包，共享分类/用量测试归 core；跨供应商对话、默认工厂及配置集成测试可留在 llm 或相应消费者的 `test/`，不为测试分组额外建包。`llm/src/smoke-test.ts` 的可执行入口移出公共源码到测试/脚本位置，提供更新后的显式运行路径；现有付费 smoke 命令仍可被操作方主动运行，dotenv、进程信号和输出留在这些宿主入口，不能随库导入执行。

验证沿用当前 `npx tsc --noEmit`、受影响应用/评测类型检查、`npm run check:dependencies`、`npm run check:docs` 与 `npm test`；Plan 再定义具体任务与 Feature Verification。根回归当前按 `packages/<pkg>/test/` 发现测试，新增包须有实际发现证据。AST/模块引用检查复用现有检查入口，覆盖承诺的类型和运行时引用形式，并用合法/违规小工程验证；包内单元测试和跨包消费测试的入口约束分别处理。

源码验证在不含项目 dist/lib/build 的临时副本进行，保留必要第三方依赖，不删除用户目录。构建消费者若实际依赖迁移路径，另验证当前本地打包入口；不新增发布产物要求。只运行确定性测试与本机受控端点，不默认调用真实模型、线上目录、真实 Benchmark 或 GEPA；未运行真实供应商 smoke 时保留该限制。

## 曾考虑的备选方案

| 备选方案 | 未采用的原因 |
| --- | --- |
| 仅在 llm 内建立子目录 | 不能形成用户要求的独立包与供应商依赖归属，默认装配仍与底层能力共处一个消费单元 |
| 本轮只拆 core 和目录 | 迁移较小，但供应商实现与 SDK 依赖仍集中；已确认本轮按完整职责拆分 |
| 共享类型与错误留在 config | 可以维持 config 零出站依赖，但底层 Adapter/目录继续依赖应用配置包；改为 config 单向消费无 I/O 的 core 契约 |
| core 保留整份 usage.ts | 该文件引用两种供应商 SDK 类型，会让通用用量读取继续携带供应商依赖；按统一表示与供应商提取分别归属 |
| 每个 pi-ai Provider、Fetcher 或 Schema 转换各建包 | 当前分别属于同一 Adapter 或目录职责，没有独立消费与演化需求；会增加组合与依赖维护成本 |
| model-catalog 通过 llm-pi-ai 取得静态目录 | 将模型发现绑到生成适配实现；直接消费同一锁定 SDK 保持独立，不建立重复模型数据真源 |
| llm 或 config 为旧契约路径统一转导出 | 隐藏真实所有者并延长迁移；当前为私有开发期包，已确认统一迁移当前消费者 |
| 随拆包统一模式、重试、目录兜底或更换 SDK | 改变可观察模型行为并扩大验证范围；本轮仅迁移职责与依赖，以原行为对照判定完成 |

## 风险与否定性保证

- **风险等级：高。** 迁移覆盖生成、配置、模型发现、Web 与多个评测入口；风险主要是广泛引用、共享错误身份、原生续接及隐式依赖。通过迁移前对照、所属包测试、真实消费者确定性验证与依赖门限制影响，不以包数量作为成功证据。
- **类型位置不等于行为重设计。** 保留共享配置的字段和值域、错误身份及直接构造器现有覆盖，不收窄 two_stage 或顺带修正配置分支差异。旧数据与协议版本不变，不增加历史兼容和迁移机制。
- **依赖泄漏与循环。** Config 单向依赖 core，core 不反向引用解析器或通过类型表达式引入 SDK；新包之间的公共入口不能形成实现重导出循环。SDK 版本、安装位置和锁文件须按当前实际依赖方式同步，不声称未经验证的独立安装与发布能力。
- **供应商行为与用量可信度。** 保持请求与原生身份、错误/取消、Gemini 投影和 pi-ai 用量限制；不伪造完成证据、有效响应、缓存命中或正式计数，不为异常静默换模型或降级。
- **凭据与外部副作用。** 连接配置仍由宿主提供，不进入 Goal/Trajectory 或因新增日志暴露；目录脱敏与现有诊断边界保持。Spec 与确定性验收不授权付费调用、线上目录查询或真实评测，不访问用户 Goal 数据。
- **跨 Spec 修改与批准。** 本 Spec 不要求前三份 Spec 交付，不接管其验收，不授权执行或联合编排它们。只在实际消费位置迁移 LLM 依赖，保留其它已存在接线；若发现必须改变其非 LLM 契约才能完成，应先修订受影响 Spec，而不是扩大本轮实现。
