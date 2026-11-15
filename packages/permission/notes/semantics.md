# 权限档位与边界判定语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Permission Profile | 一个工作区的边界与越界处置组合：`sandbox`、`approvals`、`reviewer` 与 `writableRoots`；按 workspace 持久化并带递增 `revision`，每次 Action 决策期读取，Goal 创建不冻结。 | [权限档位与边界判定](../README.md) | [档位预设](../src/permission-profile.ts)、[档位类型](../src/types.ts) |
| Sandbox Mode | 内核强制的文件与网络边界档位：`read-only`、`workspace-write`、`danger-full-access`；只描述边界，不决定越界处置。 | [权限档位与边界判定](../README.md) | [沙箱档位](../../sandbox/src/capability.ts)、[档位类型](../src/types.ts) |
| Approval Policy | 越界 Action 的默认处置：`on-request` 进入裁决，`never` 直接拒绝；不改变内核强制的边界。 | [权限档位与边界判定](../README.md) | [档位类型](../src/types.ts) |
| Approval Reviewer | 越界 Action 的裁决者：`user` 交人工，`auto_review` 按确定性规则表裁决；仅在 `approvals` 为 `on-request` 时生效。 | [权限档位与边界判定](../README.md) | [档位类型](../src/types.ts)、[边界判定](../src/permission-boundary.ts) |
| Permission Boundary Decision | 一次 Action 的边界判定结果：`allow` 直接执行、`approval` 暂存越界项等待裁决、`deny` 拒绝；三者都不改写 Action 输入、路径或网络范围。 | [权限档位与边界判定](../README.md) | [边界判定](../src/permission-boundary.ts) |
| Sandbox Grant | 边界越界豁免事实：按规范化 Action 输入摘要与规范化范围匹配，分 Goal 与 workspace 两级；批准前为 `pending`，随批准提交激活。 | [权限档位与边界判定](../README.md) | [授权匹配](../src/grant-matching.ts)、[授权类型](../src/types.ts) |
| SandboxAuthorizationDecision | 沙箱能力是否需人工审批的判定。 | [权限档位与边界判定](../README.md) | [沙箱授权](../src/sandbox-authorization.ts) |
| 批准决定身份 | 授权来源中的稳定批准身份；同一 Action 的不同决定各自暂存，只有被已提交批准引用的一条会激活。 | [权限档位与边界判定](../README.md) | [授权类型](../src/types.ts) |
| ToolGrant | Tool 级授权事实与匹配契约；默认 Tool 策略不产生 Tool 级审批，权限入口只列边界豁免。 | [权限档位与边界判定](../README.md) | [授权类型](../src/types.ts) |
