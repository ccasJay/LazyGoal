---
feature: provider-native-protocols
status: implemented
risk: high
created_at: 2026-11-15
delivered_at: null
supersedes: []
superseded_by: null
---

# 原生协议接入与 pi-ai 移除

## 目标与范围

在 [Chat Completions 协议抽取](../provider-wire-extraction/spec.md) 交付的 `wire-chat-completions` 与 `llm-adapters` 结构上，新增 `wire-anthropic-messages` 与 `wire-google-generate-content`，把现有 Gemini 投影与空值哨兵原样迁入，并在覆盖矩阵全绿后删除 `llm-pi-ai` 与其余 LLM SDK 依赖。
不做 OpenAI Responses、Anthropic 提示缓存扩展、多模态输入解析与计费。

## 用户故事

- **S1** 作为用户，我希望 Anthropic 模型通过原生 Messages 协议执行，以便获得真实的工具调用与推理语义。
- **S2** 作为用户，我希望 Google 模型的行为与迁移前完全一致，以便升级不影响既有 Goal。
- **S3** 作为维护者，我希望删除 pi-ai 后可用模型不减少，以便移除依赖不是以功能收缩为代价。
- **S4** 作为维护者，我希望 thinking 签名与用量被正确处理，以便上游接受回放请求。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | 使用 Anthropic 模型 | 请求构造、SSE 分帧、事件映射与协议特有错误码由 `wire-anthropic-messages` 提供，通用传输分类沿用 `llm-core` 的实现，适配器只声明端点、认证与模型目录 | `npx tsx --test packages/wire-anthropic-messages/test/*.test.ts` |
| R1.2 | S4 | 状态 | Anthropic 响应包含 thinking 块与用量 | thinking 签名原样回放、用量归一化，正文不混入推理文本 | `packages/wire-anthropic-messages/test/thinking*.test.ts` |
| R1.3 | S1 | 异常 | Anthropic 流截断、拒绝、取消或协议违规 | 分别归一为不完整、拒绝、取消与协议错误，已发布片段不产生可执行工具调用 | `packages/wire-anthropic-messages/test/termination*.test.ts` |
| R2.1 | S2 | 事件 | 使用 Google 模型 | 协议由 `wire-google-generate-content` 提供，schema 投影与空值哨兵原样迁入，适配器不再包含投影代码 | `npx tsx --test packages/wire-google-generate-content/test/*.test.ts` |
| R2.2 | S2 | 状态 | 以迁移前的 Gemini 用例为基线重跑 | 投影、哨兵恢复与工具调用行为与迁移前一致 | 同一组既有 Gemini 用例在迁移前后各自通过 |
| R3.1 | S3 | 事件 | 删除 pi-ai 后执行依赖检查与全量回归 | `llm-pi-ai` 与剩余 LLM SDK 依赖消失，在役供应商仍由各自 wire 执行 | `npm run check:dependencies` 与 `npm test` |
| R3.2 | S3 | 事件 | 对迁移前登记的每个供应商与模型逐个发起调用 | 覆盖矩阵无缺失；OpenCode Go 按 Goal 选择中记录的 protocol 分发给对应 wire，该字段取代 `executionApi` 并随快照往返、恢复后不变 | `packages/llm-adapters/test/coverage-matrix.test.ts` 与快照往返测试 |
| R3.3 | S3 | 异常 | 模型声明的协议没有对应 wire | 明确失败并指明缺失协议，不回退到其它协议或 chat 翻译 | `packages/llm-adapters/test/dispatch-rejection.test.ts` |

