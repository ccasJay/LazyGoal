---
status: proposed
created_at: 2026-10-16
supersedes: []
superseded_by: null
---

# Provider 配置档案与运行时切换 Spec

## 目标与范围

让用户在 LazyGoal 中一次保存多份 Provider 配置（不同 kind、凭据或端点），在 Web UI 的 Settings 里增删改、测试连接、设为激活，并在新建 Goal 与 Goal 内安全点于已保存配置之间切换；不再需要手改 TOML 或重启进程。

当前实现的硬约束是：Composition Root 在启动时解析一次 `LLMConfig` 并缓存，`createStageAdaptersForSelection` 只替换 `model`，`provider`/`apiKey`/`baseURL` 被冻结；恢复与解析路径以"provider 必须等于启动 provider"为判据，模型目录投影也按单 Provider 过滤。本 Spec 引入一个 Home 级的 Provider Profile 集合作为受管凭据与端点的权威来源，并把上述判据改为"Profile 可解析且 kind 匹配"。

**范围边界（Non-goals）**

- benchmarks、GEPA 与 CLI 入口不接入 Profile 集合，继续使用环境变量与 TOML。
- 不引入 OS keychain 或外部密钥管理；明文凭据仍只落在本机 0600 文件。
- 不做多用户、团队共享、权限分级或密钥轮换自动化。
- 不新增 Provider 类型，不改动任何 Provider 的协议适配与专属注入逻辑。
- 不重写既有 Spec 的历史正文（见下）。

**对既有 Spec 的范围修订**

- `specs/slash-command-model-switching/`：其范围明确排除跨 Provider 切换；本 Spec 取代该排除项，跨 Provider 切换由本 Spec 定义。
- `specs/web-backend-separation/`：其范围明确排除"新的模型配置编辑界面"；本 Spec 取代该排除项，Settings 面由本 Spec 定义。

## 需求与验收标准

### R1. Provider Profile 持久化与安全

作为用户，我希望多份 Provider 配置被安全保存并在重启后仍可用。

1. <a id="spec-req-1-1"></a>系统必须在 LazyGoal Home 下持久化 Provider Profile 集合与当前激活标识（`<home>/provider-profiles.json`），携带 schema 版本；写入必须原子，文件权限为 0600、父目录为 0700。
2. <a id="spec-req-1-2"></a>读取到损坏内容或不支持的 schema 版本时，系统必须 fail-fast 并给出明确错误；不得静默重建、丢弃已保存的 Profile 或回退到空集合继续运行。
3. <a id="spec-req-1-3"></a>明文 API Key 只允许存在于该本地文件与进程内 `LLMConfig`；不得进入任何 HTTP 响应正文、Goal Snapshot、Trajectory 或 Diagnostic Trace。
4. <a id="spec-req-1-4"></a>当 `config.toml` 与 Profile 集合同时存在时，Profile 集合是受管配置的权威；`[llm]` 仅作为"未选择任何受管 Profile"时的回退，且该回退行为必须与现状一致。
5. <a id="spec-req-1-5"></a>Store 不存在或为空时，系统必须以空 Profile 集合运行并继续使用 `[llm]` 回退；不得自动导入或复制凭据。

### R2. Profile 管理与校验

作为用户，我希望在 Settings 里安全地增删改 Provider 配置。

1. <a id="spec-req-2-1"></a>列表必须返回每个 Profile 的非敏感字段（`id`、`label`、`kind`、`baseURL`、容量、`defaultModel`、是否已保存凭据、掩码片段），且不得返回明文 `apiKey`。
2. <a id="spec-req-2-2"></a>创建与更新必须在落盘前按 Provider 规则校验：kind 属于受支持集合；`strict` 仅允许 `openai`/`google`/`openai-compatible`；`baseURL` 仅允许 `openai`/`google`/`openai-compatible`（其中 `openai-compatible` 必填）；`openai-compatible` 必须提供 `contextWindowTokens` 与 `maxOutputTokens` 且满足上限关系。校验失败必须在落盘前失败并给出明确错误。
3. <a id="spec-req-2-3"></a>更新时省略 `apiKey` 必须保留原凭据；显式提供时必须替换。
4. <a id="spec-req-2-4"></a>同一 kind 必须允许存在多份 Profile；`id` 稳定唯一且不可变。
5. <a id="spec-req-2-5"></a>删除当前激活的 Profile 必须被拒绝；删除其它 Profile 必须成功，并在响应中给出"可能存在引用该 Profile 的 Goal"的显式提示字段。
6. <a id="spec-req-2-6"></a>`id` 与 `label` 必须为非敏感标识；系统不得以明文凭据生成默认 `id` 或 `label`。

