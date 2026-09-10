# Gemini Strict 模式适配层优化需求规格说明书

## 审批摘要

### 目标
彻底解决 Google Gemini strict 结构化输出模式在长程多轮交互下的字段遗漏、互斥混淆以及适配层“纠偏-回滚”死锁问题，确保模型在复杂任务中 100% 稳定生成合规的 AgentDecision。

### 范围
- **包含**：
  1. 优化 `packages/llm/src/gemini.ts` 的 `mergeGeminiUnion`：将 `action`、`summary`、`completionEvidence` 等分支关键字段定义为带 `nullable: true` 的 `required` 约束，迫使语法机输出完整结构（非目标分支输出 `null`），从源头杜绝漏字段；移除容易诱导模型早退的单值固定 `enum`。
  2. 改造 `restoreGeminiResponseProjection` 与 `restoreGeminiProjectedValue`：打通分支逆向恢复，安全剥离多余的 `null` 字段；修复证据哨兵值与模式匹配逻辑，杜绝校验失败静默回退原始破损 JSON 的死锁。
  3. 补充完善定向单元测试，覆盖各类 nullable 嵌套对象、哨兵值清除及长程分支切换场景。
- **不包含**：
  1. 不改动 ACP 容器运行时、双通道 Mux、Supervisor 编排或环境预检代码。
  2. 不降低系统安全门禁，严禁自动隐式降级至非结构化模式。
  3. 不修改 5 工具体系与系统 Prompt 模板。

### 核心行为
- 严格模式下，发给 Gemini 的打平 Schema 强制要求必须包含 `kind`、`action`、`summary`、`completionEvidence` 等字段（各字段声明为可为空）。
- 当模型选择 `tool_call` 分支时，语法机强制生成完整的 `action` 对象，其余非本分支字段返回 `null`；逆向层自动剔除多余的 `null` 字段。
- 当模型选择 `complete` 分支时，语法机强制生成 `summary` 和 `completionEvidence`，`action` 返回 `null`；逆向层自动剔除 `action: null`。
- 逆向恢复层在反向模式匹配时正确处理证据哨兵值，绝不再因哨兵值校验失败而将已纠偏清洗的数据静默回滚至原始畸形文本。

### 风险与待确认
- **风险**：Gemini 端点对过深的嵌套 nullable 对象联合可能存在兼容性差异；已在真实端点验证过 `action` 为 nullable object 且能正常生成 `null` 或完整对象。
- **确认状态**：核心方案（方案 A：强语法约束 + 完备逆向映射）已在 Brainstorming 获得明确批准，无未决重大决策。

---

## 引言

LazyGoal 依赖严格的带判别字段联合契约（Discriminated Union）来推进 Agent 执行状态转换。然而 Google Gemini 官方 strict 模式目前仅支持单一扁平对象，不支持顶层联合。为了消除目前因打平 Schema 后字段变为可选导致模型在长程交互中遗漏 `action`，以及适配层纠偏逻辑因证据校验冲突发生静默回滚死锁的问题，本规范定义了 Gemini strict 模式适配层的语法约束与逆向恢复行为。

---

## 需求列表

### 需求 1: 严格模式下的完整语法约束映射

作为 Agent 执行运行时，期望向 Google Gemini API 传递具备完整必填字段覆盖的结构化 Schema，以便 Gemini 语法机在生成时必须输出关键决策结构，杜绝字段漏发。

- <a id="req-1-1"></a> 当处于 strict 模式且存在多分支决策联合时，适配器在展平生成的 JSON Schema 中必须将各分支的关键属性（包括 `action`、`summary`、`completionEvidence`）声明为可空（`nullable: true`）并纳入顶层必填字段列表（`required`）。
- <a id="req-1-2"></a> 当生成 Schema 约束时，适配器不得将 `summary` 字段限制为单个固定字符串的枚举，允许模型根据执行事实生成描述，避免单值枚举对自回归生成的非法吸引。
- <a id="req-1-3"></a> 当生成 Schema 约束时，对于嵌套的 `action` 对象，必须完整保留其 `toolId`、`actionId` 以及各个具体授权工具的输入约束。

### 需求 2: 响应逆向投影与空字段安全剥离

作为 Agent 响应解码器，期望从 Gemini 包含非目标分支 `null` 值的响应中安全恢复出标准 Wire 格式，以便符合底层静态契约。

- <a id="req-2-1"></a> 当 Gemini 返回带有 `action: null`、`summary: null` 等非当前分支空字段的响应时，适配器在逆向还原时必须安全剥离当前分支不应包含的 `null` 字段。
- <a id="req-2-2"></a> 当模型为 `tool_call` 分支输出了完整的 `action` 结构时，适配器必须完整保留其嵌套内容，且不得因剥离其他空字段而破坏 `action` 数据。
- <a id="req-2-3"></a> 当模型为 `complete` 分支输出了 `summary` 与证据时，适配器必须保留完成字段，并将 `action: null` 从决策结果中彻底删除。

### 需求 3: 证据哨兵值与模式匹配闭环容错

作为系统运维与开发者，期望适配层在纠偏或反向恢复时具备可靠的闭环验证，避免模式匹配失败导致丢弃纠偏结果并静默回退。

- <a id="req-3-1"></a> 当响应中包含证据哨兵值 `"__lazygoal_absent__"` 时，逆向投影层在进行分支匹配判定时必须正确识别该哨兵值，不得将其判定为非法类型而导致分支匹配失败。
- <a id="req-3-2"></a> 当适配器针对模型输出完成字段清洗或分支归一化后，必须输出清洗纠偏后的 JSON 文本，严禁在后续步骤中因模式匹配判定失败而静默回退至原始破损的响应内容。

### 需求 4: 契约纯洁性与失败透明性

作为 SWE-bench 评测与生产运行时，期望在模型真正输出无法识别的破坏性格式时获得清晰的错误抛出，严禁隐式降级。

- <a id="req-4-1"></a> 当 Gemini 响应在经过逆向清洗后仍无法满足 Wire 契约时，适配层必须如实向调用方返回该内容，由 Agent 解码器统一抛出 `LLMResponseProtocolError`，严禁隐式回退至非结构化模式或伪造假数据。
- <a id="req-4-2"></a> 当处于 `prompt_only` 模式时，适配器不得附加任何原生 `responseSchema` 或 `responseMimeType`，保持纯文本提示词运行链路完全隔离。
