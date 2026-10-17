# 模型响应解码语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| LLMResponseProtocolError | 唯一的模型响应协议错误与错误码。 | [模型响应解码](../README.md) | [错误契约](../src/errors.ts) |
| parseModelOutput | 按请求契约严格解析与语义校验文本响应。 | [模型响应解码](../README.md) | [文本解析](../src/model-output.ts) |
| Decide 响应形状分级 | 单调用、批次、零调用正文与无可用结果。 | [模型响应解码](../README.md) | [阶段检查](../src/stage-response.ts) |
| 工具调用解码 | 参数 JSON 与声明契约校验及业务路径标记。 | [模型响应解码](../README.md) | [阶段检查](../src/stage-response.ts) |
| 原生身份检查 | 续接数据与期望会话身份的校验。 | [模型响应解码](../README.md) | [阶段检查](../src/stage-response.ts) |
| Think 文本检查 | 拒绝工具调用与空文本，返回去除空白文本。 | [模型响应解码](../README.md) | [阶段检查](../src/stage-response.ts) |
| 完成审查输出检查 | 唯一审查调用与接受/拒绝解码。 | [模型响应解码](../README.md) | [阶段检查](../src/stage-response.ts) |
