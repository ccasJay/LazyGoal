# 沙箱执行语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| WorkspaceSandbox | 工作区路径及执行边界。 | [沙箱执行](../README.md) | [模块说明](./overview.md) |
| Effective Sandbox Scope 上限 | 实际文件范围由相同访问方向的授权文件或目录树覆盖，网络能力不得超过可信 Goal 上限。 | [沙箱执行](../README.md) | [能力范围判断](../src/capability.ts) |
| Program Sandbox | 独立的程序计算执行边界。 | [沙箱执行](../README.md) | [模块说明](./overview.md) |
