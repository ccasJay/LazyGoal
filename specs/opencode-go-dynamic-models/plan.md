# OpenCode Go 动态模型执行支持执行计划

## 任务清单

- [x] //TODO 1. 实现 OpenCode Go 在线目录与独立执行元数据的合并
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[4.3](./spec.md#spec-req-4-3)
  - 实施目标：先扩展 `packages/model-catalog/test/model-catalog.test.ts`，覆盖实时列表包含 `minimax-m3.1-flash-free` 且登记路由时可选择、在线未知 ID 保留展示但不可选择、路由存在但在线列表缺少目标时不增加可选条目，以及离线路径不把路由表当作在线可用性。再在 `model-catalog` 为目标登记 `openai-completions`、OpenCode Go 固定端点族、推理能力、1,000,000 上下文与 524,288 最大输出 Token；扩展 `LlmModelDescriptor` 的执行协议字段、合并规则与中文 TSDoc 示例。保留现有 pi-ai 静态模型路径及其它 Provider 行为。
  - 场景与预期：假模型 Fetcher 返回目标 ID 时，目录描述带独立路由与登记容量且可选择；返回无路由的新 ID 时该条目不可选择；未返回目标 ID 时路由登记本身不产生目标条目。
  - 验证手段：`npx tsx --test packages/model-catalog/test/model-catalog.test.ts packages/model-catalog/test/provider-fetchers.test.ts`；测试不访问真实供应商。

- [x] //TODO 2. 让 PiAiAdapter 动态执行已登记的 OpenCode Go 模型
  - 落实标准：[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[4.3](./spec.md#spec-req-4-3)
  - 实施目标：先扩展 `packages/llm-pi-ai/test/pi-ai.test.ts`，用本地假传输覆盖目标模型 ID、固定 `/inference/go/openai/v1/chat/completions` 路由、API Key、自有 User-Agent、`x-opencode-session`、文本／推理／工具事件、流式完成及未知协议拒绝。随后扩展 `LLMConfig`，让 `executionApi` 与登记容量到达 `PiAiAdapter`；对已知动态执行协议按 pi-ai `Model` 契约构造目标模型，并复用 OpenCode Go Provider 的 OpenAI Completions API 与会话头包装。静态模型仍使用 `getModel`；不接受客户端 Base URL，不新增 SDK 目录项。同步新增或修改的公开契约中文 TSDoc 与示例。
  - 场景与预期：Adapter 执行目录外目标时，假传输观察到 OpenCode Go Chat Completions URL 和正确请求头，且输出与流式工具语义通过既有 pi-ai 映射；缺失或不支持的 `executionApi` 在发送请求前失败；现有静态 OpenCode Go 与其它 Provider 测试保持通过。
  - 验证手段：`npx tsx --test packages/llm-pi-ai/test/pi-ai.test.ts packages/llm-core/test/core-consumption.test.ts`；所有网络调用由测试传输替代。

- [x] //TODO 3. 持久化动态执行协议并在 Snapshot 编解码中往返保留
  - 落实标准：[3.1](./spec.md#spec-req-3-1)、[3.3](./spec.md#spec-req-3-3)、[4.3](./spec.md#spec-req-4-3)
  - 实施目标：先扩展 `packages/runtime/test/domain.test.ts`、`packages/runtime/test/goal-model-selection-coordinator.test.ts` 与 `packages/storage/test/goal-snapshot-current.test.ts`，验证执行协议和容量可克隆、可保存／恢复、无效协议被拒绝，且序列化不包含 API Key、认证头或 Base URL。再在 `GoalModelSelection` 与当前 Snapshot v1 DTO／Schema／Codec 中加入非敏感 `executionApi`，更新 `cloneModelSelection` 和模型选择协调器复制逻辑；保留 Snapshot 版本，不添加兼容分支或迁移。
  - 场景与预期：含 `openai-completions`、目标模型 ID、上下文和输出上限的选择编码再解码后逐字段一致；无效执行协议或容量在存储边界失败；快照 JSON 中没有凭据或 Base URL。
  - 验证手段：`npx tsx --test packages/runtime/test/domain.test.ts packages/runtime/test/goal-model-selection-coordinator.test.ts packages/storage/test/goal-snapshot-current.test.ts`。

- [x] //TODO 4. 从服务端目录生成模型选择并恢复相同 Binding
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[3.2](./spec.md#spec-req-3-2)、[3.4](./spec.md#spec-req-3-4)、[4.3](./spec.md#spec-req-4-3)
  - 实施目标：先扩展 `packages/browser/test/browser-model-selection.test.ts`、`packages/browser/test/browser-models.test.ts` 与 `apps/goal-server/test/composition-root-model-switching.test.ts`，证明浏览器只提交模型 ID／Profile ID，额外提交协议、Base URL 或容量会被 wire 边界拒绝，服务端从可选择目录描述生成 `GoalModelSelection`，并在新进程恢复时用快照协议／容量和当前 Profile 凭据构造相同目标 Binding。随后更新 `apps/goal-server/src/runtime/composition.ts` 的目录解析、初始配置与恢复装配，使显式 CLI 配置模型 ID 也只能由服务端执行元数据解析协议；CLI 配置不据此宣称模型已通过实时可用性验证。浏览器模型目录响应继续只投影展示／能力字段，不暴露执行协议、固定路由或凭据。
  - 场景与预期：合法目标 ID 经浏览器选择后，快照与进程 Binding 均含相同协议和容量；伪造协议或容量的请求被拒绝且不写快照；重启后仍使用保存的 API 家族和当前 Profile Key；静态模型恢复不变。
  - 验证手段：`npx tsx --test packages/browser/test/browser-model-selection.test.ts packages/browser/test/browser-models.test.ts apps/goal-server/test/composition-root-model-switching.test.ts apps/goal-server/test/runtime-composition.integration.test.ts`；不调用真实模型服务。

- [x] //TODO 5. 同步架构文档、旧 Spec 范围说明并完成全量验收
  - 落实标准：[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)
  - 实施目标：更新 `packages/model-catalog`、`packages/llm-core`、`packages/llm-pi-ai`、`packages/runtime`、`packages/storage` 与 `apps/goal-server` 的模块概览和语义表，记录目录路由数据来源、适配器构造、Goal 恢复与凭据边界；在 `specs/opencode-go-provider/spec.md` 保留原历史内容并追加获批范围修订。随后运行专项回归、`npm run check:docs`、`npm run check:dependencies`、`npm test` 与 `git diff --check`，只修复本功能引入的问题，不改动无关工作区文件。
  - 场景与预期：模块职责与源码实现一致；旧 Spec 明确静态模型原规则及本目标例外；专项行为、依赖方向、文档链接与全量测试均通过。
  - 验证手段：上述专项命令以及 `npm run check:docs && npm run check:dependencies && npm test && git diff --check`。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
|---|---|---|---|
| 在线可用性与独立路由 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4) | 在线目标且路由已登记时可选；未知在线模型不可选；路由存在但目标未在线时不新增模型；pi-ai 静态目录不增加目标条目。 | `packages/model-catalog/test/model-catalog.test.ts` 与 `provider-fetchers.test.ts`。 |
| 动态请求协议与响应 | [2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4) | 目录外目标使用正确 Completions URL、凭据、UA、会话头并处理文本／推理／工具／流式响应；不支持协议在请求前失败。 | `packages/llm-pi-ai/test/pi-ai.test.ts` 的假传输场景。 |
| 服务端信任边界 | [2.1](./spec.md#spec-req-2-1)、[3.4](./spec.md#spec-req-3-4) | Browser／CLI 只通过模型 ID 选择；执行协议与容量由服务端目录生成，伪造协议、路由或容量不写入 Goal。 | Browser 路由／选择测试及 `apps/goal-server` 组合测试。 |
| Goal 持久化与恢复 | [3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3) | Snapshot 往返保留执行协议和容量，恢复沿用它们与当前 Profile 凭据；秘密与可变 Base URL 不落盘；Snapshot 版本不变。 | Runtime 选择协调测试、`packages/storage/test/goal-snapshot-current.test.ts` 与 Goal 恢复组合测试。 |
| 文档、旧 Spec 与总体回归 | [4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3) | 模块说明／语义表与实现一致，旧 OpenCode Go Spec 保留历史正文并明确本次例外；依赖边界、文档、专项与全量测试通过。 | `npm run check:docs`、`npm run check:dependencies`、`npm test`、`git diff --check`。 |

### Latest Result

- 状态：通过
- 验证时间：2026-10-21 16:12 CST
- 验证摘要：`npm test` 全部通过，包含类型检查、45 个模块／161 份文档检查、274 个源文件依赖边界检查、198 项 GEPA 测试及全部 TS／TSX 与 MJS 回归；`npm run build --prefix apps/goal-server`、`npm run check:docs`、`npm run check:dependencies` 和 `git diff --check` 通过。首次全量回归中 Seatbelt 进程测试一次未读到拒绝 stderr，独立复跑与随后完整回归均通过。
