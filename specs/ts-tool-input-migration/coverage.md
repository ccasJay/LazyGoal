# 工具输入迁移覆盖表

本表按实际注册入口核对工具输入。`生成已登记` 表示 Catalog 已启用 `typescript-binding` 并可生成制品；`待整数能力` 表示 TS/JSDoc 已表达 `@asType integer`，但共享生成器尚未接受该注解，因此暂不启用生成，由工具侧过渡绑定推进准备验证。两类都不代表与模型线完成联合切换。

## 默认与条件工具

| 工具 | 注册入口 | TS 输入 | 绑定登记 | 现状 |
| --- | --- | --- | --- | --- |
| `list_directory` | `createDefaultToolRegistrations` | `ListDirectoryInput` | `tool.list_directory.input` | 待整数能力 |
| `find_files` | 同上 | `FindFilesInput` | `tool.find_files.input` | 待整数能力 |
| `read_file` | 同上；GAIA、SWE-bench、ALFWorld 复用 | `ReadFileInput` | `tool.read_file.input` | 待整数能力 |
| `write_file` | 同上；SWE-bench 复用 | `WriteFileInput` | `tool.write_file.input` | 生成已登记 |
| `edit_file` | 同上；SWE-bench 复用 | `EditFileInput` | `tool.edit_file.input` | 生成已登记 |
| `apply_patch` | 同上 | `ApplyPatchInput` | `tool.apply_patch.input` | 生成已登记 |
| `web_search` | 同上；GAIA 复用 | `WebSearchInput` | `tool.web_search.input` | 待整数能力 |
| `web_fetch` | 同上；GAIA 复用 | `WebFetchInput` | `tool.web_fetch.input` | 待整数能力 |
| `bash` | 同上；GAIA、SWE-bench、ALFWorld 复用 | `BashInput` | `tool.bash.input` | 待整数能力 |
| `process_start` | 条件注册（需要 `processManager` 与 `processSessionStore`） | `ProcessStartInput` | `tool.process_start.input` | 生成已登记 |
| `process_read` | 条件注册 | `ProcessReadInput` | `tool.process_read.input` | 待整数能力 |
| `process_stop` | 条件注册 | `ProcessStopInput` | `tool.process_stop.input` | 生成已登记 |
| `git_status` | 默认注册 | `GitStatusInput` | `tool.git_status.input` | 待整数能力 |
| `git_diff` | 默认注册 | `GitDiffInput` | `tool.git_diff.input` | 待整数能力 |
| `git_log` | 默认注册 | `GitLogInput` | `tool.git_log.input` | 待整数能力 |
| `git_show` | 默认注册 | `GitShowInput` | `tool.git_show.input` | 待整数能力 |
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
| `bash_exec` | TUA-Bench `TuaBenchAdapter` | `BashExecInput` | `tool.bash_exec.input` | 待整数能力 |
| `context_shell` | Context `runContextWorker` | `ContextShellInput` | `tool.context_shell.input` | 生成已登记 |
| 远程代理 `read_file`、`write_file`、`edit_file`、`bash` | `createSwebenchRemoteToolRegistry` | 复用默认工具绑定 | 同默认工具 | 随默认工具 |
| 远程代理 `read_file`、`web_search`、`web_fetch`、`submit_answer` | `createGaiaRemoteToolRegistry` | 复用默认/GAIA 工具绑定 | 同对应工具 | 随对应工具 |

## 边界与剩余工作

- 生成器当前只接受 `pattern`、`minimum`、`maximum`、`minLength`、`maxLength` 约束注解；`@asType integer` 是工具侧表达整数类型的必要条件。生成能力线需要接受该注解或提供等价的整数映射。
- 待整数能力的工具以 `ContractBinding` 接缝和过渡绑定推进准备；不得把过渡验证表述为真实生成制品集成通过。
- 旧工具输入 AST 仍供模型线消费；与模型线的生产切换、删除 AST、真实模型声明到 `prepare` 的联合验证属于集成工作。
- Tool RPC describe 清单必须读取绑定 Schema，不得再编译旧 AST；这一接缝在本方向完成，跨进程联合验证仍由集成阶段执行。
