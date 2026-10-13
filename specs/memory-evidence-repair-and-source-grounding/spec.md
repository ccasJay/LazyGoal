---
status: delivered
created_at: 2026-10-11
delivered_at: 2026-10-11
supersedes: []
superseded_by: null
---

# Memory 证据纠错与来源约束 Spec

## 目标与范围

模型提交非法 `memoryPatch` 时，Runtime 在当前 Decide 阶段反馈并允许纠正；模型查询历史上下文时明确查询范围；完成审查核对指定来源与实际交付物，防止将检索未命中扩大为不存在，或用通用示例替代用户要求的真实案例。

故障样本为 Run `d82c1cb4-c2a0-4e44-8581-cce32e539179`：用户要求读取项目记忆并选择真实历史决策，模型仅查询历史对话，然后提交引用 #11 `context_lookup_requested` 的稳定 Fact，声称未找到项目历史决策。完成审查接受其通用微服务示例，随后 Patch 校验以 `INVALID_MEMORY_PATCH` 直接结束 Run。

范围包括 Runtime 候选校验和持久化反馈、Working Memory 与 Evidence 的定位诊断、Agent 的历史结果投影及来源指引、完成审查与行为验证。覆盖普通 Run、获批 Plan Run，以及其他携带 `memoryPatch` 的 Decide 结果；Think 不产生 Patch。上下文检查点沿用现有决策和 Epoch 转换，只将其模型 Patch 纳入同一候选校验。

保留当前证据白名单、原子 Patch、三次阶段纠错、当前 Decide 模型及既有授权。仓库文件由现有业务工具读取；不增加 RAG、检索语料、独立审查服务、模型配置、重试配置或旧开发数据迁移。本规范记录已实施并验证的增量行为，不整体替代已有纠错或完成审查规范。

## 需求与验收标准

### 需求 1：模型 Patch 在副作用前纠错

作为使用者，我希望模型能纠正非法记忆提议，以免可恢复的输出错误直接中断任务。

- <a id="spec-req-1-1"></a>**验收标准 1.1**：当 Decide 提供 `memoryPatch` 时，Runtime 应在业务动作、等待点、Epoch 转换或完成审查之前验证其结构、当前条目引用、证据和归约约束；失败时不得接受该决策或应用候选 Patch。
- <a id="spec-req-1-2"></a>**验收标准 1.2**：当候选 Patch 因模型提供的非法操作、字段、引用、转换、冲突或容量提议被拒绝时，Runtime 应先提交当前阶段反馈，再在同一 Goal/Run/Step/executionUnit 的 Decide 纠错链中重新调用模型；保留已提交 Think 结果，不增加已完成 Step 数。
- <a id="spec-req-1-3"></a>**验收标准 1.3**：当模型修正或显式省略可选 Patch 时，系统应重新验证完整决策，并仅在满足原任务及适用完成审查后推进；不得自动删除非法操作、猜测证据编号或替换模型事实。
- <a id="spec-req-1-4"></a>**验收标准 1.4**：当 Patch 错误、协议错误、完成证据错误与完成审查拒绝交替发生时，同一 Decide 纠错链应共用最多三次阶段尝试（含首次）；耗尽后沿用现有终态失败路径，不创建额外重试预算。

### 需求 2：反馈可定位，恢复边界不变

作为执行器维护者，我希望反馈准确指出模型应修复的字段，并与恢复故障分流。

- <a id="spec-req-2-1"></a>**验收标准 2.1**：当 Fact 引用非法事件时，反馈应包含稳定原因、操作和证据项路径、引用序号及可确定的事件类型；区分不存在、越界、重复和类型不允许，不把不存在的事件描述为跨 Run 的已知事实。
- <a id="spec-req-2-2"></a>**验收标准 2.2**：当当前 Run 没有可用 Fact 证据时，反馈应明确说明没有有效证据，并指引省略未受支持的 Fact 或继续取得相关 Observation；反馈不得暗示无关的合法引用足以证明该事实。
- <a id="spec-req-2-3"></a>**验收标准 2.3**：当反馈保存后中断并恢复时，Runtime 应读取匹配提交边界的反馈与已用次数；未提交 tail 不驱动执行，已经开始的尝试不重新获得额度。
- <a id="spec-req-2-4"></a>**验收标准 2.4**：若已接受 Memory 重放、Trajectory 身份与 revision 链、配置、存储或内部不变量失败，系统应保持现有停止或中止行为，不将这些失败转换为模型 Patch 纠错。运行时生命周期 Patch 不属于模型候选。

