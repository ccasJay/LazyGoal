# ACP 容器 Runtime 接入 设计

## 审批摘要

### 方案

新增以官方 `@agentclientprotocol/sdk@1.4.0` 稳定 ACP v1 入口为基础的 `@lazygoal/acp` 包；SWE-bench 宿主构建并注入固定 Linux amd64 Worker 与 Node 22.22.2，通过一条私有 stdio 连接复用 ACP 和模型 RPC，在每个题目容器内装配并运行现有 `HeadlessCompositionRoot`。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 公共 ACP v1 封装 | 包只封装稳定 ACP v1 的 Agent、Session 和一次性 Client 生命周期，锁定 SDK 1.4.0；支持 `Text` 与受限 cwd 内 `ResourceLink`，不暴露实验性 v2；其他内容类型拒绝 | 新增公共接口及依赖；调用方获得明确的所有权、取消和释放契约 |
| 每连接多 Session 生命周期 | 一个连接拥有多个可并发 Session，每个 Session 同时只允许一个 Prompt；断线统一取消并释放该连接的 Session | 支持 Session 间并发与隔离，不提供跨连接恢复 |
| 私有双通道路由 | Worker stdio 使用有序、有界的外层 NDJSON 帧复用 `acp` 与 `llm`；题目命令不继承控制描述符，协议输出仅走 stdout，日志仅走 stderr | 模型凭据和 Adapter 留在宿主；任一非法帧使连接明确失败，不能产生伪成功 |
| 可复现 Worker 注入 | 用当前源码和锁文件摘要构建单一 ESM Worker，并从固定官方镜像提取 Node 22.22.2；以内容摘要缓存、生成清单并注入 `/opt/lazygoal` | 题目镜像无需预装 Node 或修改 `/testbed`；启动兼容性检查可能提前终止题目 |
| 容器内 Headless Root | Worker 以 `/testbed` 装配真实 Headless Root、文件持久化和仅含五个内置 Tool 的 Profile，通过确定性 Preparation 自动进入执行 | 评测覆盖完整 Runtime；现有 `swebench_shell` 路径被删除，资源消耗与旧结果不可直接等同 |
| 取消终态与有界产物回收 | 统一 AbortSignal 传播至 ACP、模型、Runtime 和 Tool；先停止执行，再在限时宽限期复制状态并导出 patch，最后强制删除本题容器 | 正常、失败、超时和信号中止均可审计；极端故障可能只有部分产物，但清理不会无限等待 |
| 报告替换与评分不变 | 当前报告 schema 就地改为 ACP 容器字段并使用新配置 ID；提交与评分流程继续只信任官方 `resolved` | 不兼容旧报告消费者；CLI 参数、单次作答、无重试、退出码和完整 Manifest 分母保持现状 |

### 风险与待确认

- 风险等级：high；理由：新增公共协议接口，移动 Runtime 与持久化所有权，并改变跨进程、容器权限和模型凭据边界。
- 关键操作：实现后的真实评测会创建、启动、执行、复制产物并强制删除本次运行唯一命名的题目容器；只操作本次创建的容器，不挂载宿主目录。
- 风险：协议或模型桥故障会中断整题；Node 与上游镜像动态库不兼容会在执行前失败；进入容器的完整 Runtime 会改变耗时和历史结果可比性；强制清理时可能无法保存全部产物。
- 待确认：无。

## Overview

该实现把通用 ACP 生命周期与 SWE-bench 编排分开。`@lazygoal/acp` 只负责稳定 ACP v1 的连接、Session、Prompt 和通知映射；benchmark 代码负责 Worker 构建、Docker 生命周期、宿主模型代理、产物及报告。容器 Worker 复用现有 Headless Root，因此 Goal 状态机、Prompt 构造、模型决策校验、Runner、Storage 和 Tool Registry 都在题目环境内运行。（需求 1、3、8）

