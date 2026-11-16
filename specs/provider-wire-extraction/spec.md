---
feature: provider-wire-extraction
status: proposed
risk: medium
created_at: 2026-11-15
delivered_at: null
supersedes: []
superseded_by: null
---

# Chat Completions 协议抽取与供应商适配层

## 目标与范围

把代码拆成五个包：`llm-core` 契约词汇、`model-catalog` 目录共享算法、`wire-chat-completions` 线格式、`llm-adapters` 供应商事实、`llm` 选择表；Chat Completions 改用 fetch 与自解析 SSE，OpenAI、DeepSeek、OpenRouter、OpenCode Go 与自定义 compatible 共用同一套协议实现，行为与迁移前等价。
不做任何新协议（Anthropic 与 Google 由后续 Spec 接入）、OpenAI Responses、多模态输入解析、计费与目录缓存。

## 目录结构

```text
packages/
  llm-core/                     契约词汇：内容块、流协议追踪器、SSE 分帧、文本转 JSON、LlmModelDescriptor、ProtocolId、ProviderId（开放字符串）、通用错误分类
  model-catalog/                目录共享算法：静态⊕在线合并、排序、determineSelectability、四类错误降级（不含供应商端点与分页）
  wire-chat-completions/        Chat Completions 线格式（无端点、无凭证、无供应商分支）
    src/request.ts                请求形状
    src/events.ts                 到中性内容的 SSE 映射
    src/errors.ts                 协议错误分类
    test/fixtures/                预录 SSE 回放夹具
  llm-google/                   临时保留：Google 仍由现有实现服务，B 迁入 wire 后删除
  llm-adapters/                 供应商事实：每家一个文件，声明 provider id、baseURL、认证、CatalogSource（discover 含端点、鉴权与分页）与所用协议
    src/openai.ts
    src/deepseek.ts
    src/openrouter.ts
    src/opencode-go.ts
    src/custom-openai-compatible.ts
    src/registry.ts               供应商 → 适配器
  llm/                          选择表：供应商 × 输出约束 → 适配器（不引入第三方运行时依赖）
    src/default-adapters.ts
```

依赖方向：`llm-core ← model-catalog ← llm-adapters ← llm`，`wire-*` 只依赖 `llm-core`，`llm-adapters` 依赖 `wire-*`（`A ← B` 表示 B 依赖 A）。provider id 为开放字符串，适配器自注册于 `llm-adapters`，供应商清单不进入 `llm-core` 或 `config`。

两条硬规则：`model-catalog` 不得依赖 `wire-*` 或 `llm-adapters`——“协议是否已实现”由组合根注入，不靠 import 硬编码；`wire-*` 不得依赖 `model-catalog`——线格式不知道目录存在。

自定义供应商不新增适配器文件：由配置生成 `CatalogSource`，与内置供应商走同一条适配器路径。

本 Spec 不建立 `wire-anthropic-messages`、`wire-google-generate-content` 与 `wire-openai-responses`；前两者由 [原生协议接入](../provider-native-protocols/spec.md) 交付，Responses 尚无计划。

## 用户故事

