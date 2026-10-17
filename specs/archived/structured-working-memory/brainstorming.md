# Structured Working Memory Brainstorming

> 状态：已于 2026-08-27 批准。本文记录获批方向，不是 Requirements、Design 或当前实现说明。
> 这是用户明确要求持久化的 Brainstorming 记录；正式契约按本文定义的三个 Spec 与审批闸门分别形成。

## 目标

为长时间运行、可中断恢复的 Goal 提供连续的模型工作记忆，减少重复探索、遗漏既有证据和在信息缺失时自行猜测。Memory 必须能从已提交 Trajectory 重建，不能成为 Runtime State、Goal Snapshot 或 Trajectory 之外的新事实来源。

## 当前方向

- 覆盖 `gathering_context`、`planning` 和 `executing` 全阶段。
- 新版 Goal 由既有模型响应携带结构化 `memoryPatch`，不为更新 Memory 额外调用模型。
- `findings` 与 `hypotheses` 分区：Finding 必须引用已提交的 Trajectory evidence；Hypothesis 必须明确为未验证判断。
- Runtime 是 execution 状态的唯一来源；Working Memory 不复制 `checkpoint`、`previousStep`、pending Action 或 Step 计数。
- Runtime 接受业务结果和 Patch 后，单独提交 `memory_patch_accepted`；被 Schema、Tool Policy 或 Action 校验拒绝的 Decision 不得修改 Memory。
- 新协议 Goal 使用 Working Memory 取代自由文本 checkpoint；旧 Goal 继续使用旧 Prompt/Response 协议和 checkpoint，不进行有损自动迁移。
- Trajectory 保存完整、追加式执行历史；Memory 是运行期即时缓存，不写入 Goal Snapshot。Warm Compact 和检索索引可以保存为可删除、可校验、可重建的 Sidecar Cache。
- 模型上下文采用三层结构：Hot Dynamic Window、Warm Semantic Compact 和 Cold Committed Trajectory Search。
- Compact 先执行确定性合并、失效与淘汰；只有仍然超出预算时才调用独立 Compact 模型，且调用成本和来源必须单独记录。
- 历史信息缺口由 `context_lookup` 查询 Trajectory；当前 Workspace 或 Environment 状态必须通过正常 Tool Policy 重新观察，不允许 Context Router 绕过授权边界。
- 全阶段共享 Memory，但阶段转换必须显式失效旧 Plan、nextAction 和临时 Hypothesis；只有获批 Goal Task 可以进入 `executing`。
- Goal 等待、中断或终止后丢弃进程内 Memory；恢复同一 Goal 时，以 Snapshot 提交边界为准，优先复用有效 Sidecar，并从 committed Trajectory 重放剩余事件。
- 模型上下文以 Token 预算为主、字符估算为兜底，并为 System Prompt、Tool Schema 和模型输出预留空间。
- 当前总纲拆为三个正式 Spec；三个 Spec 的 Requirements、Design 和 Tasks 全部完成并分别获批前，不开始任何实现。

## 上下文分层

```text
Goal Task + Runtime execution projection
                    ↓
        Ephemeral Structured Memory
                    ↓
      Model-visible working context
          ↙                    ↘
Hot Recent Trajectory      Warm Semantic Compact
          ↘                    ↙
        Cold Committed Trajectory Search
                    ↓ current fact required
 Authorized Workspace / Environment Observation
```

各层职责不同：

- Goal Task 与 Runtime execution projection 提供当前批准任务、阶段、预算和 pending Action 等控制事实，是 execution 状态的唯一来源。
- Structured Memory 保存当前有效的结构化 Finding、Hypothesis、Plan、Blocker 与 nextAction。
- Hot Dynamic Window 提供近期完整 Action/Observation 执行单元，保持局部因果连续性。
- Warm Semantic Compact 保存被移出近期窗口的有界、有损中期条目，不得覆盖证据。
- Cold Trajectory 是历史事实、Memory 重建和按需检索来源。
- Workspace 或 Environment 是当前外部状态来源，只能通过获授权的 Tool Observation 接入。
- Sidecar 只缓存 Warm Compact 和检索索引；删除它不得损失事实或改变 Runtime 恢复结果。

## 结构化 Memory

当前候选结构：

```ts
interface WorkingMemory {
    readonly derivedThroughSequence: number;
    readonly findings: readonly EvidenceBackedFinding[];
    readonly hypotheses: readonly Hypothesis[];
    readonly plan: readonly PlanItem[];
    readonly blockers: readonly Blocker[];
    readonly nextAction?: NextAction;
}
```