### R3. 连接测试

作为用户，我希望在保存前验证凭据与端点可用。

1. <a id="spec-req-3-1"></a>测试必须通过现有在线模型目录拉取验证凭据与端点，不得发起生成请求。
2. <a id="spec-req-3-2"></a>结果必须区分鉴权、权限、协议与不可用四类，且错误文本与日志不得包含明文凭据。
3. <a id="spec-req-3-3"></a>测试失败不得改变已保存的 Profile 或激活状态。

### R4. 运行时 Provider 解析

作为用户，我希望切换 Provider 后下一次模型调用真的使用新凭据与端点。

1. <a id="spec-req-4-1"></a>Composition Root 必须按 Profile 解析配置：阶段适配器按 `{profileId, modelId}` 构造，凭据与端点来自被解析的 Profile。
2. <a id="spec-req-4-2"></a>当选择引用的 Profile 无法解析（已删除、kind 不匹配或校验失败）时，系统必须失败并提示重新选择；不得回退到其它 Profile、其它 Provider 或静默使用启动配置。
3. <a id="spec-req-4-3"></a>模型目录与模型选择必须支持 Profile 维度；`/model` 与 Settings 的切换结果必须写入既有偏好或 Goal 选择存储。
4. <a id="spec-req-4-4"></a>新增 HTTP 路由必须挂在现有回环会话访问控制之后，不得放宽既有授权边界。

### R5. Goal 级选择与恢复

作为用户，我希望已创建的 Goal 在选择 Provider 后仍能正确恢复。

1. <a id="spec-req-5-1"></a>`GoalModelSelection` 必须新增可选的非敏感 `profileId`；既有 `provider` 字段语义保持不变（仍为 Provider kind）。
2. <a id="spec-req-5-2"></a>不含 `profileId` 的既有 Goal 必须继续可用：解析时回退到启动配置，不做数据迁移。
3. <a id="spec-req-5-3"></a>新建 Goal 的默认选择来自 workspace 级偏好记录 `{profileId, modelId}`（取代现有 `{provider, modelId}`）；偏好不可用（Profile 缺失或模型不可选）时回退到激活 Profile 及其默认模型，并给出明确的 notice 语义，不得静默改写已保存偏好。
4. <a id="spec-req-5-4"></a>恢复 Goal 时 `profileId` 不可解析必须阻断推进并要求重新选择（复用现有 `model_restore_failed` 语义）。
5. <a id="spec-req-5-5"></a>Goal 内切换 Provider 必须复用现有安全点：completed/failed 恒可切；waiting 且无 pendingAction 可切；cancelled 与运行中不可。

### R6. 跨 Provider 切换的上下文语义

作为用户，我希望切换 Provider 不会破坏正在进行的 Goal。

1. <a id="spec-req-6-1"></a>跨 Provider 切换不得损坏 Goal：原生续接因身份不匹配自然截断并回落到语义历史。
2. <a id="spec-req-6-2"></a>系统不得在切换时强制重建 `modelContextEpoch`；既有上下文投影与 Token 预算必须按新选择的容量重新计算。
3. <a id="spec-req-6-3"></a>切换后新模型请求必须使用新 Profile 的凭据与端点，并保留 Provider 专属注入（例如 OpenCode Go 的自有 User-Agent 与会话头）。

### R7. Settings 与模型选择器

作为用户，我希望在 Web UI 完成全部 Provider 管理。

