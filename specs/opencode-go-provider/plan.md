# OpenCode Go 供应商接入执行计划

## 任务清单

- [x] //TODO 1. 升级 `@earendil-works/pi-ai` 至 `1.3.0` 并保持既有供应商行为等价
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)
  - 实施目标：先将 `packages/llm/package.json` 的 `@earendil-works/pi-ai` 由 `0.85.1` 提升到 `1.3.0` 并安装；对照 1.3.0 的目录格式（`chat:` 前缀、`type` 字段）与 API 形状，修正 `pi-ai.ts`（`createModels`/`getModel`/`completeSimple`/`streamSimple`/`api/*` 子路径）与 `model-catalog.ts` 中受影响的用法，确保既有 `openai`/`google`/`anthropic`/`openrouter`/`deepseek` 全部编译并通过原有测试。用一次性探针确认升级后的 `opencodeGoProvider()` 目录 baseUrl 为 `https://opencode.ai/inference/go`。先运行既有测试建立绿色基线，再改动依赖并复跑，任何回归都在本任务内修复到行为等价。
  - 验证手段：`npx tsx --test packages/llm/test/pi-ai.test.ts packages/llm/test/provider-fetchers.test.ts packages/llm/test/model-catalog.test.ts packages/llm/test/two-stage-config.test.ts packages/llm/test/native-tool-calling.test.ts`；断言既有供应商请求形态与断言全部通过，且 opencode-go 目录端点为官方 `/inference/go`。