### 需求 3：历史检索说明来源与否定结论的边界

作为使用者，我希望 Agent 区分历史对话、结构化 Working Memory 与指定的仓库文件。

- <a id="spec-req-3-1"></a>**验收标准 3.1**：当模型收到 Context Lookup 的 `found`、`not_found` 或 `lookup_error` 时，结果投影应说明语料来自当前 Goal 的已提交对话与轨迹范围，不包含工作区文件搜索；已有身份、边界、来源引用、截断与状态信息应保留。
- <a id="spec-req-3-2"></a>**验收标准 3.2**：当历史查询未命中时，模型可见说明应限定为当前查询在该历史范围未命中，不证明仓库对象不存在；查询请求与结果事件仍不能直接作为 Fact 或完成证据。
- <a id="spec-req-3-3"></a>**验收标准 3.3**：当上述结果经普通上下文或原生工具调用历史交给模型时，两条路径应呈现相同的来源与限制语义；不得只修改其中一条输入路径。
- <a id="spec-req-3-4"></a>**验收标准 3.4**：当用户要求读取仓库资料，而所需内容尚未提供时，Agent 的指引应要求发现并使用获授权的文件读取或搜索工具；历史查询未命中不解除读取要求。已提供充分来源时允许复用，不强制重复读取。

### 需求 4：完成审查核对来源与交付物

作为使用者，我希望完成结果满足当前请求，而不是仅给出相关主题的合理回答。

- <a id="spec-req-4-1"></a>**验收标准 4.1**：当用户要求指定资料中的真实案例，但候选仅提供虚构或通用示例、且没有支持所选真实案例的资料时，完成审查应拒绝，并指出缺少的来源或案例；该行为不依赖候选是否附带 Patch。
- <a id="spec-req-4-2"></a>**验收标准 4.2**：当候选将历史检索未命中推导为仓库对象不存在、或把资料中的设计描述扩大为已验证实现行为时，审查应指出来源支持范围不足；不能因引用形式合法而放行。
- <a id="spec-req-4-3"></a>**验收标准 4.3**：当候选使用已提供且充分的来源交付真实案例及所需建议，或用户只要求通用示例、问候等无需外部事实的回答时，审查应接受符合请求的候选；不新增统一工具次数、回答长度或非空完成证据门槛。
- <a id="spec-req-4-4"></a>**验收标准 4.4**：当审查拒绝时，继续复用 `completion_review` 反馈及现有调用、恢复、预算和流隔离；审查不得执行工具、改写答案或将历史结果升级为当前 Run Evidence。

### 需求 5：流程与模型行为分别验收

作为维护者，我希望验收既能证明 Runtime 的拒绝与恢复流程，也能检验生产模型的来源选择和完成判断。

- <a id="spec-req-5-1"></a>**验收标准 5.1**：确定性测试应覆盖两种可完成 Run 模式，以及工具、等待和检查点的候选 Patch 门控；核对非法候选不执行副作用、不调用完成审查、不提交 Fact 或最终回复，修正后仅执行接受的决策。
- <a id="spec-req-5-2"></a>**验收标准 5.2**：恢复与失败测试应覆盖混合错误共用预算、反馈提交前后中断、重放损坏保持 fatal、最终序号与恢复投影一致，以及无 Patch 的正常决策和生命周期清理回归。
- <a id="spec-req-5-3"></a>**验收标准 5.3**：真实模型评测应使用生产 Renderer、工具声明、反馈输入和完成审查请求构造器，固定正反场景并每项重复三次；来源选择阶段与完成判断阶段分别评分，不以预设 `accept/reject` 替代生产模型判断。
- <a id="spec-req-5-4"></a>**验收标准 5.4**：评测应报告模型及输出模式、模板或声明哈希、每次结果、误放行、误拒绝、协议失败、调用及 token 用量。所需调用缺失或传输失败标为 `incomplete`；固定场景任何一次违反预期则验收失败，不宣称长期任务成功率。

## 架构与核心决策

### 校验与提交顺序