宿主仍加载模型配置并持有供应商凭据，题目容器只得到无凭据的 RPC Adapter。每题沿用独立容器和单次作答，结束后由宿主把容器内事实复制到输出目录，再调用现有 Python 桥和官方 harness 评分。（需求 4、7）

## Architecture

```text
eval swebench host
    |
    +--> WorkerBuilder --> cache/{source-lock-digest}/
    |
    +--> SwebenchContainer (one instance)
            |
            +-- docker cp --> /opt/lazygoal/{node,worker,manifest}
            |
            +-- docker exec -i --> WorkerProcess
                    |
                    +-- channel: acp <--> @lazygoal/acp <--> HeadlessCompositionRoot
                    |
                    +-- channel: llm <--> HostLlmRpcServer <--> configured LLMAdapter
                    |
                    +-- tools/storage --> /testbed, /opt/lazygoal/state
```

`MultiplexedConnection` 是 Worker 进程唯一的 stdin/stdout 所有者。双方按通道拆分帧并向 ACP SDK 暴露对象级 `Stream`，向模型桥暴露请求/响应端口；各通道保持自己的顺序和有界队列，公共 writer 以轮转方式处理背压。Worker 日志只写 stderr。`bash` 和其他 Tool 子进程固定使用 `stdin: "ignore"` 与独立 stdout/stderr pipe，无法继承 Worker 控制流。（需求 4.3、4.4、5.3）

## Key Design Decisions

### 公共 ACP v1 封装

新增 workspace package `@lazygoal/acp`，生产依赖精确锁定 `@agentclientprotocol/sdk@1.4.0`，从默认入口使用 `PROTOCOL_VERSION`、`agent()`、`client()` 和对象级 `Stream`。包不复制 ACP Schema，也不导出 SDK 的实验性 v2 接口。（需求 1.1、1.2）

公开边界由以下最小契约组成；实际字段复用 SDK 的 ACP 类型，所有新增或扩展接口及公开方法同步提供中文契约级 TSDoc 和最小示例。（需求 1.3）

```ts
interface LazyGoalAcpSessionFactory {
    create(input: LazyGoalAcpSessionInput): Promise<LazyGoalAcpSession>;
}

interface LazyGoalAcpSession extends AsyncDisposable {
    prompt(content: readonly AcpPromptContent[], control: { signal: AbortSignal }): Promise<LazyGoalAcpPromptResult>;
}

type AcpPromptContent =
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "resource_link"; readonly uri: string; readonly name: string };

interface LazyGoalAcpSessionInput {
    readonly sessionId: string;
    readonly cwd: string;
    readonly signal: AbortSignal;
    readonly update: (update: AcpSessionUpdate) => Promise<void>;
}

function serveLazyGoalAcpAgent(input: {
    readonly stream: AcpStream;
    readonly sessions: LazyGoalAcpSessionFactory;
}): AcpConnection;
function runLazyGoalAcpClient(input: LazyGoalAcpClientInput): Promise<LazyGoalAcpClientResult>;
```

每次 `serveLazyGoalAcpAgent` 调用都拥有独立的 Session Map、连接 AbortSignal 和资源收尾；它使用 SDK `agent().connect(stream)` 返回的连接句柄，不复用跨连接 Session。Agent 固定响应 ACP v1，声明 `loadSession: false`，不注册认证、文件系统、终端、MCP、额外目录、load 或 resume 能力。Client helper 在 `connectWith` 生命周期内依次 initialize、newSession、prompt，逐条交付 update，并在返回或抛错时关闭连接和释放本地路由。（需求 1.1、1.2、2.1、2.2）

Prompt validator 支持官方 v1 baseline 的 `Text` 与 `ResourceLink`。`ResourceLink` 必须是当前 Session cwd 内的本地 `file:` URI：Agent 解析并规范化 URI、拒绝符号链接或规范化后越界的路径、读取可访问的普通文件，并按原输入顺序把文本块和资源块交给 Session；Image、Audio、EmbeddedResource、空文本、非本地 URI、越界 URI 和读取失败均整体拒绝。（需求 2.3）

