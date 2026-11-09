# Goal Server语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Composition Root | 服务依赖装配边界。 | [Goal Server](../README.md) | [模块说明](./overview.md) |
| Trigger Browser Session Port | Web 创建与控制命令接入 Supervisor 的准入、投递和 Worker 调度；只支持新 Goal、结构化交互、取消与明确恢复。 | [Goal Server](../README.md) | [Trigger 浏览器端口](../src/browser-session-port.ts) |
| Web service | 同源浏览器接口的显式启停入口；会话读取按 Goal 投影并通过 Trigger 路径接受支持的控制。 | [Goal Server](../README.md) | [CLI 装配](../src/cli.ts) |
| Trigger 本地传输 | loopback 凭据映射到可信 Worker generation、externalId 或 Supervisor Actor；严格校验来源与 Goal 目标后由 Supervisor 接收和路由 Worker target 消息。 | [Goal Server](../README.md) | [传输组件](../src/runtime/trigger-wire-server.ts)、[认证与接收](../../../packages/storage/src/trigger-delivery-ingress.ts) |
| Provider profile resolution | 启动与选择期的受管档案解析、优先级与不可解析时的显式失败；档案变更后刷新解析视图。 | [Goal Server](../README.md) | [Composition Root](../src/composition-root.ts) |
| Provider model preview | 校验表单连接并只读查询在线模型，不保存或激活档案。 | [Goal Server](../README.md) | [CLI 装配](../src/cli.ts) |
| 动态模型选择与恢复 | 服务端按在线可选目录解析协议，Goal 保存执行契约并按当前 Profile 凭据恢复 Adapter。 | [Goal Server](../README.md) | [运行时装配](../src/runtime/composition.ts) |
| 沙箱计划恢复 | 从核准范围重建绑定当前 Action 与工作区的进程内计划。 | [Goal Server](../README.md) | [运行时装配](../src/runtime/composition.ts) |
| 执行装配 | 注入现有 Port 组合 Launcher/Runner/Coordinator，只暴露命令 Port，不创建具体模型或文件存储。 | [Goal Server](../README.md) | [执行装配](../src/runtime/execution-composition.ts) |
| 内部 Runtime 会话入口 | `RuntimeComposition.sessions` 提供仓库内部通用会话操作，不承载默认 Goal Board Web 创建或续聊。 | [Goal Server](../README.md) | [运行时装配](../src/runtime/composition.ts) |
| 交互接入端口 | `RuntimeComposition.interactions` 的 `attach`／`read`：程序化决定、真人接手与显式恢复都复用同一 Runtime 会话边界。 | [Goal Server](../README.md) | [运行时装配](../src/runtime/composition.ts)、[宿主示例](../examples/headless-interaction-handlers.ts) |
| 无界面运行时装配 | 在显式工作区与数据目录上装配默认实现与实例生命周期，暴露命令、查询与管理 Port，不创建 HTTP 或进程信号。 | [Goal Server](../README.md) | [运行时装配](../src/runtime/composition.ts) |
| 宿主退出协调 | 调用唯一实例关闭核心结算运行时资源，并由应用请求退出码 130；进程信号与退出不进入 Runtime。 | [Goal Server](../README.md) | [进程退出适配](../src/process-exit.ts) |
| 宿主审批预检 | 无界面宿主经同一只读预检返回绑定审阅引用的修订决定；恢复决定只由专用恢复处理器提交。 | [Goal Server](../README.md) | [运行时装配](../src/runtime/composition.ts) |
| Trigger Admission | Fast path 确定性准入后由 Supervisor 直接运行 Slow path 模型判断，失败保留待重试。 | [Goal Server](../README.md) | [准入实现](../src/runtime/trigger-admission.ts) |
| SupervisorWorkerProcess | 独立 OS Worker 执行获派 Goal；检查点与离线 outbox 经 generation 核验后由 Supervisor 保存或结算。 | [Goal Server](../README.md) | [Worker 实现](../src/runtime/worker-process.ts) |
| WorkerScheduler | 按入队次序认领 Goal，匹配授权 workspace 并行运行；只在确认终态后复用 Worker。 | [Goal Server](../README.md) | [调度实现](../src/runtime/worker-scheduler.ts) |
| Worker Action 权限回复 | Supervisor 直接调用 LLM 决定当前 Action 是否一次性批准；失败保留待处理请求，回复须精确匹配 Worker generation 并经 Runtime 应用后结算。 | [Goal Server](../README.md) | [权限调度](../src/runtime/worker-scheduler.ts)、[权限决策](../src/runtime/worker-permission.ts) |
| Goal Workspace | 将项目授权根与共享或隔离的执行目录分开持久映射；worktree 合并需精确用户确认。 | [Goal Server](../README.md) | [工作区实现](../src/runtime/goal-workspace.ts) |