```text
Decide 候选
  → 协议与决策语义／工具准备／完成证据校验
  → 模型 Patch 候选校验
  → complete 才进入 Completion Review
  → 阶段响应及 frame 检查点
  → 追加决策／动作事实（尚未提交）
  → 按 accepted Patch 实际序号完成最终归约
  → accepted Patch、Snapshot 与 marker 提交

可纠正候选失败 → 提交 RuntimeFeedback → 同一 Decide 纠错链
恢复／存储／不变量失败 → 现有失败或中止路径
```

[Runner](../../packages/runtime/src/runner.ts) 的 `executeRepairableModelStage` 校验回调负责候选 Patch 的准入；只在明确的模型候选调用点将类型化校验错误转换为反馈，不按错误消息或宽泛错误码全局重试。

候选检查复用 [Working Memory Core](../../packages/working-memory/src/core.ts) 的规则和 [WorkingMemorySession](../../packages/runtime/src/working-memory-session.ts) 的当前投影、证据索引。对纯归约中才发现的冲突与容量错误执行无 I/O 的试归约；试归约产物不进入 Memory revision、模型输入或事件账本，不预留实际序号。实际提交由 Runner 提供纯 `operationsAtSequence` 归约回调，提交器在事实追加后传入 accepted Patch 的实际序号，生成 `originSequence` 和 Runtime 条目身份；禁止复用试归约的临时身份。

合法的 duplicate/stale 等现有规范化抑制仍沿用 Core 语义；非法 Patch 的原子拒绝不能改成部分接受。若最终归约出现候选检查未覆盖的新错误，保持失败并暴露验证缺口，不能提交已失效的结果。

### 所有权与反馈契约

| 所有者 | 职责 |
| --- | --- |
| `working-memory` | 维护结构、条目引用、状态转换与归约规则；模型 proposal 校验错误提供有界问题路径和稳定原因，非法限制配置另行失败。 |
| Runtime Evidence Gate | 维护实际可用证据判定及引用诊断；为 Patch 操作补齐字段路径，不解析英文异常字符串生成路径。 |
| Runtime Runner | 在模型候选边界分类错误、建立反馈并持久化纠错；不承担自然语言命题真伪证明。 |
| Agent | 统一历史结果的模型投影、来源选择指引及完成审查请求；不写 Goal 或授予工具权限。 |

`RuntimeFeedbackOrigin` 包含 `memory_patch`，阶段仍为 `decide`；[Trajectory 当前校验](../../packages/runtime/src/trajectory.ts) 同步接受该来源。复用现有 `pendingModelRepair` 与反馈事件，不增加恢复阶段或 Snapshot 指针，不递增协议版本。

反馈继续使用 `code`、`issues`、`constraints` 及现有字段界限。候选路径统一采用 `result.memoryPatch` 前缀；例如引用错误定位到 `result.memoryPatch.operations[0].fact.evidenceSequences[0]`。以 `INVALID_MEMORY_PATCH` 或 `INVALID_MEMORY_EVIDENCE` 表示边界，以 issue code 区分具体原因。只提供安全元数据和规则，不回传 Fact value、模型原文、文件正文或内部异常对象。

证据序号建议必须与 [Evidence Gate](../../packages/runtime/src/evidence-gate.ts) 的实际判定一致，包括 rejected Observation 的排除；有界示例不代表完整列表，也不证明与当前命题相关。无有效证据时明确提示 `none`。修复责任属于模型，Runtime 不自动把 Fact 降为 Hypothesis。

### 历史来源投影

[Context Lookup 模型投影](../../packages/agent/src/context-lookup-projection.ts) 的各状态提供共享的 `sourceScope` 与 `limitations`：前者标识 `goal_history`，后者使用固定英文说明明确工作区文件未被搜索、未命中不证明不存在、lookup 事件不是直接 Evidence。保留 `found` 的时效提示及原有字段。

仅扩展 Agent 模型 DTO，不修改 Runtime 检索 Result、算法、语料、持久化事件或 schema。普通上下文和 [原生模型历史](../../packages/agent/src/native-model-history.ts) 复用同一结果投影，防止原生路径通过事件 payload 绕过说明；实际字段与包内依赖按最小改动组织。

[工具声明](../../packages/model-contracts/src/model-output/system-tools.ts) 和 [Decide 指引](../../packages/agent/src/step-prompt/agent-decision@1.njk) 就地补足上述边界，使用通用“用户指定的仓库资料”语义，不把 `project-memory/` 硬编码成 Runtime 的特殊资源，也不重复叠加已有通用取证提醒。

