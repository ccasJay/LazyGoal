---
feature: long-session-performance
status: proposed
risk: medium
created_at: 2026-11-04
delivered_at: null
supersedes: []
superseded_by: null
---

# 长会话执行性能优化 Spec

## 目标与范围

消除长会话执行热路径上的重复全量读取、深拷贝和无缓存计量，使每步成本不随会话历史重复放大，同时保持恢复、校验和模型可见语义不变。

不包含 fsync/durability 变更、step 内快照合并、持久化缓存、存储引擎替换或 Snapshot schema 变更。

## 用户故事

- **S1** 作为长任务执行者，我希望每个 step 的提交、上下文组装和计量不重复处理全部历史，以便长会话后期仍保持可接受的执行速度。
- **S2** 作为维护者，我希望优化有结构性计数和可重复基准作为证据，以便确认收益且不静默削弱恢复或校验语义。
- **S3** 作为恢复与调试的使用者，我希望增量读取和缓存在重启、Run 切换、边界回退或索引不可用时回退到现有全量路径，以便性能优化不改变故障语义。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | 同一 Goal/Run 连续提交 | 每次提交只从 GoalStore 读取一次最新 Snapshot，并在 `prepare(latest)` 返回后保存一次 | `npx tsx --test packages/runtime/test/commit-restore-count.test.ts` |
| R1.2 | S1 | 事件 | `committedThroughSequence` 未变化 | assembler 复用已适配单元与计量，不读取 trajectory | assembler 缓存命中测试（读取计数为 0） |
| R1.3 | S1 | 事件 | `committedThroughSequence` 增加 K 个事件 | assembler 只增量读取并适配新增后缀，输出与冷启动全量组装完全一致 | assembler cached-vs-fresh 等价性测试 |
| R1.4 | S1 | 异常 | Run、Context Epoch、native identity 变化或边界回退 | assembler 丢弃缓存并回退全量读取，输出与无缓存一致 | assembler 失效路径测试 |
| R1.5 | S1 | 事件 | 存储层读取 `afterSequence` 之后的已提交事件 | `readAfter` 只读取并校验后缀，不读取更早事件或 payload；`read` 仍全量校验 | storage increment-read 测试 + 现有 trajectory-store 回归 |
| R1.6 | S1 | 异常 | 索引缺失、脏或与事件身份不匹配 | `readAfter` 拒绝增量结果并回退全量 `read`，结果与全量读取一致 | dirty-index/fallback 测试 |
| R1.7 | S1 | 事件 | 编码或解码 Snapshot | 移除冗余外层深拷贝并以 compact JSON 写入，返回对象与输入、存储快照不共享可变引用 | `npx tsx --test packages/storage/test/goal-snapshot-current.test.ts` + aliasing 测试 |
| R1.8 | S1 | 事件 | token 计量模式组装上下文 | 不为未选中单元重复 `stableJson` 计量，并复用缓存单元的计量结果；选择结果与优化前一致 | model-context selection 等价性测试 |
| R1.9 | S1 | 事件 | 记录 Model Input | 用预计算索引判定消息来源，避免逐消息扫描完整会话；来源标签与优化前一致 | `npx tsx --test packages/model-call/test/model-input-recording.test.ts` |
| R1.10 | S1 | 事件 | GoalRevisionMonitor 轮询 | 读取轻量 revision hint 而非全量 Snapshot；hint 缺失或 mtime 不匹配时回退 `restore` | `npx tsx --test packages/runtime/test/session-stream.test.ts` |
| R1.11 | S2 | 事件 | 运行性能基准 | 输出 100/1,000/5,000 messages/events 三档的 commit、cold assembly、warm assembly、encode/decode 数字，并支持同机前后对比 | `npx tsx --test packages/runtime/test/long-session-benchmark.test.ts` |
| R1.12 | S3 | 状态 | 优化完成并执行完整验证 | committed/tail 分类、未提交 tail 不进入模型上下文、Snapshot 协议和现有回归保持不变 | `npm test` |