字段语义：

- `derivedThroughSequence` 只能单调前进，且不得超过 Snapshot 的 `committedThroughSequence`。
- `findings` 是模型对 Observation 的证据化归纳；Runtime 校验证据引用，但不通用验证自然语言语义。
- `hypotheses` 是待验证判断，不能作为任务完成证据。
- `plan`、`blockers` 与 `nextAction` 表达控制意图和未完成工作，不代表外部效果已经发生。
- 可跨阶段存在的条目必须记录来源 phase、状态和 evidence sequence；阶段转换由 Reducer 将不再有效的内容标记为 `superseded`，不依赖模型自行清理。

模型不返回完整 Memory，而是在现有阶段响应或 AgentDecision 中携带操作式 Patch：

```ts
interface WorkingMemoryPatch {
    readonly addFindings?: readonly AddFinding[];
    readonly updateFindings?: readonly UpdateFinding[];
    readonly upsertHypotheses?: readonly HypothesisUpdate[];
    readonly upsertPlanItems?: readonly PlanItemUpdate[];
    readonly upsertBlockers?: readonly BlockerUpdate[];
    readonly setNextAction?: NextAction | null;
}
```

Patch 可以由 Preparation Result 或 AgentDecision 提出，但不能随原始响应直接生效。Runtime 接受对应业务结果后，必须追加独立的 `memory_patch_accepted` 事件；进程内 Reducer 只归并 Snapshot 已提交范围内的 accepted Patch，不读取未提交 tail，也不绕过 Trajectory 直接持久化 Memory。

### Memory 提交边界

已确认 Memory 可以随进程结束而丢失，但产生它的 `memoryPatch` 不能丢失。新协议必须复用现有 Snapshot 提交边界，并遵守以下顺序：

```text
LLM 返回业务结果 + memoryPatch
  → Runtime 校验业务结果与 Patch
  → Runtime 接受业务结果
  → 追加独立 memory_patch_accepted Event
  → Goal Snapshot 保存并提交 accepted event sequence
  → Reducer 才把 Patch 应用到进程内 Working Memory
```

对应失败语义：

- Trajectory Event 追加失败时，不保存后续 Snapshot，也不更新 Memory。
- Snapshot 保存失败时，已追加事件属于未提交 tail；Reducer 不得应用其中的 Patch。
- 业务结果或 Patch 校验失败时不得产生 `memory_patch_accepted`；已经记录的原始 Decision 也不能单独使 Patch 生效。
- `state_committed` marker 写入失败不改变已经保存的 Snapshot 边界；当前推进可以停止，但恢复时仍以 Snapshot 的 `committedThroughSequence` 判断 Patch 是否有效。
- Reducer 只按 sequence 单调归并，每个已提交事件至多应用一次；重复构建必须得到相同 Memory。
- `derivedThroughSequence` 只是进程内投影进度，不是新的提交边界，也不能使未提交事件生效。

因此，新版 Working Memory Goal 必须配置可读取的真实 TrajectoryStore；当前允许省略 Trajectory 的兼容路径只能继续服务旧协议 Goal，否则中断后无法重建 Memory。

## 生命周期

```text
恢复 Goal Snapshot
  → 读取 committedThroughSequence
  → 校验匹配 Goal / Run / sequence / hash / schema 的 Sidecar
  → Sidecar 有效：恢复 Warm Compact，并重放其后已提交事件
  → Sidecar 无效：从已提交 Trajectory 完整重建
  → 建立进程内 Working Memory
  → 每次 Snapshot 提交成功后按新事件增量归并
  → phase transition 时显式 supersede 失效条目
  → Goal wait / interrupt / terminal
  → 丢弃进程内 Working Memory
```

Memory 或 Sidecar 丢失不影响 Runtime State 恢复；Sidecar 只优化模型工作上下文的重建成本。Sidecar 缺失、损坏或版本不兼容时必须自动回退到 committed Trajectory；权威 Trajectory 缺失或损坏时必须明确停止，不能以空 Memory 猜测继续。

阶段转换遵守以下规则：

- 仍被 committed evidence 支持且对当前阶段有效的 Finding 可以保留。
- 用户否决 Planning 结果时，旧 Plan、nextAction 和仅服务该方案的 Hypothesis 必须标记为 `superseded`。
- 只有显式批准后的 Goal Task 可以成为 Executing 的任务契约；Preparation 中的提案不能隐式升级为批准事实。
- 已解决 Blocker 和被新决策替代的条目必须解除活跃保护，避免永久 Pin 导致增长失控。

