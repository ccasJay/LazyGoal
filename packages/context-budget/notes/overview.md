# 上下文预算

本包提供模型上下文预算的确定性计算，不读取 Goal、Trajectory、模板或 Provider，也不执行 I/O；调用方负责提供已渲染的固定输入、候选历史单元和计量策略。公开入口是 [src/index.ts](../src/index.ts)。

## 计量与预算

`ModelInputEstimator` 是 Token 或字符计量的唯一抽象：`CharacterModelInputEstimator` 按 UTF-16 code unit 长度计量（对象与数组使用 [`stableJson`](../src/stable-json.ts) 表示），`createTokenModelInputEstimator` 包装供应商 tokenizer 并校验非负安全整数。`resolveModelInputEstimator` 在未注入 Token 计量器时返回字符兜底，注入非 `token` 单位的计量器会失败。

`createModelContextBudgetPolicy` 校验总预算、响应预留、Warm 比例/上限与大型输出 preview 上限，并冻结策略。`plan` 从总预算中先扣除响应预留与固定输入计量，再按 `warmShare`（以及可选绝对上限）分配 Warm 与 Hot；固定输入软超限时历史层配额为零，但调用方仍须保留完整固定结构。`reallocateHotBudget` 把未使用的 Warm 配额回借给 Hot，Warm 使用量超过配额时抛 `RangeError`。

`ModelCapabilities` 与 `TokenBudgetPlanner` 冻结一次 Goal 生命周期内的 tokenizer 与硬输入上限：`hardInputLimit = floor(contextWindowTokens * 0.95) - maxOutputTokens`，`epochPressureLimit` 取其 85%。`measure` 返回输入计量、剩余量、压力与硬溢出标志；`resolveTokenEstimatorEncoding` 为没有供应商 tokenizer 包时提供 `cl100k_base`/`o200k_base` 明确编码的保守确定性估算。

## 完整单元与裁剪

`ContextUnit<T>` 表示一段整体选择或丢弃的有序数据；`characterCount` 由 Adapter 按计量规则预先计算，策略只读取该值，不拆分 `items`。`DropOldestContextCompactor` 从最旧单元开始丢弃，只保留连续最新后缀：最新单元始终完整保留（即使自身超出软预算），遇到首个无法整体容纳的单元立即停止，不跳选更旧的小单元。`compact` 从第一版即为异步，`AbortSignal` 已中止时拒绝且不返回结果；实例不保存调用状态，可安全共享。

`ContextSelector` 是权威优先的统一回退策略：初始渲染包含权威输入、最新 Conversation、Hot、旧 Conversation 与 Warm，硬溢出时按 Warm → 旧 Conversation → Hot 的顺序整体移除单元，仍然溢出则抛出 `ModelContextHardOverflowError`（错误码 `MODEL_CONTEXT_HARD_OVERFLOW`）。最新 Conversation 与权威输入不参与回退。选择结果冻结，并记录每次实际计量与各层移除数量；计算不修改输入数组。

## 思考链截断与序列化

`truncateThought` 对超长思考链执行确定性尾部截断并附加 `THOUGHT_TRUNCATION_MARKER`；提供 `TokenBudgetPlanner` 时同时返回截断后 Token 数。`formatThinkingContext` 生成第二阶段提取用的固定包装文本。

[`stableJson`](../src/stable-json.ts) 与 `compareCodeUnits` 不依赖 Nunjucks：对象键按代码单元顺序递归排序、数组保持原顺序、两空格缩进，空数组固定输出 `[]`。该实现同时是 Prompt 环境的 `stableJson` Filter 与各计量、投影消费者引用的唯一算法，不另建通用工具包。

## 限制

本包不感知模型输入 View、历史来源或模板协议，不选择模型、不执行请求，也不拥有 Goal/Run 状态推进。预算比例与硬上限的具体值属于调用方配置；本包只保证确定性计算与错误语义。