- [x] //TODO 2. 注册 opencode-go 供应商并接入统一配置与适配器工厂
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)、[1.2](./spec.md#spec-req-1-2)
  - 实施目标：先扩展 `packages/config/test/llm-config.test.ts` 与 `packages/llm/test/two-stage-config.test.ts`，证明 `opencode-go` 在 `prompt_only` 下可构造、在 `strict` 下于副作用前快速失败、`two_stage` 解析为双 prompt_only（与既有 prompt_only 供应商一致）；再在 `LLMProvider` 与 `LLMConfig` 联合新增 `opencode-go`（落入 `anthropic`/`deepseek`/`openrouter` 分支，无 `baseURL`），更新 `readLLMConfig`、`toml-config.ts` 字段白名单与 `config-loader.ts` 校验分支；在 `factory.ts` 的 `decideModeForProvider` 与 `pi-ai.ts` 的 provider 工厂表注册 `opencodeGoProvider`（prompt_only 经 `PiAiAdapter`），并保持 `createReflectionLlmAdapter` 回落行为。同步更新受影响公开 TypeScript 契约的中文 TSDoc。
  - 验证手段：`npx tsx --test packages/config/test/llm-config.test.ts packages/config/test/toml-config.test.ts packages/llm/test/two-stage-config.test.ts packages/llm/test/pi-ai.test.ts`；断言模式校验错误、适配器构造与目录模型解析。

- [x] //TODO 3. 以 `LLMRequest.sessionId` 传递稳定会话身份，并仅对 opencode-go 覆盖 UA、透传会话头
  - 落实标准：[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)
  - 实施目标：先扩展 `packages/llm/test/pi-ai.test.ts`，用本地假服务器断言 opencode-go 请求携带自有 `User-Agent`、且当传入 `sessionId` 时携带 `x-opencode-session` 等于该值、未传入时不得出现空头；再扩展 Agent 侧测试证明运行期以 `goal.id` 填充。实现上在 `core/types.ts` 的 `LLMRequest` 新增可选 `sessionId`，由 `llm-step-executor.ts` 的 providerRequest 注入 `goal.id`，`PiAiAdapter` 仅在 `opencode-go` 下把 `sessionId` 作为 pi-ai `options.sessionId` 传入并通过 `options.headers` 覆盖 `User-Agent`；其它供应商不注入、不改变请求头。会话身份不得写入 Snapshot/轨迹/Trace。
  - 验证手段：`npx tsx --test packages/llm/test/pi-ai.test.ts packages/agent/test/llm-step-executor-metrics.test.ts`；断言请求头、`sessionId` 来源与其它供应商不受影响。

- [ ] //TODO 4. 提供 opencode-go 静态目录与在线模型发现，并抽出共享 id-only 解析
  - 落实标准：[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[1.2](./spec.md#spec-req-1-2)
  - 实施目标：先扩展 `packages/llm/test/provider-fetchers.test.ts` 覆盖 opencode-go 端点（`GET https://opencode.ai/inference/go/v1/models` + `Authorization: Bearer`）与错误分类，并新增解析一致性断言；再在 `provider-fetchers.ts` 抽出纯函数 `parseIdOnlyModelList(json, { provider, acceptModelsKey, allowStringItems })`，让 `openai`/`deepseek`/`openai-compatible`/`opencode-go` 共用，同时保留 Google/Anthropic/OpenRouter 各自分支。在 `model-catalog.ts` 的 `STATIC_FACTORIES` 注册 `opencodeGoProvider` 以启用静态补全，并扩展 `packages/llm/test/model-catalog.test.ts` 验证静态目录与在线合并结果、降级规则（鉴权/权限/协议/取消不降级）。
  - 验证手段：`npx tsx --test packages/llm/test/provider-fetchers.test.ts packages/llm/test/model-catalog.test.ts`；断言端点、共享解析等价、静态+在线合并与降级边界。

- [ ] //TODO 5. 同步模块文档并完成跨模块全量回归
  - 落实标准：[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[1.3](./spec.md#spec-req-1-3)
  - 实施目标：更新 `packages/llm/notes/overview.md`（路由表新增 opencode-go 的 prompt_only 行为、端点与目录来源）、`packages/config/notes/overview.md` 与 `packages/config/notes/model-configuration.md`（新供应商配置项与模式限制），并按仓库约定更新语义表与受影响读者链接；说明 pi-ai 升级带来的目录/兼容性变化。随后运行完整回归并处理本功能引入的问题，不改写无关工作区变更。
  - 验证手段：`npm run check:docs`、`npm test`、`git diff --check`；文档检查与全量回归通过、差异检查无空白错误。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
|---|---|---|---|
| pi-ai 升级与既有供应商等价 | [1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4) | 依赖为 `1.3.0`；`openai`/`google`/`anthropic`/`openrouter`/`deepseek` 的请求形态与原有测试全部通过，无行为回归。 | `npx tsx --test packages/llm/test/pi-ai.test.ts packages/llm/test/provider-fetchers.test.ts packages/llm/test/model-catalog.test.ts packages/llm/test/native-tool-calling.test.ts`；`npm test`。 |
| 官方端点对齐 | [1.2](./spec.md#spec-req-1-2) | opencode-go 目录 baseUrl 为 `https://opencode.ai/inference/go`（openai-completions/responses/google-generative-ai 追加 `/v1`），不含 `/zen/go`。 | 探针读取 `opencodeGoProvider()` 目录；`packages/llm/test/model-catalog.test.ts` 静态目录断言。 |
| 供应商可用与模式固定 | [2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5) | `opencode-go` + 模型 + Key 可构造适配器并发起生成；`strict` 在副作用前失败；`two_stage` 解析为双 prompt_only；失败按既有分类处理，无内部重试。 | `npx tsx --test packages/config/test/llm-config.test.ts packages/llm/test/two-stage-config.test.ts packages/llm/test/pi-ai.test.ts`。 |
| 客户端规范合规 | [3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4) | 请求携带自有 `User-Agent`；同一 Goal 的 `x-opencode-session` 稳定等于 `goal.id`，跨 Run/重启不变；其它供应商不受影响；无会话身份时不发空头。 | `npx tsx --test packages/llm/test/pi-ai.test.ts packages/agent/test/llm-step-executor-metrics.test.ts`。 |
| 目录与在线发现 | [4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4) | 离线可用静态目录；在线合并 `.../inference/go/v1/models` 元数据；鉴权/权限/协议/取消不降级，超时/不可用降级；共享解析与既有 provider 语义一致。 | `npx tsx --test packages/llm/test/provider-fetchers.test.ts packages/llm/test/model-catalog.test.ts`。 |
| 请求级会话身份契约 | [5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3) | `LLMRequest.sessionId` 为可选；Goal 上下文由 `goal.id` 填充并透传为 pi-ai `sessionId`；既有适配器在无该字段时行为不变；身份不落盘。 | `npx tsx --test packages/llm/test/pi-ai.test.ts packages/agent/test/llm-step-executor-metrics.test.ts`。 |
| 文档与完整回归 | [6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2) | `packages/llm` 与 `packages/config` 文档说明新供应商职责、模式、端点与 pi-ai 升级影响，语义表与链接一致。 | `npm run check:docs`、`npm test`、`git diff --check`。 |

### Latest Result

- 状态：未执行
- 新鲜度：-
- 验证时间：-
- 验证摘要：尚未开始执行。
