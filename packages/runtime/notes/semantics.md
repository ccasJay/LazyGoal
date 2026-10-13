# Goal Runtime语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Goal | 可恢复的会话聚合。 | [Goal Runtime](../README.md) | [模块说明](./overview.md) |
| Run | Goal 内的一次执行边界。 | [Goal Runtime](../README.md) | [模块说明](./overview.md) |
| Step | 一次已提交的决策或动作周期。 | [Goal Runtime](../README.md) | [模块说明](./overview.md) |
| 工具发现 | 在授权目录中排序并累积当前 Run 可见工具。 | [Goal Runtime](../README.md) | [模块说明](./overview.md) |
| Memory proposal 纠错 | 模型记忆提议在副作用前校验，拒绝进入同一 Decide 预算。 | [Goal Runtime](../README.md) | [阶段反馈](../src/runtime-feedback.ts) |
| Run 阶段 | Run 内模型自主组织的阶段说明与完成条件；业务执行需活动阶段，最终审查拒绝后可重新打开已接受阶段。 | [Goal Runtime](../README.md) | [阶段规则](../src/run-stage.ts) |
