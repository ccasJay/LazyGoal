# 权限档位与边界判定

本包定义工作区级权限档位、Action 的权限边界判定与边界越界豁免的匹配；权限事实由调用方提供并持久化，本包不拥有 Goal Store。

## 权限档位

[档位预设](../src/permission-profile.ts) 以 `sandbox`、`approvals`、`reviewer` 与 `writableRoots` 描述一个工作区的边界及越界处置：`PERMISSION_PRESETS` 提供 Ask for approval、Approve for me 与 Full access 三档，`DEFAULT_PERMISSION_PROFILE` 在档位未保存时生效。持久化边界由 [ProjectPermissionProfileStore](../src/types.ts) 定义，写入携带读取到的 `revision`，并发覆盖以 `PermissionProfileConflictError` 拒绝。

档位属于工作区，创建 Goal 不冻结资源边界；每个 Action 在决策期读取当前档位。

## 边界判定

[权限边界判定](../src/permission-boundary.ts) 按档位与 Action 的真实范围给出 `allow`、`approval` 或 `deny`。工作区树读写、`.git` 读取、`writableRoots` 与常规本机命令属于边界内；工作区外读写、`.git` 写入、出站网络与破坏性命令属于越界；`.lazygoal` 内部状态在任何档位都拒绝。

`approvals` 为 `on-request` 时越界进入裁决，为 `never` 时直接拒绝；`reviewer` 为 `auto_review` 时只把命中规则表的越界交人工，其余越界自动放行。判定只决定是否放行，不改写 Action 输入、路径或网络范围。

## 边界豁免

[授权匹配](../src/grant-matching.ts) 按规范化 Action 输入摘要与规范化边界范围匹配 Sandbox Grant，豁免分 Goal 与 workspace 两级；批准前记录为 `pending`，随批准提交激活。Runtime 用已提交的批准事实重建执行计划，不重新授权或扩大范围。
