---
status: delivered
created_at: 2026-10-28
delivered_at: 2026-10-29
supersedes: []
superseded_by: null
---

# 存储写入原语收敛 Spec

## 目标与范围

`@lazygoal/storage` 的 17 个源文件共 7,361 行，其中“临时文件 + fsync + rename”原子替换在 8 个文件里有 9 处实现，JSONL 追加在 4 个文件里有 5 处实现，另有一处非 JSONL 的进程输出分片追加；按键串行在 10 个文件里有 11 个各自维护的队列机制。权限、失败清理、可重试错误码和“写入结果未知”的核对方式因此只在各自的 Store 里成立，任何一处修正都不会传播到其它 Store。

本 Spec 把这些重复收敛为 `atomicWriteJson`、`appendJsonl`（内部委托 `appendFileChunk`）与一个 `KeyedSerialQueue`，让权限、临时文件清理、重试上限和核对顺序只有一处权威定义；全部持久化格式、路径布局、Store 公共契约与恢复语义保持不变。

明确不包含：

- 不引入 `node:sqlite`、`better-sqlite3`、任何原生模块或新的 npm 依赖；SQLite 由独立 Spec 覆盖 schema、迁移、导出与恢复，本 Spec 只固化它的前置约束（需求 7）。
- 不改变任何文件路径、文件名、base64url 编码、JSON 缩进、换行或 JSONL 行格式。
- 不合并 `JsonFileToolGrantStore` 与 `JsonFileSandboxGrantStore` 近乎相同的账本读改写实现；这是相邻但独立的重复，另行简化。
- 不覆盖 `packages/config` 中的原子写实现（`scripts/check-dependencies.mjs` 的依赖方向禁止 `config` 依赖 `storage`），也不覆盖 `benchmarks/*` 中的制品写入实现（它们写的是评测产物，不属于 storage 层）。
- 不新增跨进程锁、Outbox、exactly-once、目录 fsync 或崩溃后自动修复。
- 不迁移历史开发期数据，不为旧权限或旧临时文件格式增加兼容分支。
- 不改变 `JsonFileModelInputStore` 的 SHA-256 正文独占创建（`flag: "wx"`）与 `JsonFileGoalStore` 的空归档标记写入；两者各只有一处实现，不属于本次收敛对象。

### 当前重复清单

| 重复项 | 文件 | 关键位置 |
| --- | --- | --- |
| 原子替换 | `goal-store.ts`、`json-file-tool-grant-store.ts`、`json-file-sandbox-grant-store.ts`、`json-file-model-preference-store.ts`、`json-file-project-permission-mode-store.ts`、`goal-context-index-store.ts`、`context-retrieval-index-sidecar.ts`、`json-file-process-session-store.ts` | `goal-store.ts:112-160`、`json-file-tool-grant-store.ts:219-229`、`json-file-sandbox-grant-store.ts:225-235`、`json-file-model-preference-store.ts:40-56`、`json-file-project-permission-mode-store.ts:166-182`、`goal-context-index-store.ts:114-130`、`context-retrieval-index-sidecar.ts:359-383`、`json-file-process-session-store.ts:139-170` 与 `268-288` |
| JSONL 追加 | `json-file-trajectory-store.ts`、`json-file-metrics-store.ts`、`json-file-diagnostic-trace-sink.ts`、`json-file-model-input-store.ts` | `json-file-trajectory-store.ts:139-173`、`json-file-metrics-store.ts:118-147` 与 `345-358`、`json-file-diagnostic-trace-sink.ts:40-62`、`json-file-model-input-store.ts:29-53` |
| 非 JSONL 字节追加 | `json-file-process-session-store.ts` | `json-file-process-session-store.ts:340-354` |
| 串行队列 | `goal-store.ts`、`json-file-trajectory-store.ts`、`json-file-metrics-store.ts`、`json-file-diagnostic-trace-sink.ts`、`json-file-model-input-store.ts`、`json-file-process-session-store.ts`、`json-file-tool-grant-store.ts`、`json-file-sandbox-grant-store.ts`、`json-file-model-preference-store.ts`、`json-file-project-permission-mode-store.ts` | `goal-store.ts:71`、`json-file-trajectory-store.ts:119`、`json-file-metrics-store.ts:105`、`json-file-diagnostic-trace-sink.ts:28`、`json-file-model-input-store.ts:25`、`json-file-process-session-store.ts:84`、后四个 Store 的 `this.tail` |

