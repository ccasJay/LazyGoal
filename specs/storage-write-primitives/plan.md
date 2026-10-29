# 存储写入原语收敛 执行计划

风险等级、关键操作与否定性保证见 [spec.md 的风险与否定性保证](./spec.md#风险与否定性保证)；本计划不重复该评估。

## 任务清单

- [x] //TODO 1. 交付原子替换原语并接入 Goal Snapshot：临时文件、可选 fsync、结果未知核对与失败清理
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6)、[4.1](./spec.md#spec-req-4-1)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[6.1](./spec.md#spec-req-6-1)、[6.3](./spec.md#spec-req-6-3)
  - 实施目标：新增 `packages/storage/src/json-file-write.ts`，导出 `atomicWriteJson`、`TRANSIENT_FILE_ERROR_CODES`、`WRITE_RETRY_THREE_ATTEMPTS`、`FileWriteOperations` 与选项类型；临时文件固定为 `<target>.<uuid>.tmp`，创建时文件 `0600`、目录 `0700`，`durable` 决定 rename 前是否 `fsync`，失败时清理临时文件并重抛原始错误。`tolerateRenameEnoent` 只在 `rename` 返回 `ENOENT` 时正常返回，其余阶段与其它 errno 照旧抛出；清理临时文件的失败不得掩盖原始错误。把 `packages/storage/src/goal-store.ts` 的 `saveSnapshot` 改为调用原语，保留三次临时故障上限、目标内容核对、归档标记清理与 `GoalSnapshotProtocolError`。原语不定义新错误类型，也不从 `src/index.ts` 导出。同步补中文契约 TSDoc。
  - 场景与预期：第一次 `open` 抛 `EINTR`、第二次成功时 `restore` 得到同一 Goal；`rename` 已完成但抛 `EBUSY` 时只写一次且不重放提交；持续 `EBUSY` 时第三次后以 `EBUSY` 拒绝，目录中无 `*.tmp`；核对抛出 `GoalSnapshotProtocolError` 时立即停止并传播；新建目录中保存后快照为 `0600`、目录为 `0700`；`indent` 与 `trailingNewline` 组合产生的字节与重构前一致；`mkdir` 或 `open` 抛 `ENOENT` 时以该错误拒绝，`tolerateRenameEnoent: true` 时 `rename` 抛 `ENOENT` 正常返回且无 `*.tmp` 残留，未声明该选项时 `rename` 的 `ENOENT` 照旧抛出；`unlink` 清理抛 `EACCES` 时抛出原始写入错误。
  - 验证手段：新增 `packages/storage/test/json-file-write.test.ts` 覆盖权限、`durable` 顺序、核对三分支、清理与逐阶段 `ENOENT` 语义，然后运行 `npx tsx --test packages/storage/test/json-file-write.test.ts packages/storage/test/goal-store.test.ts`；断言既有故障注入用例未被修改。

- [x] //TODO 2. 交付其余原子替换 Store 迁移并统一创建权限
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6)、[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.4](./spec.md#spec-req-4-4)、[6.1](./spec.md#spec-req-6-1)、[6.3](./spec.md#spec-req-6-3)
  - 实施目标：把 `json-file-tool-grant-store.ts`、`json-file-sandbox-grant-store.ts`、`json-file-model-preference-store.ts`、`json-file-project-permission-mode-store.ts`、`goal-context-index-store.ts`、`context-retrieval-index-sidecar.ts`、`json-file-process-session-store.ts` 的 `writeLedger`、`writeRecord`、`save`、`writeMeta` 全部改调用 `atomicWriteJson`，并按 spec 的策略表逐点声明 `durable`、`retry`、`verify`；删除 `context-retrieval-index-sidecar.ts` 与 `goal-context-index-store.ts` 在写入后重复的 `chmod`；`permission-mode.json` 不再依赖 umask。`process-session` 的两个调用点按 spec“缺失目录（ENOENT）的阶段语义”分别承载：`saveSession` 传 `tolerateRenameEnoent: true`（仅 rename 静默），`writeMeta` 不传该选项、在调用点捕获整次调用的 `ENOENT`（整段写入静默）；不得把前者扩大为整段容忍，也不得把后者收窄为仅 rename。同步更新受影响的 TSDoc 权限与重试描述。
  - 场景与预期：授权账本、沙箱账本、模型偏好、权限模式、Goal 上下文索引、Retrieval Sidecar 写后均以 `0600` 存在并可读回，损坏账本仍失败关闭；把进程 umask 设为 `0o000` 后新建 `permission-mode.json` 仍为 `0600`；逐阶段故障注入下 `saveSession` 只在 `rename` 的 `ENOENT` 上返回、`mkdir`/`open` 的 `ENOENT` 仍拒绝，`writeMeta` 对整段写入的 `ENOENT` 返回、`rename` 的 `EACCES` 仍拒绝；所有 Store 的可捕获错误类型不变。
  - 验证手段：`npx tsx --test packages/storage/test/json-file-tool-grant-store.test.ts packages/storage/test/sandbox-grant-store.test.ts packages/storage/test/json-file-model-preference-store.test.ts packages/storage/test/project-permission-mode.test.ts packages/storage/test/goal-context-index-store.test.ts packages/storage/test/context-retrieval-index-sidecar.test.ts packages/storage/test/process-session-store.test.ts`；重点断言 `0600` 权限、账本损坏拒绝与上述逐阶段 `ENOENT` 范围。

- [x] //TODO 3. 交付 JSONL 与字节追加原语并接入 Trajectory 尾部核对
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)、[4.1](./spec.md#spec-req-4-1)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[6.1](./spec.md#spec-req-6-1)、[6.3](./spec.md#spec-req-6-3)
  - 实施目标：在 `json-file-write.ts` 增加 `appendJsonl` 与 `appendFileChunk`。`appendJsonl` 负责序列化单行、把该行交给 `verify`、按 `applied`/`absent` 决定是否重试，并在核对抛错时停止且不触碰文件；`appendFileChunk` 负责 `durable` 选择 `open("a")` 加 `fsync` 或直接 `appendFile`。把 `json-file-trajectory-store.ts` 的 `writeEventLine` 改调用 `appendJsonl`：`program_time_reserved` 保持 `durable: true`，其余 `false`；三次 / 10ms / `EINTR` `EAGAIN` `EBUSY` 与现有 `inspectAppendOutcome` 语义原样搬入核对回调。
  - 场景与预期：第一次追加抛 `EBUSY` 且核对为 `absent` 时重试后恰好一行；追加已写入但抛 `EAGAIN` 时只尝试一次并返回同一序号；部分写入导致不完整尾部时抛 `TrajectoryProtocolError` 且文件不被截断；`EACCES` 只尝试一次；`read` 与 `readWithBoundary` 结果不变。
  - 验证手段：在 `packages/storage/test/json-file-write.test.ts` 增加追加用例后运行 `npx tsx --test packages/storage/test/json-file-write.test.ts packages/storage/test/trajectory-store.test.ts`；断言既有尾部、sync 与不完整尾部用例未被修改。

- [ ] //TODO 4. 交付其余 JSONL 与字节追加迁移
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.6](./spec.md#spec-req-2-6)、[4.1](./spec.md#spec-req-4-1)、[4.4](./spec.md#spec-req-4-4)、[6.1](./spec.md#spec-req-6-1)
  - 实施目标：把 `json-file-metrics-store.ts` 的调用事实与覆盖记录、`json-file-diagnostic-trace-sink.ts`、`json-file-model-input-store.ts` 的 `requests.jsonl` 改调用 `appendJsonl`（均 `durable: false`、无 `retry`、无 `verify`）；把 `json-file-process-session-store.ts` 的 `part-<n>.log` 改调用 `appendFileChunk`（`durable: true`）。删除 Metrics 在每次追加后重复的 `chmod`，保留其目录 `0700` 创建、冲突事实检测、Trace 无重试与模型输入“正文先行落盘、清单后追加”的顺序。
  - 场景与预期：指标、覆盖记录、诊断 Trace 与模型输入清单的行数与内容不变且文件为 `0600`；同一次调用出现冲突的完成事实时仍抛 `ModelCallMetricStoreProtocolError`；Trace 写入失败仍原样传播且不影响 Goal；模型输入正文已存在且哈希一致时不重写；进程输出分片按原字节追加、轮转仍产生 `gap` 语义。
  - 验证手段：`npx tsx --test packages/storage/test/session-metrics-store.test.ts packages/storage/test/diagnostic-trace-sink.test.ts packages/storage/test/model-input-store.test.ts packages/storage/test/process-session-store.test.ts`。

- [ ] //TODO 5. 交付按键串行队列并接管全部写入顺序
  - 落实标准：[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[3.5](./spec.md#spec-req-3-5)、[6.1](./spec.md#spec-req-6-1)、[6.3](./spec.md#spec-req-6-3)
  - 实施目标：新增 `packages/storage/src/keyed-serial-queue.ts`，实现按 key 的 FIFO `run`、`drain` 与只读 `pendingKeyCount`（用于验证簿记释放）。把 10 个 Store 中 11 处手写队列（含 `this.tail`、`Map<string, Promise>` 与 `withLock`）全部替换，key 粒度严格按 spec 的队列表；`JsonFileModelPreferenceStore` 与 `JsonFileProjectPermissionModeStore` 的读取改为先 `drain` 固定 key。删除 `withLock`，其串行与读取互斥语义由 `run` 承担。
  - 场景与预期：同 key 连续提交三次写入按提交顺序完成；第一个操作拒绝时只拒绝它本身，第二个仍成功；不同 key 的慢操作不阻塞彼此；`drain` 返回后立即可读到刚写入的偏好与权限模式；连续写入后 `pendingKeyCount` 回到 0；不存在未处理拒绝（进程级 `unhandledRejection` 未被触发）。
  - 验证手段：新增 `packages/storage/test/keyed-serial-queue.test.ts` 覆盖顺序、隔离、释放、`drain` 与拒绝簿记，然后运行 `npx tsx --test packages/storage/test/keyed-serial-queue.test.ts packages/storage/test/goal-store.test.ts packages/storage/test/trajectory-store.test.ts packages/storage/test/process-session-store.test.ts`。

- [ ] //TODO 6. 交付重复实现静态守护、消费方不变检查与模块文档
  - 落实标准：[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[6.2](./spec.md#spec-req-6-2)、[6.4](./spec.md#spec-req-6-4)、[7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)
  - 实施目标：新增 `packages/storage/test/storage-write-invariants.test.ts`，剥离注释与 TSDoc 后扫描 `packages/storage/src/*.ts`：除 `json-file-write.ts` 外禁止 `rename(`、`appendFile(`、`.sync(`、`open(..., "a")` 与 `.tmp` 构造；除 `keyed-serial-queue.ts` 外禁止 `this.tail` 与 `new Map<string, Promise`；违规时报告文件与行号。更新 `packages/storage/notes/overview.md` 与 `notes/semantics.md`，新增写入原语与串行队列的职责和语义条目，删除各 Store 中已由原语统一承担的重复重试/权限表述，并记录延后 SQLite 的三项阻塞约束与独立 Spec 的最低覆盖范围。
  - 场景与预期：正常树上静态检查通过；临时在任一 Store 加回 `rename(` 或 `.tmp` 构造时测试失败并打印文件与行号；`npm run check:docs` 通过；`git diff --stat` 不包含 `apps/goal-server`、`packages/browser`、`benchmarks/src/file-persistence-adapter.ts` 与任何 `package.json`。
  - 验证手段：`npx tsx --test packages/storage/test/storage-write-invariants.test.ts` 并手工注入一次违规样例确认报告可定位，然后运行 `npm run check:docs` 与 `git diff --stat`。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
|---|---|---|---|
| 原子替换单一实现与错误语义 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6) | 9 处原子替换全部经 `atomicWriteJson`；`durable` 控制 rename 前 fsync；核对为 `applied` 时不重写、为 `absent` 时有界重试；失败后无 `*.tmp` 残留，文件与目录分别为 `0600`/`0700` | `npx tsx --test packages/storage/test/json-file-write.test.ts packages/storage/test/goal-store.test.ts`；`npm test` |
| JSONL 与字节追加单一实现 | [2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)、[2.6](./spec.md#spec-req-2-6) | 每次追加恰好一行；Trajectory 完整命中视为成功、不完整尾部抛协议错误且不截断；无核对的 Store 首次失败即传播；进程输出分片原样追加 | `npx tsx --test packages/storage/test/json-file-write.test.ts packages/storage/test/trajectory-store.test.ts packages/storage/test/session-metrics-store.test.ts packages/storage/test/diagnostic-trace-sink.test.ts packages/storage/test/model-input-store.test.ts packages/storage/test/process-session-store.test.ts` |
| 按键串行与簿记释放 | [3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[3.5](./spec.md#spec-req-3-5) | 同 key FIFO、失败隔离、不同 key 并行；`drain` 支持读己之写；写入后 `pendingKeyCount` 归零且无未处理拒绝 | `npx tsx --test packages/storage/test/keyed-serial-queue.test.ts` |
| 权限与错误策略统一 | [4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4) | 所有新建持久化文件 `0600`、目录 `0700`；`permission-mode.json` 在 umask `0o000` 下仍为 `0600`；无重复 `chmod`；协议错误类型与原始 fs 错误照旧传播；`saveSession` 仅在 rename `ENOENT` 静默、`writeMeta` 整段 `ENOENT` 静默，其余阶段与 errno 照旧抛出 | `npm test`；`packages/storage/test/json-file-write.test.ts`、`process-session-store.test.ts`、`context-retrieval-index-sidecar.test.ts` 与 `project-permission-mode.test.ts` 的权限与逐阶段故障注入断言 |
| 无重复写文件实现 | [5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3) | 正常树通过静态检查；注入 `rename(` 或 `.tmp` 样例时报告文件与行号；无第二处 `this.tail` 或 `Map<string, Promise` | `npx tsx --test packages/storage/test/storage-write-invariants.test.ts` |
| 格式、路径与消费方不变 | [6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2) | 磁盘路径、命名、JSON 缩进与换行、JSONL 行格式不变；Goal Server 组合根、浏览器 trajectory 路由与 Benchmark 持久化适配器无改动且回归通过 | `npm test`、`npm run test:web-e2e`、`git diff --stat` |
| 故障与崩溃路径 | [6.3](./spec.md#spec-req-6-3) | 既有 fault-injection 用例断言未修改即通过；进程级恢复测试（`program-recovery.test.ts`）通过；Benchmark 制品目录复制测试通过 | `npm test` |
| 文档、依赖与 SQLite 边界 | [6.4](./spec.md#spec-req-6-4)、[7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3) | storage overview 与语义表已更新；SQLite 阻塞约束与独立 Spec 覆盖范围已记录；无依赖清单变更且依赖方向检查通过 | `npm run check:docs`、`npm run check:dependencies`、`git diff -- package.json` |

### Latest Result

- 状态：未执行
- 验证时间：-
- 验证摘要：尚未开始执行。