- **S1** 作为维护者，我希望每种协议只有一个实现，以便新增供应商时不必复制线格式代码。
- **S2** 作为维护者，我希望每家供应商只有一个适配器文件，以便审查时一眼看出端点、认证与协议差异。
- **S3** 作为用户，我希望自定义 compatible 与 OpenCode Go 不再需要特例字段与硬编码端点，以便只靠配置完成接入。
- **S4** 作为维护者，我希望用预录 SSE fixture 自证协议层改动，以便没有真实凭据也能回归。
- **S5** 作为用户，我希望移除 openai SDK 后 Chat Completions 的行为与端点表现保持不变，以便升级不改变既有 Goal 的结果。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | 构造 Chat Completions 请求或消费其响应流 | 请求构造、SSE 分帧与协议特有错误码由 `wire-chat-completions` 提供，通用传输分类留在 `llm-core`，`llm-openai` 的 openai SDK 依赖被移除 | `npx tsx --test packages/wire-chat-completions/test/*.test.ts` 与 `npm run check:dependencies` |
| R1.2 | S1 | 异常 | 流出现截断、内容过滤、缺少终态、取消或协议违规 | 分别归一为不完整、拒绝、取消与协议错误，已发布片段只用于观察，不产生可执行工具调用 | `packages/wire-chat-completions/test/termination*.test.ts` |
| R1.3 | S4 | 状态 | 用预录 SSE fixture 回放一段真实响应 | 请求形态与事件序列逐帧比对通过，全程不触网、不需要凭据 | `packages/wire-chat-completions/test/fixtures*.test.ts` |
| R1.4 | S5 | 事件 | 迁移前的 Chat Completions 用例在迁移后重跑 | 请求字段、块顺序、工具调用组装与终态与迁移前一致，且请求体与迁移前 golden 快照逐字段相等 | 同一组既有用例，加 `packages/wire-chat-completions/test/golden/*.json` |
| R2.1 | S2 | 事件 | 新增或在役供应商 | 每家供应商一个适配器文件，仅声明 baseURL、认证、CatalogSource（由 `discover` 提供端点、鉴权与分页）与所用协议，不实现线格式 | `npx tsx --test packages/llm-adapters/test/registry.test.ts` |
| R2.2 | S3 | 事件 | 使用 OpenAI、DeepSeek 或 OpenRouter 模型 | 三者复用 `wire-chat-completions`，差异只保留在适配器文件内的端点、请求头与错误映射 | `packages/llm-adapters/test/{openai,deepseek,openrouter}.test.ts` |
| R2.3 | S3 | 事件 | 使用 OpenCode Go 模型 | 适配器声明固定端点、自有 User-Agent 与稳定会话头；协议分发在本 Spec 内统一走 chat wire，与迁移前行为等价 | `packages/llm-adapters/test/opencode-go.test.ts` |
| R2.4 | S1 | 状态 | `model-catalog` 计算可选性 | 目录只消费组合根注入的"协议是否已实现"结果与适配器返回的模型列表，只做合并、排序、可选性与降级判定，不 import 任何 wire 或适配器 | `packages/model-catalog/test/boundary*.test.ts` 与 `npm run check:dependencies` |
| R3.1 | S3 | 事件 | 加载含自定义供应商的配置 | 连接声明在 `providers.<family>.<name>`，模型元数据声明在该供应商的 `models[]`，`profiles` 只引用 provider 与 model；`context_window` 与 `max_output_tokens` 均必填，能力位可选；未知 family 或字段、任一容量缺失或非正、provider 内重复 id、输出上限不小于上下文、profile 引用不存在的 provider 或 model，全部在加载期失败 | `packages/config/test/*.test.ts` 与组合根配置测试 |
| R3.2 | S3 | 事件 | 配置中出现 provider id | 已注册 id 被接受，未注册 id 在解析时被拒绝并指明未知供应商；新增一家供应商不修改 `llm-core` 或 `config` | `packages/config/test/*.test.ts` 与 `npm run check:dependencies` |
| R4.1 | S1 | 状态 | `llm` 为一次调用选择实现 | 选择表按供应商与请求声明的输出约束决定适配器；输出约束不是用户配置项，模型无原生约束能力时复用 `llm-core` 的文本转 JSON 提取与修复 | `packages/llm/test/default-adapters.test.ts` |

组合：Chat wire 迁移 → 三家复用 → OpenCode Go 分发 → 自定义 compatible → 选择表收敛（R1.1–R4.1）；最终验证运行 `npm test`、`npm run check:dependencies`、`npm run check:docs`、`npm run contracts:generate -- --check`。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| 五层职责：`llm-core` 契约词汇、`model-catalog` 目录共享算法、`wire-chat-completions` 线格式、`llm-adapters` 供应商事实、`llm` 选择表；`model-catalog` 与 `wire-*` 互不依赖，协议可用性由组合根注入；通用传输分类归 `llm-core`，协议特有错误码归 `wire-*`；wire 包按协议命名，不建 `wire-openai` 与单一多协议包；在线发现由适配器 `discover` 提供，`model-catalog` 只做合并、排序、可选性与降级 | 供应商、协议与目录三者解耦；错误语义不因新增协议而分叉；一个 vendor 名装不下同一家不兼容的两条线 | 继续把协议与供应商混在同一包；让目录 import wire 判断可选性；让每条 wire 各写一份 HTTP 分类；建 `wire-openai` 或 `llm-wire` |
| 供应商身份为开放字符串加适配器自注册；配置以 `providers.<family>.<name>` 声明连接、`models[]` 声明逐模型元数据、`profiles` 只引用；模型标识只在 provider 内唯一，下游以 `(providerId, modelId)` 为键 | 新增一家供应商只改一个文件；连接属性与模型属性分属不同作用域，避免每模型一份端点；容量两项必填，预算与预留都需要确定的数，不在运行期估算；单键会在多网关同名模型时互相覆盖 | 保留闭合联合与 profile 级容量；或用单一 `models[]` schema 统一两个家族 |
| 适配器不实现线格式，wire 不持有端点、凭证与供应商分支 | 供应商差异必须集中在一个可审查的文件里 | 允许 wire 内按供应商加分支 |
| 全部改为 fetch 与自解析 SSE，移除 openai SDK | 消除传递依赖与版本锁定；SDK 不删则同时维护两套类型 | 保留 SDK 只做类型与重试，靠包装层隔离 |
| 本 Spec 取代 [LLM 能力拆包](../llm-component-extraction/spec.md) 的包划分；该文保留历史正文 | 旧包划分以 pi-ai 与 SDK 为前提，与本结构冲突 | 保留旧划分并叠加新层 |

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| medium | 传输层从 SDK 换成自解析 SSE，流终态与错误分类最容易退化 | 迁移前先建立 fixture 回归网；真实端点验证使用开发 Profile 与用户提供的凭据 |
| medium | 一次性工程成本：TS project references、workspace 解析、每个包独立的测试与 tsconfig；开放注册表把供应商合法性校验移到运行期配置解析 | 无 |
| medium | 失去 SDK 的重试、类型提示与错误码，错误分类改为自写 | 协议层必须有独立错误分类用例，不接受只靠集成测试覆盖 |

