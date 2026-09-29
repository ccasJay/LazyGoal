# macOS Seatbelt 项目沙箱设计

## 审批摘要

### 方案

新增不依赖 Runtime 的 `@lazygoal/sandbox`，统一文件工具的项目路径判断，并以 macOS Seatbelt 执行 `bash`。Runtime 把模型申请转换为可强制的实际能力，由 [Permission](../permission/design.md) 核准后生成本次受限执行计划；Sandbox 不拥有授权账本或审批 UI。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 默认 Bash 与能力请求 | macOS 上符合 Profile 和输入规则的 Bash 直接进入默认 Seatbelt；模型通过 Bash 输入申请额外能力，由 Permission 单独核准。 | 项目普通文件可被自动执行的命令修改；Tool Grant、YOLO 均不能扩大沙箱。 |
| 网络强制范围 | 首版不引入代理。模型说明目标和用途；实际放行只有经 Permission 核准的任意目标出站能力。 | 域名请求不能被伪称为域名隔离；获准命令及子进程可连接外网与回环上的任意目标，入站不开放。 |
| 文件边界与受保护目录 | Seatbelt 默认拒绝，按项目、运行必需路径、私有临时目录及明确批准的外部文件或目录子树生成规则；项目内部状态与 Git 元数据另行保护，子进程环境筛除凭据。 | 未覆盖的工具链路径会拒绝；批准项目写入不等于批准 Git 元数据或宿主私密文件。 |
| 执行计划与恢复 | Runtime 以当前 Action 身份和 Permission 核准的实际能力生成短生命周期计划；恢复时重建，不反序列化旧计划。 | 旧授权、旧计划和结果不确定的 Action 不会借恢复越界或自动重放。 |
| 平台与启动失败 | macOS 只调用固定的 `/usr/bin/sandbox-exec`，建策略或启动失败即停止；其他平台维持现有命令沙箱行为并上报无 Seatbelt。 | 不会因沙箱故障静默退回宿主执行；跨平台安全状态可供 Permission 界面展示。 |

### 风险与待确认

- 风险等级：high；理由：默认 Bash 自动执行，宿主文件及网络强制边界发生变化；错误计划可能扩大进程权限。
- 关键操作：项目外文件、Git 元数据或整网访问必须先由 Permission 核准实际能力；文档阶段不执行这些操作。
- 风险：`sandbox-exec` 已标记 deprecated；严格读范围可能使工具链先失败；项目内普通文件仍可被自动命令修改。任意目标出站授权会让已批准命令及子进程连接任何外网或回环目标。
- 待确认：无。

## Overview

本设计覆盖 [需求 1–7](requirements.md)。`@lazygoal/sandbox` 只负责路径边界、可强制范围、策略编译和受限进程启动。Runtime 拥有 Action 状态并构造本次执行计划；[Permission Design](../permission/design.md) 拥有授权匹配、Grant、项目模式和 Browser／TUI 交互。Benchmark 容器与 `web_fetch` 保持各自执行路径。

## Architecture

```text
模型 Bash 输入 -> Tool Contract -> Runner/Profile -> 能力解析
                                                   |
                                      EffectiveSandboxScope
                                                   |
                                  @lazygoal/permission 核准
                                                   |
                                   Runtime 提交 Action 意图
                                                   |
                            BashTool -> @lazygoal/sandbox -> sandbox-exec
                                                   |
                                        Observation/故障
```

Runtime 不信任模型填入的“已批准”标记。最终 Seatbelt 策略只从当前 Action、真实工作区与 Permission 核准的实际能力生成；`BashTool` 在 macOS 收不到 Runtime 提供的本次执行计划时拒绝启动。

## Key Design Decisions

### 默认 Bash 与能力请求