## 动态滑动窗口

Dynamic Window 按本轮剩余上下文预算选择最近的连续执行单元，而不是固定保留最近 N 条事件：

```text
recentTrajectoryBudget
  = modelContextBudget
  - systemAndProfile
  - authorizedTools
  - conversation
  - workingMemory
  - compactedContext
  - responseReserve
```

`modelContextBudget` 优先使用目标模型的 Token 预算；无法获得可靠 tokenizer 时才使用字符估算。预算必须为模型输出、Tool Schema 和其他不可裁剪输入预留空间。

窗口从最新执行单元向旧单元装入，并遵守以下边界：

- 不拆分同一 `executionUnitId` 的 Action、Tool Result 与 Observation。
- 遇到首个无法完整容纳的单元时停止，不跳选更旧单元。
- Runtime projection 中已有的 `previousStep` 和 pending Action 不得在 Dynamic Window 中重复注入；当前 Task 与活跃阻塞分别由 Goal Task 和 Structured Memory 提供。
- 大型 Tool Result 应投影为 preview、artifact reference、hash 和原始 sequence，而不是占满窗口。
- 裁剪只影响本轮 Model Input View，不修改 Snapshot 或 Trajectory。
- 固定内容本身超过预算时允许可诊断的软超限，但不得通过拆分执行单元或静默截断结构化条目伪装成正常输入。

## 自动 Compact

Compact 是独立的上下文功能，在预计模型输入超过阈值时处理已移出 Hot Dynamic Window 的旧 Context Units。Compact 只改变模型工作上下文，不压缩、删除、覆盖或写回完整 Trajectory；触发条件是预计模型输入大小，而不是 Trajectory 文件大小。

Warm Compact 不是无限追加的自由文本摘要，而是固定容量的结构化语义条目集合。候选条目至少包含：

```ts
interface CompactEntry {
    readonly id: string;
    readonly kind: "decision" | "finding" | "failure" | "blocker" | "unresolved";
    readonly summary: string;
    readonly status: "active" | "resolved" | "superseded";
    readonly evidenceSequences: readonly number[];
    readonly firstSequence: number;
    readonly lastSequence: number;
    readonly lastAccessedSequence: number;
    readonly reinforcementCount: number;
}
```

Warm 层采用有界语义淘汰，而不是纯 LRU 或 Round-robin：

1. 先合并重复条目，并删除 `superseded` 条目。
2. 已解决 Blocker、低相关内容和已有可靠 Trajectory 引用的陈旧条目优先降级。
3. 活跃 Blocker、未解决问题和当前方案依赖的 Decision 获得临时保护，但每种 `kind` 都必须有容量配额。
4. 条目被检索结果或新证据再次支持时更新访问位置与强化次数；仅反复出现在模型文本中不算新的事实强化。
5. 被 Warm 层淘汰的内容仍保留在 Cold Trajectory，可由 `context_lookup` 重新获取。

Compact 先执行确定性 Reducer、合并、失效和淘汰。只有这些操作后仍超出预算，才允许调用独立 Compact 模型；模型生成结果必须记录来源 Goal、Run、sequence range、内容 hash、Compact schema/version 和生成方式，并保留 evidence sequence。Goal Task 和用户约束不得复制进有损 Compact，它们继续由权威 Goal Task / Conversation 提供。

Warm Compact 保存为可丢弃 Sidecar Cache。Sidecar 必须记录 `derivedThroughSequence`、来源 hash 和 Compactor 版本，只能覆盖 Snapshot 已提交边界内的内容；它可以落后于 Snapshot，但不得领先。Sidecar 写入顺序必须晚于 Trajectory 和 Snapshot，删除 Sidecar 后必须能够从 committed Trajectory 重建。

## Trajectory 检索

当 Memory、近期窗口和 Compact 结果缺少执行所需的历史信息时，模型应请求内部 `context_lookup`，而不是把未知信息写成 Finding。

首版采用增量式 Fielded BM25-lite，索引单位是完整 execution unit，而不是孤立 Event。检索流程：

1. 只查询当前 Goal/Run 且位于 Snapshot 提交边界内的事件。
2. 先按 `eventType`、`actionId`、`stepIndex`、Tool ID、文件路径和错误码过滤。
3. Tokenizer 保留完整路径、对象 ID、Tool 名称和错误码，同时拆分路径、`snake_case`、`camelCase` 与数字后缀。
4. 使用字段权重和 BM25 对候选排序；完整路径、对象 ID 和 Tool/Action 名称的精确匹配优先，recency 只作为接近分数的 tie-break。
5. 合并同一 execution unit 的重复命中，并附带必要的相邻单元，避免破坏 Action/Observation 因果关系。
6. 每个结果返回 sequence range、匹配字段、分数、截断状态和来源引用。
7. 无结果或低于最低相关阈值时返回明确的 `not_found`，不得生成替代事实。