供应商差异不得写进 wire 包（R2.1）。不得为尚未使用的协议提前建包。迁移不得改变任何既有供应商的可观察请求形态（R1.4）。配置校验不得推迟到首次调用（R3.1）。

## 任务

- [x] //TODO 1. 抽出 `wire-chat-completions`：请求形状、SSE 映射、协议错误分类，并移除 openai SDK → R1.1、R1.2；检查：wire 包基础测试
- [x] //TODO 2. 建立预录 SSE fixture、请求 golden 与迁移等价基线 → R1.3、R1.4；检查：fixture 逐帧比对与 golden 比对
- [x] //TODO 3. 收敛 `model-catalog` 为合并、排序、可选性与降级判定，协议可用性与模型来源由组合根和适配器注入 → R2.4；检查：边界与依赖检查
- [x] //TODO 4. 建立开放 provider 注册表与 `llm-adapters` 结构，先落 OpenAI 官方适配器（含 `discover`）→ R2.1、R3.2；检查：注册表、未知 id 拒绝与声明测试
- [x] //TODO 5. DeepSeek 与 OpenRouter 复用 chat wire → R2.2；检查：端点与请求头断言
- [x] //TODO 6. OpenCode Go 适配器声明固定端点与会话头，协议分发保持 chat 等价 → R2.3；检查：端点、请求头与分发断言
- [x] //TODO 7. 把自定义 compatible 收敛为由配置生成的 `CatalogSource`，与内置供应商同构 → R3.1；检查：配置校验与同构断言
- [x] //TODO 8. 收敛 `llm` 选择表与 `llm-core` 文本转 JSON 兜底 → R4.1；检查：选择表测试
- [ ] //TODO 9. 建立开发 Profile：全部工具、自定义 openai-compatible 与 Mistral 取值，供真实端点验证 → R1.4、R3.1；检查：真实端点跑通一次 Goal
- [x] //TODO 10. 同步五个包的概览、语义表与根 README 布局 → R2.1；检查：`npm run check:docs`

## 执行记录

- 状态：blocked（仅余 TODO 9 真实端点验证）
- 验证：分支 `feature/provider-wire-extraction`；`npx tsc --noEmit`、`npm run check:dependencies`、`npm run check:docs`、`npm run contracts:generate -- --check` 通过；包与集成测试分批全部通过（`packages/tools/test/git-write-tools.test.ts` 因本机 Git 输出中文失败，与本次改动无关）。
- 结果：TODO 1–8、10 完成。`structured_output_mode` 已从 config、受管档案、Web 契约、Goal 快照、生成契约、全部适配器与测试夹具中全量移除；`llm-openai` 已删除；自定义 provider 名（`providers.<family>.<name>`）在运行时注册表按家族投影调用适配器工厂；线上目录动态选型只为已登记的 OpenCode Go 模型携带 `executionApi`。
- 未决：TODO 9 开发 Profile 骨架待用户填入真实端点、凭据与模型容量后跑通一次 Goal。