### 每连接多 Session 生命周期

Agent 为每个连接维护 `Map<sessionId, SessionRecord>`；记录包含绝对 cwd、实现实例、当前 Prompt 的 AbortController 和状态。`session/new` 先完整校验 cwd、空 MCP 与空额外目录，再创建 Session；失败不留下记录。Prompt 接受一个或多个非空 `Text` 或受限 `ResourceLink`，按顺序保留内容；资源 URI 在 cwd 内解析为只读引用后交给 Session。出现空块、非法 URI、越界/不可读资源或其他类型时整体拒绝。（需求 2.2、2.3）

不同记录可并发运行，同一记录通过 `idle | prompting | disposed` 状态拒绝重入。`session/cancel` 只中止对应记录；请求 signal、显式取消和连接 signal 合并成该 Prompt 的控制信号。连接关闭时先标记全部记录 disposed，再中止执行、等待有界收尾并调用每个 Session 的异步释放；已 disposed 的记录禁止发送更新或成功响应。（需求 2.4、2.5、6.3）

### 私有双通道路由

物理传输每行一个 UTF-8 帧：`{ version: 1, channel: "acp" | "llm", sequence: number, payload: unknown }`。每个方向共用一个从 1 开始且严格递增的 sequence；通道各自维护有界待发送队列，但 writer 以轮转方式交错帧，避免 ACP 等待模型时无法处理取消。单帧编码上限为 16 MiB。解码器处理任意 chunk 拆分和合并，只在完整换行后解析；未知版本、重复、跳号、非法 JSON、未知通道、非对象 payload、越界整数和超限行均关闭整条连接，并以当前阶段错误拒绝所有在途请求。（需求 4.3、5.3）

ACP payload 是 SDK `Stream` 的单个 JSON-RPC 消息。LLM payload 是内部 request/response/cancel 消息，request 携带唯一 ID、完整 `LLMRequest` 和 structured-output mode；宿主只允许与已配置 Adapter 相同的 mode，调用 `generate` 后原样返回 `LLMResponse`，或返回结构化 provider/cancel 错误。重复 ID、未知响应或终态后的消息属于协议错误。（需求 4.2、4.3）

### 可复现 Worker 注入

`WorkerBuilder` 以 Worker 入口依赖图、根与 benchmarks 锁文件、构建参数、Node 版本和 ACP SDK 版本计算 SHA-256。缓存 miss 时用 esbuild 生成 `platform=node`、`target=node22` 的单一 ESM；Prompt 模板作为构建输入嵌入 bundle，避免运行时依赖仓库路径。Node 从固定 digest 的官方 linux/amd64 Node 22.22.2 镜像提取，缓存目录通过临时目录和原子 rename 发布。（需求 5.1）

产物清单记录 Worker、Node 和每个输入的摘要。每题启动后，宿主用 `docker cp` 注入 `/opt/lazygoal`，目录不位于 `/testbed`。Worker 在建 Goal 前验证平台为 linux/amd64、Node 版本、所需动态库可加载、清单与文件摘要、`/testbed` 的 base commit 和题目测试环境激活命令；任一失败写入 stderr 诊断并退出，禁止开启 LLM 请求或 Runtime 持久化。（需求 5.1、5.2）

### 容器内 Headless Root

Worker 的 Session metadata 接收经过宿主校验的 `instanceId`、`repo`、`baseCommit`、`goalId`、`runId`、`maxSteps` 和 structured-output mode；ACP Prompt 只承载 `problem_statement`。Worker 由这些输入确定性生成 objective 与完成条件，创建 `swebench-acp-profile`，并通过现有 `HeadlessCompositionRoot` 的确定性 Preparation 和自动 approve 流程进入 executing。（需求 3.1、3.3）