权限现状同样不一致：`json-file-project-permission-mode-store.ts:171` 的临时文件未指定 mode，实际权限由 umask 决定；`goal-store.ts:123` 与 `json-file-diagnostic-trace-sink.ts:45` 的 `mkdir` 未指定 `0700`；`json-file-metrics-store.ts:360-367` 则在每次追加后重复 `chmod` 目录与文件来弥补这一点。

## 需求与验收标准

### 需求 1：统一原子替换写入

作为存储层维护者，我希望所有原子替换只经过一个原语，以便权限、临时文件清理和重试核对不会在不同 Store 之间再次漂移。

- <a id="spec-req-1-1"></a>**验收标准 1.1**：当 `packages/storage/src` 中任一 Store 需要原子替换一个 JSON 文件时，系统必须只调用共享 `atomicWriteJson`，由它负责同目录临时文件、创建时权限、可选 fsync、rename 与失败清理。
- <a id="spec-req-1-2"></a>**验收标准 1.2**：当调用方声明 `durable: true` 时，系统必须在 rename 之前完成临时文件 `fsync`；当声明 `durable: false` 时不得执行 `fsync`。两种情况都不得执行目录 fsync。
- <a id="spec-req-1-3"></a>**验收标准 1.3**：若写入抛出调用方声明为可重试的错误码，系统必须先执行调用方提供的效果核对；只有核对判定目标文件尚未成为目标内容时，才按声明间隔重试，且总尝试次数不得超过声明上限。
- <a id="spec-req-1-4"></a>**验收标准 1.4**：若核对判定目标文件已经是目标内容，系统必须把该次写入视为成功并返回，不得再次写入或回放调用方上层的提交。
- <a id="spec-req-1-5"></a>**验收标准 1.5**：若错误不可重试、核对自身失败或重试耗尽，系统必须尽力删除临时文件，并传播核对错误或最后一次写入错误；临时文件清理失败不得掩盖该错误。
- <a id="spec-req-1-6"></a>**验收标准 1.6**：原子替换成功后，目标文件必须为 `0600`；由该次写入新建的父目录必须为 `0700`。

### 需求 2：统一 JSONL 追加

作为存储层维护者，我希望所有 JSONL 追加只经过一个原语，以便“是否已落盘”的判断和重试顺序只有一套实现。

- <a id="spec-req-2-1"></a>**验收标准 2.1**：当 Store 追加一条 JSONL 记录时，系统必须调用共享 `appendJsonl`，且每次调用只写入一条以单个 `\n` 结尾的完整记录。
- <a id="spec-req-2-2"></a>**验收标准 2.2**：当调用方声明 `durable: true` 时，系统必须在返回前完成文件 `fsync`；当声明 `durable: false` 时不得执行 `fsync`。
- <a id="spec-req-2-3"></a>**验收标准 2.3**：若追加抛出调用方声明为可重试的错误码且调用方提供尾部核对，系统必须把本次序列化行交给核对回调；只有判定该行未写入时才重试，且总尝试次数不得超过声明上限。
- <a id="spec-req-2-4"></a>**验收标准 2.4**：若核对判定该行已完整写入，系统必须视为成功返回，不得重复追加，也不得改变调用方的事件序号。
- <a id="spec-req-2-5"></a>**验收标准 2.5**：若核对抛出协议错误（不完整尾部、无法确认结果或序号冲突），系统必须立即停止重试并传播该错误，不得截断、重写或删除已存在文件。
- <a id="spec-req-2-6"></a>**验收标准 2.6**：若调用方未提供核对，系统必须在第一次失败时直接传播错误，不执行盲重试。

### 需求 3：统一按键串行队列

作为存储层维护者，我希望并发写入顺序由同一个队列实现保证，以便失败隔离和簿记释放不再各写一遍。

