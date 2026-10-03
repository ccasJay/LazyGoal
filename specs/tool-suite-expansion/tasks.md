# 工具集扩展 实施计划

按以下顺序执行；Requirements 与 Design 已获批准，本计划仍待独立审批。工具参数、资源额度和安全决策以 [Design](./design.md) 为准，风险依据见 [风险与待确认](./design.md#风险与待确认)。新增测试均标为待实现，不将计划命令当作已执行证据。

每个 TODO 交付一个已接入的行为切片，并同步受影响的中文公共契约 TSDoc、最小示例和当前架构文档。完成时只修改 checkbox，保留 `//TODO` 及其后的原文。各切片运行 `npx tsc --noEmit` 和其针对性测试；新增工具当次接入默认工具集及 Policy，显式和冻结 Profile 不扩大，不留待后续统一接线。

- [ ] //TODO 1. 接入可信工具执行身份和通用沙箱授权

  - 实现目标：扩展 Tool 执行上下文与能力派生接口，贯通普通/流式调用、PTC 和恢复；将 Sandbox Grant 当前格式泛化，更新 Permission、Storage、TUI/Browser 及远端注册适配器，先接入现有 Bash；建立默认工具集的注册与 Profile 同源入口。
  - 成功判据：现有 Bash 的准备输入只解析一次，普通调用和 PTC 收到正确 Goal/Run；Default/YOLO 下额外能力仍需审批，持续授权撤销或路径变化不放行；旧开发 Grant 明确拒绝，不降级或迁移；显式 Profile 保持原工具集合。
  - 验证方式：扩展现有 `sandbox-permission-action.test.ts`、`sandbox-plan-recovery.test.ts`、`program-execution.test.ts`、Permission/Storage Grant 与 TUI Policy 测试；新增可信身份测试（待实现）。运行 `npx tsx --test packages/runtime/test/sandbox-permission-action.test.ts packages/runtime/test/sandbox-plan-recovery.test.ts packages/runtime/test/program-execution.test.ts packages/permission/test/grant-matching.test.ts packages/storage/test/sandbox-grant-store.test.ts packages/tui/test/tool-policy.test.ts benchmarks/test/remote-tool-registry.test.ts` 及 `npm run check:dependencies`。
  - _Requirements: [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_

- [ ] //TODO 2. 实现可分页的目录列举与文件定位

  - 实现目标：依赖 TODO 1，接入 `list_directory`、`find_files`，安装锁定的 picomatch，完成有界遍历、查询绑定游标、路径保护和可终止的模式匹配；加入两个工具的默认注册、输入 Contract 和英文诊断。
  - 成功判据：目录只返回直接子项；分页定位可获得全部可扫描匹配且顺序稳定，达到扫描额度时即使零匹配也能续查；非法/错查询游标、不支持的深度、不可访问范围和越界符号链接均明确失败；超时或取消不会阻塞宿主。
  - 验证方式：新增 `packages/tools/test/list-directory.test.ts`、`find-files.test.ts`（待实现），覆盖根目录、过滤、空结果、额度及游标推进、失败/中止和保护路径；扩展输入与 CLI 注册测试。运行 `npx tsx --test packages/tools/test/list-directory.test.ts packages/tools/test/find-files.test.ts packages/tools/test/input-contracts.test.ts packages/tui/test/cli.test.ts`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_

- [ ] //TODO 3. 扩展文本读取与带上下文的搜索

  - 实现目标：依赖 TODO 2，扩展 `read_file` 行范围/行内续读及结构化结果，扩展 `grep` 文件过滤、上下文、Worker 匹配和分页；更新 CLI、Agent 及已有测试中真实消费结果的代码，不保留旧输出兼容层。
  - 成功判据：大文件、超长行和文件首尾都能准确读取/续读；搜索返回可区分的匹配与上下文行；空文件/零匹配与非法范围、二进制、读取失败明确区分；模式超时和调用中止正确收敛，输出实际 JSON 字节不越界。
  - 验证方式：扩展现有 `read-file.test.ts`、`grep.test.ts`、`input-contracts.test.ts` 和相关 Agent/CLI 用例，覆盖不同页大小、查询变化、UTF-8、超长行和部分搜索失败。运行 `npx tsx --test packages/tools/test/read-file.test.ts packages/tools/test/grep.test.ts packages/tools/test/input-contracts.test.ts packages/tui/test/cli.test.ts`，另运行本次实际修改的 Agent 消费方测试。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_

- [ ] //TODO 4. 实现严格预检的多文件补丁应用

  - 实现目标：依赖 TODO 1–3，安装锁定的 diff，完成 `apply_patch` 的解析、唯一定位、整批预检及逐文件写入；将有界 `failure.details` 贯通 Runtime 校验、当前 Codec、模型/UI 消费和恢复，接入默认工具集。
  - 成功判据：标准 unified/Git 文本补丁能创建、修改和删除文件，包括空文件、模式及末尾换行；唯一偏移匹配可应用，歧义/格式/路径错误在首个写入前拒绝；预检后变化或晚期写失败报告真实已知影响，未知结果保持 manual 等待且不重复应用。
  - 验证方式：新增 `packages/tools/test/apply-patch.test.ts`、`packages/runtime/test/apply-patch-recovery.test.ts`（待实现），使用真实 Git 生成补丁并注入明确写入故障；扩展 Storage 当前 Snapshot 和 UI/模型结果用例。运行 `npx tsx --test packages/tools/test/apply-patch.test.ts packages/runtime/test/apply-patch-recovery.test.ts packages/storage/test/goal-snapshot-current.test.ts packages/tools/test/input-contracts.test.ts`，并执行实际修改的结果消费方测试。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [4.5](./requirements.md#req-4-5), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_

- [ ] //TODO 5. 接入有界且受授权的网页搜索与抓取

  - 实现目标：依赖 TODO 1、3，接入已有网页工具的默认注册、派生网络能力、执行计划检查和请求 deadline；扩展抓取来源/偏移输出、响应体上限，更新已有本机及远端结果消费方。
  - 成功判据：搜索得到有界来源列表或空列表，抓取可按 UTF-16 偏移续读；无有效网络计划时后端不被调用；响应超大、超时、取消和网络错误不冒充成功；只有明确暂时故障沿既有安全重试路径，PTC 不绕过审批。
  - 验证方式：使用 fake 后端和本地 HTTP 扩展 `web-search.test.ts`、`web-fetch.test.ts`；新增 `packages/runtime/test/web-tool-permission.test.ts`（待实现），覆盖源 URL、正文上限、字符偏移及授权/恢复，不请求真实搜索供应商。运行 `npx tsx --test packages/tools/test/web-search.test.ts packages/tools/test/web-fetch.test.ts packages/runtime/test/web-tool-permission.test.ts benchmarks/test/remote-tool-registry.test.ts benchmarks/test/tool-rpc.test.ts`。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_

- [ ] //TODO 6. 实现按 Goal 隔离的长进程管理与宿主关闭

  - 实现目标：依赖 TODO 1–3，提取受限命令启动/终止原语并保持 Bash 行为；一次完成进程 Store Port、Storage 状态/轮转日志、ProcessManager 和 `process_start/read/stop`；接入默认工具、资源关闭及 Goal 删除入口。
  - 成功判据：启动立即返回身份，日志可有界续读并显示退出结果/缺口；跨 Goal 不可读或停止，跨 Run 可观察；重复启动、日志背压/磁盘失败和中止不产生隐式副作用重放；stop/正常关闭终止受管进程组，重启只投影 interrupted 且不连接或误杀旧 PID。
  - 验证方式：新增 `packages/tools/test/process-tools.test.ts`、`packages/storage/test/process-session-store.test.ts`、`packages/tui/test/process-lifecycle.integration.test.ts`（待实现），使用真实长进程、子进程、重启和磁盘失败；扩展 Bash/Shutdown/PTC 回归。运行 `npx tsx --test packages/tools/test/process-tools.test.ts packages/storage/test/process-session-store.test.ts packages/tui/test/process-lifecycle.integration.test.ts packages/tools/test/bash.test.ts packages/runtime/test/shutdown.test.ts packages/runtime/test/program-interruption.test.ts`。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4), [6.5](./requirements.md#req-6-5), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_

- [ ] //TODO 7. 接入专用沙箱中的本地 Git 查询

  - 实现目标：依赖 TODO 1、2、6，构建固定 argv 的 Git 执行和仓库资源发现入口；接入 status/diff/log/show、branch/worktree 列举与分页，禁止查询的可选写入、外部 diff/textconv、远端抓取及自由选项透传。
  - 成功判据：临时真实仓库的工作树/暂存区、提交、分支和 worktree 返回可定位结果，超限可续查；不存在对象或仓库、选项注入、不可用沙箱/系统 Git 明确失败；外部 common-dir 未授权不读取，查询不改变 index 或连接远端。
  - 验证方式：新增 `packages/tools/test/git-read-tools.test.ts`、`packages/sandbox/test/git-sandbox.test.ts`（待实现），覆盖真实仓库、链接工作树和严格受限环境；扩展默认注册/PTC 用例。运行 `npx tsx --test packages/tools/test/git-read-tools.test.ts packages/sandbox/test/git-sandbox.test.ts packages/tui/test/cli.test.ts packages/runtime/test/program-execution.test.ts`。
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.3](./requirements.md#req-7-3), [7.4](./requirements.md#req-7-4), [7.5](./requirements.md#req-7-5), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_

- [ ] //TODO 8. 实现本地 Git 暂存提交与分支写操作

  - 实现目标：依赖 TODO 4、7，接入 git_add/commit、分支创建/切换及当前进程内写操作串行化；Git 专用执行仅开放本次获授权元数据，更新真实权限审阅和 manual 恢复；增加文件发现到补丁再到提交的自动化组合场景。
  - 成功判据：只暂存指定路径，提交返回实际 OID，分支创建/切换结果可核验；未指定文件与会被覆盖的改动保持原状；钩子、身份或签名失败不被绕过；Default/YOLO 均不能让 Bash/进程/普通写工具借用 Git 元数据计划，未知提交不自动重复。
  - 验证方式：新增 `packages/tools/test/git-write-tools.test.ts`、`packages/runtime/test/git-tool-recovery.test.ts`、`packages/tui/test/tool-suite.integration.test.ts`（待实现），覆盖真实仓库、拒绝钩子、dirty 切换、恢复、TUI/Browser 审阅和直接/PTC 组合流。运行 `npx tsx --test packages/tools/test/git-write-tools.test.ts packages/runtime/test/git-tool-recovery.test.ts packages/tui/test/tool-suite.integration.test.ts packages/sandbox/test/git-sandbox.test.ts`，另执行实际修改的权限 UI 测试。
  - _Requirements: [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3), [7.5](./requirements.md#req-7-5), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_

- [ ] //TODO 9. 实现受授权且保留用户文件的 worktree 创建与移除

  - 实现目标：依赖 TODO 7、8，接入 worktree add/remove，完成真实目标/父目录/common-dir 能力审阅与执行前复核；将 worktree 操作加入组合流和手工改动保护的自动化用例。
  - 成功判据：已授权目标从现有本地分支创建并返回路径/分支，干净的非主工作树可移除；主工作树、dirty/untracked/ignored、locked、初始化 submodule 或无法完整检查的目标拒绝且文件保留；不使用 force/clean，不因创建而扩张其他工具的路径权限；已知失败和结果未知分别结算。
  - 验证方式：新增 `packages/tools/test/git-worktree-tools.test.ts`（待实现），覆盖真实仓库、外部目录和移除前变化；扩展 `git-sandbox.test.ts`、`git-tool-recovery.test.ts`、`tool-suite.integration.test.ts`。运行 `npx tsx --test packages/tools/test/git-worktree-tools.test.ts packages/sandbox/test/git-sandbox.test.ts packages/runtime/test/git-tool-recovery.test.ts packages/tui/test/tool-suite.integration.test.ts`。
  - _Requirements: [7.4](./requirements.md#req-7-4), [7.5](./requirements.md#req-7-5), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_

## Feature Verification

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3) | 只列直接子项；glob 定位及默认目录排除正确；排序/分页推进、空结果、不可访问范围和链接边界正确 | TODO 2 的目录/文件测试及 CLI 注册用例（新增部分待实现） |
| [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3) | 行范围及超长行分片不丢文本；空文件/EOF 明确；非法范围、二进制和读取失败不冒充成功 | TODO 3 的 read-file 用例（扩展部分待实现） |
| [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3) | 文件过滤、正则/大小写、匹配/上下文区分正确；文件首尾、扫描额度、续查及已知错误正确 | TODO 3 的 grep/Worker 用例（扩展部分待实现） |
| [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3) | 实际 Git/unified 新增/修改/删除成功；偏移只接受完整唯一匹配；非法、歧义、多文件晚期 hunk 冲突均零写入 | TODO 4 的补丁测试（待实现） |
| [4.4](./requirements.md#req-4-4), [4.5](./requirements.md#req-4-5) | 写入故障/文件变化停止后续应用且报告部分影响；崩溃或未提交结果进入 manual，不自动应用或以内容推断成功 | TODO 4 的故障、Codec 与 Runtime 恢复测试（待实现） |
| [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3) | 搜索列表/空结果及 URL 来源正确；抓取分页可继续；超大响应、deadline、暂时/普通故障、取消各自结算 | TODO 5 的 fake 后端/本地 HTTP 与 Runtime 授权测试（新增部分待实现） |
| [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2) | 长任务不等待退出即可返回；状态/退出码、双通道日志分页/缺口准确；重复或未知启动不创建额外任务 | TODO 6 的真实进程、日志存储和恢复用例（待实现） |
| [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4), [6.5](./requirements.md#req-6-5) | 跨 Goal 拒绝，跨 Run 可读；停止/正常关闭无遗留受管进程；重启为 interrupted 且不重跑/重连/误杀；取消、背压和资源额度有界 | TODO 6 的真实进程组、关闭/重启、磁盘失败与 PID 复用用例（待实现） |
| [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2) | Git 查询无隐式写入且可分页；指定路径暂存、实际提交 OID 正确；身份/钩子失败保留失败结果 | TODO 7–8 的真实 Git 查询、写入及恢复用例（待实现） |
| [7.3](./requirements.md#req-7-3) | 分支列举、创建及切换正确；冲突创建/覆盖改动被拒绝，无强制切换或删除 | TODO 7–8 的分支用例（待实现） |
| [7.4](./requirements.md#req-7-4), [7.5](./requirements.md#req-7-5) | worktree 列举/创建/干净移除正确；主工作树及任意未保存文件拒绝移除；已知失败与未知结果分开，不执行排除操作或自动清理 | TODO 7–9 的 worktree、保护路径及 manual 恢复用例（待实现） |
| [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3) | 默认清单完整、显式/冻结 Profile 不扩大；每个工具直接/PTC 均受授权；资源范围变化、撤销及真假计划不可越权；结果有界/可序列化、英文诊断、正确重放和当前 Run 证据提交 | TODO 1 的现有工具回归与各新增切片的参数化授权/PTC/恢复用例（新增部分待实现） |
| 文件到 Git 组合工作流 | 默认 Composition Root 使用发现→读取/搜索→补丁→差异→暂存/提交；只引用已提交 Observation，实际提交内容与目标修改一致，用户无关改动保留 | TODO 8–9 的 tool-suite.integration.test.ts，使用确定性 executor 与真实临时仓库（待实现） |
| 网页与进程组合工作流 | 普通调用/PTC 获取资料及启动→分次观察→停止；权限等待可恢复、不同 Run 可观察且不同 Goal 不可访问，关闭完成不依赖单个工具成功路径 | TODO 5–6 的 Runtime/PTC 和真实 Composition Root 集成（待实现） |
| high 风险边界 | 真实 macOS Seatbelt 下验证 Git 元数据独立授权、越界文件/网络在 YOLO 仍审批；普通写工具/Bash/进程不能复用 Git 计划；新 Grant 当前格式存储与恢复激活一致 | TODO 1、4–9 的 Permission/Storage/Seatbelt 集成；缺真实沙箱环境则记录 blocked，不以 fake 或跳过冒充通过 |
| 全量回归与文档契约 | 类型、包依赖及全部确定性回归通过；公共接口 TSDoc、架构文档符合实际实现，需求链接有效，Spec TODO 原文保持 | `npx tsc --noEmit`、`npm run check:dependencies`、`npm test`、`git diff --check` 与变更审查；不执行收费 LLM smoke 或真实外部业务写入 |

### Latest Result

未执行。上述新测试尚未实现，当前仅完成规划文档检查，不代表功能验收通过。执行后逐项记录实际结果、证据位置和未解决项，并记录验证时间、被测提交或“未提交”、相关文件内容指纹及 Requirements/Design 指纹；整体状态使用 `passed / failed / blocked / pending-human`，时效使用 `current / stale`。任何必要检查缺失或跳过均不得记为 passed。
