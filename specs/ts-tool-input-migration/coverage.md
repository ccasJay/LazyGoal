# 工具输入迁移覆盖表

本表按实际注册入口核对工具输入。`生成已登记` 表示 Catalog 已启用 `typescript-binding`、生成制品已提交，且工具注册与 `prepare` 消费该真实绑定。该状态不代表与模型线完成联合切换。

## 默认与条件工具

| 工具 | 注册入口 | TS 输入 | 绑定登记 | 现状 |
| --- | --- | --- | --- | --- |
| `list_directory` | `createDefaultToolRegistrations` | `ListDirectoryInput` | `tool.list_directory.input` | 生成已登记 |
| `find_files` | 同上 | `FindFilesInput` | `tool.find_files.input` | 生成已登记 |
| `read_file` | 同上；GAIA、SWE-bench、ALFWorld 复用 | `ReadFileInput` | `tool.read_file.input` | 生成已登记 |
| `write_file` | 同上；SWE-bench 复用 | `WriteFileInput` | `tool.write_file.input` | 生成已登记 |
| `edit_file` | 同上；SWE-bench 复用 | `EditFileInput` | `tool.edit_file.input` | 生成已登记 |
| `apply_patch` | 同上 | `ApplyPatchInput` | `tool.apply_patch.input` | 生成已登记 |
| `web_search` | 同上；GAIA 复用 | `WebSearchInput` | `tool.web_search.input` | 生成已登记 |
| `web_fetch` | 同上；GAIA 复用 | `WebFetchInput` | `tool.web_fetch.input` | 生成已登记 |
| `bash` | 同上；GAIA、SWE-bench、ALFWorld 复用 | `BashInput` | `tool.bash.input` | 生成已登记 |
| `process_start` | 条件注册（需要 `processManager` 与 `processSessionStore`） | `ProcessStartInput` | `tool.process_start.input` | 生成已登记 |
| `process_read` | 条件注册 | `ProcessReadInput` | `tool.process_read.input` | 生成已登记 |
| `process_stop` | 条件注册 | `ProcessStopInput` | `tool.process_stop.input` | 生成已登记 |
| `git_status` | 默认注册 | `GitStatusInput` | `tool.git_status.input` | 生成已登记 |
| `git_diff` | 默认注册 | `GitDiffInput` | `tool.git_diff.input` | 生成已登记 |
| `git_log` | 默认注册 | `GitLogInput` | `tool.git_log.input` | 生成已登记 |
| `git_show` | 默认注册 | `GitShowInput` | `tool.git_show.input` | 生成已登记 |
| `git_add` | 默认注册 | `GitAddInput` | `tool.git_add.input` | 生成已登记 |
| `git_commit` | 默认注册 | `GitCommitInput`、`GitCommitAuthorInput` | `tool.git_commit.input` | 生成已登记 |
| `git_branch_list` | 默认注册 | `GitBranchListInput` | `tool.git_branch_list.input` | 生成已登记 |
| `git_branch_create` | 默认注册 | `GitBranchCreateInput` | `tool.git_branch_create.input` | 生成已登记 |
| `git_branch_switch` | 默认注册 | `GitBranchSwitchInput` | `tool.git_branch_switch.input` | 生成已登记 |
| `git_worktree_list` | 默认注册 | `GitWorktreeListInput` | `tool.git_worktree_list.input` | 生成已登记 |
| `git_worktree_add` | 默认注册 | `GitWorktreeAddInput` | `tool.git_worktree_add.input` | 生成已登记 |
| `git_worktree_remove` | 默认注册 | `GitWorktreeRemoveInput` | `tool.git_worktree_remove.input` | 生成已登记 |

## Program 工具

| 工具 | 注册入口 | TS 输入 | 绑定登记 | 现状 |
| --- | --- | --- | --- | --- |
| `execute_program` | `createExecuteProgramRegistration` → `createProgramToolRegistration` | `ExecuteProgramInput` | `tool.execute_program.input` | 生成已登记 |

## 评测与远程 Worker 工具

| 工具 | 注册入口 | TS 输入 | 绑定登记 | 现状 |
| --- | --- | --- | --- | --- |
| `submit_answer` | GAIA `getGaiaToolManifest`、`createGaiaWorkerToolRegistry`、远程代理 | `SubmitAnswerInput` | `tool.submit_answer.input` | 生成已登记 |
| `alfworld_reset` | ALFWorld `createAlfworldToolSet` | `AlfworldResetInput` | `tool.alfworld_reset.input` | 生成已登记 |
| `alfworld_step` | 同上 | `AlfworldStepInput` | `tool.alfworld_step.input` | 生成已登记 |
| `bash_exec` | TUA-Bench `TuaBenchAdapter` | `BashExecInput` | `tool.bash_exec.input` | 生成已登记 |
| `context_shell` | Context `runContextWorker` | `ContextShellInput` | `tool.context_shell.input` | 生成已登记 |
| 远程代理 `read_file`、`write_file`、`edit_file`、`bash` | `createSwebenchRemoteToolRegistry` | 复用默认工具绑定 | 同默认工具 | 随默认工具 |
| 远程代理 `read_file`、`web_search`、`web_fetch`、`submit_answer` | `createGaiaRemoteToolRegistry` | 复用默认/GAIA 工具绑定 | 同对应工具 | 随对应工具 |

## 边界与剩余工作

- 生成能力线已支持 `@asType integer`，全部 30 个工具输入均已启用 `typescript-binding` 并生成 Schema、校验器与 `ContractBinding`；`createTransitionalToolInputBinding` 不再存在于生产入口，只保留为测试夹具辅助。
- 旧工具输入 AST 仍供模型线消费。模型线需要把 `AuthorizedToolContract`、`model-context` 工具投影、`model-request` 声明与动态组合切到 `BoundToolDefinition.inputBinding.schema` / `modelProjection()`，并删除对 `ToolDefinition.inputContract` 的读取。
- 联合切换阶段需要删除工具输入 AST 导出、`ToolDefinition.inputContract`、`ToolInputContract` 和测试夹具的过渡绑定，随后运行真实模型声明到 `prepare` 的集成测试、Worker 跨进程测试和完整回归；这些检查在本方向为 pending-integration，不由替身结果代替。
- Tool RPC describe 清单已改为读取绑定 Schema，不再编译旧 AST；真实 Worker 跨进程联合验证仍由集成阶段执行。
