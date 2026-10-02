# Sandbox 模块

`@lazygoal/sandbox` 提供工作区路径边界、业务 Tool 的 macOS Seatbelt 范围，以及 PTC 专用的独立 Node.js 计算进程。它不决定 Goal 状态、Profile 授权或工具审批；PTC worker 只能通过宿主控制的管道请求业务 Tool。

PTC 由 [ProgramSandbox](../../packages/sandbox/src/program-sandbox.ts) 启动固定 [worker](../../packages/sandbox/src/program-worker.cjs)：每次程序创建新进程与私有临时目录，继承清洁环境，使用 [专用 Seatbelt 策略](../../packages/sandbox/src/macos-seatbelt.ts) 拒绝宿主文件、网络和进程派生。JavaScript 在无宿主模块、动态代码和计时器的 VM Context 内执行，时间与随机数使用持久化固定值；程序结束只接受显式、可 JSON 序列化的返回值。Seatbelt、Node.js 依赖或资源监控不可用时拒绝启动；非 macOS 平台不执行该功能。

宿主限制源码、管道帧、返回和诊断字节，设置 Node old-space、RSS 采样和独立 watchdog。每一秒活动额度先由 Runtime 写入持久化预留事件，再继续 worker；进程退出后关闭管道并回收私有目录。业务工具仍由 Runtime 逐次授权和提交，worker 不持有工作区能力。
