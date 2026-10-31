# 其他边界剩余 AST 消费者清单

本清单落实 [Spec 1.1](./spec.md#spec-req-1-1) 与 [1.4](./spec.md#spec-req-1-4)：以 Catalog 的 `durable` 边界、生产导入、真实装配和跨进程入口为基线，记录每个剩余消费者的所有者、调用链、信任位置和负责 Spec。旧 Contract AST 指 `packages/contracts` 的 `contract.*`、`Contract`、`InferContract`、`compileJsonSchema`、`safeParse(Contract, ...)` 与相关 AST 推导，不包括 `canonicalJson`、`isRecord`、`deepFreeze`、`compareCodeUnits`、`JsonValue` 等通用 JSON 原语。

## 扫描方法

- Catalog 对照：`contracts/catalog.json` 的 `boundaries[]` 中 `boundary = "durable"` 的全部入口，以及 `entries[]` 中 `definitionKind = "contract-ast"` 的条目。
- 生产导入扫描：`rg -n "@lazygoal/contracts|compileJsonSchema|safeParse\\(|contract\\.|InferContract|AgentDecisionContract" packages apps benchmarks bin scripts --glob '!**/test/**' --glob '!**/node_modules/**'`。
- 装配核对：逐项沿 `apps/goal-server`、`packages/agent`、`packages/runtime`、`packages/llm`、`benchmarks/src` 与各 Benchmark Worker 入口核对实际调用链。
- 测试入口核对：真实进程与 Worker 入口包括 [`agent-components-worker.integration.test.ts`](../../benchmarks/test/agent-components-worker.integration.test.ts)、[`tool-rpc.test.ts`](../../benchmarks/test/tool-rpc.test.ts)、[`llm-rpc.test.ts`](../../benchmarks/test/llm-rpc.test.ts)、[`multiplex.test.ts`](../../benchmarks/swebench/test/multiplex.test.ts) 与 [`sidecar-client.test.ts`](../../benchmarks/alfworld/test/sidecar-client.test.ts)。

## 本线直接拥有且已是 TS 类型（无结构 AST）

| 边界 | 调用链与信任位置 | 所有者 | 负责 Spec / 处置 | 证据 |
| --- | --- | --- | --- | --- |
| ACP 客户端/Agent | `packages/acp/src/index.ts` 装配 `serveLazyGoalAcpAgent`、`runLazyGoalAcpClient`；ACP v1 wire 由 `@agentclientprotocol/sdk` 解码，本包只在 Agent 入口校验 `cwd`、Prompt 内容、资源路径与 Session 生命周期。 | `@lazygoal/acp` | 本线：保持现有 TS 类型与 SDK 协议，不生成自有 AST。 | [`contracts.ts`](../../packages/acp/src/contracts.ts)、[`agent.ts`](../../packages/acp/src/agent.ts)、[`client.ts`](../../packages/acp/src/client.ts)、[`agent-session.test.ts`](../../packages/acp/test/agent-session.test.ts)、[`client-lifecycle.test.ts`](../../packages/acp/test/client-lifecycle.test.ts) |
| 沙箱 Worker Mux 帧 | 子进程 stdio NDJSON → `MuxFrameDecoder` → `MultiplexedConnection` 的 `acp`/`llm`/`tools` 通道；边界校验 UTF-8、版本、通道、序号、单帧与队列字节上限。 | `benchmarks/src/multiplex.ts` | 本线：TS 帧类型与手写边界校验；不是 Contract AST。 | [`multiplex.ts`](../../benchmarks/src/multiplex.ts)、[`multiplex.test.ts`](../../benchmarks/swebench/test/multiplex.test.ts) |
| Tool RPC 传输 | Host `ToolRpcClient` ↔ Worker `ToolRpcServer`；`tools` 通道载荷校验消息判别、Action/Request 身份、Goal/Run 身份、重复 Action、并发执行、取消与 Observation kind。工具输入的字段与 Schema 归工具线，传输与身份边界归本线。 | `benchmarks/src/tool-rpc.ts` | 本线：传输协议 TS 类型；工具输入契约见工具线。 | [`tool-rpc.ts`](../../benchmarks/src/tool-rpc.ts)、[`tool-rpc.test.ts`](../../benchmarks/test/tool-rpc.test.ts) |
| LLM RPC 传输 | Host `LlmRpcServer` ↔ Worker `RpcLlmAdapter`；`llm` 通道校验消息判别、请求 ID、structured-output 模式、请求消息、响应 blocks、错误分类与取消。模型请求/响应 DTO 归 `llm-core`/模型线协议，RPC 传输归本线。 | `benchmarks/src/llm-rpc.ts` | 本线：传输协议 TS 类型；模型 wire 契约见模型线。 | [`llm-rpc.ts`](../../benchmarks/src/llm-rpc.ts)、[`llm-rpc.test.ts`](../../benchmarks/test/llm-rpc.test.ts) |
| ALFWorld Python sidecar | Node `SidecarClient` 启动 Python 子进程，JSONL 请求含 `requestId`/`op`，响应校验 `requestId`、`ok`、health/reset/step 结果、超时、中止、进程退出与并发请求；Python 侧协议在 `sidecar.py`。 | `benchmarks/alfworld/src/sidecar-client.ts`、`benchmarks/alfworld/python/sidecar.py` | 本线：外部进程协议使用 TS 类型与边界读取；不是 Contract AST。 | [`sidecar-client.ts`](../../benchmarks/alfworld/src/sidecar-client.ts)、[`sidecar.py`](../../benchmarks/alfworld/python/sidecar.py)、[`sidecar-client.test.ts`](../../benchmarks/alfworld/test/sidecar-client.test.ts) |
| Bench ACP Task Metadata | 各 Benchmark Worker 从 ACP `sessionMeta` 接收 `unknown`，在 Worker 入口解析任务身份、Goal/Run、路径、步数、输出模式与冻结 Profile。 | ALFWorld、GAIA、SWE-bench、TUA-Bench Worker | 本线：外部输入边界保留手写解析与拒绝规则；不是 Contract AST。 | [`alfworld/worker-runtime.ts`](../../benchmarks/alfworld/src/worker-runtime.ts)、[`gaia/worker-entry.ts`](../../benchmarks/gaia/src/worker-entry.ts)、[`swebench/worker-runtime.ts`](../../benchmarks/swebench/src/worker-runtime.ts)、[`tua-bench/worker-entry.ts`](../../benchmarks/tua-bench/src/worker-entry.ts) |
| Process Session 运行时 | `ProcessManager` 拥有受管进程生命周期与输出；`ProcessSessionRecord` 是 Runtime 端口类型，文件表示与严格 Schema 由 Storage 线拥有；重启时投影 `interrupted`。 | `@lazygoal/process-runtime`、`packages/runtime/src/process-session-store.ts` | 本线：Runtime/进程边界使用 TS 类型；文件 DTO 与 Schema 归 [Storage Spec](../ts-storage-contract-migration/spec.md)。 | [`process-manager.ts`](../../packages/process-runtime/src/process-manager.ts)、[`process-session-store.ts`](../../packages/runtime/src/process-session-store.ts)、[`process-manager.test.ts`](../../packages/process-runtime/test/process-manager.test.ts)、[`process-session-store.test.ts`](../../packages/storage/test/process-session-store.test.ts) |
| Session 输入与排队数据 | HTTP/会话适配层把 `SessionInput` 交 Runtime admission；`validateSessionInputShape` 校验判别、文本上限、Goal/Run 身份、queue binding 与 revision；持久化由 Snapshot/Storage 线负责。 | `packages/runtime/src/session-input.ts` | 本线：排队数据在 Runtime 边界验证；持久化表示归 Storage 线。 | [`session-input.ts`](../../packages/runtime/src/session-input.ts)、[`session-input.test.ts`](../../packages/runtime/test/session-input.test.ts)、[`session-queue.test.ts`](../../packages/runtime/test/session-queue.test.ts) |
| 外部 LLM Provider 适配 | `llm-core` 定义 TS 请求/响应与错误分类；`llm-openai`、`llm-google`、`llm-pi-ai` 在各自 Provider wire 边界解码，不构造 Contract AST。 | `@lazygoal/llm-core`、Provider 适配包 | 本线：外部适配保持现有 TS 协议与失败/取消语义；模型动态输出契约归 [模型 Spec](../ts-model-contract-migration/spec.md)。 | [`llm-core/src/types.ts`](../../packages/llm-core/src/types.ts)、[`openai-compatible.ts`](../../packages/llm-openai/src/openai-compatible.ts)、[`gemini.ts`](../../packages/llm-google/src/gemini.ts)、[`pi-ai`](../../packages/llm-pi-ai/src/index.ts) |

## 其他 Spec 负责的 AST 消费者

| 消费者 | 调用链与信任位置 | 负责 Spec / 处置 | 证据 |
| --- | --- | --- | --- |
| Runtime AgentDecision 校验 | `Runner` 在接收模型决策后调用 `safeParse(AgentDecisionContract, value)`，构造 canonical 错误信息；这是模型动态输出的 Runtime 消费点。 | [模型 Spec 1.4](../ts-model-contract-migration/spec.md#spec-req-1-4) / 计划 TODO 3：Runtime 决策验证改用模型线绑定。 | [`runner.ts:72`](../../packages/runtime/src/runner.ts#L72)、[`runner.ts:74`](../../packages/runtime/src/runner.ts#L74)、[`runner.ts:566`](../../packages/runtime/src/runner.ts#L566) |
| Program Tool 输入准备 | `createProgramToolRegistration` 在注册/准备时编译并 `safeParse` `execute_program` 输入契约。 | [工具 Spec 1.1](../ts-tool-input-migration/spec.md#spec-req-1-1) / 计划 TODO 2-3：Program 输入迁移到工具绑定。 | [`runtime/tool.ts:30`](../../packages/runtime/src/tool.ts#L30)、[`runtime/tool.ts:37`](../../packages/runtime/src/tool.ts#L37) |
| Worker 远程工具声明 | `ToolRpcServer.describe` 从工具注册的 `inputContract` 编译 `inputSchema`；`RemoteToolRegistry` 在注册与准备时编译/解析工具输入。 | [工具 Spec 1.3](../ts-tool-input-migration/spec.md#spec-req-1-3) / 计划 TODO 2：远程 Worker 声明与工具准备使用同一绑定。 | [`tool-rpc.ts:538`](../../benchmarks/src/tool-rpc.ts#L538)、[`remote-tool-registry.ts:71`](../../benchmarks/src/remote-tool-registry.ts#L71)、[`remote-tool-registry.ts:78`](../../benchmarks/src/remote-tool-registry.ts#L78) |
| Benchmark 工具清单 | GAIA 与 SWE-bench 的 Worker 工具清单从工具注册的 `inputContract` 编译 `inputSchema`。 | 工具 Spec 1.1/1.3：Benchmark 工具输入与远程声明归工具线。 | [`gaia/tool-manifest.ts:69`](../../benchmarks/gaia/src/tool-manifest.ts#L69)、[`swebench/tool-manifest.ts:57`](../../benchmarks/swebench/src/tool-manifest.ts#L57) |
| 模型投影中的工具输入 Schema | `projectTools` 在模型上下文中把 `tool.inputContract` 编译为模型可见 `inputSchema`；模型线负责投影，工具线提供同一绑定。 | [模型 Spec 1.2](../ts-model-contract-migration/spec.md#spec-req-1-2)：动态组合使用工具线绑定。 | [`model-inference-projector.ts:408`](../../packages/model-context/src/model-inference-projector.ts#L408) |
| Benchmark 工具输入 AST 定义 | ALFWorld、GAIA、TUA-Bench、Context Worker 的工具输入仍以 `contract.object(...)` 定义；这些是工具输入而不是本线协议。 | [工具 Spec 1.1](../ts-tool-input-migration/spec.md#spec-req-1-1)：全部评测/Worker 工具输入归工具线。 | [`alfworld-tools.ts:34`](../../benchmarks/alfworld/src/alfworld-tools.ts#L34)、[`submit-answer.ts:23`](../../benchmarks/gaia/src/submit-answer.ts#L23)、[`bash-exec-tool.ts:36`](../../benchmarks/tua-bench/src/bash-exec-tool.ts#L36)、[`context/worker-entry.ts:16`](../../benchmarks/context/src/worker-entry.ts#L16) |
| Model Response 的 Contract 错误类型 | `model-response` 使用 `ContractValidationError` 包装模型输出校验失败；该错误类型与模型解码同属模型线。 | 模型 Spec 1.3/1.4：模型解码与错误路径由模型线迁移。 | [`model-output.ts:1`](../../packages/model-response/src/model-output.ts#L1)、[`stage-response.ts:21`](../../packages/model-response/src/stage-response.ts#L21) |
| Web / Storage 专用 AST | `web-contracts` 的 command/activity/event 等 AST；`storage` 的 Snapshot/Json Store；分别由 Web 与 Storage 线拥有。 | [Web Spec](../ts-web-contract-migration/spec.md)、[Storage Spec](../ts-storage-contract-migration/spec.md)。 | [`web-contracts/src/contracts`](../../packages/web-contracts/src/contracts)、[`storage/src/goal-snapshot.ts`](../../packages/storage/src/goal-snapshot.ts) |
| 测试夹具中的 AST | `apps/goal-board/e2e/test-service.ts` 使用 `contract.object` 构造测试工具；不是生产消费者。 | 非生产；随 Web E2E 夹具在集成阶段处理。 | [`test-service.ts:29`](../../apps/goal-board/e2e/test-service.ts#L29) |

## 通用 JSON 原语（不属于旧 AST 消费者）

以下导入只使用 `packages/contracts` 的非 AST 能力；[删除 AST Spec 1.3](../remove-legacy-contract-ast/spec.md#spec-req-1-3) 要求保留或迁移其行为，本线不把它们计作待迁移契约。

| 原语 | 实际消费者（生产） | 处置 |
| --- | --- | --- |
| `canonicalJson` / `canonicalizeJson` | `packages/context-budget/src/stable-json.ts`、`packages/permission/src/grant-matching.ts`、`packages/runtime/src/action-approval.ts`、`packages/runtime/src/session-input.ts`、`packages/working-memory/src/core.ts` | 通用 JSON 规范化；保留行为。 |
| `compareCodeUnits` | `packages/context-budget/src/stable-json.ts`、`packages/context-retrieval/src/context-protocol.ts` | 稳定排序；保留行为。 |
| `isRecord` | Runtime、Model Context、Benchmark、Working Memory 的未知输入守卫 | 通用对象守卫；保留行为。 |
| `deepFreeze` | `packages/model-context`、`packages/storage` | 只读快照；保留行为。 |
| `JsonValue` / `JsonSchema202012` 类型 | `packages/llm-core`、`packages/context-retrieval`、`packages/working-memory` | 共享 JSON 类型；无 AST 构造或解析。 |

## 归属结论

- Catalog `durable` 边界中没有 `definitionKind = "contract-ast"` 的条目；ACP、Mux、Tool/LLM RPC、ALFWorld sidecar、Bench ACP metadata、Process Session 与 Session 输入均已使用 TS 类型，并在进程/外部/排队边界做运行时读取。
- 本线生产代码未发现仍构造、推导或解析旧 Contract AST 的消费者；现存 AST 使用点全部落在工具线、模型线、Web 线或 Storage 线的负责范围，或为测试夹具。
- 因此 TODO 2 不需要替换本线不存在的 AST 定义；需要验证的是真实进程/Worker 的合法、非法、身份与取消语义，以及上述归属在集成后仍成立。

## 待集成复核

- 工具线与模型线切换后，`runtime/src/tool.ts`、`runtime/src/runner.ts`、`benchmarks/src/tool-rpc.ts`、`remote-tool-registry.ts`、Benchmark 工具清单与 `model-context` 投影应由协调者在集成 worktree 复核；本线不修改这些归属文件。
- 若集成后出现新的本线 AST 消费者，按 Spec 1.2 在本线补充迁移，而不是把 Catalog 条目存在本身当作消费证明。