Profile 只注册 `read_file`、`write_file`、`edit_file`、`grep`、`bash`，所有路径边界和 cwd 固定在 `/testbed`；ToolPolicy 对该冻结集合确定性返回 allow。`JsonFileBenchmarkPersistenceAdapter` 改为容器内 `/opt/lazygoal/state/{instanceId}`，每题新建 Registry、Goal、Run 和命名空间。其他 benchmark 继续使用原 Headless Root 接线。（需求 3.2、3.4）

`RpcLlmAdapter` 实现现有 `LLMAdapter`，只发送模型 RPC，不读取容器环境配置。包装 `TrajectoryStore` 在成功提交 `tool_started` 和 `tool_finished` 后发送 ACP tool call update；使用 Runtime 的 actionId 作为稳定 Tool Call ID，输入和结果按固定字节上限截断并显式标记。通知失败会中止 Session，不能改变已提交的 Trajectory 事实。（需求 4.1、6.1）

### 取消终态与有界产物回收

Runtime 结果统一映射：正常完成或 Runtime 等待映射 `end_turn`，步数耗尽映射 `max_turn_requests`，取消收敛后映射 `cancelled`；`PromptResponse._meta` 携带 goalId、runId、run status、stop reason、completed、usage 和容器内相对产物定位。供应商、Worker、传输、Runtime 或清理基础设施错误直接拒绝 Prompt，并由宿主记录 failure stage。（需求 6.2、6.4）

超时、SIGINT/SIGTERM 和 Client cancel 共用同一取消入口：停止接受更新，发送 LLM cancel，中止 Root/Tool，并等待短暂协作退出。随后宿主在独立且有总时限的 artifact grace period 内先复制 Snapshot、Trajectory 和 Diagnostic Trace，再尝试导出相对原 `base_commit` 的 git patch；每一步独立记错。patch 导出使用位于 `/opt/lazygoal` 的临时 `GIT_INDEX_FILE`，通过 `git read-tree <base>`、`git add -A` 和 `git diff --cached --binary <base>` 生成结果，不修改题目仓库的 `.git/index`。宽限期结束后关闭 Worker stdin、等待其退出，再无条件对本次唯一名称执行 `docker rm --force`。（需求 6.3、7.1、7.2）

宿主只在复制成功并校验 goalId/runId 后写入持久化 locator；报告中的路径均相对 output directory。Agent 修改 `.git` 不影响 patch 基准：导出显式使用已验证的原 `base_commit`，失败则记录 `patch_export` 且不提交预测。（需求 7.1、7.3）

### 报告替换与评分不变

`SwebenchReport` 保持当前 schemaVersion 数值并就地替换字段，`configId` 改为 `swebench-acp-container-v1`。报告新增 profile/Worker/Node/镜像/ACP 身份、Goal/Run 终态、用量、patch 摘要、本地持久化 locator 和枚举化 failure stage；删除 `swebench_shell` 身份，不添加旧字段或双模式。（需求 8.1、8.2）

`eval swebench` 的参数、顺序单题执行、一次作答、无自动重试、stdout 摘要、stderr 进度和退出码保持现状。`predictions.jsonl` 仍只接收成功导出的 patch；Python 桥、完整 Manifest 分母和官方 harness 的 `resolved` 判定不读取 ACP 或 Runtime 完成事实。（需求 8.1、8.3）

## Data Models

```ts
type LlmRpcMessage =
    | { type: "generate"; id: string; request: LLMRequest; structuredOutputMode: string }
    | { type: "cancel"; id: string }
    | { type: "result"; id: string; response: LLMResponse }
    | { type: "error"; id: string; code: "provider" | "cancelled" | "protocol"; message: string };

interface WorkerIdentity {
    readonly workerSha256: string;
    readonly nodeVersion: "22.22.2";
    readonly nodeImageId: string;
    readonly acpProtocolVersion: 1;
    readonly acpSdkVersion: "1.4.0";
}
```

内部跨进程输入在 Worker 边界做运行时校验；同进程内已经由 TypeScript 固定的 Runtime DTO 不重复验证。错误详情不得包含 API Key、请求认证头或完整模型响应，协议错误只记录通道、sequence/request ID 和分类。（需求 4.1、5.3）

