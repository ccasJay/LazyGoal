---
feature: long-session-io-performance
status: proposed
risk: medium
created_at: 2026-11-04
delivered_at: null
supersedes: []
superseded_by: null
---

# 长会话 I/O 热路径优化

## 目标与范围

消除模型输入正文写入、轨迹索引提交与 Goal 列表三条 I/O 热路径上的重复系统调用和写放大，使每个模型调用、每条轨迹事实和每次列表的成本不随会话规模重复放大，同时保持既有恢复与校验语义。

不包含 Diagnostic Trace 的 schema 引用化、轨迹目录存在性缓存、fsync/durability 变更、索引换用 WAL、P2 并发架构或 Trajectory 真源收敛。

## 用户故事

- **S1** 作为长会话执行者，我希望每个模型调用和每条轨迹事实的写入成本不随会话历史重复放大，以便长会话后期仍保持可接受的执行速度。
- **S2** 作为 Goal 列表的使用者，我希望列出 Goal 时不必解码每个完整快照，以便 Goal 数量增加后列表仍然快速。
- **S3** 作为维护者，我希望这些优化在外部目录变更、索引失败和进程异常退出时回退到现有全量路径，并有可重复的基准证据，以便确认收益不来自削弱语义。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | 同一 Goal 连续记录模型输入，且正文已由本进程落盘 | 不再对已存在正文执行 `writeFile` 或 `readFile`，只为首次出现的摘要写正文；调用清单内容与优化前一致 | `npx tsx --test packages/storage/test/model-input-store.test.ts` |
| R1.2 | S1 | 状态 | 正文目录被外部删除或重建 | 下一次 append 重新种子化摘要集合并重写正文，清单不产生悬空引用 | 删除 `messages/` 后 append 再 `read` 的往返测试 |
| R1.3 | S1 | 异常 | 摘要未命中进程内集合 | 保留 `wx` 写入与 EEXIST 读回比对；正文内容不匹配时仍然失败 | 篡改正文字节后 append 被拒绝的测试 |
| R2.1 | S1 | 事件 | 一个 commit 内连续追加多条事件 | JSONL 仍逐事件落盘；索引行在 commit 结束时以单个事务写入，索引最终包含全部序号 | `npx tsx --test packages/storage/test/trajectory-index-batch.test.ts` |
| R2.2 | S1 | 状态 | 追加后立即执行 `readAfter` 或 `queryPage` | 读取前刷新缓冲，返回刚刚追加的事件而不是过期索引结果 | 写入后立即读取的测试 |
| R2.3 | S1 | 异常 | 索引刷新失败，或进程在缓冲未刷新时退出 | 丢弃缓冲并把索引标记为脏；下一次读取走既有 repair 或 rebuild，不返回不完整结果、不丢事件 | 刷新故障注入与未刷新重开 Store 测试 |
| R2.4 | S1 | 事件 | 索引刷新 | 仍使用 DELETE journal 与既有 `INDEX_SCHEMA_VERSION`，索引 schema 与 JSONL 字节格式不变 | 现有 trajectory-store 回归与 schema 版本断言 |
| R3.1 | S2 | 事件 | 保存 Goal Snapshot | 同时写出与该快照一致的派生 catalog 摘要；摘要写入失败不使已完成的快照保存失败 | 保存后摘要与快照解码结果一致的测试 |
| R3.2 | S2 | 事件 | `listHistory` 且摘要与快照指纹匹配 | 只读摘要，不读取或解码快照正文 | 读取计数断言与 I/O 基准 |
| R3.3 | S2 | 异常 | 摘要缺失、损坏，或与快照 `mtime`/`size`/`commitRevision` 不匹配 | 回退全量 decode，返回正确条目并重写摘要 | 删除或篡改摘要后的 `listHistory` 测试 |
| R3.4 | S2 | 状态 | 快照目录新增、删除或存在无法解码的快照 | 目录对账后不漏不多；无法解码的快照继续计入 `unreadableCount` | 目录对账与损坏快照测试 |
| R4.1 | S3 | 事件 | 运行 I/O 基准 | 输出模型输入 append、轨迹 append、`listHistory` 在三档规模下的耗时与系统调用摘要，不做绝对耗时断言 | `npx tsx --test packages/storage/test/io-benchmark.test.ts` |