1. <a id="spec-req-7-1"></a>goal-board 必须提供 Settings 面：Provider 列表、新增/编辑/删除、测试连接、设为激活，并以只读方式展示当前 `config.toml` 回退配置。
2. <a id="spec-req-7-2"></a>Settings 表单不得回显明文密钥；已保存密钥以掩码占位呈现，空值提交表示不修改。
3. <a id="spec-req-7-3"></a>`ModelPicker` 必须支持 Provider 维度（先选 Provider 再选模型）；两级选择结果必须写入对应的偏好（草稿/新建）或 Goal 选择（安全点内）。
4. <a id="spec-req-7-4"></a>设置与选择的失败必须以现有错误分类呈现（鉴权/权限/协议/不可用/不可选/需重新选择），不得以静默成功结束。

### R8. 文档与既有 Spec 修订

作为维护者，我希望文档与当前实现一致，且既有 Spec 的范围变更可追溯。

1. <a id="spec-req-8-1"></a>必须同步更新 config、browser、goal-server、goal-board 的 `notes/overview.md` 与语义表。
2. <a id="spec-req-8-2"></a>必须在 `specs/slash-command-model-switching/` 与 `specs/web-backend-separation/` 中加入指向本 Spec 的范围修订说明，不重写其历史正文。
3. <a id="spec-req-8-3"></a>`npm run check:docs` 必须通过。

## 架构与核心决策

### 系统拓扑与接口

```text
~/.lazygoal/provider-profiles.json        (0600, versioned, atomic)   ← 受管权威
~/.lazygoal/config.toml [llm]             (只读回退，行为同现状)
workspace/model-preference.json           { profileId, modelId }      ← 新 Goal 默认

ProviderProfileStore (port) ── JsonFileProviderProfileStore (storage)
        │  list / get / create / update / delete / activate
        ▼
ProviderProfileRegistry (composition root)
        │  resolve(profileId) → LLMConfig（复用现有 Provider 规则校验）
        ▼
createStageAdaptersForSelection({ profileId, modelId })
        ├─ 受管 Profile：凭据/端点来自 Store
        └─ 无 profileId：回退启动 LLMConfig（既有 Goal 行为不变）

Goal.state.modelSelection = { provider(kind), profileId?, modelId, ... }
        └─ Snapshot 依旧不含任何凭据

Web:  GET/POST/PATCH/DELETE /api/providers
      POST /api/providers/:id/test      → 在线列模型（不生成）
      POST /api/providers/:id/activate
      GET  /api/providers               → 掩码 + 只读回退项
      （全部挂在 createBrowserSessionAccess 之后）
```

关键契约变更（最小且向后兼容）：

- 新增 Home 级 `ProviderProfile` 实体与 Store；`GoalModelSelection` 新增可选 `profileId`。
- 门禁判据由"`provider` 相等"改为"`profileId` 可解析且 kind 与选择一致"。

### 核心决策

- **D1. 独立 JSON Store 是受管凭据与端点的权威**：UI 写入的是用户数据，不应重写用户手编的 TOML（会丢注释与格式）；Store 具备 schema 版本、原子写与 0600 权限，与既有 `model-preference.json` 范式一致。TOML `[llm]` 保留为未选择受管 Profile 时的回退，行为等同现状。
- **D2. Profile 作用域为 Home 级**：凭据属于用户而非项目；Home 级让同一份 Provider 在所有 workspace 复用，符合"一次配置、到处可用"的诉求。
- **D3. `GoalModelSelection` 保留 `provider` 语义并新增 `profileId`**：`provider` 继续服务原生续接身份与既有校验，`profileId` 只用于解析凭据与端点。既有不含 `profileId` 的 Goal 无需迁移；`profileId` 不可解析时 fail-fast，不做静默回退。
- **D4. 切换复用既有安全点与 Snapshot-first 原子语义，不新增切换协议**：切换时机、Goal 级持久化与恢复阻断全部沿用 `GoalModelSelectionCoordinator` 的既有契约。
- **D5. 跨 Provider 切换不显式重建 context epoch**：原生续接身份不匹配会安全截断 replay 段；epoch 是投影代，与模型身份无绑定，强制重建会无谓丢失既有投影收益。Token 预算按新选择容量重算。
- **D6. 校验复用现有 Provider 规则，不建第二套**：Profile 落盘前按 provider 白名单、strict 门禁、`baseURL` 允许集合与容量关系校验，与 `readLLMConfig`/`loadRuntimeConfig` 使用同一套规则。
- **D7. 连接测试只做在线列模型**：零生成费用、秒级反馈，直接复用现有 catalog live list 与 `ModelCatalogError.kind` 分类；真实可用性由实际调用暴露。
- **D8. 凭据只在服务端流转**：HTTP 只回掩码与"是否已保存"，表单空值表示不修改；写入路径 0600/0700 原子写；新增路由必须位于会话访问控制之后；不引入 keychain（与既有 Spec 的排除一致）。

