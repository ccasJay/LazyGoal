# Goal Server语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Composition Root | 服务依赖装配边界。 | [Goal Server](../README.md) | [模块说明](./overview.md) |
| Web service | 同源浏览器接口的显式启停入口。 | [Goal Server](../README.md) | [模块说明](./overview.md) |
| Provider profile resolution | 启动与选择期的受管档案解析、优先级与不可解析时的显式失败；档案变更后刷新解析视图。 | [Goal Server](../README.md) | [Composition Root](../src/composition-root.ts) |
| Provider model preview | 校验表单连接并只读查询在线模型，不保存或激活档案。 | [Goal Server](../README.md) | [CLI 装配](../src/cli.ts) |
| 执行装配 | 注入现有 Port 组合 Launcher/Runner/Coordinator，只暴露命令 Port，不创建具体模型或文件存储。 | [Goal Server](../README.md) | [执行装配](../src/runtime/execution-composition.ts) |
| 会话入口 | `RuntimeComposition.sessions` 暴露内部会话操作：创建、流式输入、审批、关闭与重建恢复，复用同一 Store／提交边界与生命周期。 | [Goal Server](../README.md) | [运行时装配](../src/runtime/composition.ts) |
| 无界面运行时装配 | 在显式工作区与数据目录上装配默认实现与实例生命周期，暴露命令、查询与管理 Port，不创建 HTTP 或进程信号。 | [Goal Server](../README.md) | [运行时装配](../src/runtime/composition.ts) |
| 宿主退出协调 | 调用唯一实例关闭核心结算运行时资源，并由应用请求退出码 130；进程信号与退出不进入 Runtime。 | [Goal Server](../README.md) | [进程退出适配](../src/process-exit.ts) |