`BASH_INPUT_CONTRACT` 增加可选的 `sandboxAccess`：网络请求包含目标说明与用途；文件请求包含具体路径、读或写及用途。省略即请求默认边界。Contract 和 Tool 语义校验先完成，Profile 不含 Bash 时仍拒绝。macOS 的默认 Tool Policy 对已校验 Bash 返回 `allow`；其他 Tool 的策略和 Linux/Windows 上的 Bash 策略维持原状。`sandboxAccess` 是请求，不是权限凭据。

Runner 在 `stage_action` 之前调用能力解析器，将规范化的实际范围交给 Permission。默认范围直接通过；超出范围时只根据 Permission 的核准结果提交执行意图或进入其审批等待。因为 Bash 不再有逐次 Tool 审批，同一 Bash Action 无须串行的 Tool 与沙箱双重弹窗。Sandbox package 不生成审批结果，也不接受 UI 直接修改策略。

### 网络强制范围

Seatbelt 的默认规则不允许外向连接、回环连接或任意 Unix 网络套接字。首版联网能力只有 `all_outbound`：Permission 只有在显示并核准“本命令及子进程可连接任意出站网络目标（含本机回环）”的实际范围后，Runtime 才能为该次命令生成联网计划。Sandbox 不按模型声明的域名缩小或放宽这一规则；入站监听不随出站授权自动开放。

仅有域名、URL、端口或用途说明而没有 `all_outbound` 核准的请求不产生网络能力，也不被记录为已强制的目标限制。若未来增加受控代理，可另行引入较窄能力；首版不得把网络环境变量或命令文本检查当成访问控制。

### 文件边界与受保护目录

策略从 `(deny default)` 开始，只允许进程管理、最小系统服务、项目真实路径的普通读写、受限私有临时目录，以及经过验证的系统可执行文件和运行库读取。不得用通用用户主目录读取作为工具链兼容方案。外部工具链或缓存确需访问用户文件时，Runtime 以具体路径请求 Permission 核准；启动前对工作区及核准路径做真实路径与目录边界检查，策略中的路径参数不拼接模型原文。

项目 `.git`（含 `gitdir:` 指向的外部位置）默认可读不可写；写入时必须把受保护路径与方向作为实际能力交给 Permission。项目中的 `.lazygoal` 等内部状态和模型凭据路径不可通过普通外部路径批准开放。外部路径申请明确区分单个文件与目录子树，后者包含递归范围；不存在的写入目标先解析其现有父目录，最终访问仍由 Seatbelt 检查。受限命令仅继承筛选后的环境变量，`HOME`、临时目录和缓存指向本次私有目录；模型密钥、宿主令牌及不可信代理变量不得继承。文件级 Tool 的既有路径判断迁入新 package，由 Tools 侧保留原领域错误映射和中止语义。

### 执行计划与恢复

`@lazygoal/sandbox` 只接受本次 Action 的 `SandboxExecutionPlan`，其中的额外文件和网络能力已由 Runtime 从 Permission 核准的 `EffectiveSandboxScope` 得到。它不读取 Grant 账本，也不依赖 UI；权限匹配、撤销和跨进程执行闸门按 [Permission Design](../permission/design.md) 处理。计划只在当前 Action 执行期间有效，不能从旧 Snapshot 直接恢复。

恢复时 Runtime 从已提交的 Action 和当前 Permission 结果重建执行计划，不能反序列化或信任旧的内存策略。等待中的申请继续等待；已批准但尚未启动的 Action 由 Permission 重验；已开始但结果不确定的 Bash 保留人工等待，不因新增能力而重跑。Sandbox 的文件或网络拒绝仅返回有界原因，不自动重试可能已有副作用的命令。

### 平台与启动失败

macOS 后端只使用固定的 `/usr/bin/sandbox-exec` 和受控生成的 policy；不从 `PATH` 寻找可替换程序。启动前先验证平台、工作区路径、策略参数、私有临时目录及必要文件；策略编译和受限进程启动失败返回独立的沙箱故障，不调用无沙箱 `spawn`。执行中 Seatbelt 拒绝与普通命令失败分开投影：能明确识别的能力拒绝给出可申请的资源信息，无法判定时只报告受限执行失败，不猜测宿主文件内容。