组合：长会话中提交、冷/热上下文组装、快照编解码与完整回归（专项基准 + `npm test`）。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| 增量读取：`read` 保持全量校验；新增 `readAfter(afterSequence)` 只校验后缀，仅由持有已校验前缀的 assembler 缓存调用；索引缺失、脏或身份不匹配时回退全量读取 | 保留既有 fail-closed 契约，同时去掉重复扫描 | 修改 `read` 的 `fromSequence` 语义，削弱既有全量校验契约 |
| 缓存归属：assembler 实例内按 `(goalId, runId)` 缓存完整单元与计量，最多 2 个 LRU 条目；Run、Epoch、native identity、边界回退或 Store 实例变化时失效；不持久化 | 有界、确定性、进程重启即自然失效 | 持久化 Sidecar 单元缓存或 GoalStore 全量快照缓存，隔离与失效复杂度更高 |
| 提交路径：committer 内部唯一一次 `restore`，调用方通过 `prepare(latest)` 做前置检查或基于 latest 构造待保存 Goal；保存复用该 latest，每次 commit 一次读一次写 | 消除调用方、committer 与 save 之间的重复读取 | 只给 save 传 latest 的 2-restore 方案；进程内 GoalStore cache |
| 快照编解码与磁盘格式：移除 encode/decode 外层 `structuredClone`，保留 `binding.read` 的边界校验与 clone；Snapshot 改为 compact JSON 并保留 trailing newline | 少两次全量拷贝，减少写入字节；schema 不变 | validate-only binding 路径；保持 `indent: 2` |
| 计量与修订：token 模式不再为每个 unit 预计算 `characterCount`，单元计量随缓存复用；`GoalStore` 增加可选 `readRevision` hint（mtime 校验），monitor 用它替代全量 `restore` | 去掉每步重复计量和每秒全量 decode，同时保留 `commitRevision` 语义 | 把 mtime 直接暴露为公开 revision；新增 revision sidecar 文件 |

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| medium | 跨 Runtime/Storage/Model Context 读路径与公共端口变化，Snapshot 磁盘字节形态变化；无 schema、durability 或权限变更，失败时可回退现有全量路径 | 无 |

增量缓存只在同进程、同 Store 实例、同 Goal/Run 且前缀已校验时生效，不得作为跨进程恢复权威。`readAfter` 不得替代 `read` 的全量校验；索引不可用时必须回退。缓存失效、回退和等价性由 R1.2–R1.6 覆盖。快照去重不得引入输入、输出或存储之间的共享可变引用；compact JSON 不改变 schema 或字段语义，由 R1.7 覆盖。本次不改变 fsync/durability、不合并 step 内快照、不新增持久化缓存，也不把未提交 tail 注入模型上下文；由 R1.12 覆盖。

## 任务

- [x] //TODO 1. 建立长会话性能基准与结构计数基线，覆盖 commit、cold assembly、warm assembly、encode/decode 三档规模 → R1.11；检查：`npx tsx --test packages/runtime/test/long-session-benchmark.test.ts` 输出三档数字。
- [x] //TODO 2. 实现索引驱动的 `readAfter` 后缀读取、身份校验与全量回退 → R1.5, R1.6；检查：`npx tsx --test packages/storage/test/trajectory-store.test.ts` 及新增 increment-read 测试通过。
- [x] //TODO 3. 实现 assembler 单元/计量缓存、失效规则与有界 LRU → R1.2, R1.3, R1.4；检查：cached-vs-fresh 等价性与失效路径测试通过。
- [x] //TODO 4. 将 commit 收敛为 committer 单次 `restore` + `prepare(latest)`，并迁移 Runner 调用点 → R1.1；检查：`npx tsx --test packages/runtime/test/commit-restore-count.test.ts` 与现有 runner 回归通过。
- [x] //TODO 5. 移除 Snapshot encode/decode 外层 clone、改 compact JSON，并补 aliasing/往返测试 → R1.7；检查：`npx tsx --test packages/storage/test/goal-snapshot-current.test.ts` 与 aliasing 测试通过。
- [x] //TODO 6. 去重预算计量：token 模式惰性计算 `characterCount`，缓存单元计量并复用 → R1.8；检查：model-context selection 等价性测试通过。
- [x] //TODO 7. 用预计算索引替代逐消息会话扫描来判定 Model Input 来源 → R1.9；检查：`npx tsx --test packages/model-call/test/model-input-recording.test.ts` 通过。
- [x] //TODO 8. 增加 `GoalStore.readRevision` hint 并让 GoalRevisionMonitor 走轻量轮询与 `restore` 回退 → R1.10；检查：`npx tsx --test packages/runtime/test/session-stream.test.ts` 通过。
- [x] //TODO 9. 同步受影响模块的 TSDoc/notes，并完成完整回归与同机前后基准记录 → R1.12；检查：`npm run check:docs` 与 `npm test` 通过，基准数字记录到执行记录。

## 执行记录

- 状态：未执行
- 验证：-
- 结果：-
- 未决：无
