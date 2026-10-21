---
status: proposed
created_at: 2026-10-21
supersedes: []
superseded_by: null
---

# OpenCode Go 动态模型执行支持 Spec

## 目标与范围

当 OpenCode Go 在线模型列表出现 `minimax-m3.1-flash-free` 时，LazyGoal 可以按独立登记的执行协议调用它，而无需把它加入 pi-ai 静态模型目录。在线列表只决定模型当前是否可用；执行元数据决定如何调用。列表未提供协议和容量，未知模型不得按名称猜协议。

本次只支持 OpenCode Go 的 `minimax-m3.1-flash-free`，沿用当前 `prompt_only` 执行链路、OpenCode Go 凭据、User-Agent 与 `x-opencode-session`。不扩展其它 Provider、不新增 strict 能力、不改变 Goal 模型切换时机，也不承诺自动支持没有执行元数据的新模型。

本 Spec 对 [OpenCode Go 供应商接入 Spec](../opencode-go-provider/spec.md) 的范围修订：此前“每个模型协议由 pi-ai 目录决定”继续适用于静态目录模型；对于不在静态目录中的本次目标模型，执行协议由 model-catalog 的独立 OpenCode Go 执行元数据决定。其它供应商与现有静态模型行为不变。

## 需求与验收标准

### 需求 1：在线可用性与执行元数据分离

- <a id="spec-req-1-1"></a>**验收标准 1.1**：当 OpenCode Go 实时模型列表包含 `minimax-m3.1-flash-free` 且独立执行元数据登记了该模型时，系统应将其标记为可选择，并按登记的执行协议提供给适配器。
- <a id="spec-req-1-2"></a>**验收标准 1.2**：当实时列表包含没有执行元数据的模型时，系统应展示该在线模型及不可选择原因，不得根据模型 ID 推断协议或借用其他模型的能力。
- <a id="spec-req-1-3"></a>**验收标准 1.3**：当实时列表没有目标模型时，独立执行元数据不得单独使其可选择；实时列表故障时，本目标不得伪装成已在线验证。
- <a id="spec-req-1-4"></a>**验收标准 1.4**：系统不得把 `minimax-m3.1-flash-free` 加入或补丁化 pi-ai 静态模型目录；其他静态目录模型继续走当前解析路径。

### 需求 2：动态构造 OpenCode Go 模型

- <a id="spec-req-2-1"></a>**验收标准 2.1**：当服务端收到目标模型 ID 时，必须从服务端目录解析独立执行元数据；浏览器和 CLI 请求不得指定或覆盖执行协议、Base URL 或凭据。
- <a id="spec-req-2-2"></a>**验收标准 2.2**：当目标模型可选择时，`PiAiAdapter` 必须动态构造 `openai-completions` 模型并请求 OpenCode Go 官方 Chat Completions 端点族，不要求该模型存在于 pi-ai 静态目录。
- <a id="spec-req-2-3"></a>**验收标准 2.3**：当发起文本、推理内容、工具调用或流式请求时，目标模型必须沿用当前 pi-ai 适配器支持的映射和错误语义；OpenCode Go 请求继续携带当前凭据、自有 User-Agent，并在存在 Goal 身份时发送稳定的 `x-opencode-session`。
- <a id="spec-req-2-4"></a>**验收标准 2.4**：执行元数据缺失、协议不受支持或容量无效时，系统必须在模型调用前拒绝构造 Binding，不得退回静态目录猜测或隐式改用其它协议。

### 需求 3：Goal 选择与恢复保留执行契约

- <a id="spec-req-3-1"></a>**验收标准 3.1**：当目标模型被用于 Goal 时，`GoalModelSelection` 与相应的配置／Binding 必须携带非敏感执行协议及已确认的上下文和输出容量，使恢复能够重建相同执行契约。
- <a id="spec-req-3-2"></a>**验收标准 3.2**：当 Goal 恢复时，系统必须使用快照中的协议与容量，并从当前 OpenCode Go Profile 取得凭据；不得静默改用其它协议或进程默认模型。
- <a id="spec-req-3-3"></a>**验收标准 3.3**：Snapshot 不得包含 API Key、认证头或可变 Base URL；固定 OpenCode Go 端点由适配器拥有。此变更不得增加 Snapshot 版本或迁移分支。
- <a id="spec-req-3-4"></a>**验收标准 3.4**：当客户端只提交模型 ID 并选择目标模型时，服务端必须从已解析目录生成并保存执行协议；被篡改的客户端请求不能为模型注入另一个协议或容量。

### 需求 4：文档与旧契约边界