- <a id="spec-req-3-1"></a>**验收标准 3.1**：当同一 key 上提交多个操作时，`KeyedSerialQueue` 必须严格按调用顺序串行执行，后一个操作在前一个操作结算后才开始。
- <a id="spec-req-3-2"></a>**验收标准 3.2**：若一个操作拒绝，系统必须只让该操作返回的 Promise 拒绝；同一 key 的后续操作和不同 key 的操作必须继续执行。
- <a id="spec-req-3-3"></a>**验收标准 3.3**：当某 key 上最后一个排队操作结算后，系统必须删除该 key 的簿记，使内部映射不随操作次数增长。
- <a id="spec-req-3-4"></a>**验收标准 3.4**：队列为簿记创建的内部 Promise 不得产生未处理的拒绝。
- <a id="spec-req-3-5"></a>**验收标准 3.5**：系统必须提供 `drain(key)`，返回该 key 当前已排队工作全部结算的 Promise，供读己之写路径等待在途写入。

### 需求 4：权限与错误策略唯一

作为本机用户，我希望所有私有持久化文件的权限由一个策略决定，以便不再依赖进程 umask 或逐点补 `chmod`。

- <a id="spec-req-4-1"></a>**验收标准 4.1**：由 storage 创建的持久化文件必须在创建时使用 `0600`，目录必须在创建时使用 `0700`；系统不得对已存在路径重复执行 `chmod` 来纠正权限。
- <a id="spec-req-4-2"></a>**验收标准 4.2**：`permission-mode.json` 的实际权限必须由创建参数决定，不得再依赖进程 umask。
- <a id="spec-req-4-3"></a>**验收标准 4.3**：原语不得定义通用错误包装，也不得在调用点未显式声明时吞掉任何文件系统错误；缺失文件（`ENOENT`）的静默范围必须由各 Store 显式声明，并遵守“缺失目录（ENOENT）的阶段语义”的阶段划分。
- <a id="spec-req-4-4"></a>**验收标准 4.4**：写入失败必须仍以该 Store 现有的错误类型或原始文件系统错误传播，调用方可捕获的协议错误类型不得改变。

### 需求 5：重复实现的可验证消除

作为审查者，我希望“不再有重复写文件 helper”由测试而不是人工搜索保证。

- <a id="spec-req-5-1"></a>**验收标准 5.1**：`packages/storage/src` 中除 `json-file-write.ts` 外，不得出现构造 `.tmp` 目标路径的代码（注释与 TSDoc 不计）、`rename` 调用、`FileHandle.sync` 调用、直接 `appendFile` 调用或 `open(..., "a")` 追加写入。
- <a id="spec-req-5-2"></a>**验收标准 5.2**：上述约束必须由 `packages/storage/test` 下的确定性静态检查测试守护；违反时测试必须报告文件与行号，而不是仅返回失败。
- <a id="spec-req-5-3"></a>**验收标准 5.3**：除 `keyed-serial-queue.ts` 外，`packages/storage/src` 中不得出现第二处手写按键串行实现，判定特征为持有 `this.tail` 或 `Map<string, Promise` 并手工链式排队。

### 需求 6：行为与契约保持

作为 Goal Server、浏览器与 Benchmark 的调用方，我希望这次重构不改变任何可观测结果。

- <a id="spec-req-6-1"></a>**验收标准 6.1**：既有 Store 的文件布局、命名、JSON 缩进与换行、错误类型、重试上限、核对语义和读取结果必须保持不变。
- <a id="spec-req-6-2"></a>**验收标准 6.2**：Goal Server 组合根、浏览器 trajectory 路由与 Benchmark 持久化适配器的调用方式与构造参数必须保持不变。
- <a id="spec-req-6-3"></a>**验收标准 6.3**：现有写入故障注入测试（`goal-store.test.ts` 的 rename/open 临时错误、`trajectory-store.test.ts` 的 append/sync/不完整尾部、`context-retrieval-index-sidecar.test.ts` 与 `json-file-model-preference-store.test.ts` 的权限断言）必须在不修改断言的条件下通过。
- <a id="spec-req-6-4"></a>**验收标准 6.4**：`packages/storage/notes/overview.md` 与 `notes/semantics.md` 必须新增写入原语与串行队列的归属条目，并删除各 Store 中已由原语统一承担的重试与权限表述；`npm run check:docs` 必须通过。

