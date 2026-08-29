# Trajectory Context Retrieval 设计

## Overview

本设计在 Structured Working Memory Core 与 Trajectory Model Context 之上增加显式 Cold Context 查询。模型只有在现有 Task、Working Memory、Hot 和 Warm 不足时才返回 `context_lookup`；Runtime 将查询限制在当前 Snapshot committed boundary，Fielded BM25-lite 返回带原始 sequence 的历史结果或明确 `not_found`。[Req 1–2, Req 5–6]

检索索引与查询缓存都是可删除 Sidecar。它们不改变 Trajectory、Snapshot、Working Memory 或 Evidence Gate；Finding 和完成声明仍必须引用命中结果中的原始 committed sequence，而不是 lookup 事件或检索分数。[Req 5, Req 7–8]

## Architecture

```text
 [Preparation Result | AgentDecision]
                  |
                  | kind = context_lookup
                  v
        [Runtime ContextSourceRouter]
          validate need / query / filters / limit
                  |
          +-------+------------------------------+
          | historical need                     | current/task need
          v                                     v
 [TrajectoryContextLookup]          [reject route substitution]
          |                          Workspace/Environment -> normal Tool
          |                          Task/constraints -> authority projection
          v
 [RetrievalIndexSession] <------ [Index Sidecar + Query LRU]
          |
          +--> committed events --> [ContextDocumentBuilder]
          |                              |
          |                              v
          |                       [Fielded BM25-lite]
          |                              |
          v                              v
 [context_lookup_requested]    [found | not_found | lookup_error]
                  \                    /
                   \                  /
                    v                v
                  [Trajectory facts]
                         |
                         v
                  [Snapshot commit]
                         |
                         v
               [next normal model call]
```

Runtime 拥有路由、Step/Preparation 生命周期和查询事实提交；Agent 拥有 v6 Response Schema 与结果投影；检索算法位于 Runtime 的无模型纯组件；Storage 实现索引 Sidecar。Router 不引用 Workspace 文件系统或 Tool Registry。

## Key Design Decisions

### 1. 使用独占 Decision 分支并持久化查询周期

结构化 Preparation Result 与 AgentDecision 增加独占分支：

```ts
interface ContextLookupRequest {
    readonly kind: "context_lookup";
    readonly need: "historical_execution" | "decision_rationale";
    readonly question: string;
    readonly filters?: ContextLookupFilters;
}
```

该分支不允许 `memoryPatch`、Tool Action、完成或阶段推进字段。Runtime 接受后生成稳定 `lookupId`，先读取并校验 authoritative committed source；来源可用后追加 `context_lookup_requested`，执行查询，再追加 `context_lookup_completed`、`context_lookup_not_found` 或 `context_lookup_failed`。请求与结果由同一 Snapshot 提交后才发起下一次模型调用。[Req 1]

Executing lookup 作为一种 `StepRecord` 恰好增加一次 `stepCount`，不产生 pending Action，也不触发 Tool Policy。Preparation 不增加执行 Step，但每次 Coordinator `advance` 最多连续查询 3 次，超过后返回 `CONTEXT_LOOKUP_CHAIN_LIMIT`。中断后根据已提交 lookup facts 恢复，不重复同一 `lookupId`。

### 2. 冻结独立 Retrieval 协议

`GoalDefinition` 增加 `contextRetrievalProtocol`：`none@1` 或 `bm25-lite@1`。Snapshot v9 保存该字段；v5–v8 只读恢复为 `none@1`。Prompt Bundle v6 固定 structured Memory、trajectory-layered Model Context 和 bm25-lite Retrieval；v1–v5 不出现 lookup 分支。[Req 8]

`GoalProtocolValidator` 同时校验三项协议和 Prompt Manifest。新 Goal 使用 v6；未知协议或交叉组合在模型、索引和持久化副作用前失败。

### 3. 索引完整 Context Document 而不是 Event

`ContextDocumentBuilder` 读取 `TrajectoryStore.readWithBoundary` 的 committed 部分，排除 marker、未提交 tail 和所有历史 lookup 事件。带 `executionUnitId` 的事件按 ID 聚合，只有包含已接受决策及其终止事实或 Observation 的闭合单元才进入索引。[Req 2]