### 完成审查与质量验证

[Completion Review](../../packages/agent/src/completion-review.ts) 保留当前输入与当前 Decide Adapter，明确核对三个问题：用户要求的来源是什么；候选关键事实得到哪些实际来源支持；实际交付物是否被通用示例、主题介绍或状态汇报替换。拒绝指出可行动的缺口，禁止依据篇幅、语气或引用数量判断交付质量。

复用 [Decide 评测](../../packages/agent/test/decision-guidance-eval.ts) 和 [完成审查评测](../../packages/agent/test/completion-review-eval.ts)，不建立独立评测框架。来源选择测试评估生产单步决策是否继续发现／读取文件，而非据未命中直接完成；Patch 反馈测试评估是否产生合法修正且保持原任务。完成审查以固定候选评估判断质量，两者不混称端到端成功率。

固定场景至少包括：历史查询未命中但指定仓库资料待读取；非法 Fact 收到字段级反馈；省略 Patch 的通用案例替代真实案例；把未命中扩大为对象不存在；已提供真实资料且交付充分；用户明确请求通用示例；问候；已有充分来源无需重复读取。保留既有正反场景，新增场景每次均应满足预期。真实模型验收使用故障 Run 的 `google / gemini-3.6-flash-high / strict` 绑定，按固定场景各重复三次；判据与当前证据见 [执行计划](./plan.md#latest-result)。

Runtime、Agent、Working Memory 和受影响模型契约的 owning overview、语义表与中文契约 TSDoc 已同步。验证采用仓库当前回归入口、`npm run check:dependencies`、`npm run check:docs` 及已有真实模型评测入口；行为 TODO 与命令组合由 [执行计划](./plan.md) 定义。

## 曾考虑的备选方案

- **放宽证据白名单，允许 lookup 事件支持 Fact**：查询过程无法证明仓库对象存在或不存在；该方案会持久化本次错误结论，拒绝。
- **静默丢弃非法 Patch，仅提交其他决策**：改变原子契约并隐藏模型误判；本例还会发布偏题答案，拒绝。
- **只增加 Prompt 或提高重试次数**：不能补上 Patch 位于纠错链之外的流程缺口；额外次数也不能补足来源信息，拒绝。
- **提前生成最终 canonical Patch 并沿用至提交**：阶段事件会改变真实来源序号；选择无副作用的候选检查与提交时归约，接受少量纯计算重复以保留序号和恢复一致性。
- **新增独立 Memory 提交工具或专用修复模型调用**：扩大决策协议并分裂尝试预算与恢复身份；复用现有 Decide 提议和纠错，暂不采用。
- **用其他模型或新增 RAG 提升判断**：改变成本、配置及语料所有权，尚无证明是解决当前问题的必要条件；先验证当前模型与现有工具，暂不采用。
- **所有完成都要求工具证据，或强制读取固定路径**：会拒绝问候、用户已提供来源等合法任务，并把项目文件规则嵌入通用 Runtime，拒绝。

## 风险与否定性保证

- **风险等级：medium**。涉及跨包行为、公开诊断契约、反馈持久化来源和阶段恢复；不改变权限、不执行破坏性迁移或工作区写操作。候选修复可能增加模型调用，完成审查仍可能误判；固定真实模型案例仅证明该模型配置下的有限观察。
- 结构与引用合法不能证明自然语言 Fact 真伪；Runtime 只保证可追溯与拒绝边界，来源相关性和交付质量继续由模型审查及行为评测检验。
- 候选试归约与最终归约必须使用同一业务规则；实际提交身份、边界或状态改变时，不得将试归约结果当作已接受事实。
- 无效模型响应可以保留在既有受限诊断或阶段反馈记录中，但不得成为业务 Observation、已提交决策、Working Memory 或最终用户回复。来源提示本身不是证据。
- 模型错误分类不得覆盖存储、恢复、不变量与中止异常；不得放宽 Profile、Policy、审批、Evidence 或 Snapshot 提交边界。
- 不自动清理用户既有 Goal、不修改历史 Memory、不为开发数据增加兼容层；新增协议成员按当前版本原位更新。
- 若真实模型评测不完整或未达标，保留实现证据并报告缺口，不降低场景标准或以桩测试代替质量验收。