### 需求 7：SQLite 战略选项的边界与记录

作为架构决策者，我希望本轮不承担 SQLite 的不确定性，同时保留它的评估结论。

- <a id="spec-req-7-1"></a>**验收标准 7.1**：本 Spec 不得修改任何 `package.json` 依赖，不得引入 SQLite、原生模块或第三方原子写库。
- <a id="spec-req-7-2"></a>**验收标准 7.2**：模块说明必须记录延后 SQLite 的阻塞约束与独立 Spec 的最低覆盖范围，使后续评估不必重新发现这些事实。
- <a id="spec-req-7-3"></a>**验收标准 7.3**：共享原语必须保持为 storage 内 JSON/JSONL 的唯一序列化出口，使未来的 SQLite 实现可以直接复用它们实现导出，而不必再引入第二套写入代码。

## 架构与核心决策

### 系统拓扑与接口

新增两个模块，均不从 `src/index.ts` 导出，保持公共入口不变：

```text
packages/storage/src/json-file-write.ts
    atomicWriteJson(options): Promise<void>
    appendJsonl(options): Promise<void>
    appendFileChunk(options): Promise<void>
    TRANSIENT_FILE_ERROR_CODES
    WRITE_RETRY_THREE_ATTEMPTS
    FileWriteOperations
    AtomicWriteOptions / AppendJsonlOptions / AppendChunkOptions / FileWriteRetryPolicy

packages/storage/src/keyed-serial-queue.ts
    class KeyedSerialQueue { run<T>(key, operation): Promise<T>; drain(key): Promise<void> }
```

调用链固定为 `Store → KeyedSerialQueue → atomicWriteJson | appendFileChunk → node:fs/promises → 磁盘`。`appendJsonl` 只负责“一条 JSON 加一个换行”并委托 `appendFileChunk` 完成字节追加。原语不认识任何 Store 类型、协议错误或路径语义，只接收完整目标路径与序列化输入。

```ts
interface FileWriteRetryPolicy {
    /** 含首次尝试的总次数。 */
    readonly attempts: number;
    /** 两次尝试之间的等待毫秒；为 0 表示不等待。 */
    readonly delayMs: number;
    /** 触发核对与重试的 errno 集合。 */
    readonly codes: ReadonlySet<string>;
}

interface AtomicWriteOptions {
    readonly path: string;
    readonly value: unknown;
    readonly indent: 2 | undefined;
    readonly trailingNewline: boolean;
    readonly durable: boolean;
    readonly retry?: FileWriteRetryPolicy;
    readonly verify?: (serialized: string) => Promise<"applied" | "absent">;
    /** 仅 `rename` 阶段返回 `ENOENT` 时视为成功；其余阶段与其它 errno 照旧抛出。 */
    readonly tolerateRenameEnoent?: boolean;
    readonly operations?: Partial<FileWriteOperations>;
}

interface AppendJsonlOptions<T> {
    readonly path: string;
    readonly value: T;
    readonly durable: boolean;
    readonly retry?: FileWriteRetryPolicy;
    readonly verify?: (line: string) => Promise<"applied" | "absent">;
    readonly operations?: Partial<FileWriteOperations>;
}

interface AppendChunkOptions {
    readonly path: string;
    readonly data: string | Uint8Array;
    readonly durable: boolean;
    readonly operations?: Partial<FileWriteOperations>;
}
```

`FileWriteOperations` 是 `node:fs/promises` 的 `mkdir`、`open`、`rename`、`unlink`、`appendFile`、`readFile` 子集的注入点，默认使用真实实现；各 Store 把现有可选注入参数原样透传，未提供时不做额外包装。`readFile` 只服务于调用方提供的核对回调。

### 缺失目录（ENOENT）的阶段语义