BM25 索引和一个小型 LRU 查询结果缓存保存于可重建 Sidecar；缓存键必须包含 query hash、committed sequence 和索引版本。首版不引入向量数据库，后续只有在词法检索召回率经评测证明不足时，才考虑混合向量召回。

### Context Source Routing

历史事实与当前状态必须按问题类型处理，不能把所有信息缺口都串行回退到 Trajectory，也不能让内部 Context Router 绕过正常 Tool Policy。当前流程是：

1. 模型需要历史上下文时，在 `context_lookup` 中声明具体问题和可选过滤条件。
2. `ContextSourceRouter` 只查询 Snapshot committed boundary 内的 Trajectory 或其有效 Sidecar 索引，不读取当前 Workspace 或 Environment。
3. 查询结果必须携带 Goal/Run、sequence range、匹配字段、分数、截断状态和来源引用。
4. 历史 Observation 若涉及可能变化的 Workspace 或 Environment，只证明当时状态；执行当前决策前必须通过正常 Tool Decision 重新观察或验证。
5. 检索没有结果时返回 `not_found`，由模型保留 unknown、提出 Hypothesis，或请求另一种获授权的观察，不得把空结果转换成 Finding。

信息需求与处理机制：

| 信息需求类型 | 处理机制 | 约束 |
| --- | --- | --- |
| `historical_execution` | `context_lookup` 查询已提交 Trajectory | 结果涉及可变外部状态时重新观察 |
| `decision_rationale` | `context_lookup` 查询 Decision / accepted Patch | 不以当前 Memory 反向改写历史理由 |
| `current_workspace_state` | 正常 Workspace Tool Decision | 必须经过授权并形成新 Observation |
| `current_environment_state` | 正常 Environment Tool Decision | 仅在环境支持重新观察且 Tool 获授权时执行 |
| `task_contract` | 直接读取 Goal Task / Conversation | 批准边界不从 Trajectory 摘要推断 |
| `verification_status` | 正常验证 Tool Decision | 历史测试结果只能作为线索 |

## 信息权威与防幻觉边界

“模型不准猜测”不能只由 Prompt 保证。Runtime 能强制执行的边界包括：

- Finding 必须引用当前 Goal/Run 的已提交 evidence sequence。
- Completion Criterion 的完成声明必须关联可定位证据。
- 检索无结果时保持 `unknown`，Hypothesis 不得升级为 Finding。
- Trajectory 查询结果必须保留来源，不允许 Compact 摘要伪装成原始 Observation。
- 缺少历史证据时，Decision 只能请求 `context_lookup`、发起新的获授权观察，或把判断显式记录为 Hypothesis；不得用无来源陈述驱动完成判定。

Runtime 无法通用判断任意自然语言归纳是否正确，也无法证明某个普通 Action 没有隐含猜测。协议目标是阻止无证据内容进入 Trajectory-backed Finding 和完成声明，而不是承诺消除所有模型幻觉。

`ContextSourceRouter` 只处理历史查询。Trajectory 与 Workspace 不存在固定的全局先后顺序；当前状态是否需要重新观察由问题类型、风险和 Tool Policy 决定。

## 增长控制候选

- Memory 使用稳定 ID 和 upsert，不把每轮状态重复追加为新条目。
- 对总 Token/估算字符、集合数量、单项长度、单次 Patch 操作数和 evidence reference 数分别设限；超限 Patch 必须拒绝，不静默截断。
- Memory 和 Compact 不复制凭据、密钥、完整大文件或完整 Tool Result；只保存经过大小限制的摘要与可追溯引用。
- 活跃 Plan、Blocker 和证据化 Finding 可以临时 Pin，但每类必须有配额；优先淘汰 resolved、abandoned、superseded 和无证据的失效 Hypothesis。
- Dynamic Window 使用本轮剩余 Token 预算或字符兜底估算，不使用固定事件数。
- 大输出外置，近期窗口只保留 preview 与引用。
- Trajectory 保持完整；清理 Memory 条目不删除原始证据。

## Spec 拆分与交付闸门

本文保留为总纲，正式设计拆为三个有依赖顺序的 Spec：