组合：连续模型调用、commit 追加与 `listHistory` 的混合长会话流程，覆盖 R1–R3 与完整回归（I/O 基准 + `npm test`）。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| Model Input：进程内按 Goal 维护已落盘正文摘要集合，首次 append 用 `readdir` 种子化，每次 append 用一次 `stat` 校验正文目录身份；命中摘要跳过写入与读回，未命中保留 `wx` 与 EEXIST 读回校验 | 命中路径从每条消息两次系统调用降为零，同时对外部目录变更自愈 | 不种子化（首次调用仍承担 N 次 EEXIST）；只记录本进程写入（无法覆盖重启前已存在的正文） |
| 轨迹索引：JSONL 逐事件落盘与重试语义不变；索引行按 Goal/Run 缓冲，commit 结束显式 `flushIndex()` 单事务提交，任何索引读取前强制刷新，缓冲超过阈值自动刷新 | 保留 fail-closed 与既有 repair 语义，只消除派生索引的逐事件事务 | 批量追加端口（需重定义部分失败与重试语义）；WAL 加 `synchronous=NORMAL`（与目录级 copy-out 不变量冲突，且合批后无额外收益） |
| Catalog：`save` 后写派生摘要文件；`listHistory` 只读摘要并用快照 `mtime`/`size`/`commitRevision` 校验；缺失或不匹配时回退全量 decode 并重写；与快照目录对账 | 把列表成本从每个快照一次完整 decode 降为每个 Goal 一次 `stat` | 纯进程内缓存（冷启动仍为 O(全部快照)）；工作区级 SQLite catalog（新增有独立生命周期的持久库） |
| 归属：索引与 catalog 摘要都是派生数据，不得成为恢复或表述权威；任何不一致都回退到 JSONL 与 Snapshot 的全量路径 | 保持 Trajectory/JSONL 为事实源、Snapshot 为当前状态的既有归属 | 让摘要或索引参与恢复权威 |
| 验证：在现有回归之外增加一个可重复的 I/O 基准测试，输出固定三档数字 | 与既有基准方式一致，便于同机前后对比 | 断言绝对耗时阈值（机器相关，容易脆断） |

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| medium | 触及 Storage 写路径并新增派生文件；无 schema、durability、权限或轨迹协议变更，失败时均可回退现有全量路径 | 无 |

索引缓冲不得改变 JSONL 的落盘顺序、重试或 fail-closed 语义（R2.1、R2.3、R2.4）。catalog 摘要不是恢复权威，缺失或陈旧时以快照 decode 结果为准（R3.3、R3.4）；摘要写入失败不得使已提交快照报错或回滚（R3.1）。本次不改变 durability 与 fsync 边界，不引入 WAL，也不承诺检测原地被篡改且 `mtime`/`size` 保持不变的快照。

## 任务

- [x] //TODO 1. 模型输入正文摘要集合：懒种子化、目录身份校验与命中跳过 → R1.1、R1.2；检查：`npx tsx --test packages/storage/test/model-input-store.test.ts`
- [x] //TODO 2. 模型输入未命中路径保留 `wx` 与 EEXIST 读回校验 → R1.3；检查：同一测试文件的篡改用例
- [x] //TODO 3. 轨迹索引行缓冲、阈值刷新与索引读取前强制刷新 → R2.1、R2.2、R2.4；检查：`npx tsx --test packages/storage/test/trajectory-index-batch.test.ts` 与现有 trajectory-store 回归
- [x] //TODO 4. 索引刷新失败与未刷新重开的恢复路径 → R2.3；检查：故障注入测试
- [x] //TODO 5. Committer 在 commit 边界调用 `flushIndex` → R2.1；检查：`npx tsx --test packages/runtime/test/commit-restore-count.test.ts`
- [x] //TODO 6. 保存快照时写 catalog 摘要，且摘要失败不影响快照结果 → R3.1；检查：`npx tsx --test packages/storage/test/goal-catalog-summary.test.ts`
- [x] //TODO 7. `listHistory` 读摘要、指纹校验与回退重写 → R3.2、R3.3；检查：同一测试文件的回退用例
- [ ] //TODO 8. catalog 与快照目录对账并保持 `unreadableCount` 语义 → R3.4；检查：目录对账测试
- [ ] //TODO 9. 增加三档 I/O 基准测试 → R4.1；检查：运行基准并记录数字

## 执行记录

- 状态：未执行
- 验证：-
- 结果：-
- 未决：无