Preparation 与无 Tool 的 Runtime 生命周期事实由 Coordinator/Committer 赋予稳定 `executionUnitId`，同一次协调单元内的 preparation result、accepted Memory Patch 和 workflow transition 组成一个文档。跨 ID、sequence 不连续、重复终止或缺少闭合事件均使重建失败，不基于部分文档查询。

每个文档保存 source event IDs、sequence range、phase、step index、Tool/Action/error/path/object 字段和有界正文。增量构建从 Sidecar `derivedThroughSequence + 1` 开始；更新文档频率和平均长度后，与完整重建使用同一 canonical 排序和统计过程。

### 4. 使用确定性 Fielded BM25-lite

Tokenizer 对文本执行 Unicode NFKC 和 locale-independent lowercase，同时保存 raw exact token；再按 `/`、`.`、`_`、`-`、camelCase 边界和字母/数字边界拆分。空 Token、超长 Token 和重复字段值按版本化规则处理，不读取系统 locale。[Req 3]

字段过滤先于评分。v1 使用 `k1 = 1.2`、`b = 0.75` 和标准 IDF：

```text
idf(t) = ln(1 + (N - df(t) + 0.5) / (df(t) + 0.5))

score(d, q) = sum(fieldWeight[f] * bm25(fieldTokens[f], queryTokens))
              + exactMatchBoosts

fieldWeight:
  body=1, eventType=2, stepIndex=3,
  toolId/actionId/errorCode=4, path/objectId=5

exact multiplier:
  path/objectId=3, toolId/actionId/errorCode=2
```

分数序列化前舍入到 6 位小数。只有舍入后相同才按 `lastSequence` 降序、`firstSequence` 降序、document ID 字典序 tie-break；recency 不进入主分数。[Req 4]

### 5. 合并命中并有界扩展相邻单元

查询默认 `topK = 5`、`minimumScore = 1.0`、结果总预算 24 KiB。相同 document 只返回一次；主命中确定后可附带前后各一个 committed 相邻文档，但相邻项不占 Top-K 排名，也必须完整落入剩余结果预算。[Req 4–5]

结果 DTO 包含 query hash、index version、committed boundary、每个命中的 source range、matched fields、rounded score、preview、`truncated`、`historical: true` 和原 event references。预算不足时丢弃整个最低排名结果或相邻文档，不截断 Context Document；preview 内部的大字段继续使用 Model Context Spec 的稳定大型输出投影。

成功查询无候选或最高分低于阈值才返回 `not_found`。索引/Trajectory 错误返回 `lookup_error`，两者不能互换。Evidence Gate 禁止 lookup request/result/not_found/error sequence 作为 Finding 或 Completion Evidence，只接受结果引用的原始允许事件。

### 6. Router 只接受历史信息需求

`ContextSourceRouter` 对 `need` 做封闭路由：[Req 6]

```text
historical_execution / decision_rationale
  -> ContextLookupPort

current_workspace_state / current_environment_state / verification_status
  -> context_lookup schema rejects
  -> model must issue authorized Tool Decision

task_contract / user_constraints
  -> supplied by Goal Task / Conversation projection
  -> never reconstructed from search summary
```

所有结果标记为历史状态。Prompt v6 要求涉及可变外部状态时重新观察；Runtime 通过 Evidence Gate 阻止历史 lookup event 本身完成 criterion，但不尝试通用判断自然语言是否陈旧。

### 7. Sidecar 保存版本化倒排索引与有界 LRU

Runtime 定义 `TrajectoryRetrievalIndexStore`，Storage 使用 `.lazygoal/context-sidecars/<goal>/<run>/retrieval-v1.json` 原子替换并采用与 Warm Sidecar 相同的安全路径和文件权限。Sidecar 包含文档、字段倒排表、df/长度统计、来源摘要和最多 64 个查询缓存项。[Req 7]