`atomicWriteJson` 默认把每个阶段的文件系统错误原样抛给调用方，临时文件清理失败也不得掩盖原始错误。唯一例外由调用点显式声明：`tolerateRenameEnoent: true` 时，`rename` 返回 `ENOENT` 视为目标目录已被并发清理并正常返回；`mkdir`、`open`、写入、`sync` 与 `close` 的 `ENOENT` 仍抛出。

`JsonFileProcessSessionStore` 的两个调用点各自保持原有静默范围，不得合并或互换：

| 调用点 | 重构前的静默范围 | 迁移后的承载方式 |
| --- | --- | --- |
| `saveSession`（`session.json`） | 仅 `rename` 的 `ENOENT` | 传 `tolerateRenameEnoent: true`；其余阶段照旧抛出 |
| `writeMeta`（`meta.json`） | 整段写入的任何 `ENOENT` | 不传该选项，在调用点用 `try/catch` 吞掉该次调用的 `ENOENT` |

两者都只在 `ENOENT` 上静默，其余错误原样传播；`tolerateRenameEnoent` 不改变临时文件清理顺序，也不改变核对与重试的执行时机。

原子替换调用点必须按下表显式声明策略，不得依赖原语默认值：

| Store | `durable` | `retry` | `verify` |
| --- | --- | --- | --- |
| `JsonFileGoalStore` | `true` | 3 次 / 10ms / `EINTR` `EAGAIN` `EBUSY` | 读取目标文件并与待写内容逐字节比对 |
| `JsonFileToolGrantStore` | `true` | 无 | 无 |
| `JsonFileSandboxGrantStore` | `true` | 无 | 无 |
| `JsonFileModelPreferenceStore` | `false` | 无 | 无 |
| `JsonFileProjectPermissionModeStore` | `false` | 无 | 无 |
| `JsonFileGoalContextIndexStore` | `true` | 无 | 无 |
| `JsonFileContextRetrievalIndexStore` | `true` | 无 | 无 |
| `JsonFileProcessSessionStore`（`session.json`、`meta.json`） | `true` | 无 | 无 |

JSONL 追加调用点：

| Store | `durable` | `retry` | `verify` |
| --- | --- | --- | --- |
| `JsonFileTrajectoryStore` | 仅 `program_time_reserved` 为 `true`，其余 `false` | 3 次 / 10ms / 同左 | 现有尾部核对：完整命中为 `applied`，序号为 `n-1` 为 `absent`，不完整尾部或冲突抛协议错误 |
| `JsonFileMetricsStore` | `false` | 无 | 无 |
| `JsonFileDiagnosticTraceSink` | `false` | 无 | 无 |
| `JsonFileModelInputStore` | `false` | 无 | 无 |

进程输出分片不是 JSONL，使用 `appendFileChunk` 原样追加字节并完成 `fsync`：

| Store | 目标 | `durable` | 轮转 |
| --- | --- | --- | --- |
| `JsonFileProcessSessionStore` | `part-<n>.log` | `true` | 轮转与 `meta.json` 更新仍由 Store 按现有锁 key 串行完成 |

队列 key 必须按下表保持现有隔离粒度：

| Store | key |
| --- | --- |
| `JsonFileGoalStore` | `goalId` |
| `JsonFileTrajectoryStore` | `goalId` + `runId` |
| `JsonFileMetricsStore` | 调用事实用 `goalId` + `runId`；覆盖记录用 `goalId` |
| `JsonFileDiagnosticTraceSink` | `goalId` + `runId` |
| `JsonFileModelInputStore` | 同一 Goal 的正文与清单共用同一个 key |
| `JsonFileToolGrantStore`、`JsonFileSandboxGrantStore` | 账本固定 key |
| `JsonFileModelPreferenceStore`、`JsonFileProjectPermissionModeStore` | 文件固定 key，读取前 `drain` |
| `JsonFileProcessSessionStore` | `goalId` + `processId` + `session`，或同前缀 + `channel` |

`JsonFileProcessSessionStore` 现有 `withLock` 把 `prev.then(() => next)` 写入映射，却在 `finally` 中与 `next` 比较，导致条目永不删除。改由 `KeyedSerialQueue` 接管后该泄漏随需求 3.3 一并消失，串行顺序与读取互斥语义不变。

