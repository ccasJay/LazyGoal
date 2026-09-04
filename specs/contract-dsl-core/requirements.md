# Contract DSL Core 需求

## 引言

本特性为 LazyGoal 提供独立的结构契约 DSL 内核，使同一份不可变 Contract 定义能够推导 TypeScript 类型、校验未知 JSON 输入并导出确定性 JSON Schema，同时不改变现有模型、Tool、Runtime 或持久化协议行为。

## 需求

### 需求 1：统一声明与静态类型推导

**用户故事：** 作为协议维护者，我希望通过单一 Contract 定义同时描述 JSON 结构和 TypeScript 类型，以便后续协议无需维护相互独立的 Schema 与类型副本。

#### 验收标准

1. <a id="req-1-1"></a> 当调用方使用公开 Contract builder 组合受支持的 primitive、literal、enum、object、array、record、union 或递归结构时，系统必须产生可供校验和 Schema 导出的同一份 Contract 定义。
2. <a id="req-1-2"></a> 当调用方对 Contract 使用 `InferContract` 时，TypeScript 必须推导出与必填、optional、nullable、集合和联合分支一致的只读类型。
3. <a id="req-1-3"></a> 当 Contract 创建完成后，调用方对构造参数或返回节点的后续修改不得改变该 Contract 的校验或导出结果。
4. <a id="req-1-4"></a> 当调用方查看公共 API 时，系统不得提供 transform、coerce、default、refine 或其他无法等价导出为受支持 JSON Schema 的规则入口。

### 需求 2：严格解析与输入隔离

**用户故事：** 作为外部 JSON 的消费者，我希望 Contract 严格校验未知输入并返回隔离副本，以便已校验数据不会受原始输入后续修改影响。

#### 验收标准

1. <a id="req-2-1"></a> 当输入符合 Contract 时，`safeParse` 和 `parse` 必须返回结构与值保持一致的独立深复制结果，且不得修改原始输入。
2. <a id="req-2-2"></a> 当输入包含字符串、数值、数组或对象约束时，系统必须校验声明的长度、范围、整数和 pattern 限制。
3. <a id="req-2-3"></a> 当输入对象包含 Contract 未声明的字段时，严格 object 必须拒绝该输入；只有显式 record 才能接受满足 value Contract 的动态键。
4. <a id="req-2-4"></a> 当输入需要 trim、类型转换、默认值或其他规范化才能合法时，系统必须保持原值并拒绝不符合 Contract 的输入，不得静默转换。

### 需求 3：联合与递归结构

**用户故事：** 作为复杂协议的定义者，我希望 DSL 能安全表达互斥分支和递归 JSON 结构，以便后续模型与持久化协议可以复用同一内核。

#### 验收标准

1. <a id="req-3-1"></a> 当 discriminated union 收到已知 discriminator 时，系统必须只按对应分支校验，并在 discriminator 未知时拒绝输入。
2. <a id="req-3-2"></a> 当普通 union 收到输入时，只要至少一个分支完全合法，系统必须接受该输入；所有分支均不合法时必须返回联合失败。
3. <a id="req-3-3"></a> 当 Contract 使用合法递归引用时，系统必须能够校验对应的有限 JSON 数据并导出可解析的引用关系。
4. <a id="req-3-4"></a> 当 Contract 含有重复定义、悬空引用或非法递归声明时，系统必须在使用该 Contract 时返回可识别的配置错误，不得无限递归或产生不完整 Schema。
5. <a id="req-3-5"></a> 当输入对象自身形成循环或超过固定校验深度时，系统必须有界失败，不得发生无限递归或进程崩溃。

### 需求 4：稳定且有界的校验诊断

**用户故事：** 作为 Contract 调用方，我希望校验失败提供稳定、可定位且有界的诊断，以便不同协议消费者可以一致处理错误。

#### 验收标准

1. <a id="req-4-1"></a> 当输入不合法时，`safeParse` 必须返回失败结果和 `ContractIssue` 集合，不得因普通数据错误抛出异常。
2. <a id="req-4-2"></a> 当输入不合法时，`parse` 必须抛出稳定的 Contract 校验错误，并携带与 `safeParse` 一致的 issues。
3. <a id="req-4-3"></a> 每个 `ContractIssue` 必须提供稳定 code 和从根输入开始的字段或数组索引 path；调用方不得需要解析 message 才能分类错误。
4. <a id="req-4-4"></a> 当同一 Contract 校验同一输入时，issues 的内容与顺序必须保持确定性。
5. <a id="req-4-5"></a> 当单次输入产生大量错误时，系统必须限制 issues 数量，并明确表示诊断已达到上限。

### 需求 5：确定性 JSON Schema 导出

**用户故事：** 作为协议集成者，我希望 Contract 能导出标准且稳定的 JSON Schema，以便后续 Provider 和工具链消费同一结构事实源。

#### 验收标准

1. <a id="req-5-1"></a> 当调用方使用 `compileJsonSchema` 时，系统必须为受支持 Contract 生成符合 JSON Schema 2020-12 语义的 JSON 数据。
2. <a id="req-5-2"></a> 当相同 Contract 被重复导出时，字段、required 列表、联合分支和定义的顺序必须保持确定性。
3. <a id="req-5-3"></a> 当 Contract 包含严格 object、optional、nullable、record、union 或递归引用时，导出结果必须保持与本地校验等价的结构约束。
4. <a id="req-5-4"></a> 对受支持子集的同一组合法与非法 fixture，自研校验器和独立 JSON Schema oracle 必须给出一致的接受或拒绝结论。

### 需求 6：独立引入与现有行为隔离

**用户故事：** 作为 LazyGoal 维护者，我希望 Contract DSL Core 能作为独立基础能力引入，以便后续分阶段迁移而不提前改变现有协议。

#### 验收标准

1. <a id="req-6-1"></a> 当其他 LazyGoal package 使用 `@lazygoal/contracts` 时，该包不得要求导入 Runtime、Agent、Storage、Tools、LLM 或 TUI 的实现。
2. <a id="req-6-2"></a> 当 Contract DSL Core 被安装用于生产运行时，系统不得依赖 Zod、TypeBox、Ajv 或其他外部结构校验器；独立 oracle 只能作为测试依赖使用。
3. <a id="req-6-3"></a> 当本特性完成时，现有 AgentDecision、PreparationResult、Tool input、Snapshot、Trajectory、Profile、Sidecar 和 Diagnostic Trace 的 wire shape 与校验入口必须保持不变。
4. <a id="req-6-4"></a> 当现有 LazyGoal 工作流运行时，新增 DSL Core 不得改变模型调用次数、Runtime 状态转换、持久化顺序或恢复语义。
