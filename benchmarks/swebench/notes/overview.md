# SWE-bench 评测

Verified 实例的容器执行、补丁导出和官方评分。本文描述当前实现、使用边界与限制；[公开入口](../src/cli.ts)。


## 边界

[`eval swebench`](../src/cli.ts) 是显式评测入口，使用固定
Verified Manifest、单题单次作答和官方 `swebench==4.1.0` 评分。无界面 Benchmark
入口仅在配置与依赖预检通过后才构造模型 Adapter 和容器 Worker；普通 Web 服务不加载
Python 或 Docker。
运行方式和产物说明见 [SWE-bench ACP container evaluation](../README.md)。

## 数据与执行

[`Python bridge`](../python/bridge.py) 按数据集 revision 读取
固定实例，保存原始记录供官方 harness 使用；作答适配器只接收 issue、repo、
base commit、instance ID 和镜像引用，参考补丁及评分测试不进入 Agent 上下文。

[`Evaluator`](../src/evaluation.ts) 顺序委托单题 ACP
[`Supervisor`](../src/supervisor.ts)，由容器 Worker 内的
[`HeadlessCompositionRoot`](../../src/headless-composition-root.ts) 复用既有
Goal 生命周期、Trajectory 上下文、Storage 编解码与 Trace。容器 Profile 只授权五个
内置文件/命令 Tool，Runtime 的 Tool 校验和 Evidence Gate 仍然生效。

[`SwebenchEnvironmentSpec`](../src/environment-spec.ts) 声明官方
amd64 实例镜像、`/testbed` 工作区、base commit 预检和 patch 导出；
[`SwebenchContainer`](../src/container.ts) 只作为共享隔离环境的
生命周期适配。每题独立容器无网络、无宿主挂载，有固定资源上限；所有模型 shell 操作只
进入容器，文件修改跨调用保留，shell 状态不保留。进程执行、中止与输出边界由共享
[`ProcessRunner`](../../src/process.ts) 管理。

[`WorkerBuilder`](../../src/worker-builder.ts) 根据 Worker 入口依赖图、
锁文件、Prompt 资产和固定 Node/ACP 构建参数计算 SHA-256 身份，并用 esbuild 生成单一
Node 22 ESM Worker。构建结果先写入摘要临时目录，再以原子 rename 发布；完整 manifest
校验通过后才能命中缓存。Node 二进制由宿主从固定 linux/amd64 镜像提供，构建器不在
题目工作区安装依赖。

容器启动后，`SwebenchContainer.injectWorker` 通过 `docker cp` 将 Worker、Node 和
manifest 写入 `/opt/lazygoal`，不向 `/testbed` 添加挂载或环境变量；
`preflightWorker` 在任何模型请求和 Runtime 副作用前检查容器平台、Node 版本、动态库、
两个文件摘要、base commit 以及 `testbed` 内的 Python/pytest。预检和 Worker 启动共用
Conda 初始化；Worker 激活 `testbed` 后通过 `exec` 启动 Node，Tool 继承此环境并使用
独立 stdio。初始化日志进入 stderr，stdin/stdout 专用于 ACP 控制流。

Worker 侧的 [`runSwebenchAcpTask`](../src/worker-runtime.ts) 在
容器内装配真实 `HeadlessCompositionRoot`，固定 `swebench-acp-profile` 和
`read_file`、`write_file`、`edit_file`、`grep`、`bash` 五个 Tool；五个 Tool 都以
`/testbed` 为根，每个调用创建独立 Registry。任务 metadata 只在 Worker 内生成确定性
objective 和完成条件，并作为普通 Run 的初始用户上下文交给 Headless Root；它不会提交任务提案或自动批准任务。Goal、Run 和
JSON Storage 通过 `instanceId`、`goalId`、`runId` 分别隔离。metadata 校验和
structured-output mode 一致性检查在首次 Root 副作用前完成。