- <a id="spec-req-4-1"></a>**验收标准 4.1**：实现必须更新 model-catalog、llm-pi-ai 及受影响 Runtime／Storage 模块的概览、语义表和新增公开 TypeScript 契约 TSDoc，准确描述元数据来源、适配器选择及恢复行为。
- <a id="spec-req-4-2"></a>**验收标准 4.2**：实现必须在 `specs/opencode-go-provider/spec.md` 保留历史正文，并补充范围修订，明确本 Spec 对静态目录外目标模型的例外；不得隐式改写其它供应商或历史验收。
- <a id="spec-req-4-3"></a>**验收标准 4.3**：自动化验证必须覆盖实时可选性与未知模型拒绝、目标请求路由／头／文本／推理／工具／流式行为、Goal 保存恢复、客户端协议伪造拒绝及敏感信息不落盘。

## 架构与核心决策

### 系统拓扑与接口

`model-catalog` 保有独立于 pi-ai 静态目录的 OpenCode Go 执行元数据。元数据登记目标 ID、`openai-completions` API 家族、固定端点族与适配器重建所需容量。在线 `/v1/models` 列表仍只提供当前可用性；只有在线 ID 与有效执行元数据同时匹配时，目标才能选择。未知在线 ID 仍可显示，但必须不可选择。

目录描述将执行协议传给服务端适配器装配。`LLMConfig` 将其传入 `PiAiAdapter`；动态模型遵循 pi-ai `Model` 契约构造，不查找静态模型。Goal 的 `GoalModelSelection` 持久化非敏感 API 家族与容量。浏览器保持提交模型 ID 的既有边界，服务端从目录取协议；恢复使用快照协议和当前 Profile 凭据。运行时领域不得依赖 pi-ai SDK 类型。

OpenCode Go `/v1/models` 不提供路由或容量字段。本次路由表为 `minimax-m3.1-flash-free` 登记 `openai-completions`，端点依据 [OpenCode Go 官方模型端点表](https://opencode.ai/v2/docs/console/go/)。上下文窗口 1,000,000、最大输出 524,288 Token 依据 [MiniMax OpenAI API 文档](https://platform.minimax.io/docs/api-reference/text-openai-api) 与 [MiniMax 请求参数限制](https://platform.minimax.io/docs/api-reference/text-chat-anthropic)；这是基于 MiniMax 模型规格的路由能力假设，不代表 OpenCode Go 在线接口已验证这些上限。新模型或协议只有补充独立元数据后才能选择。

### 核心决策

- **在线状态与执行协议分开维护**：避免把模型可用性误当作协议元数据；在线清单实时变动，路由表只登记有充分证据的模型执行契约。
- **路由登记不依赖 pi-ai 静态模型表**：仅使用 pi-ai 的 OpenAI-compatible 请求能力，不为目标模型维护静态目录副本，也不从 ID 猜测协议。
- **协议和容量随 Goal 选择持久化**：保证恢复执行重建同一 API 家族与预算；凭据来自当前 Provider Profile，固定端点由代码拥有。
- **限定目标模型与协议**：本次只添加目标模型所需的 OpenAI Chat Completions 动态构造能力，不泛化为所有 Provider 的任意模型注册表。

## 曾考虑的备选方案

- **把模型加入 pi-ai 静态目录**：落选，因为这重新引入随 SDK 目录更新才能启用模型的前置要求，也混合了动态可用性和执行路由。
- **按模型名称或在线列表 ID 推断协议**：落选，因为列表没有协议字段，协议推断可能把请求发往错误 API。
- **将 API Key 或 Base URL 写入 Goal 快照**：落选，因为恢复只需要非敏感协议和容量；凭据与固定端点分别由当前 Profile 和适配器拥有。
- **自动支持任意新 OpenCode Go 模型**：落选，因为在线列表不提供必要路由与容量信息，自动猜测不可验证。

## 风险与否定性保证

- **风险等级：中。** 改动跨模型目录、适配器、Goal 持久化与恢复，新增公开执行选择契约，并更新旧 Spec 的范围说明。关键操作：无；不删除外部数据、不触发订阅模型调用。
- **容量风险**：MiniMax 文档给出的是模型规格，不是 OpenCode Go 中转服务针对账号的实时限制；若 OpenCode Go 实际限制更低，请求可能被拒绝。通过将容量作为独立登记且明示来源来限制影响。
- **否定性保证**：未知执行协议不可选择；不得把在线可见误认为能力已验证；不得让客户端控制 API 家族、端点或凭据；不得把凭据或 Base URL 写入快照、错误或诊断；不得对其他 Provider 改变路由行为；不得以静态目录回退或默认模型掩盖恢复失败。
