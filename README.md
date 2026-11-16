# LazyGoal

LazyGoal 是 Goal 驱动、可恢复的 Agent Runtime。使用 `node bin/lazygoal.cjs web` 启动本机服务；评测命令从 `node bin/lazygoal.cjs eval` 进入。依赖与常用脚本见 [package.json](./package.json)。

Web 服务和 Worker 共用启动时解析的代理配置。显式 HTTP(S) 代理变量优先；macOS 上没有显式配置时，读取系统的 HTTP 或 HTTPS 代理。使用代理需要支持 `--use-env-proxy` 的 Node.js，代理故障会使对应请求失败。详见 [Goal Server 出站代理](./apps/goal-server/notes/overview.md#出站代理)。

确定性回归由 `npm test` 按 `packages/<pkg>/test/`、`apps/*/test/`、`benchmarks/**/test/` 与 `scripts/*.test.mjs` 发现测试；各单元以源码相对路径互相消费，不依赖项目构建产物，产物目录（`dist`/`lib`/`build`）不参与模块解析与依赖检查。

当前实现的领域状态与恢复见 [Runtime](./packages/runtime/notes/overview.md)，服务装配见 [Goal Server](./apps/goal-server/notes/overview.md)。各单元的说明和语义表由自身维护：

- [Goal Board](apps/goal-board/README.md)
- [Goal Server](apps/goal-server/README.md)
- [共享评测框架](benchmarks/README.md)
- [ALFWorld 评测](benchmarks/alfworld/README.md)
- [GAIA 评测](benchmarks/gaia/README.md)
- [SWE-bench 评测](benchmarks/swebench/README.md)
- [TUA-Bench 评测](benchmarks/tua-bench/README.md)
- [ACP 服务与客户端](packages/acp/README.md)
- [Agent 默认装配](packages/agent/README.md)
- [浏览器服务边界](packages/browser/README.md)
- [配置解析](packages/config/README.md)
- [上下文预算](packages/context-budget/README.md)
- [上下文检索](packages/context-retrieval/README.md)
- [通用 JSON 原语](packages/contracts/README.md)
- [契约运行时绑定](packages/contract-binding/README.md)
- [构建期契约 Catalog](contracts/README.md)
- [执行控制](packages/execution-control/README.md)
- [执行事件流](packages/execution-stream/README.md)
- [HTTP 宿主](packages/http/README.md)
- [模型默认装配](packages/llm/README.md)
- [LLM 核心契约](packages/llm-core/README.md)
- [Chat Completions 线格式](packages/wire-chat-completions/README.md)
- [Anthropic Messages 线格式](packages/wire-anthropic-messages/README.md)
- [Google GenerateContent 线格式](packages/wire-google-generate-content/README.md)
- [供应商适配层](packages/llm-adapters/README.md)
- [Gemini 适配](packages/llm-google/README.md)
- [模型调用](packages/model-call/README.md)
- [模型目录](packages/model-catalog/README.md)
- [模型上下文组装](packages/model-context/README.md)
- [模型协议契约](packages/model-contracts/README.md)
- [模型执行协调](packages/model-execution/README.md)
- [模型请求准备](packages/model-request/README.md)
- [模型响应解码](packages/model-response/README.md)
- [模型视图](packages/model-view/README.md)
- [权限档位与边界判定](packages/permission/README.md)
- [进程会话运行时](packages/process-runtime/README.md)
- [Prompt 渲染](packages/prompt-renderer/README.md)
- [Prompt Bundle](packages/prompt-bundle/README.md)
- [Goal Runtime](packages/runtime/README.md)
- [沙箱执行](packages/sandbox/README.md)
- [会话指标](packages/session-metrics/README.md)
- [斜杠命令](packages/slash-command/README.md)
- [持久化实现](packages/storage/README.md)
- [工具核心](packages/tool-core/README.md)
- [内置工具](packages/tools/README.md)
- [Web 传输契约](packages/web-contracts/README.md)
- [结构化工作记忆](packages/working-memory/README.md)
- [GEPA 优化](prompt-evaluation/gepa/README.md)
- [Harness2 优化](prompt-evaluation/harness2/README.md)

Context 恢复评测入口见 [Context Benchmark](./benchmarks/context/README.md)。
