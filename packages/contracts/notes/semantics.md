# 通用契约语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Contract AST | 通用输入结构定义。 | [通用契约](../README.md) | [模块说明](./overview.md) |
| safeParse | 契约校验的非抛错入口。 | [通用契约](../README.md) | [模块说明](./overview.md) |
| canonical JSON | 递归键排序且由 `JSON.stringify` 输出的确定性 JSON 文本。 | [通用契约](../README.md) | [JSON 原语](../src/json.ts) |
| 对象守卫 | 非 `null`、非数组对象的通用类型收窄。 | [通用契约](../README.md) | [JSON 原语](../src/json.ts) |
| 深冻结 | 返回同一引用、环安全的递归只读冻结。 | [通用契约](../README.md) | [JSON 原语](../src/json.ts) |
| unknown | 接受任意 JSON 并返回隔离深复制；载荷遍历不占用结构深度预算。 | [通用契约](../README.md) | [模块说明](./overview.md) |
| openObject | 校验声明字段、保留额外 JSON 字段，静态类型只含声明字段。 | [通用契约](../README.md) | [模块说明](./overview.md) |
