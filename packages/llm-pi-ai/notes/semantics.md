# pi-ai 适配语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| PiAiAdapter | pi-ai 多供应商 prompt_only 适配器；离线解析模型并校验容量。 | [pi-ai 适配](../README.md) | [模块说明](./overview.md) |
| PiAiProviderError | pi-ai 返回型失败的错误身份；不携带部分输出与凭据。 | [pi-ai 适配](../README.md) | [实现](../src/pi-ai.ts) |
| piUsage | 非权威用量诊断字段；始终不等同正式 usage。 | [pi-ai 适配](../README.md) | [模块说明](./overview.md) |
| 增量流转换 | SDK text/thinking/tool-call 增量到统一事件的映射。 | [pi-ai 适配](../README.md) | [实现](../src/pi-ai.ts) |
| OpenCode Go 会话头 | 该 provider 专属 UA 与可选 `x-opencode-session`。 | [pi-ai 适配](../README.md) | [实现](../src/pi-ai.ts) |
