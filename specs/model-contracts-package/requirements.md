# 模型协议契约拆包需求

## 引言

本 Spec 将通用 Contract DSL 与模型输出、模型消息协议拆分为可独立引用的模块。拆分保持既有 Canonical／Wire 解码、Schema、Shape Guide 与模型消息校验结果，并同步 `WorkingMemoryPatch` 在已批准 Working Memory 拆包计划中的契约归属；不新增模型协议能力或改变持久化格式。

## 需求

### 需求 1：通用 DSL 与模型协议可独立引用

**用户故事：** 作为包的调用方，我希望按需引用通用 Contract DSL 或模型协议，以便依赖边界清楚且共用同一套契约基础。

#### 验收标准

1. <a id="req-1-1"></a> 当调用方只使用通用 Contract DSL 时，系统必须允许其从 `@lazygoal/contracts` 获取 AST 构造、Parser、JSON Schema 编译及对应类型，而无需引入模型输出或模型消息协议。
2. <a id="req-1-2"></a> 当调用方使用模型输出或模型消息协议时，系统必须允许其从 `@lazygoal/model-contracts` 获取相关契约、类型和校验能力，并继续使用 `@lazygoal/contracts` 提供的同一套 Contract DSL。

### 需求 2：拆分保持现有协议结果

**用户故事：** 作为模型协议的生产者或消费者，我希望迁移后相同输入仍产生相同校验与投影结果，以便拆包不改变现有调用行为。

#### 验收标准

1. <a id="req-2-1"></a> 当相同输入交由模型输出 Canonical 契约解析时，系统必须保持与拆分前相同的接受／拒绝结果及解析值。
2. <a id="req-2-2"></a> 当相同的 Canonical 契约用于 Wire 派生、Wire 解码、Provider Schema 编译或 Shape Guide 生成时，系统必须保持与拆分前相同的结果。
3. <a id="req-2-3"></a> 当相同模型消息输入交由消息协议校验时，系统必须保持与拆分前相同的合法性判定及消息语义。

### 需求 3：跨包使用时保持 Contract AST 识别一致

**用户故事：** 作为模型契约的维护者，我希望拆分后的协议仍能正确识别核心 DSL 创建的 AST 节点，以便 Wire 与 Schema 派生继续按原规则工作。

#### 验收标准

1. <a id="req-3-1"></a> 当模型协议处理由 `@lazygoal/contracts` 创建的 Contract AST 时，系统必须正确识别普通、optional 与 recursive 节点，并保持既有派生结果。
2. <a id="req-3-2"></a> 当模型协议跨包检查 Contract AST 身份时，节点身份必须由通用 DSL 唯一持有；系统不得因拆分建立另一套不兼容的品牌身份。

### 需求 4：模型协议调用方迁移到独立入口

**用户故事：** 作为仓库维护者，我希望模型协议通过独立公开入口使用，以便 `@lazygoal/contracts` 只表达通用 DSL 职责。

#### 验收标准

1. <a id="req-4-1"></a> 当仓库内生产调用方使用 Agent 决策、系统工具、模型消息或其他模型协议时，系统必须使其通过 `@lazygoal/model-contracts` 的公开入口导入。
2. <a id="req-4-2"></a> 当拆分迁移完成时，`@lazygoal/contracts` 的公开入口必须只保留通用 DSL 能力，不再转发模型协议的旧导出。

### 需求 5：Working Memory Patch 契约归属保持一致

**用户故事：** 作为 Working Memory 拆包的维护者，我希望模型提出的 Patch 继续对应唯一权威契约，以便两个拆包计划能够组合实施而不产生重复或过时类型。

#### 验收标准

1. <a id="req-5-1"></a> 当 Working Memory 拆包使用模型提出的 `WorkingMemoryPatch` 时，系统必须使其结构与类型来自拆分后的唯一权威契约，不得产生重复或不一致的定义。
2. <a id="req-5-2"></a> 当模型协议拆分进入实现计划时，已批准的 [Working Memory 拆包设计](../working-memory-package/design.md) 必须同步更新 `WorkingMemoryPatch` 的契约归属，不再将模型协议归于 `@lazygoal/contracts`。

## 风险与待确认

- 风险等级：medium；原因：拆分改变多个包的公开导入边界并涉及 Agent、Runtime、Storage 等现有调用方，但已确认不改变模型接受规则、输出结果或持久化格式。
- 关键操作：无。
- 已知风险：跨包 AST 检查若使用不同节点身份会破坏 Wire／Schema 派生；遗留旧导入会模糊包边界；Working Memory 计划未同步会留下冲突的类型归属。
- 待确认：无；拆分范围、行为一致性、旧导出移除及 Working Memory 类型归属同步均已在需求收集中确认。
