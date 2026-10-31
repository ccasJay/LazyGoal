# 模型协议契约语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| AgentDecisionContract | 模型决策结构。 | [模型协议契约](../README.md) | [模块说明](./overview.md) |
| ModelConversation | 有序模型对话消息协议。 | [模型协议契约](../README.md) | [模块说明](./overview.md) |
| Context Lookup 声明 | 历史检索能力不等于工作区文件读取或证据授权。 | [模型协议契约](../README.md) | [工具声明](../src/model-output/system-tools.ts) |
| Run 阶段控制声明 | 阶段新建、修订与候选提交的系统工具声明。 | [模型协议契约](../README.md) | [工具声明](../src/model-output/system-tools.ts) |
| Plan Run 路线候选 | 随单一 `task_proposal` 一并审批的有序阶段目标与验收条件；不携带 Runtime 状态。 | [模型协议契约](../README.md) | [Canonical 合同](../src/model-output/canonical.ts) |
| Plan Run 路线修订 | 获批后携带当前 revision、理由与完整候选的修订声明；范围扩展需要审批请求。 | [模型协议契约](../README.md) | [工具声明](../src/model-output/system-tools.ts) |
| 请求绑定阶段工具 | 模型仅描述工作，声明闭包绑定阶段身份与版本并按状态提供工具。 | [模型协议契约](../README.md) | [阶段工具工厂](../src/model-output/system-tools.ts) |
| TS 契约单源 | 模型 canonical 输出与 system tool 输入的字段、可选性和约束的迁移目标来源。 | [模型协议契约](../README.md) | [TS 契约类型](../src/model-output/schema-types.ts) |
| 授权工具绑定 | 工具线提供工具身份与输入生成绑定；模型线只消费其投影、读取与未知字段策略。 | [模型协议契约](../README.md) | [绑定集合接口](../src/model-output/bindings.ts) |
| 生成绑定组合 | 按阶段、模式与授权集合组合 Provider Schema、声明与解码；分支确定后剥离未知字段。 | [模型协议契约](../README.md) | [绑定组合器](../src/model-output/bound-factory.ts) |
