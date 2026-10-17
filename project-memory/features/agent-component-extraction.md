---
feature: agent-component-extraction
status: active
summary: "将 packages/agent 的能力拆为九个可独立消费的私有包，agent 只保留默认执行器装配"
source_spec: specs/agent-component-extraction/
distilled_at: 2026-10-17
reviewed_at: 2026-10-17
tags: [agent, component-extraction, prompt-bundle, model-execution, dependency-direction, binding, recovery]
authorities: [packages/agent/src/create-agent-executor.ts, packages/agent/src/index.ts, packages/model-execution/src/llm-step-executor.ts, packages/model-view/src/index.ts, packages/prompt-bundle/src/default-bundles.ts, packages/context-budget/src/index.ts, scripts/check-dependencies.mjs]
---

# Agent Component Extraction

## Purpose

- 将 `packages/agent` 的能力拆为九个可独立消费的私有包（`context-budget`、`model-view`、`model-context`、`prompt-renderer`、`prompt-bundle`、`model-request`、`model-response`、`model-call`、`model-execution`），`agent` 只保留默认执行器装配；模型请求、输出接受条件、模板正文、预算与恢复行为在迁移中保持。 [S1, S2]

## Durable Decisions

- D1 — 九包各有单一边界：`context-budget` 拥有计量、预算分配与单元选择；`model-view` 单一定义模型可见输入与历史结果 DTO；`model-context` 拥有 Runtime 到模型的投影、来源适配与 Hot / Warm 组装；`prompt-renderer` 拥有内存渲染机制；`prompt-bundle` 拥有模板真源与默认装配；`model-request` 准备请求与 Section 更新计划；`model-response` 解码响应；`model-call` 执行单次调用与记录；`model-execution` 协调阶段、Binding 与反馈转换。 [S1, S2, S10, S12, S13]
- D2 — 依赖方向为上限且受机器检查：Runtime、LLM、Storage 等基础包不得反向依赖九包或 `agent`；`context-budget` 无 LazyGoal 出站依赖，`model-view` 不得导入 Runtime 或投影实现，渲染包不得导入默认 Bundle / Runtime，解码包不依赖请求构造与调用层，调用包不依赖请求构造或 Binding。 [S1, S2, S17]
- D3 — View DTO 单一定义：模型可见字段只由 `model-view` 声明，不在实现文件中另起表示、不通过 `import("...")` 保留 Runtime 类型引用；Runtime 到 View 的转换留在 `model-context` 的 Projector，不得以放宽字段、复制 DTO 或类型转导出消除边界。 [S1, S9, S11]
- D4 — `agent` 的唯一行为入口是 `createAgentExecutor(options): Promise<StepExecutor>`：只解析 Renderer 与 Compactor 两个默认值（`prompt-bundle` 默认 Renderer、`context-budget` 的 `DropOldestContextCompactor`），不解析环境 / Profile、不创建 Provider、Store、工具、Runner 或关闭管理器；构造期不调用模型或工具，模板缺失或配置错误在构造期拒绝；公共入口不转导出九包类型与实现。 [S1, S2, S3, S4]
- D5 — 渲染机制与默认内容分离：`prompt-renderer` 只接收显式内存模板、Manifest、Section 定义与 View，不读取默认资产、工作区或 Runtime 状态；`prompt-bundle` 持有当前唯一 `.njk` 真源、Manifest、具体 Section 定义与 Runtime 协议适配；Worker 从该真源打包内嵌，脱离源码模板目录仍可运行。 [S1, S2, S12, S13, S16]
- D6 — 阶段执行固定同一 Binding：`model-execution` 在阶段开始时读取并固定一次 Binding（不可变 generation，异步调用中不得换用），由 `model-request` 准备请求与匹配解析契约，`model-call` 执行一次调用并返回最终响应与 callId，`model-response` 用同一契约解码；解码失败用同一 callId 记录诊断，不新增 Adapter 调用、不重记指标、不让解码包创建 RuntimeFeedback。 [S1, S2, S5, S6, S7, S8, S18]
- D7 — 行为等价以基线对照证明：迁移保持消息正文 / 角色 / 顺序、工具可见交集、Shape Guide、Section 更新、预算结果与解析契约；只有 Snapshot 提交边界内的有效事实参与 Hot / Warm、原生历史与 Section 基线，输入日志与诊断不取得恢复权威。 [S1, S2, S14]
- D8 — 机器约束与资产发现：依赖门检查九包方向、View / Renderer 文件规则、入口穿透与类型位置引用（import / export、type import、`import("...")` 类型表达式、侧效与字面量 dynamic import）；新包源码、测试、模板加载与 Worker bundle 分别验证，禁止项目内 dist / lib / build 产物导入；维持私有包与直接源码消费，不发布 npm、不建分组目录或兼容层。 [S1, S2, S16, S17]

## Guardrails

- `agent` 不得保存能力实现或充当统一转导出入口，不保留旧路径转发、并行副本或历史别名。 [S1, S3, S4]
- 不改变模板正文、系统声明、协议版本、Schema 或持久化结构；不新增历史数据兼容分支，也不恢复已移除的后台压缩或 Warm Sidecar。 [S1, S2]
- 新包不取得 Goal / Run 推进、授权、工具执行、重试预算、检查点提交或恢复决策权；借用 Adapter、Store、Recorder 与取消信号不因拆包被关闭。 [S1, S2, S15]
- Benchmark 只迁移导入、模型执行默认装配与模板资源定位，不迁移其 Runtime 装配或改变评分。 [S1, S16]

## Revisit When

- 需要发布 npm 包、独立构建产物或跨语言模型协议时。
- 新增模型阶段、上下文算法、Provider、插件平台或后台压缩任务时。
- 模板真源、Worker 打包方式、Section 更新协议或 Binding 发布规则再次变化时。

## Sources

- S1: `specs/agent-component-extraction/spec.md`
- S2: `specs/agent-component-extraction/plan.md`
- S3: `packages/agent/src/create-agent-executor.ts`
- S4: `packages/agent/src/index.ts`
- S5: `packages/model-execution/src/llm-step-executor.ts`
- S6: `packages/model-request/src/prompt.ts`
- S7: `packages/model-response/src/stage-response.ts`
- S8: `packages/model-call/src/model-call.ts`
- S9: `packages/model-context/src/model-inference-projector.ts`
- S10: `packages/context-budget/src/index.ts`
- S11: `packages/model-view/src/index.ts`
- S12: `packages/prompt-renderer/src/renderer.ts`
- S13: `packages/prompt-bundle/src/default-bundles.ts`
- S14: `packages/model-execution/test/component-extraction-baseline.test.ts`
- S15: `packages/agent/test/create-agent-executor.test.ts`
- S16: `benchmarks/test/agent-components-worker.integration.test.ts`
- S17: `scripts/check-dependencies.mjs`
- S18: `packages/model-execution/src/model-execution-binding.ts`