Worker ACP Session 通过 [`createSwebenchAcpSessionFactory`](../src/worker-runtime.ts)
绑定单次 Prompt 和单题 metadata。`AcpTrajectoryStore` 只在 `tool_started` 与
`tool_finished` 事实成功追加后发送对应 ACP Tool 更新，使用 Runtime `actionId` 作为
稳定 Tool Call ID，并按固定字节上限标记截断输入和输出。Headless `completed`/`waiting`
映射为 `end_turn`，步数上限映射为 `max_turn_requests`，取消映射为 `cancelled`；
Runtime、通知或清理错误不会形成成功终态。已知失败通过标准 JSON-RPC 错误 data
传递阶段、业务错误码及已有结果 metadata；未知异常只发送固定安全消息。
宿主校验错误数据和 Goal/Run 身份，不依赖远端 Error 原型。

单题 [`runSwebenchSupervisor`](../src/supervisor.ts) 通过共享
[`IsolatedEnvironment`](../../src/isolated-environment.ts) 把上述 Worker 接入
宿主模型：它先启动、注入并预检容器，再创建 ACP/LLM 双通道、一次性 Client
和宿主 RPC Server。任务超时或外部取消共用一个 AbortSignal；Worker 停止后，Supervisor
在独立的有界宽限期内按 Goal Snapshot、Trajectory、Trace、patch 顺序逐项复制或导出，
单步失败只追加对应阶段错误，最后幂等删除本题容器。patch 使用 `/opt/lazygoal` 下的
临时 `GIT_INDEX_FILE` 相对已校验 base commit 导出，不修改题目仓库的 `.git/index`。
成功复制的 Goal 文件会校验 Goal/Run 身份，报告 locator 只保存相对于宿主 output 根的路径。

## 结束与评分

当前 `eval swebench` 入口由 `evaluation.ts` 使用共享隔离 Supervisor，报告身份为
`swebench-acp-container-v1`。每次评测先构建或复用一个带 Prompt 资产的 Worker 产物，
再按 Manifest 顺序将同一产物注入各自容器；模型完成、ACP 终态或 Runtime 状态不参与
官方评分事实。未能创建环境或导出补丁的题目单独记录，不重试。
`readOutcome` 不做评分。Evaluator 逐题保存补丁、预测和阶段报告后，才将预测交给
官方 harness 在新的干净环境评分；正式测试结果不反馈给本次作答。

成功事实仅来自官方 `resolved`，模型终态独立保存。报告的分母始终是完整 Manifest，
区分未运行、未提交、空补丁、未解决和评分错误；错误不得缩小分母。输出目录与
评分 run ID 每次独立，避免覆盖已有产物或命中旧预测的评分缓存。

Snapshot、Trajectory、Trace 位于本次输出目录的 `runtime/`；共享 Attempt 记录位于
`attempts/<instanceId>/attempt-1.json`，报告保存定位、模型
配置、Manifest/Profile 哈希、镜像 ID、补丁哈希、任务耗时和 token 用量。终态 metadata
缺失时，Supervisor 从回收 Snapshot 恢复状态、从 Trace 聚合已记录响应的用量；恢复失败
独立记录诊断。状态无法确认时为 `unknown`，仅确定未启动 Worker 时为 `not_started`；
用量无法取得时为 null，汇总通过 `unknownUsageAttempts` 显示此缺口，不推算 token。

## 当前限制

第一版仅支持 Verified、固定 shell Profile、顺序单次作答和官方 amd64 镜像。
镜像 tag 为上游 `latest`，报告记录实际镜像 ID；跨运行比较需核对镜像一致性。
SIGINT/SIGTERM 清理本次容器并保存已有产物，但不支持从 Goal Snapshot 恢复容器。
预置五题 Astropy 清单只用于接入冒烟测试，不代表整体能力。

已有预测可使用 `grade swebench --output <run-directory>` 重新调用官方 harness；该入口
只读取 `dataset.json`、`predictions.jsonl` 和已有 patch，不解析 LLM 配置。

## 操作说明

运行前提、命令和结果示例见 [使用说明](./usage.md)。