## 曾考虑的备选方案

1. **继续用 TOML 作为权威（UI 写 TOML）**：**落选原因**：UI 写入会丢失注释与格式，需要保留式编辑；把用户数据写进配置文件会破坏手编习惯，且难以表达"多份同名 kind"。
2. **混合：Store 覆盖 TOML**：**落选原因**：两来源优先级与漂移规则在首版没有实际需求，增加复杂度而无收益。
3. **把 `GoalModelSelection.provider` 改存 `profileId`**：**落选原因**：需迁移既有 Goal，且 `provider`（kind）仍是原生续接身份与 Provider 规则判定的来源，改语义会引入无谓迁移与歧义。
4. **把完整 Provider 配置快照写进 Goal 选择**：**落选原因**：违反"凭据不进 Snapshot"红线；且快照化凭据会让密钥轮换与删除语义失效。
5. **新增独立的 Provider 切换协议**：**落选原因**：与既有安全点、Snapshot-first、恢复阻断语义重复且可能冲突；复用现有一处状态机更小更安全。
6. **跨 Provider 切换时强制重建 context epoch**：**落选原因**：epoch 与模型身份无绑定，强制重建会丢失既有投影收益；原生 replay 已能安全截断。
7. **测试连接改为发一次最小生成请求**：**落选原因**：产生费用、慢，且"能生成"与"凭据/端点可用"不等价（真实可用性由实际调用暴露）。
8. **引入 OS keychain**：**落选原因**：既有 Spec 明确排除，跨平台成本高；本地 0600 明文与当前 TOML 现状一致。
9. **Profile 作用域改为 workspace 级**：**落选原因**：凭据属于用户，跨项目复用是本诉求的核心；workspace 级会导致重复添加。

## 风险与否定性保证

- **风险等级：高。** 依据：本功能新增**凭据写入路径**（敏感数据）、新增公开 HTTP 接口、变更持久化结构（新增 Profile 文件与 `GoalModelSelection.profileId`），并放宽既有 Provider 门禁。高风险要求验证额外覆盖安全、恢复与影响边界。
- **命名关键操作（需在执行前确认授权）**：以明文形式把用户输入的 API Key 写入 `<home>/provider-profiles.json`；删除 Provider Profile；放宽"provider 必须等于启动 provider"的既有门禁。三项均属本 Spec 的既定范围，执行阶段仍需按其作用域确认。
- **待确认（实现阶段验证）**：`GoalModelSelection` 新增可选 `profileId` 后，Snapshot 编解码与既有严格 schema 测试需确认仍拒绝凭据字段；`profileId` 缺失路径（回退启动配置）需有独立回归。
- **待确认**：Settings 中"回退 `[llm]` 配置"的只读呈现与显式导入的交互细节在 design 阶段确定；首版不要求自动导入。
- **否定性保证**：
  - 明文凭据不得出现在任何 HTTP 响应正文、Goal Snapshot、Trajectory 或 Diagnostic Trace 中。
  - 不得静默回退：`profileId` 或选择不可解析时必须失败并要求重新选择。
  - 不得在运行中的 Goal、存在 pendingAction 的 waiting 状态或 cancelled 状态下切换 Provider。
  - 删除激活中的 Profile、或删除后使既有 Goal 静默改用其它凭据，必须被拒绝或显式阻断。
  - 不得放宽 `createBrowserSessionAccess` 之外的任何授权边界；不得新增未受保护的本地路由。
  - 不得为保存 Profile 而绕过既有 Provider 校验规则（strict 门禁、容量必填、`baseURL` 允许集合）。
