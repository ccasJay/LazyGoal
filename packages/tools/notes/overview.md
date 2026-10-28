# 内置工具

本包实现文件、Shell、搜索和编辑等可供 Agent 调用的工具。[公开入口](../src/index.ts) 导出具体实现及其 Input Contract；通用注册和单次校验边界由 [Tool Core](../../tool-core/README.md) 拥有。进程工具（`process_start`/`process_read`/`process_stop`）同样属于本包，但它们调用 [进程会话运行时](../../process-runtime/README.md) 的共享管理器；会话归属、额度与自有句柄结算不由工具实现决定。

## 执行边界

文件工具的路径须通过 [Workspace Sandbox](../../sandbox/README.md) 限定，Shell 执行受超时与输出上限控制；Bash 只移除 macOS 系统 Git 启动器在 Seatbelt 下固定出现的 xcrun 缓存写入噪声，其余 stderr 原样保留。Tool 的 Observation 是执行结果，只有 Runtime 成功提交后才能成为当前 Run 的证据。权限授予和恢复重放由 [Runtime](../../runtime/README.md) 管理，不由工具实现决定。

Grep 的空白 `include` 与 `exclude` 按未设置过滤处理；非空模式才用于匹配文件路径。