## Error Handling

宿主使用固定阶段枚举：`worker_build`、`container_start`、`worker_inject`、`worker_preflight`、`transport`、`agent`、`model`、`runtime`、`cancel`、`artifact_copy`、`patch_export`、`cleanup`、`grading`。首个执行错误决定题目未成功，后续产物与清理错误追加保留；取消不会被重写为普通成功或基础设施成功。（需求 6.4、7.2）

Agent 对非法 ACP 参数、未知 Session、Prompt 重入和不支持能力返回 JSON-RPC 协议错误。传输损坏和 Worker 异常关闭整连接。宿主 Adapter 错误只返回无凭据的供应商类别和消息，保留原 cause 于宿主 Diagnostic Trace。所有清理采用幂等容器名检查，重复关闭忽略“容器不存在”，其他错误进入报告。（需求 2、4、5、6）

## Research Findings

- 官方 TypeScript SDK 的默认入口是稳定 ACP v1，`agent().connect(stream)` 与 `client().connectWith(stream, ...)` 是当前 app-style API；实验性 v2 需要显式子路径，因此本包无需自建 ACP JSON-RPC 状态机。
- SDK 的对象级 `Stream` 可以直接接入多路复用器，`ActiveSession` 已提供按 sessionId 分发 update 的基础能力；本包仍负责 LazyGoal Session 所有权、输入限制和断线清理。
- 当前 SWE-bench 已固定 linux/amd64 容器、无网络、无挂载、资源限制、顺序单题、patch 导出和官方评分桥；设计复用这些边界，仅替换 Agent 执行位置与报告身份。
- 当前 Headless Root 已提供确定性任务描述、自动批准、Goal/Run 注入、完整 Runtime 装配和持久化 Port，适合在 Worker 内复用，无需复制执行循环。

## Testing Strategy

- `@lazygoal/acp` 契约测试使用 SDK 内存 Stream：覆盖 initialize 能力、Session 参数、多个文本块、合法 cwd 内 `ResourceLink`、混合/空/越界/不可读内容拒绝、同 Session 重入、跨 Session 并发、更新隔离、cancel、断线和恰好一次释放。（需求 1、2）
- 多路复用与 RPC 测试对任意 byte chunk 做拆分/合并，并覆盖通道交错、背压、顺序、重复/跳号、非法 JSON、未知通道、超限帧、未知 request ID、provider 错误和取消竞争；断言无伪成功且诊断不含凭据。（需求 4、5）
- Worker 单元与集成测试使用真实 `HeadlessCompositionRoot`、内存 ACP Client 和宿主假 Adapter，断言五个 Tool 的真实文件修改、确定性预批准、Tool update、终态映射、Goal/Run 隔离、持久化和用量。（需求 3、6）
- WorkerBuilder 测试覆盖相同输入命中缓存、源码/锁文件/版本变化失效、并发构建原子发布、清单篡改和预检早失败；默认测试通过伪 Docker runner 验证 `pull/create/cp/exec/export/copy/rm` 参数、无网络/挂载/凭据及清理顺序。（需求 4、5、7）
- SWE-bench TypeScript 与 Python 回归覆盖 CLI、完整 Manifest 分母、预测提交、官方 `resolved` 唯一成功来源、报告字段、分阶段错误、正常/异常/超时/信号中止的产物回收和退出码。（需求 7、8）
- 新增显式 `swebench:worker-smoke` 入口，用真实 Docker 在固定 linux/amd64 fixture 镜像中验证 Node 注入、动态库、Worker 握手、宿主假模型和文件修改；它不进入默认无外部依赖回归。（需求 5.2、8.4）
- 默认验证运行 ACP、benchmarks TypeScript、SWE-bench Python、相关 package 测试、全仓库回归、`tsc --noEmit`、`npm run check:dependencies` 和 `git diff --check`；同步更新 package 清单、仓库布局、SWE-bench README 与当前架构文档。（需求 8.4）
