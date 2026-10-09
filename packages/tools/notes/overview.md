# 内置工具

本包实现文件、Shell、搜索和编辑等可供 Agent 调用的工具。[公开入口](../src/index.ts) 导出具体实现及其 Input Contract；通用注册和单次校验边界由 [Tool Core](../../tool-core/README.md) 拥有。

## 执行边界

文件工具的路径须通过 [Workspace Sandbox](../../sandbox/README.md) 限定，Shell 执行受超时与输出上限控制。Tool 的 Observation 是执行结果，只有 Runtime 成功提交后才能成为当前 Run 的证据。权限授予和恢复重放由 [Runtime](../../runtime/README.md) 管理，不由工具实现决定。