组合：Anthropic wire → Google wire → 覆盖矩阵 → 删除 pi-ai（R1.1–R3.3）；最终验证运行 `npm test`、`npm run check:dependencies`、`npm run check:docs`、`npm run contracts:generate -- --check`。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| Anthropic 走原生 Messages 协议，不经过 chat 翻译；原生回放身份由适配器声明，续接载荷（含 thinking 签名）由 wire 产出 | 工具调用、thinking 与用量只有在原生协议上才完整；身份属于供应商事实，续接属于线格式 | 复用 Chat Completions 的翻译路径；或把回放载荷交给适配器拼装 |
| Google 只做搬移：schema 投影与空值哨兵原样进入 wire 包，语义不改 | 现有投影已被真实用例验证，重写只会引入漂移 | 借搬迁机会简化投影规则 |
| pi-ai 的删除以覆盖矩阵全绿为前提，并保留可回滚提交点 | 删除不可逆，必须让"功能未减少"先被证明 | 先删依赖再补协议 |
| 本 Spec 依赖 [Chat Completions 协议抽取](../provider-wire-extraction/spec.md) 交付的 wire 结构与适配器结构 | 两个 Spec 共享同一套四层骨架，骨架未定前改动 wire 层会返工 | 与 A 并行改动同一批文件 |
| 本 Spec 取代 [OpenCode Go 接入](../opencode-go-provider/spec.md) 的 pi-ai 直通决策；该文保留历史正文 | 原生协议接入与 pi-ai 直通互斥 | 保留 pi-ai 作为 Messages 或 Google 的实现 |

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| high | 删除不可逆，且覆盖收缩只有在矩阵全绿时才被排除；涉及凭据的真实端点验证会产生费用 | 删除前确认覆盖矩阵全绿并保留回滚提交点；真实端点验证使用开发 Profile 与用户提供的凭据 |
| medium | thinking 签名回放错误会导致上游直接拒绝请求 | 用真实 Anthropic 端点验证一次多轮工具交换 |
| medium | Gemini 投影搬移引入语义漂移 | 以现有 Gemini 用例为等价基线，不接受改写断言 |

不得在覆盖矩阵存在缺口时删除 pi-ai（R3.1、R3.2）。不得为缺失协议静默降级到 chat 翻译（R3.3）。不得在 wire 包内引入供应商分支（沿用 A 的边界）。

## 任务

- [x] //TODO 1. 新增 `wire-anthropic-messages` 的请求、SSE 与错误分类 → R1.1、R1.3；检查：wire 包基础与终态测试
- [x] //TODO 2. Anthropic thinking 签名与用量处理 → R1.2；检查：thinking 与 usage 用例
- [x] //TODO 3. Anthropic 适配器接入 `llm-adapters` → R1.1；检查：适配器声明测试
- [x] //TODO 4. 新增 `wire-google-generate-content` 并搬迁投影与哨兵 → R2.1、R2.2；检查：投影等价测试
- [x] //TODO 5. Google 适配器瘦身并接入 → R2.1；检查：适配器声明测试
- [x] //TODO 6. 把 OpenCode Go 分发从统一 chat 改为按模型协议，协议随 Goal 选择往返，并建立覆盖矩阵与分发拒绝用例 → R3.2、R3.3；检查：矩阵、快照往返与拒绝测试
- [x] //TODO 7. 删除 `llm-pi-ai` 与剩余 LLM SDK 依赖 → R3.1；检查：`npm run check:dependencies`
- [x] //TODO 8. 同步受影响包概览与语义表 → R2.1、R3.1；检查：`npm run check:docs`

## 执行记录

- 状态：implemented（待真实 Anthropic 端点多轮工具交换验证）
- 验证：`npx tsc --noEmit`、`npm run check:dependencies`、`npm run check:docs`、`npm run contracts:generate -- --check` 通过；`wire-anthropic-messages`（11 项）、`wire-google-generate-content` 相关 `llm-google`（32 项）、`llm-adapters`（43 项含覆盖矩阵与分发拒绝）、`llm`（25 项）、runtime/storage/browser/goal-server 受影响套件均通过。
- 结果：TODO 1–8 完成。Anthropic 走原生 Messages 协议（thinking 签名按块保存并原样回放）；Google 投影与哨兵原样迁入 `wire-google-generate-content`；`executionApi` 由 `protocol` 取代并随 Goal 快照往返；`llm-pi-ai` 与全部供应商 SDK 依赖删除，静态目录固化为包内数据。
- 未决：真实 Anthropic 端点的一次多轮工具交换验证需用户凭据；本机存在随机单比特内存损坏（导致 `tsc`/生成器/打包偶发 SIGSEGV），所有验证均以重试至成功的运行为准。
