# 工具集扩展 设计

## 审批摘要

### 方案

沿用现有 Tool 注册、Permission、Action/Observation 和关闭流程，在一个 Spec 中增加专用文件、进程和 Git 工具，并接入已有网页工具。业务工具提供事实，Runtime 提供可信调用身份与授权；进程记录单独保存，不成为 Goal 恢复或完成证据的替代来源。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 工具接口与执行身份 | 读写操作使用独立 Tool ID；Runtime 注入 Goal/Run 身份；失败结果可带有界 JSON details | 扩展执行与结果契约，直接调用与 PTC 使用相同身份和授权；模型不能指定所有者 |
| 文件查询与续读 | 结构化结果、流式读取、绑定查询的续读游标；固定扫描和输出额度 | `read_file` 与网页抓取输出改为对象，不兼容旧结果形状；文件变化不保证跨页快照 |
| 严格补丁与小型依赖 | 新增 `diff@9.0.0` 解析补丁、`picomatch@4.0.7` 匹配路径；补丁定位与写入由 LazyGoal 控制 | 不依赖 Git 仓库应用补丁；完整上下文唯一匹配，禁止 fuzz 和自动换行转换；多文件失败可能部分完成 |
| 能力派生与授权 | 工具派生真实资源范围，沙箱 Grant 泛化为 Tool ID、输入摘要及能力范围 | 更新当前 Grant 存储形状，不迁移旧开发数据；网络和受保护路径即使 YOLO 也走现有沙箱审批 |
| 网页获取与资源额度 | 保留现有后端；按偏移续读，固定请求/响应上限，不新增内容缓存 | 翻页重新抓取，页面变化可能改变结果；宿主 HTTP 由执行计划控制，不声称域名级内核隔离 |
| 进程归属与持久化 | 宿主级进程管理器、Goal 隔离、私有有界日志及状态记录，接入资源关闭 | 同宿主内可跨 Run 观察；旧宿主任务只投影为中断，不重连、不自动重跑，不提供多宿主管理保证 |
| Git 专用沙箱与工作树保护 | 系统 Git 固定 argv；只为当前获授权 Git 操作开放所需元数据/目标；查询禁用可选写入 | Bash、进程和普通文件工具仍不能写 Git 元数据；不绕过仓库钩子，受限配置可导致提交失败；worktree 移除检查忽略文件 |
| 装配与恢复 | 默认 Profile 扩展，显式 Profile 不变；写工具及进程停止为 manual，查询为 safe | 不新增 Goal 状态或 Snapshot 版本；未知写入结果保持现有人工恢复，已知失败不触发恢复确认 |

### 风险与待确认

