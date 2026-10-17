# 进程会话运行时

宿主拥有的后台长进程会话管理：启动受理、并发额度、输出追加、停止与自有句柄清理。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。

## 职责

`@lazygoal/process-runtime` 拥有 `ProcessManager`：按注入的进程存储 Port 与本次 `hostInstanceId` 启动、观察、停止并清理本实例实际创建的子进程。它只依赖 [Goal Runtime](../../runtime/README.md) 的 `ProcessSessionStore`/记录类型与资源契约，以及 [沙箱执行](../../sandbox/README.md) 的受限 spawn 与进程组终止能力；不依赖 Agent、LLM、Tool、Storage 实现或应用，不解析环境配置，也不选择数据目录。

管理器不构造 Goal、工具注册表或 HTTP 服务。`goalId` 是调用方提供的会话归属键，用于额度与读取隔离，不授予业务权限；沙箱策略、环境变量和权限仍由调用方（当前为 [内置工具](../../tools/README.md) 的进程工具）准备。管理器不扫描系统 PID、不重连或终止历史 PID，也不把会话记录当成 Goal 恢复或完成证据。

## 生命周期与结算

`startProcess` 依次写入 `starting` 记录、创建受限子进程、安装输出与退出监听、写入 `running` 记录；额度覆盖每 Goal 4 个、宿主 16 个活跃进程与每 Goal 32 项历史记录。stdout/stderr 按通道追加到注入 Store，具体解码、轮转与绝对字节游标由 [持久化实现](../../storage/README.md) 拥有。

`stopProcess` 只对本实例持有的句柄发送进程组信号并请求结算；没有活跃句柄的历史记录按现有读取语义返回，不重新获得 OS 控制权。`close`/`forceClose` 停止新启动受理并请求清理全部自有句柄，重复调用复用同一过程。管理器不关闭借用的 Store、注册表或其它资源，也不自行退出宿主；实例级关闭期限与结果汇总由宿主生命周期所有者决定。

## 当前限制

额度只保证单个管理器范围：当前一个宿主装配一个管理器，不承诺多个管理器或共享注册表之间的全局配额。跨宿主的旧记录只由 Store 投影为 `interrupted`，不清扫、不重连。`waitForOutput` 只负责唤醒等待者，不证明日志已写入，读取仍以 Store 为准。