查询缓存键为 canonical `{question, filters, committedThroughSequence, indexVersion}` 的 SHA-256；命中更新进程内 LRU，成功 Sidecar 写入时保存稳定 MRU 顺序。缓存结果仍需校验 source document 存在。Sidecar 可落后并增量更新，不得领先；读取、写入或缓存损坏时从 committed Trajectory 重建，且不改变查询语义。

## Data Models

```ts
type ContextRetrievalProtocol =
    | { readonly kind: "none"; readonly version: 1 }
    | { readonly kind: "bm25-lite"; readonly version: 1 };

interface ContextLookupFilters {
    readonly eventTypes?: readonly string[];
    readonly toolIds?: readonly string[];
    readonly actionIds?: readonly string[];
    readonly stepIndexes?: readonly number[];
    readonly paths?: readonly string[];
    readonly errorCodes?: readonly string[];
    readonly sequenceRange?: { readonly from: number; readonly to: number };
}

type ContextLookupResult =
    | {
        readonly status: "found";
        readonly lookupId: string;
        readonly committedThroughSequence: number;
        readonly matches: readonly ContextLookupMatch[];
        readonly truncated: boolean;
    }
    | { readonly status: "not_found"; readonly lookupId: string }
    | { readonly status: "lookup_error"; readonly lookupId: string; readonly code: string };

interface RetrievalIndexSidecar {
    readonly schemaVersion: 1;
    readonly goalId: string;
    readonly runId: string;
    readonly derivedThroughSequence: number;
    readonly sourceDigest: string;
    readonly tokenizerVersion: string;
    readonly rankingVersion: string;
    readonly documents: readonly ContextSearchDocument[];
    readonly queryCache: readonly CachedLookup[];
}
```

问题长度默认上限 1024 字符，每类 filter 最多 16 项。所有数组在规范化后排序去重；sequence range 必须位于 `[1, committedThroughSequence]`。模型不可提交 index version、Top-K、权重或阈值覆盖值。

## Error Handling

```text
[context_lookup]
  invalid schema / unsupported need / chain limit
    -> stable protocol error; no lookup facts
  valid request
    -> read and validate committed source
         +-- authoritative source fails -> stable source error; no lookup facts
         `-- source valid -> load/rebuild index
                +-- Sidecar failure, rebuild succeeds -> index ready + diagnostic
                `-- internal rebuild fails ------------> result = lookup_error
    -> append requested fact
    -> index ready: query
         +-- score >= threshold -> commit found
         +-- successful no match -> commit not_found
         +-- internal query error -> commit lookup_error
       result already lookup_error -> commit lookup_error without query
    -> Snapshot save
         +-- failed -> result remains uncommitted; no next model call
         `-- succeeded -> next model call sees committed result
```

## Testing Strategy

- Response Schema 与 Runtime 生命周期测试覆盖独占 lookup 分支、Executing 单 Step、Preparation 三次上限、事实顺序、Snapshot 失败和中断恢复，对应 Req 1。
- DocumentBuilder 属性测试覆盖 committed boundary、完整 execution/preparation 单元、lookup/marker/tail 排除、增量与全量等价及损坏 fail-closed，对应 Req 2。
- Tokenizer golden tests 覆盖路径、snake/camel、数字、Unicode、精确 Token、locale 隔离与版本确定性，对应 Req 3。
- BM25 golden tests 固定字段权重、IDF、长度归一化、精确 boost、舍入、recency tie-break、去重与相邻扩展，对应 Req 4。
- 结果契约测试覆盖 Top-K、24 KiB 预算、完整文档截断、source refs、`not_found`/`lookup_error` 区分和 Evidence Gate，对应 Req 5。
- Router/Prompt 测试覆盖六类信息需求，证明 current state 只能进入正常 Tool 分支，Task/Conversation 不经检索，对应 Req 6。
- Sidecar/Cache 测试覆盖原子替换、权限、增量更新、领先/损坏/hash 失配回退、64 项 LRU、跨 boundary key 隔离和删除重建，对应 Req 7。
- 固定评测集分别测试精确标识 Recall@5、自然语言 Recall@5、`not_found` 精确率和 byte-stable ranking；新旧 Prompt/Snapshot 协议矩阵及全包回归覆盖 Req 8。
