# Provider 配置档案与运行时切换执行计划

风险等级、命名关键操作与否定性保证见 [spec.md 的风险与否定性保证](./spec.md#风险与否定性保证)；本计划不重复该评估。

## 任务清单

- [x] //TODO 1. 交付 Provider Profile 实体、Provider 规则校验与 Home 级 Store
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[2.6](./spec.md#spec-req-2-6)
  - 实施目标：先在 `packages/config/test/provider-profile-store.test.ts` 建立行为断言（0600/0700 权限、原子写、schema 版本与损坏内容 fail-fast、空 Store 不自动导入 `[llm]`、同 kind 多份并存、省略 `apiKey` 保留原值、校验失败不落盘）；再在 `packages/config` 内实现 `ProviderProfile` 实体与校验函数（复用现有 provider 白名单、strict 门禁、`baseURL` 允许集合与容量关系规则，不另建第二套），以及 `<home>/provider-profiles.json` 的版本化 Store（含激活标识，复用 `home.ts` 的安全目录/文件能力）。实体与 Store 均落在 `config` 以保持依赖矩阵不变（`config` 为叶子，`storage`/`browser`/`runtime` 均不得依赖它）。同步为新增公开接口补中文契约 TSDoc。
  - 验证手段：`npx tsx --test packages/config/test/provider-profile-store.test.ts packages/config/test/home.test.ts packages/config/test/llm-config.test.ts packages/config/test/config-loader.test.ts`；断言权限位、损坏与不支持版本的 fail-fast、空 Store 回退路径、同 kind 多份、凭据保留与校验拒绝。

- [x] //TODO 2. 让运行时按 Profile 解析凭据与端点，并让 Goal 选择承载 profileId
  - 落实标准：[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[6.3](./spec.md#spec-req-6-3)
  - 实施目标：先在 `apps/goal-server/test/composition-root-provider-profiles.test.ts` 断言：解析受管 Profile 后阶段适配器使用该 Profile 的凭据与端点；选择引用不可解析 Profile（已删除、kind 不匹配、校验失败）时显式失败且不回退其它 Profile/Provider/启动配置；无 `profileId` 时回退启动配置；Provider 专属注入（如 OpenCode Go 的自有 User-Agent 与会话头）在受管 Profile 路径下仍然生效。再在 Composition Root 引入 Profile 解析（`resolve(profileId) → LLMConfig`）并把阶段适配器构造改为按 `{profileId, modelId}`。
  - 验证手段：`npx tsx --test apps/goal-server/test/composition-root-provider-profiles.test.ts apps/goal-server/test/composition-root-model-switching.test.ts packages/llm/test/pi-ai.test.ts`；断言解析结果、不可解析时的失败语义与专属注入保留。

- [x] //TODO 3. 承载 Provider 偏好记录与跨 Provider 恢复/切换语义
  - 落实标准：[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5)、[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[2.5](./spec.md#spec-req-2-5)
  - 实施目标：先在 `packages/storage/test/json-file-model-preference-store.test.ts`、`packages/runtime/test/goal-model-selection-coordinator.test.ts` 与 `packages/browser/test/browser-model-preference.test.ts` 断言：偏好记录为 `{profileId, modelId}` 且不可用时回退激活档案并给出 notice；恢复时 `profileId` 不可解析必须阻断并提示重新选择（复用 `model_restore_failed` 语义）；跨 Provider 切换只在安全点发生且不重建 `modelContextEpoch`。再实现偏好记录迁移、`cli.ts` 的恢复门禁放宽与安全点切换。
  - 实施目标：先在 `packages/storage/test/goal-snapshot-current.test.ts` 与 `apps/goal-server/test/composition-root-provider-profiles.test.ts` 断言：`profileId` 随选择往返且严格 schema 继续拒绝任何凭据字段；不含 `profileId` 的既有 Goal 仍可解析；按档案解析凭据与端点；不可解析档案显式失败且不回退。已随本切片交付：`toLlmConfig` 映射、Composition Root 的档案解析与启动配置来源判定、`GoalModelSelection.profileId` 与 Snapshot 编解码、`ProviderProfileResolutionError`。
  - 验证手段：`npx tsx --test packages/runtime/test/goal-model-selection-coordinator.test.ts packages/storage/test/goal-snapshot-current.test.ts packages/storage/test/json-file-model-preference-store.test.ts packages/agent/test/llm-step-executor.test.ts`；断言往返、兼容、阻断与安全点边界。

- [ ] //TODO 4. 交付 Settings 管理接口与掩码 DTO
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.5](./spec.md#spec-req-2-5)、[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[4.4](./spec.md#spec-req-4-4)、[7.4](./spec.md#spec-req-7-4)
  - 实施目标：先在 `packages/browser/test/browser-provider-settings.test.ts` 与 `packages/web-contracts/test/web-contracts.test.ts` 断言：列表/创建/更新只回掩码与 `hasApiKey`，任何响应正文不含明文凭据；更新省略密钥保留原值；删除激活 Profile 被拒、删除其它 Profile 返回引用提示字段；连接测试只触发在线模型列表并区分鉴权/权限/协议/不可用四类；新增路由在既有会话访问控制之后（未授权请求被拒）。再实现 DTO、校验函数与路由，并复用现有 `ModelCatalogError.kind` 映射。
  - 验证手段：`npx tsx --test packages/browser/test/browser-provider-settings.test.ts packages/browser/test/browser-models.test.ts packages/web-contracts/test/web-contracts.test.ts apps/goal-server/test/browser-session.integration.test.ts`；断言掩码、拒绝语义、错误分类与授权边界。

- [ ] //TODO 5. 让模型目录与选择支持 Provider 维度
  - 落实标准：[4.3](./spec.md#spec-req-4-3)、[5.3](./spec.md#spec-req-5-3)、[7.3](./spec.md#spec-req-7-3)
  - 实施目标：先在 `packages/browser/test/browser-models.test.ts`、`packages/browser/test/browser-model-selection.test.ts` 与 `packages/browser/test/browser-model-preference.test.ts` 断言：目录按 Profile 维度提供多 Provider 选项；草稿偏好不可用（Profile 缺失或模型不可选）时回退激活 Profile 及其默认模型并给出 notice；Goal 内选择在安全点写入 `{profileId, modelId}`。再扩展目录投影、命令服务与偏好写入路径。
  - 验证手段：`npx tsx --test packages/browser/test/browser-models.test.ts packages/browser/test/browser-model-selection.test.ts packages/browser/test/browser-model-preference.test.ts`；断言 Provider 维度、回退 notice 与偏好写入。

- [ ] //TODO 6. 交付 goal-board Settings 面与 ModelPicker 两级选择
  - 落实标准：[7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)、[7.4](./spec.md#spec-req-7-4)、[1.3](./spec.md#spec-req-1-3)
  - 实施目标：先在 `apps/goal-board/test/` 下建立组件/状态断言与 `apps/goal-board/e2e/` 端到端断言：Settings 面能列出/新增/编辑/删除/测试/激活 Provider，并以只读方式展示 `config.toml` 回退项；表单不回显明文密钥、空值提交表示不修改；ModelPicker 可先选 Provider 再选模型且结果写入对应偏好或 Goal 选择；失败以现有错误分类呈现。再实现 UI 与 API 客户端接入。挂载点为已交付的 `apps/goal-board/src/components/SettingsPage.tsx` 空壳（当前无配置项与 API 调用）与 `WorkspaceShell` 导航，本切片负责填充该空壳而非新建界面。
  - 验证手段：`npx tsx --test apps/goal-board/test/*.test.ts apps/goal-board/test/*.test.tsx` 与 `npm run build:web`；端到端按 `apps/goal-board/e2e/` 既有运行方式执行新增用例。

- [ ] //TODO 7. 同步文档、为既有 Spec 增添范围修订说明并完成全量回归
  - 落实标准：[8.1](./spec.md#spec-req-8-1)、[8.2](./spec.md#spec-req-8-2)、[8.3](./spec.md#spec-req-8-3)、[1.3](./spec.md#spec-req-1-3)
  - 实施目标：更新 `packages/config`、`packages/browser`、`apps/goal-server`、`apps/goal-board` 的 `notes/overview.md` 与语义表（Profile 存储归属、凭据边界、运行时解析与 Provider 维度）；在 `specs/slash-command-model-switching/` 与 `specs/web-backend-separation/` 加入指向本 Spec 的范围修订说明，不重写其历史正文；随后运行完整回归并只处理本功能引入的问题。
  - 验证手段：`npm run check:docs`、`npm test`、`git diff --check`；文档检查与全量回归通过、差异检查无空白错误。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
|---|---|---|---|
| Profile 存储与安全 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5) | Store 以 0600/0700 原子写入并带 schema 版本；损坏或不支持版本 fail-fast；空 Store 不自动导入 `[llm]`；存在 Store 时其为受管权威 | `npx tsx --test packages/config/test/provider-profile-store.test.ts`；权限位与原子性断言 |
| 管理与 Provider 规则校验 | [2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)、[2.6](./spec.md#spec-req-2-6) | 非法组合（strict/baseURL/容量）在落盘前失败；省略密钥保留原值；同 kind 多份并存；删除激活被拒并返回引用提示；id/label 非敏感 | `npx tsx --test packages/config/test/provider-profile-store.test.ts packages/browser/test/browser-provider-settings.test.ts` |
| 凭据不泄漏（安全边界） | [1.3](./spec.md#spec-req-1-3) | 任何 Settings/目录 HTTP 响应正文不含明文；Goal Snapshot 严格 schema 继续拒绝凭据字段；Diagnostic Trace 中凭据保持脱敏 | `npx tsx --test packages/storage/test/goal-snapshot-current.test.ts packages/agent/test/llm-diagnostic-trace.test.ts packages/browser/test/browser-provider-settings.test.ts`；响应正文与落盘内容抽查 |
| 连接测试 | [3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3) | 只触发在线列模型不发生成请求；鉴权/权限/协议/不可用分类正确且错误脱敏；失败不改变 Profile 与激活状态 | `npx tsx --test packages/browser/test/browser-provider-settings.test.ts` |
| 运行时 Profile 解析 | [4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4) | 阶段适配器使用被解析 Profile 的凭据与端点；不可解析时显式失败不回退；目录与选择支持 Provider 维度；新路由受会话访问控制保护 | `npx tsx --test apps/goal-server/test/composition-root-provider-profiles.test.ts packages/browser/test/browser-models.test.ts apps/goal-server/test/browser-session.integration.test.ts` |
| Goal 选择、偏好与恢复 | [5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5) | `profileId` 往返且无凭据；无 `profileId` 的既有 Goal 仍可用；偏好回退给出 notice 且不改写偏好；恢复遇不可解析 Profile 阻断推进；切换仅发生在安全点 | `npx tsx --test packages/runtime/test/goal-model-selection-coordinator.test.ts packages/storage/test/goal-snapshot-current.test.ts packages/browser/test/browser-model-preference.test.ts` |
| 跨 Provider 上下文语义 | [6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3) | 切换后原生续接安全截断并回落语义历史、Goal 不损坏；`modelContextEpoch` 不被强制重建且预算按新容量重算；新请求使用新凭据端点并保留 Provider 专属注入 | `npx tsx --test packages/runtime/test/goal-model-selection-coordinator.test.ts packages/agent/test/llm-step-executor.test.ts packages/llm/test/pi-ai.test.ts` |
| Settings 与 ModelPicker | [7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)、[7.4](./spec.md#spec-req-7-4) | Settings 可完成增删改/测试/激活并只读展示回退配置；表单不回显明文且空值表示不修改；两级选择结果写入正确目标；失败按现有分类呈现 | `npx tsx --test apps/goal-board/test/*.test.ts apps/goal-board/test/*.test.tsx`；`npm run build:web`；`apps/goal-board/e2e/` 新增用例 |
| 文档与完整回归 | [8.1](./spec.md#spec-req-8-1)、[8.2](./spec.md#spec-req-8-2)、[8.3](./spec.md#spec-req-8-3) | config/browser/goal-server/goal-board 的 overview 与语义表已更新；两个既有 Spec 含范围修订说明；文档检查与全量回归通过 | `npm run check:docs`、`npm test`、`git diff --check` |

### Latest Result

- 状态：未执行
- 新鲜度：-
- 验证时间：-
- 验证摘要：尚未开始执行。
