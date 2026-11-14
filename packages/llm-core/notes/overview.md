# LLM 核心契约

本包承载 Agent、供应商适配包与配置之间的共享模型调用契约，不执行供应商通信，也不读取环境或配置来源。

## 职责

- [LLMAdapter](../src/adapter.ts) 定义供应商无关的最小调用边界：[LLMRequest / LLMResponse / LLMStreamEvent](../src/types.ts) 以有序内容块 `blocks`（`text`、`reasoning`、`tool_call`）作为一次响应正文、公开 reasoning 与工具调用的唯一权威，并承载协议续接字段；实例构造时固定 `strict` 或 `prompt_only`，`two_stage` 由装配层解析为阶段 Adapter 对。
- [content-blocks](../src/content-blocks.ts) 提供无 I/O 的纯读投影：按块顺序派生既有正文（不隐式 trim 或插入换行）、受限 reasoning 与工具调用列表，供阶段解码与原生历史使用；投影不是第二份可变状态，文本格式（`plain`／`json`）只来自请求的结构化输出契约。
- [content-block-stream](../src/content-block-stream.ts) 定义流式块协议：响应开始、块开始（含 `incremental`／`whole` 交付方式）、类型化块增量、块完整结束与唯一成功完成；追踪器只做无 I/O 序列核验与最终结果比对，未知索引、重复边界、类型冲突、结束后追加、未封口块与最终失配都是协议错误。
- [LLMConfig / LLMConfigurationError](../src/llm-config.ts) 提供无 I/O 的共享连接配置与唯一配置错误构造器。动态 OpenCode Go 配置可携带服务端目录解析的 `executionApi`、容量、推理、视觉和工具选择能力，不携带执行端点；环境、TOML/Profile 的读取、合并与校验仍在 [Config](../../config/notes/overview.md)，不会从客户端接收这些执行字段。解析、默认工厂与 pi-ai 引用同一错误类。
- [NormalizedUsage / toSafeTokenCount / readNormalizedUsage](../src/usage.ts) 定义归一化 token 用量形态与数字守卫；供应商原始字段提取归各供应商适配包，缺失或非法计数整体缺省，不以 0 或估算值代替。
- [classifyTransientModelFailure](../src/model-request-failure.ts) 只做结构化识别（限流、暂时性 5xx、连接与超时），结果身份来自 [execution-control](../../execution-control/notes/overview.md)；鉴权、配额、协议与未知错误原样返回。
- [classifyContextWindowRejection](../src/model-request-failure.ts) 只从已知窗口拒绝代码或拒绝状态（400/413/422）加窗口文案识别，结果身份为 execution-control 的 `ContextWindowRejectedError`；其它 4xx 与传输故障不会被归入。

## 依赖方向与限制

本包只依赖 `contracts`、`model-contracts` 与 `execution-control`；不包含供应商 SDK、不读环境、不建网络连接、不拥有 Runtime 状态、重试次数或模型目录。原生消息与 continuation 引用 `model-contracts`，JSON/Schema 类型引用 `contracts`，不在本包复制对话或决策协议。公共契约见 [src/index.ts](../src/index.ts)。