与既有 Spec 的边界：`three-view-architecture` 规定 Storage 独占持久化表示与文件路径，本 Spec 只替换其内部写入实现，不改变该所有权；`run-execution-persistence-separation` 与 `trajectory-store-performance` 定义的 Snapshot 提交边界、JSONL 尾部扫描和 `committedThroughSequence` 语义保持不变；`browser-trajectory` 与 Benchmark 持久化只消费 `TrajectoryStore`/`GoalStore` Port，因此无需改动调用方。没有其它未提交 Spec 与本 Spec 重叠，也没有实现依赖需要串行化。

### 核心决策

- **原语留在本包内部，不新建共享包**：唯一真实消费者是 `packages/storage`；`packages/config` 受依赖方向限制无法引用本包，`benchmarks/*` 的同类实现服务于评测制品，把它们一并纳入需要重新设计包边界与依赖允许清单，属于独立决策。
- **无状态函数 + 单类队列**：写入原语没有实例状态，差异全部由显式选项表达；只有队列需要保存按键状态，因此只有它是类。不引入 `JsonFileStore<T>` 基类。
- **重试与核对由调用点提供，原语只执行**：`EINTR`/`EAGAIN`/`EBUSY` 集合与 3 次 / 10ms 预设作为共享常量，但“是否可重试”“如何核对”必须逐点声明。Goal Snapshot 的“rename 已生效但报错”和 Trajectory 的“不完整尾部即失败”是两种不同语义，不能合并为一个内置策略。
- **fsync 显式参数化**：保留现有差异而不是统一加 `fsync`。`Snapshot`、Grant 账本、Sidecar 与进程元数据继续 `durable: true`；偏好、权限模式、Metrics、Trace 与模型输入清单不参与恢复，继续 `durable: false`，避免改变其写入成本与失败面。
- **权限只在创建时设置**：统一为文件 `0600`、目录 `0700`，删除 Metrics 的重复 `chmod` 与 Sidecar 的重复 `chmod`。这修正 `permission-mode.json` 的 umask 依赖；历史宽松权限不被自动纠正，符合仓库的开发期兼容策略。
- **JSON 字节形状由参数固定**：`indent` 与 `trailingNewline` 逐点声明，保证 Goal Snapshot 的逐字节核对、Grant 账本的 `2` 空格缩进加换行，以及进程元数据的无尾换行都不变。
- **临时文件命名统一为 `<target>.<uuid>.tmp`**：`JsonFileGoalStore.listHistory` 只扫描 `.json` 普通文件，该命名保持其忽略规则；`JsonFileProcessSessionStore` 与 `JsonFileGoalContextIndexStore` 的 `.<name>-<uuid>.tmp` 变体一并收敛。
- **SQLite 延后到独立 Spec**：本 Spec 记录三项决定性约束——Benchmark 制品按 `goals/`、`trajectories/`、`traces/` 目录独立复制（`benchmarks/swebench/src/container.ts`、`benchmarks/*/src/environment-spec.ts`、`BenchmarkPersistenceLocator`）；`node:sqlite` 在 Node 22.22.2 可用但仍打印 `ExperimentalWarning`；当前运行时依赖清单不含原生模块。独立 Spec 必须覆盖 schema、迁移与删除策略、导出、恢复，以及制品目录形状的替代方案。

## 曾考虑的备选方案