Linux／Windows 的后端接口留空实现与明确 TODO，现有 Bash 调用路径不变；Runtime 向 Permission UI 提供“未启用 Seatbelt”的准确平台状态，不得把普通工作目录描述成沙箱。

## Components and Interfaces

`@lazygoal/sandbox` 导出不依赖 Permission、Runtime、Tools、Storage 或 UI 的 `WorkspaceSandbox`、`SandboxRequest`、`EffectiveSandboxScope`、`SandboxExecutionPlan`、Seatbelt 策略编译与进程启动边界。输入为 canonical 路径、实际能力与 `AbortSignal`；输出为结构化拒绝或进程结果。Tools 将路径拒绝映射为现有 Observation；Bash 仅消费 Runtime 提供的本次 `SandboxExecutionPlan`，保留现有超时、输出截断和进程组终止契约。

Runtime 的 `ToolExecutionRequest`／`PreparedToolAction` 增加只由 Runner 传入的非持久化执行计划，不把计划纳入模型输入。Sandbox 把规范化能力与稳定错误交给 Runtime／Permission 投影，不保存授权来源、期限、Grant 或环境变量原值；Browser／TUI 审批和授权接口由 Permission Spec 定义。

## Data Models

模型可填写的 `sandboxAccess` 是意图描述；Runtime 解析后使用以下两层对象，不能把前者直接传入 Seatbelt：

```ts
type SandboxAccessRequest = {
    files?: readonly {
        path: string;
        access: "read" | "write";
        kind: "file" | "directory_tree";
        purpose: string;
    }[];
    network?: { targets: readonly string[]; purpose: string };
};

type EffectiveSandboxScope = {
    extraFiles: readonly {
        canonicalPath: string;
        access: "read" | "write";
        kind: "file" | "directory_tree";
    }[];
    network: "none" | "all_outbound";
};
```

`extraFiles` 仅表示默认项目与运行路径之外的增量范围。Runtime 只把已规范化的范围交给 Permission，模型填写的申请目标与用途只作审阅背景，不能替代实际网络范围。`SandboxExecutionPlan` 绑定当前工作区、Action 和范围；策略规则变化时，Permission 的旧 Grant 必须失配，不能让 Sandbox 接受旧计划。

## Testing Strategy

- 在 macOS 真正启动受限 Bash：验证项目普通文件读写、项目外读写、符号链接逃逸、Git 元数据写入、私有临时目录及子进程继承；不能只断言生成的策略文本。（需求 1、2、5）
- 验证默认断网（含回环）；经 Permission 核准的 `all_outbound` 仅对对应 Action 放行，模型填写目标文本不能缩小或扩大实际权限；未经核准或范围不符时不启动。（需求 3、4、5）
- 覆盖默认 Bash 自动执行、Profile 拒绝、沙箱故障失败关闭、恢复时重建计划、进程已启动结果不确定，以及与 Permission 的授权闸门集成；Grant 匹配、撤销和 UI 由 Permission Spec 验证。（需求 1、4、6）
- 用受控子进程检查敏感环境变量不可见、内部状态不可读取；在 Linux／Windows 验证现有行为和准确的无 Seatbelt 状态，Benchmark 与 `web_fetch` 不被误标为受保护。（需求 5–7）

## Research Findings

Codex 的 macOS 实现也固定调用 `/usr/bin/sandbox-exec`，以默认拒绝的 Seatbelt 策略约束进程树；其受管理网络模式使用本地代理端口控制流量。[Seatbelt 实现](https://github.com/openai/codex/blob/main/codex-rs/sandboxing/src/seatbelt.rs)、[基础策略](https://github.com/openai/codex/blob/main/codex-rs/sandboxing/src/seatbelt_base_policy.sbpl)。本设计不引入代理，因此整网能力须明示，域名说明不能被当成强制范围。
