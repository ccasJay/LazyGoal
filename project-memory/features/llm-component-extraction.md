---
feature: llm-component-extraction
status: active
summary: 将 packages/llm 拆为 llm-core、llm-openai、llm-google、llm-pi-ai 与 model-catalog 五个私有能力包，llm 只保留默认装配，config 单向依赖共享契约
source_spec: specs/llm-component-extraction/
distilled_at: 2026-10-17
reviewed_at: 2026-10-17
tags: [llm, component-extraction, llm-core, openai, google, pi-ai, model-catalog, dependency-direction, entry-isolation]
authorities: [packages/llm-core/src/index.ts, packages/llm-openai/src/index.ts, packages/llm-google/src/index.ts, packages/llm-pi-ai/src/index.ts, packages/model-catalog/src/index.ts, packages/llm/src/default-adapters.ts, packages/config/src/llm-config.ts, scripts/check-dependencies.mjs, packages/llm/test/package-entry-isolation.test.ts]
---

# LLM 能力拆包与默认装配收敛

## Purpose

- 将 `packages/llm` 的能力拆为五个可独立消费的私有包：供应商无关调用契约（`llm-core`）、OpenAI/OpenAI-compatible 原生适配（`llm-openai`）、Gemini 原生适配（`llm-google`）、pi-ai prompt_only 适配（`llm-pi-ai`）与模型目录（`model-catalog`）；`llm` 只保留三个默认工厂与阶段装配，消费者可直接使用单一能力而无需默认装配或构造整套执行链。 [S1, S2]

## Durable Decisions

- D1 — 依赖方向：`config` 单向依赖 `llm-core` 的共享模型契约；`llm` 只依赖 `llm-core` 与三个适配包，不依赖 `config`、`model-catalog` 或生成 SDK；供应商适配包互不依赖、不反向依赖目录或应用配置；`model-catalog` 只依赖 `llm-core` 与同版本 pi-ai 静态目录 SDK。 [S1, S2, S4]
- D2 — 共享契约唯一归属 `llm-core`：`LLMAdapter`/`LLMRequest`/`LLMResponse`/`LLMStreamEvent`、`LLMConfig`/`LLMProvider`/`StructuredOutputMode`、唯一 `LLMConfigurationError` 构造器、`NormalizedUsage` 与 `readNormalizedUsage` 数值守卫、无 SDK 的暂时故障分类；原生消息与续接引用 `model-contracts`，取消与暂时故障身份引用 `execution-control`；core 不含任何供应商 SDK 的运行时或类型依赖。 [S1, S2, S4]
- D3 — `llm` 门面收窄：公共入口只导出 `createLlmAdapter`、`createLlmStageAdapters`、`createReflectionLlmAdapter` 与自有 `LlmStageAdapters`；旧 `factory`/`core`/`adapter`、供应商与目录路径全部删除且无兼容转发；smoke 入口移到 `test/`，付费 smoke 保持显式语义。 [S1, S2, S3]
- D4 — 供应商行为保持：请求映射、原生身份与续接回放、Gemini strict 投影与哨兵恢复、pi-ai 增量流与失败语义、SDK 内部重试关闭；`piUsage` 不取得正式用量身份，缺失用量不以零或估算补齐；`two_stage` 的环境与 TOML 既有差异保持。 [S1, S2]
- D5 — 目录独立且选择规则保持：默认工厂在线查询与直接构造（无 Fetcher）的离线路径并存；鉴权、权限、非法协议与取消不兜底，网络故障、超时或端点不支持沿用静态目录/配置兜底；不新增缓存、后台刷新或模型 Binding 所有权。 [S1, S2]
- D6 — 机器边界：依赖门登记五包方向、能力包入口穿透、core/config 供应商 SDK 泄漏、旧路径转发与构建产物引用，覆盖普通/类型 import/export、类型位置、侧效与字面量动态导入；入口隔离测试在独立子进程验证导入与构造零网络、零宿主副作用（信号/退出）与零越界加载；SDK 归属与锁定版本由 manifest/锁文件核对（`llm-pi-ai` 与 `model-catalog` 使用同一锁定 pi-ai 版本）。 [S1, S2, S4, S5]

## Guardrails

- 不新增 SDK、供应商、模型协议、重试、降级、缓存或发布配置；不升级供应商 SDK；不改变 SDK 构造与消息映射。 [S1]
- 不为迁移保留双实现、兼容转发或转导出替代入口；消费者直接引用所有者入口。 [S1, S2]
- 不伪造用量、完成证据或缓存命中；不扩大目录兜底范围；目录与诊断不泄露凭据或敏感响应正文。 [S1]
- 确定性验证不调用真实供应商、线上目录或付费模型；付费 smoke 保持显式授权语义，未执行不得报告供应商端到端验证通过。 [S1, S2]

## Revisit When

- 新增供应商或模型协议，或需要独立安装、发布、SDK 门面能力时。
- OpenAI、Google 或 pi-ai SDK 版本升级、锁定版本变化或静态目录真源调整时。
- `two_stage` 与阶段装配策略调整，或环境与 TOML 配置入口差异收敛时。
- 跨 Spec 集成验证或后续组件提炼调整包边界时。

## Sources

- S1: `specs/llm-component-extraction/spec.md`
- S2: `specs/llm-component-extraction/plan.md`
- S3: `packages/llm/src/index.ts`
- S4: `scripts/check-dependencies.mjs`
- S5: `packages/llm/test/package-entry-isolation.test.ts`