1. `structured-working-memory-core`
   - 定义 WorkingMemory、Patch、`memory_patch_accepted`、Reducer、phase transition、Evidence Gate、旧 checkpoint 协议隔离和 committed boundary 重建。
2. `trajectory-model-context`
   - 定义 Hot/Warm/Cold 模型上下文、Token/字符预算、语义淘汰、混合 Compact、Sidecar 生命周期和大型输出引用。
3. `trajectory-context-retrieval`
   - 定义 Fielded BM25-lite 索引、`context_lookup`、查询结果契约、Context Router 边界和检索评测。

交付顺序不是“写完一个 Spec 就实现一个 Spec”，而是：

```text
Memory Core Requirements → Design → Tasks → 分别批准
  → Model Context Requirements → Design → Tasks → 分别批准
  → Context Retrieval Requirements → Design → Tasks → 分别批准
  → 三个 Spec 全部完成并获批
  → 才允许按依赖顺序开始实现
```

下游 Spec 可以引用上游已批准契约，但不得在上游实现完成前把推测行为写成当前事实。任何一个 Spec 尚未完成 Tasks 审批时，都不能开始功能代码、Prompt 或 Runtime 协议修改。

## 成功标准方向

- 同一 committed boundary 在连续执行和重启恢复后产生等价 WorkingMemory。
- 未提交 Patch、校验失败或未获 Runtime 接受的 Decision 不得修改 Memory。
- 被否决或 `superseded` 的阶段内容不得泄漏到后续 `executing` 上下文。
- 删除、损坏或升级不兼容的 Sidecar 后，可以从 committed Trajectory 重建；Trajectory 不可用时明确停止。
- `context_lookup` 返回可验证 sequence range 或明确 `not_found`，无证据历史陈述不能成为 Finding 或完成依据。
- 模型输入遵守 Token 预算或字符兜底预算；不可裁剪内容导致的软超限必须有明确诊断。
- 普通 Memory 更新不额外调用模型；独立 Compact 调用必须单独记录成本、来源和失败。
- 旧协议 Goal 的 checkpoint 和恢复行为保持不变。
- 契约测试覆盖提交、重建、Sidecar 失效、阶段失效、预算和检索；ALFWorld/SWE 强制中断 Benchmark 对比连续执行与恢复执行的成功率、重复 Action、Token 和额外模型调用。

## 待讨论问题

1. WorkingMemory 各条目、Patch 操作、状态转换与 stable ID 的精确 Schema。
2. Preparation Result 和 AgentDecision 如何提出 Patch，以及 Runtime 在各阶段判定业务结果“已接受”的具体时机。
3. `context_lookup` 是 AgentDecision 分支还是内部只读 Tool，是否消费执行 Step，以及 `not_found` 如何进入下一轮。
4. Sidecar 的存储端口、原子写入、更新频率、累计 hash 和版本失效格式。
5. Compact 模型的输入/输出 Schema、触发阈值、失败回退和调用预算。
6. Token 估算器、字符兜底比例、各上下文层预算和配置所有者。
7. Fielded BM25-lite 的字段权重、Tokenizer、最低相关阈值、Top-K 和相邻单元扩展范围。
8. Patch、Compact、Sidecar 和检索结果的精确大小上限、敏感内容处理与本地文件权限。
9. 新旧 Prompt Bundle、Response Schema、Trajectory Event 和 Snapshot 之间的版本选择与兼容测试矩阵。
10. ALFWorld/SWE 样本、强制中断位置、随机性控制以及成功率、重复 Action、Token 和恢复耗时的通过阈值。

## 当前非目标

- 不修改或压缩原始 Trajectory。
- 不让 Compact 或 Memory 成为 Runtime 恢复权威。
- 不在首版默认引入向量数据库、跨 Goal 长期记忆或自动学习 Profile。
- 不在 Brainstorming 阶段实现代码、修改 Prompt 或确定未讨论的协议细节。
- 不在三个正式 Spec 的 Requirements、Design 和 Tasks 全部完成并分别获批前开始实现。

## 调研参考

- [OpenAI Compact a response](https://developers.openai.com/api/reference/java/resources/responses/methods/compact)
- [GitHub Copilot CLI Context Management](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/context-management)
- [Claude Context Editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)
- [Claude Memory Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)
- [LangGraph Memory](https://docs.langchain.com/oss/python/concepts/memory)
- [MemGPT](https://arxiv.org/abs/2310.08560)
- [Cognitive Architectures for Language Agents](https://arxiv.org/abs/2309.02427)
