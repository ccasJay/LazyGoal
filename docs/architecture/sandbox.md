# Sandbox 模块

`@lazygoal/sandbox` 提供工作区路径边界、业务 Tool 的 macOS Seatbelt 范围、受限命令与专用 Git 执行底座，以及 PTC 专用的独立 Node.js 计算进程。它不决定 Goal 状态、Profile 授权或工具审批；PTC worker 只能通过宿主控制的管道请求业务 Tool。

## 受限进程与 Git 执行底座

- **受限命令与进程组终止**：[restricted-process](../../packages/sandbox/src/restricted-process.ts) 提取统一的受限子进程启动原语（`spawnRestrictedCommand`）。所有长进程与命令执行置于独立 POSIX 进程组（`detached: true`），两阶段终止机制（`killProcessGroup`：先发 SIGTERM，在宽限期到达后升级为 SIGKILL）确保不留孤儿僵尸进程。[ProcessManager](../../packages/tools/src/process-manager.ts) 在退出状态写入持久存储后才完成进程收尾等待。
- **Git 专用执行底座**：[git-runner](../../packages/sandbox/src/git-runner.ts) 实现本地 Git 查询与写操作的隔离执行。提供 `discoverGitRepository` 发现仓库、worktree 及其实际 gitdir/common-dir 拓扑；强制固定 argv 白名单（`validateSafeGitArgs` / `validateSafeGitWriteArgs`），禁止外部选项透传。只读查询关闭 hooks 与 external diff/textconv；写操作保留仓库 hooks，并在同一受限 Seatbelt 策略内执行。macOS 上直接执行当前 Xcode Developer 目录内的 Git，并只读放行该目录，避免系统 Git 启动器在沙箱外写入 `xcrun` 缓存。执行器复核当前 Action 计划与真实元数据、worktree 目标路径；Git 元数据仅按已批准范围开放写入。普通 Bash 与受管进程会拒绝写入 `.git` 指针、真实 gitdir 和共享 common-dir，不能借用 Git Tool 的授权；`.lazygoal` 始终拒绝写入，网络强制为 none。
- **写操作排他串行化**：`GitMutex` 在当前进程内按仓库绝对路径互斥串行化写操作，杜绝 `index.lock` 并发冲突。

## Program-Triggered Computation (PTC)

PTC 由 [ProgramSandbox](../../packages/sandbox/src/program-sandbox.ts) 启动固定 [worker](../../packages/sandbox/src/program-worker.cjs)：每次程序创建新进程与私有临时目录，继承清洁环境，使用 [专用 Seatbelt 策略](../../packages/sandbox/src/macos-seatbelt.ts) 拒绝宿主文件、网络和进程派生。JavaScript 在无宿主模块、动态代码和计时器的 VM Context 内执行，时间与随机数使用持久化固定值；程序结束只接受显式、可 JSON 序列化的返回值。Seatbelt、Node.js 依赖或资源监控不可用时拒绝启动；非 macOS 平台不执行该功能。

宿主限制源码、管道帧、返回和诊断字节，设置 Node old-space、RSS 采样和独立 watchdog。每一秒活动额度先由 Runtime 写入持久化预留事件，再继续 worker；进程退出后关闭管道并回收私有目录。业务工具仍由 Runtime 逐次授权和提交，worker 不持有工作区能力。