- **只抽常量与小工具函数，保留各 Store 的重试循环**：改动最小，实施风险最低。**落选原因**：核对与重试顺序仍分散在 9 处，需求 5 的“不再有重复写文件 helper”无法满足，也无法阻止下一处 Store 再次各写一遍。
- **新建 `@lazygoal/file-store` 共享包**：可让 `config`、`storage` 与 `benchmarks` 共用同一实现。**落选原因**：需要新增包边界、改依赖允许清单并重新验证三层依赖方向，而当前真实消费者只有 `storage`；属于没有当前需求支撑的抽象。
- **通用 `JsonFileStore<T>` 模板方法基类**：看起来能一次覆盖全部 JSON 存储。**落选原因**：各 Store 的读协议、错误类型、路径布局与内存缓存（Trajectory 的序号缓存、Grant 的读改写事务）差异远大于写入差异，基类会迫使它们共享不属于自己的抽象。
- **统一为全量 `fsync` 加目录 `fsync`**：持久性最强。**落选原因**：Metrics、Trace、模型输入清单与 UI 偏好不参与恢复，逐条 `fsync` 会显著增加写入延迟和失败面；目录 `fsync` 还需要额外的错误语义，超出本次范围。
- **引入 `write-file-atomic`、`proper-lockfile` 等第三方实现**：减少自维护代码。**落选原因**：仍要为每个调用点补“结果未知时如何核对”的语义，且新增依赖违反仓库当前的零额外运行时依赖基线。
- **本轮直接切换 SQLite**：删除量最大。**落选原因**：净收益不确定，且需要独立处理 schema、制品目录形状、导出与恢复；同时战术层并非一次性投入——即使将来落库，JSON/JSONL 仍是导出与调试格式，共享原语会继续承担该职责。

## 风险与否定性保证

- **风险等级：medium**。理由：改动覆盖全部持久化写入路径，影响 Goal Server 运行时组合、浏览器 trajectory 读取与 Benchmark 制品回收；但不改变文件格式、公开 Port 或恢复协议。关键操作：重写 Tool Grant 与 Sandbox Grant 账本、Goal Snapshot、Trajectory 的写入路径，必须保持失败关闭。
- **风险：Goal Snapshot 的“rename 已生效但返回临时错误”被误判为失败并重写**。应对：需求 1.4 与原语 `verify` 返回值 `applied` 直接表达该语义，由 `goal-store.test.ts` 的 rename/open 故障注入锁定。
- **风险：Trajectory 把不完整尾部当作可重试的未写入**。应对：需求 2.5 要求核对抛出的协议错误立即终止重试且不触碰文件；由 `trajectory-store.test.ts` 的部分写入与 sync 故障用例锁定。
- **风险：抽取后某一 Store 丢失或扩大“目录不存在时忽略”的容忍行为**。应对：`saveSession` 只对 `rename` 的 `ENOENT` 静默（`tolerateRenameEnoent`），`writeMeta` 对整段写入的 `ENOENT` 静默（调用点 `try/catch`），范围见“缺失目录（ENOENT）的阶段语义”；两者由 `process-session-store.test.ts` 的逐阶段故障注入锁定。
- **风险：统一权限改变 `permission-mode.json` 与原无 mode 目录的实际权限**。应对：只在创建时生效，不追溯已有文件；开发期数据可删除重建，符合仓库兼容策略。
- **风险：静态检查测试过度绑定实现细节**。应对：只禁止五类具体模式并保留单一 allowlist；新增合法写入必须走原语，而不是放宽检查。
- **否定性保证**：
  - 不得在同一 key 上并发写入同一文件。
  - 不得在核对判定“已生效”或“已写入”后再次执行写入。
  - 不得截断、重写或删除已存在文件来“修复”无法确认的写入结果。
  - 不得吞掉非 `ENOENT` 的写入错误，也不得让临时文件清理失败掩盖原始错误。
  - 不得改变任何持久化路径、文件名、JSON/JSONL 字节格式或 Store 公开类型签名。
  - 不得新增依赖、SQLite、原生模块、跨进程锁或 exactly-once 承诺。
  - 不得以行数减少作为验收依据；本 Spec 的收益是单一权威实现，预期净减少约 100–200 行只是副作用。
- **验证边界**：需求 1–4 由新增的原语单元测试与既有 Store 故障注入测试共同覆盖；需求 5 由静态检查测试覆盖；需求 6 由 `npm test`（含 `tsc --noEmit`、依赖方向检查、全部包与 Benchmark 测试）、`npm run test:web-e2e`、`apps/goal-server/test/browser-session.integration.test.ts` 与 `npm run check:docs` 覆盖；需求 7 由依赖检查与模块说明更新覆盖。
