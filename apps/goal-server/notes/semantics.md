# Goal Server语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Composition Root | 服务依赖装配边界。 | [Goal Server](../README.md) | [模块说明](./overview.md) |
| Web service | 同源浏览器接口的显式启停入口。 | [Goal Server](../README.md) | [模块说明](./overview.md) |
| Provider profile resolution | 启动与选择期的受管档案解析、优先级与不可解析时的显式失败；档案变更后刷新解析视图。 | [Goal Server](../README.md) | [Composition Root](../src/composition-root.ts) |