- 风险等级：high；原因与 [Requirements](./requirements.md#审批摘要) 一致，Git 专用元数据权限、可信执行身份和独立进程记录需要跨模块集成验证。
- 关键操作：补丁写入/删除、Git 暂存/提交/切换、worktree 创建/移除和进程启动/停止，均按运行时真实输入与能力范围授权。
- 风险：补丁预检后的外部写入竞态无法完全消除；多文件写入无事务回滚；进程异常崩溃可能遗留；磁盘失败可能丢失未持久化日志；Git 钩子和签名受沙箱限制；网页及查询续读不是稳定快照。新增依赖增加供应链维护面，仅使用锁定版本且不引入生产传递依赖。
- 待确认：无。用户已确认保持现有沙箱、采用专用 Git 调用和宿主资源关闭，不引入常驻守护进程；本文件仍待独立 Design 审批。

## Overview

覆盖 [需求 1–8](./requirements.md#需求)。不更改业务决策和完成协议；模型看到的输入继续由 Contract AST 生成。采用新的当前输入/输出及 Grant 形状，更新消费方和测试，不维护旧开发数据兼容分支。

## Architecture

```text
CLI Composition Root --> Tool Registry --> Runner
       |                                  |
       +--> ProcessManager                +--> Permission --> SandboxExecutionPlan
       |        |                         |
       |        +--> ProcessSessionStore  +--> ToolExecutionContext --> Tool
       |                  ^                                         |
       +--> Storage Adapter                  Observation <----------+
       |
       +--> ManagedResourceRegistry --> ProcessManager.close/forceClose
```

`packages/tools` 拥有具体操作和进程句柄；`packages/sandbox` 拥有命令派生、Seatbelt 和进程组终止；Runtime 声明进程存储 Port、传递身份并提交 Observation；Storage 保存进程 DTO 和日志。保持现有包依赖方向。进程存储不调用 GoalStore，异步退出不自动生成 Step 或完成证据，只有查询工具的已提交结果参与验收。

## Key Design Decisions

### 工具接口与执行身份

对应 [需求 6](./requirements.md#req-6-3)、[需求 8](./requirements.md#req-8-1)。给 `ToolExecutionRequest` 增加必需的 `context: { goalId, runId }`；已准备 Action 的 `execute/stream` 显式接收此上下文。Runner 在执行闭包中从当前 Goal 构造，重试、恢复和 PTC 子调用保持一致；不塞入模型 Contract、Action input 或 Snapshot。更新本地调用、fake、远端注册适配器和中文契约级 TSDoc，进程工具不接受模型指定所有者。

每个 ID 的读写性质固定，禁止一个枚举式 Tool 同时承载只读查询和写入。`process_read` 为只读；其日志读取不推进共享消费位置，调用者自己保留游标。只读查询为 `safe`，`apply_patch`、`process_start/stop` 和 Git 写操作为 `manual`；不改变已有 `write_file/edit_file` 重放策略。

接口表中 `?` 表示可选；`cursor?` 是 Tool 专属续读字符串，`sandboxAccess?` 复用既有显式能力申请 Contract。未列出的参数不得作为原始 argv 或命令透传。

| Tool ID | 输入要点 | output 要点 |
|---|---|---|
| `list_directory` | `path?`、`maxEntries?`、`cursor?` | `entries[{path,type}]`、`truncated`、`nextCursor?` |
| `find_files` | `pattern`、`path?`、`maxResults?`、`cursor?` | `paths`、`scannedEntries`、`truncated`、`nextCursor?` |
| `read_file` | `path`、`startLine?`、`endLine?`、`maxChars?`、`cursor?` | `path`、`text`、实际行范围、`eof`、`truncated`、`nextCursor?` |
| `grep` | `pattern`、`path?`、`ignoreCase?`、`include?`、`exclude?`、`contextLines?`、`maxMatches?`、`cursor?` | 匹配/上下文行及路径、扫描数、`truncated`、`nextCursor?` |
| `apply_patch` | `patch` | 逐文件操作及应用 hunk 数 |
| `web_search` | 保留 `query`、`maxResults?` | 保留有界搜索数组；限制每项文本长度 |
| `web_fetch` | 保留 `url`、`maxChars?`；新增 `offset?` | `url`、`text`、`offset`、`nextOffset?`、`truncated` |
| `process_start` | `command`、`sandboxAccess?` | `processId`、当前状态、启动来源 |
| `process_read` | `processId`、`cursor?`、`waitMs?`、`maxChars?` | 状态、stdout/stderr 分片、退出信息、`truncated`、`nextCursor?` |
| `process_stop` | `processId` | 实际终止/已退出状态 |

### 文件查询与续读

对应 [需求 1–3](./requirements.md#req-1-1)。复用 WorkspaceSandbox 的规范化路径与错误转换；普通文件写入、补丁及进程沙箱禁止修改 `.lazygoal`、`.git` 和链接工作树的真实 Git 元数据，Git 专用执行是唯一例外。`list_directory` 可以展示这些目录名称，默认递归发现/搜索不进入 `.git`、`.lazygoal`、`node_modules`。

目录项按相对路径的字符序排序，显式路径查询失败必须返回失败；递归遇到不可访问路径不得吞掉并宣称无匹配。文件模式使用 POSIX 分隔符并相对搜索根匹配，允许常见 glob，禁用 glob 中的原始正则扩展，模式长度上限 4 KiB。目录符号链接只列举，不递归跟随。

游标是经 base64url 编码的当前结构 JSON，含工具 ID、查询摘要和续读位置；解析时验证类型、长度、范围和查询身份，不把编码当作授权。目录发现保存遍历栈及目录内位置，文本保存文件/行/列位置，grep 保存遍历和匹配内位置；恢复时重新校验每个路径。达到扫描额度但没有匹配也返回可推进游标；到深度上限或无法继续的位置，返回明确限制失败，不伪造续查可覆盖未扫描子树。

`read_file` 使用增量 UTF-8 解码，按 1 起始的闭区间读取，不整文件加载。游标支持超长行内续读，未指定 `endLine` 时继续至 EOF；采用 NUL 和严格 UTF-8 解码识别不支持的文本。`grep` 的超长匹配/上下文也支持分片续读，正则与 glob 匹配在可终止 Worker 中执行，避免模型提供的模式阻塞宿主；普通中止不包装成业务失败。

### 严格补丁与小型依赖

对应 [需求 4](./requirements.md#req-4-1)。新增锁定生产依赖 `diff@9.0.0`（BSD-3-Clause）和 `picomatch@4.0.7`（MIT），均无生产传递依赖；分别用于补丁语法解析和路径 glob，不使用依赖的默认文件写入或容错应用。

`diff.parsePatch` 之后校验完整输入是否为支持的补丁，拒绝未消费的非补丁内容、缺文件头、二进制、复制/重命名、符号链接或 submodule 模式及只有 mode 的变更。普通文本文件可保留/应用 `100644` 与 `100755` 模式，新增空文件和删除空文件由 Git 文本头识别。只有 Git 格式去除成对 `a/`、`b/` 前缀，`/dev/null` 仅表示创建或删除；其余绝对路径、父级逃逸及保护路径拒绝。每个规范化目标只允许一个文件补丁；冲突重复目标拒绝。

流程为：解析与路径校验 → 读取有界原文 → 在内存顺序构造全部结果 → 写前复核全部目标 → 逐文件写入。每个 hunk 用上下文加删除行组成旧侧序列，搜索完整唯一位置，顺序不可重叠；即使声明行号匹配也检查是否有其他候选。无旧侧内容且目标不是空文件时，插入点缺少定位证据，返回歧义失败。保留行尾与末尾换行标记，不 trim、不自动转换 CRLF，不调用有自动偏移优先选择的 `applyPatch` 来替代唯一性检查。

预检保存规范化路径、文件身份、模式与原文摘要，写前检查全部目标并在各文件写入前再次复核。修改以同目录临时文件替换并保留模式，创建使用排他创建，删除仅对复核后的目标 unlink；不跟随新出现的符号链接。后续失败停止操作，通过 `failure.details` 返回已知 applied/failed/pending 文件；仅向现有失败 Observation 增加可选、有界 JSON details，并同步输出校验/Codec，不增加新的 Observation 分支。不能确定修改结果时抛出异常，由 Runtime 进入现有 `manual` 等待，不以内容推断成功。

### 能力派生与授权

对应 [需求 8](./requirements.md#req-8-2)。Tool 可实现 `resolveSandboxAccess(input, control)`，已准备 Action 暴露同源闭包；Runner 在准备完成、授权之前调用，得到资源申请后仍由 sandbox 规范化并由 Permission 判断。该方法只发现资源，不执行业务写入、不持有 Goal。Bash/进程复用输入申请，网页由 URL/后端派生网络能力，Git 由仓库元数据和 worktree 目标派生文件能力；普通文件仍只支持现有工作区相对路径。

泛化 `SandboxGrantMatcher` 的当前格式为 `{ toolId: string, inputDigest, scope, version: 1 }`，摘要涵盖 canonical input；Bash 也使用相同格式。更新 Permission、Storage Schema、TUI/Browser Grant 显示及恢复激活路径，不保留仅 Bash 分支，不增加版本和迁移。Tool Grant 与 Sandbox Grant 继续独立；后者匹配工具、输入身份及权限子集，只有 active 才能使用。

直调与 PTC、审批恢复和重试每次都重新派生能力，和已批准范围比较；路径或范围变大时重新审批，不复用旧计划。受保护 Git 元数据写入即使位于工作区内也显式列入 extraFiles；任何新网络或额外路径权限即使 YOLO 也按既有规则审批。只读分类不绕过沙箱能力审批。执行入口检查计划与 Action/工作区/真实范围匹配，Bash 的默认保护策略保持不变。

### 网页获取与资源额度

对应 [需求 5](./requirements.md#req-5-1)。保留已有后端注入方式并修订英文说明/错误。默认搜索后端仍为 DuckDuckGo；fetch 用宿主 HTTP，派生 `all_outbound` 能力并要求匹配计划，域名只供审阅，不宣称仅允许指定域名。组合调用者取消与 30 秒 deadline；先限制响应体读取字节，再进行文本提取及分页，不无限 `response.text()`。

`web_fetch.offset` 为提取文本中的 UTF-16 偏移，分页重新请求；达到响应体读取上限时返回 `WEB_RESPONSE_TOO_LARGE`，不得以不完整 HTML 解析结果宣称可续读完整网页。不做跨调用缓存，不新增搜索供应商或配置。429/5xx 等确认的暂时故障沿现有类型化重试路径，普通失败和 deadline 不触发无限重试。

| 固定额度 | 默认 / 硬上限 |
|---|---|
| 文本单页 / 序列化 Observation | 16,000 字符 / 128 KiB（含元数据和转义） |
| 目录项、发现结果、grep 匹配 | 默认 200 项，最多 1,000 项；grep 上下文最多各 20 行 |
| 递归扫描 / 深度 / 查询时间 | 每页 2,000 项 / 16 层 / 10 秒；模式匹配 Worker 超时终止 |
| 补丁 / 文件数 / 原文与结果 | 1 MiB / 100 文件 / 合计 32 MiB，单文件 8 MiB |
| 网页响应 / 请求时间 | 2 MiB / 30 秒；搜索保留已有最多 20 条限制 |
| Git 命令 / 查询续读 | 默认 30 秒，提交/worktree 写入 120 秒；字节预算与文本页相同 |
| 进程观察等待 / 运行数量 | `waitMs` 默认 0，最多 30 秒；每 Goal 同时 4 个，宿主同时 16 个 |
| 进程日志 / 活动及完成记录 | 每通道保留 1 MiB；每 Goal 最多 32 条记录，达到额度拒绝新启动 |

`maxChars` 等调用参数只能降低或在硬上限内调整额度，不新增全局配置项。输出构造按实际 JSON 字节计量；所有读取遇到额度必须正确给出续查位置或明确限制失败，单个无法分页的字段超限返回 `TOOL_OUTPUT_TOO_LARGE`。查询不是稳定快照；游标摘要不含页大小但包含查询条件，更改查询条件后游标无效。文本单页硬字符上限 50,000，不维持 `web_fetch` 原有 500,000 字符上限。

### 进程归属与持久化

对应 [需求 6](./requirements.md#req-6-1)。一个 Composition Root 创建一个 `ProcessManager` 和随机 `hostInstanceId`，注入共享进程工具及 ManagedResourceRegistry；在 `packages/sandbox` 提取 Bash 所需的底层受限命令启动/进程组终止原语，Bash 继续同步等待，进程工具负责跨调用持有句柄，不把业务管理器放入 Runtime 或 sandbox。

Runtime 定义 `ProcessSessionStore` Port：读取/写入状态记录、追加/读取日志页、删除 Goal 记录；Storage 实现独立 DTO 校验、原子状态写和按 processId 串行日志写。目录为现有 workspace Home 下 `processes/<goalId>/<processId>/`（实际组件编码，不直接拼接模型字符串），目录 0700、文件 0600；若 Composition Root 使用独立 dataDirectory，则保存到该目录对应的 `processes/`。PID/命令不作为授权凭据。

记录含当前 `schemaVersion: 1`、workspace/goal/sourceRun/action/process/host 身份、command、状态、时间、退出信息和日志字节范围，不保存环境密钥或进程可重连信息。每通道用两个最多 512 KiB 的轮转文件，采用绝对字节偏移；落后于保留范围的游标返回日志缺口及当前最早可读位置。追加排队字节达到 1 MiB 时暂停管道消费，磁盘失败终止进程并记录可确认的失败；不能持久化失败时不声称日志完整。重启不依赖日志作为完成证据。

启动先生成 processId 并持久化 `starting`，再 spawn、注册句柄和资源，写 `running` 后返回。spawn 或注册失败清理受管进程和临时目录；同一 Action 不隐式创建第二个进程，当前宿主内已有对应句柄时返回实际状态，旧宿主记录拒绝重启该 Action。过程失败不得仅凭写入的记录推定调用成功，未提交结果沿现有 pending Action 恢复。

```text
starting --> running --> exited
    |           |
    +--> failed +--> stopped

old-host starting/running --> interrupted (read projection, no reconnect)
```

退出时保存实际结果并清理句柄/临时目录，已完成记录保留至 Goal 删除或用户删除开发数据。`process_read` 验证可信 context.goalId 与记录所有者，跨 Run 可用；失败时不泄露其他 Goal 的日志。`process_stop` 按受管进程对象终止整个进程组，SIGTERM 后固定 2 秒宽限再 SIGKILL，进程组和管道全部收敛后结算；不从磁盘 PID 向当前系统任意进程发信号。

普通 observe 中止只终止该等待，已启动进程保留；启动调用中止先清理本次创建的受管资源再传播 `ExecutionAbortedError`。正常关闭使管理器拒绝新启动，close/forceClose 幂等清理所有受管任务；宿主重启读取旧 host 记录时投影为 interrupted，不修改其他宿主记录、不杀旧 PID。与现有 Runtime 一致，不承诺多个宿主并发管理同一 Goal；活动进程不因 Run 暂停或完成而隐式重启或终止。

### Git 专用沙箱与工作树保护

对应 [需求 7](./requirements.md#req-7-1)。固定系统 Git 可执行文件和 `spawn` 参数数组，不接收自由参数或 shell 命令。查询设置 `GIT_OPTIONAL_LOCKS=0`、禁用 pager、外部 diff/textconv 和按需远端抓取；命令不允许额外网络，输出流式消费并按游标偏移取有界片段。Git 不存在或当前平台无法提供所需受限执行能力时返回明确不可用，不退回无沙箱运行。

| Tool ID | 输入要点 | 固定操作 / 验证结果 |
|---|---|---|
| `git_status` | `repoPath?`、`cursor?` | porcelain v2 + NUL 分隔；返回路径与暂存/工作树状态 |
| `git_diff` | `repoPath?`、`staged?`、`paths?`、`cursor?` | 只比较工作树或暂存区；返回文本差异 |
| `git_log` | `repoPath?`、`maxCount?`、`cursor?` | 固定格式提交列表，默认 20、最多 100 条 |
| `git_show` | `repoPath?`、`revision`、`paths?`、`cursor?` | 解析并验证本地对象，再 show 内容/差异 |
| `git_add` | `repoPath?`、`paths` | 非空显式路径，literal pathspec + `--`，返回实际暂存结果 |
| `git_commit` | `repoPath?`、`message` | `commit -m` 当前暂存区；返回实际提交 OID |
| `git_branch_list` | `repoPath?`、`cursor?` | 本地分支及当前分支 |
| `git_branch_create` | `repoPath?`、`name`、`startPoint?` | check-ref-format；从本地有效对象创建，不切换 |
| `git_branch_switch` | `repoPath?`、`name` | 仅切换已有本地分支；关闭远端猜测与强制选项 |
| `git_worktree_list` | `repoPath?`、`cursor?` | porcelain + NUL 分隔；路径、分支/OID、主工作树标识 |
| `git_worktree_add` | `repoPath?`、`path`、`branch` | 目标不存在且父目录存在，使用已有本地分支，不隐式创建分支 |
| `git_worktree_remove` | `repoPath?`、`path` | 验证属于同一仓库、非主工作树且无未保存文件后 remove，无 force |

`repoPath` 默认当前工作区，其他路径须显式通过能力审批；创建 worktree 不自动切换 Goal 工作区或授予其他文件工具外部访问。外部 worktree 的 Git 操作重新授权目标和真实 gitdir/common-dir。通过受限只读探测和 `.git`/commondir 元数据解析定位主仓库与链接工作树，检查所有规范化路径；不信任模型声明的 Git 元数据路径。

Git 专用 Seatbelt 策略仍拒绝 `.lazygoal`；只移除本次已批准 Git 元数据目标的写保护，其余保护不变。授权包含真实 gitdir/common-dir、worktree 目标及需要的父目录范围；主仓库外的 common-dir 必须在审阅中显示。删除/创建所需父目录权限实际按目录树开放，明确呈现其真实范围，不声称单一路径的内核隔离。普通 Bash、process_start 和补丁不能借该计划写 Git 元数据。

清洁环境复用现有 filterSandboxEnvironment：HOME 指向私有临时目录，仅使用可访问的仓库配置，用户身份缺失时明确失败；不默认继承全局凭据或签名代理。仓库钩子保持启用且在相同沙箱运行，不能为提交失败自动禁用钩子或签名。若 Git filter/钩子或签名需要额外路径，当前调用失败，由后续显式能力设计/请求处理，不隐式放宽。

worktree 移除先检查 tracked/untracked/ignored 文件，仅允许 `.git` 管理文件，不因 `.gitignore` 排除用户数据；拒绝锁定、submodule 初始化或无法完整检查的工作树，不运行 clean。移除前再次检查并按 common-dir 做当前进程内写操作串行化；外部 Git/编辑器不受此锁控制，不承诺跨进程删除事务。Git 非零结果返回 failure 及已知影响，超时/中止终止受管进程组，未知副作用按 manual 处理。

### 装配与恢复

对应 [需求 8](./requirements.md#req-8-1)。工具注册与默认 Profile ID 列表从同一个默认工具集入口构建，仍只在无显式 Profile 时扩展默认清单；保留调用方注入 registry/policy 的现有行为，不自动修改已有冻结 Goal Profile。默认 Policy 自动允许已注册专用只读工具和既有入口，写操作沿现有 Default/YOLO 与 Grant 判断，沙箱能力独立校验。

进程 manager/store 随本机 Composition Root 装配并注册关闭；Goal 删除先停止所属受管进程再删除记录。Headless/ACP 不自动扩展 benchmark 的 Profile 或 worker 工具：只修订通用执行身份及已有网页输出消费方，不在此 Spec 新增 benchmark 工具部署或协议。所有新增本机工具经 PTC 子调用路径重新授权并正确归属。

仅扩大当前 Tool 请求、失败 details、Sandbox Grant 当前格式及新增独立进程存储，不引入 Goal/Run 状态、不递增 Snapshot/协议版本。文件和网络的已知领域失败结算为现有 failure；中止传播原异常，写入结果未知保留 pending Action。实现时同步相关中文公共 TSDoc、最小示例及当前架构文档，架构文档不提前写入本设计的未实现能力。

## Testing Strategy

| 验收组 | 必须覆盖的行为证据 |
|---|---|
| 需求 1–3 | 目录直接子项、glob 与过滤、稳定顺序和分页推进、超长行续读、UTF-8/二进制、无法访问的搜索范围、符号链接边界、正则 Worker 超时和中止 |
| 需求 4 | 真正 Git/unified 多文件补丁、创建/删除空文件、mode/末尾换行、偏移但唯一匹配、歧义/格式冲突零写入、晚期文件失败与部分影响、预检后变化、保护路径、manual 结果未知 |
| 需求 5 | fake 后端/本地 HTTP 的来源与分页、UTF-16 偏移、响应体及 JSON 字节额度、deadline/429/5xx/取消；无网络计划不调用后端，不产生真实供应商费用 |
| 需求 6 | 真实长进程和大量 stdout/stderr、日志轮转/缺口/背压、磁盘失败、跨 Goal 拒绝、跨 Run 查询、启动/中止竞态、停止受管子进程、关闭强制清理、重启只投影 interrupted、PID 复用不发信号 |
| 需求 7 | 临时真实仓库的查询/暂存/提交/分支/worktree；钩子失败、身份缺失、保护 `.git`、共用外部 common-dir 授权；拒绝 ignored/untracked/dirty/main/locked/submodule 目标移除；选项注入、超时及已知/未知失败 |
| 需求 8 | 默认/显式/冻结 Profile、输入只准备一次、Default/YOLO 与持续授权撤销、能力变更重新审批、普通/PTC/恢复身份一致、当前 Codec 和 Grant Schema、英文工具诊断 |

使用已有 `npx tsc --noEmit`、受影响包的 Node/tsx 测试、`npm run check:dependencies` 和最终 `npm test`；沙箱权限验收在真实 macOS Seatbelt 环境完成，不把非 macOS 或 fake executor 视为该安全保证通过。测试不绕过现有 Runtime 恢复断言，不以工具单元测试替代真实 Composition Root、PTC 与关闭集成。Tasks 按本表和 Requirements 锚点绑定验收，不预先承诺 SWE-bench 成功率提升。

## Research Findings

- [jsdiff API](https://github.com/kpdecker/jsdiff#api) 提供 Git 文本头解析；默认补丁应用会选择匹配位置且可自动转换换行，因而这里只使用解析能力，唯一定位由本项目实现。
- [picomatch](https://github.com/micromatch/picomatch) 提供无生产依赖的路径匹配；实现前核对锁定发布包 API 和类型声明，不从 master 的未来接口推断发布行为。
- [Git 全局选项](https://git-scm.com/docs/git) 提供 literal pathspec、禁用可选锁和按需抓取控制；[Git worktree](https://git-scm.com/docs/git-worktree) 的非强制移除不能替代本项目对未保存文件的完整检查。
