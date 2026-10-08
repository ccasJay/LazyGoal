# 授权判断

本包定义 Tool 与 Sandbox 的 Grant、模式和判定结果；权限事实由调用方提供并持久化，本包不拥有 Goal Store。

## 决策边界

[Tool 授权](../src/tool-authorization.ts) 与 [Sandbox 授权](../src/sandbox-authorization.ts) 对当前模式、动作及有效 Grant 作判定。[Grant 匹配](../src/tool-grant-matcher.ts) 只比较约束，不代替执行阶段的工作区路径验证。Runtime 在动作执行前按提交过的授权事实决定是否继续，Web 命令只发起批准或撤销操作。
