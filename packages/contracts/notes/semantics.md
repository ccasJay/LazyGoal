# 通用 JSON 原语语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| canonical JSON | 递归键排序且由 `JSON.stringify` 输出的确定性 JSON 文本。 | [通用 JSON 原语](../README.md) | [JSON 原语](../src/json.ts) |
| 对象守卫 | 非 `null`、非数组对象的通用类型收窄。 | [通用 JSON 原语](../README.md) | [JSON 原语](../src/json.ts) |
| 深冻结 | 返回同一引用、环安全的递归只读冻结。 | [通用 JSON 原语](../README.md) | [JSON 原语](../src/json.ts) |
| 代码单元比较 | 不受 locale 影响的 UTF-16 code unit 字符串比较。 | [通用 JSON 原语](../README.md) | [JSON 原语](../src/json.ts) |
| JSON 类型 | 数据边界共享的 JSON 标量、值、Schema 值与 Schema 根静态类型。 | [通用 JSON 原语](../README.md) | [JSON 类型](../src/types.ts) |
| 契约校验诊断 | 生成绑定读取与模型输出边界共用的唯一 issue 分类、路径与错误容器；分类区分上下界与容器类型，消费方只补消息和路径。 | [通用 JSON 原语](../README.md) | [校验诊断](../src/errors.ts) |
