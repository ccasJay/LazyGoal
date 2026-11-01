---
feature: trajectory-query-contract
status: proposed
risk: high
created_at: 2026-11-02
delivered_at: null
supersedes: []
superseded_by: null
---

# 轨迹查询契约 Spec

## 目标与范围

将 Trajectory 从「整文件读取驱动的查询」改为「JSONL 事实账本 + 可重建 SQLite 索引 + 固定 Snapshot 水位」，让列表、详情、执行单元、关联事件、时间线与 Model Input 共用同一可见性边界。

范围包含索引、水位游标、ExecutionUnit/Action/ModelCall 查询、Blob 外置、JSONL 分段、Model Input 可见性、Timeline 聚合与 Goal Board 迁移；不包含跨进程写者、全文检索、自动删除未提交数据，也不改变 Runtime 恢复边界与 `program_time_reserved` 的独立规则。

## 用户故事

- **S1** 作为查看长 Run 的用户，我希望翻页和详情只读取当前需要的数据，并且一次浏览看到的边界稳定，以便不会因实时提交而出现重复、遗漏或统计跳变。
- **S2** 作为排查执行过程的开发者，我希望按执行单元、Action 与模型调用精确查看事件，以便直接从事实定位问题，而不是从某条事件开始猜测。
- **S3** 作为维护者，我希望索引可以删除并重建，JSONL 与 Blob 仍是可审计的事实来源，以便索引损坏时不影响历史事实。
- **S4** 作为产品维护者，我希望未提交或孤立的模型输入不进入正常历史，并且清理只能是显式操作，以便不把调试数据当成已完成事实。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S3 | 事件 | 追加一条事件 | 先写入 Blob（如需）并追加 JSONL，再写索引；索引失败不得回滚已落盘事实，也不得让追加失败，索引标记为待重建；索引不得领先 JSONL | `packages/storage/test/trajectory-index-write.test.ts` |
| R1.2 | S3 | 异常 | 索引被删除、落后或领先 JSONL，或 JSONL 尾部只有半行 | 删除后从 JSONL 完整重建；尾部不一致只重扫增量；索引领先的行被截断；中段损坏或不匹配 fail-closed | `packages/storage/test/trajectory-index-recovery.test.ts` |
| R1.3 | S1 | 普遍 | 查询一页事件 | 不读取 payload 或 Blob，只按索引定位读取所需元数据；读取量随页大小变化而非 Run 长度 | `packages/storage/test/trajectory-index-query.test.ts` |
| R2.1 | S1 | 状态 | 首屏返回并进入后续分页 | 响应固定 `committedThroughSequence`；所有后续查询使用该水位；索引不得扩大可见范围 | `packages/browser/test/browser-trajectory.test.ts` |
| R2.2 | S1 | 事件 | 浏览期间 Run 继续提交事件 | 已开始浏览的分页不出现新事件、不重复、不遗漏，`total` 与 `committedCount` 与首屏一致 | `packages/browser/test/browser-trajectory-pagination.test.ts` |
| R3.1 | S2 | 事件 | 请求执行单元 | `locate` 只返回首条归属事件；`list` 只返回显式归属事件；上下文事件单独标记；不得按时间、相邻关系或 Action 位置推断归属 | `packages/storage/test/trajectory-index-query.test.ts` |
| R3.2 | S2 | 事件 | 请求事件详情或关联事件 | Action、ModelCall、Program 与父 Action 关联只由 Runtime 的关联契约决定；Browser 不再包含推断逻辑 | `packages/browser/test/browser-trajectory-detail.test.ts` |
| R4.1 | S3 | 状态 | Payload 超过 64 KiB | 外置为内容寻址 Blob，JSONL 行只保留 `payloadRef`；`read()` 仍物化完整事件；缺失 Blob fail-closed | `packages/storage/test/trajectory-encoding.test.ts` |
| R4.2 | S3 | 状态 | 当前 JSONL 分段超过 64 MiB | 后续追加进入新分段；跨段读取、索引重建与事件顺序保持不变 | `packages/storage/test/trajectory-encoding.test.ts` |
| R5.1 | S4 | 事件 | 查询 Model Input 或执行清理 | 只返回水位内能找到对应模型事件且属于当前 Run 的调用；孤立输入不进入历史；清理仅在显式 `--apply` 下执行 | `packages/browser/test/browser-model-input.test.ts` |
| R6.1 | S1 | 普遍 | 请求 Run 时间线概览 | 从索引按固定序列桶返回事件数、时间范围与类型分布，不物化事件 | `packages/storage/test/trajectory-index-query.test.ts` |
| R6.2 | S1 | 异常 | 翻页、刷新、断线重连或打开 Run Directory | 游标失效与水位变化有明确的重置或错误语义；Run Directory 不再连续拉取全部分页 | `apps/goal-board/e2e/trajectory.test.mjs` |

组合：真实 Board 打开长 Run → 翻页 → 期间提交新事件 → 打开详情与 Timeline（`npm test`、`npm run test:web-e2e`）。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| 采用「JSONL 事实 + 每 Run SQLite 索引 + 内容寻址 Blob」，三者都位于 `trajectories/` 树内 | 与 Benchmark 按目录独立 copy-out 的制品形状一致，索引可删除重建 | 工作区单库会破坏目录级 copy-out；`better-sqlite3` 等原生库无法进入单文件 Worker 产物 |
| Snapshot 水位是唯一可见性权威，索引只决定查询效率 | 列表、详情、执行单元、时间线与 Model Input 必须共享同一提交边界 | 由索引自行推导提交边界会让未提交事实泄漏到历史 |
| Runtime 新增关联契约，统一给出 actionId、modelCallId、programId 与 parentActionId | 关联语义只能有一处定义，Storage 与 Browser 都不得重新推断 | 把 `modelCallId` 提升为事件信封字段会扩大写入与恢复的改动面 |
| 领域 `TrajectoryEvent` 保持不变，Blob 只存在于存储编码层，`read()` 负责物化 | Runtime 的 model-context、evidence-gate 等消费者不需要感知存储形状 | 让领域类型承载 `payloadRef` 会把存储细节扩散到全部消费者 |
| 移除 `q` 全文搜索与 UI 搜索框，只保留结构化过滤与索引内的有界标题/预览 | 全文匹配要求读取 payload，与索引化目标冲突 | 对 payload 建全文索引会增加隐私、一致性与维护成本 |

边界：Snapshot 提交边界仍由 `execution-trajectory` 拥有，本 Spec 只增加查询侧水位；`trajectory-store-performance` 已交付的追加序号缓存与尾部扫描保持不变；本 Spec 同时兑现 `storage-write-primitives` 需求 7 对独立 SQLite Spec 的覆盖要求。

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| high | 同时变更读取路径、持久化编码、Browser wire 与 Goal Board；索引与 JSONL 不一致会造成漏页或重页；Blob 与分段改变 Benchmark 制品形状 | 删除或重建索引；执行 Model Input 清理 `--apply`（不可逆）；切换 JSONL 编码使旧开发期轨迹不可读 |
| medium | `node:sqlite` 仍为实验 API，且 Worker 只使用固定镜像内的 `node` 二进制 | 首个任务验证宿主与 Worker 二进制的可用性，并在启动入口抑制实验警告 |
| medium | 大 Run 的索引重建与 Timeline 聚合同步执行会阻塞事件循环 | 重建分批、查询设置上限，超限返回明确错误而不是静默降级 |

- 不得让索引成为可见性来源；索引缺失或过期时只能重建，不能改变 R2.1 的水位语义。
- 不得在 Browser 重新实现 Action、ModelCall 或 Program 关联（R3.2）。
- 不得为旧开发期 JSONL、旧索引 schema 或旧游标增加迁移分支；不支持时 fail-closed。
- 不得支持跨进程并发写同一 Run；检测到序号冲突或索引/JSONL 身份不一致时必须失败。
- 不得自动删除未提交 Model Input、孤立 Blob、JSONL 或索引。

## 任务

- [x] //TODO 1. 验证 `node:sqlite` 在宿主与固定 Worker 镜像中的可用性，加入启动警告抑制与依赖边界 → R1.1；检查：`node -e "require('node:sqlite')"`、`npm run check:dependencies`
- [ ] //TODO 2. 新增 Runtime 查询契约：水位上下文、事件关联、有界摘要与查询 Port → R2.1、R3.2；检查：`npx tsc --noEmit -p packages/runtime`
- [ ] //TODO 3. 存储编码支持 Blob 与分段，并保持 `read()` 返回完整领域事件 → R4.1、R4.2；检查：`npx tsx --test packages/storage/test/trajectory-encoding.test.ts`
- [ ] //TODO 4. 实现 SQLite 索引写入、打开校验、增量修复、重建与截断 → R1.1、R1.2；检查：`npx tsx --test packages/storage/test/trajectory-index-write.test.ts`
- [ ] //TODO 5. 实现索引查询：分页、详情、执行单元、关联与时间线聚合，全部按水位过滤 → R1.3、R2.1、R3.1、R6.1；检查：`npx tsx --test packages/storage/test/trajectory-index-query.test.ts`
- [ ] //TODO 6. 迁移 Browser 轨迹路由：不透明游标、新查询端点、移除 `q`、稳定错误语义 → R1.3、R2.1、R2.2、R3.2；检查：`npx tsx --test packages/browser/test/browser-trajectory.test.ts packages/browser/test/browser-trajectory-detail.test.ts packages/browser/test/browser-trajectory-pagination.test.ts`
- [ ] //TODO 7. 更新 Web wire 契约与生成绑定：分页水位、详情关联、Timeline、Model Input → R2.1、R5.1、R6.1；检查：`npm run contracts:generate -- --check`
- [ ] //TODO 8. 实现 Model Input 可见性过滤、孤立输入审计与显式清理命令 → R5.1；检查：`npx tsx --test packages/browser/test/browser-model-input.test.ts`
- [ ] //TODO 9. 迁移 Goal Board：Run Directory 分页、游标与水位、Timeline 聚合、Inspector 关联分组、移除搜索框 → R2.1、R6.1、R6.2；检查：`npm run build:web`
- [ ] //TODO 10. 增加故障注入与等价测试，覆盖索引缺失/落后/超前、半行、双写、并发分页、部分提交关联与孤立输入 → R1.2、R2.2、R3.1、R3.2、R5.1；检查：`npx tsx --test packages/storage/test/trajectory-index-recovery.test.ts`
- [ ] //TODO 11. 建立 10,000 事件读取与重建基准，断言分页不读取 payload 且重建有上限 → R1.3、R6.1；检查：`npx tsx --test packages/storage/test/trajectory-benchmark.test.ts`
- [ ] //TODO 12. 更新 storage、browser、goal-board、runtime 的模块说明、语义表与根导航 → 全部；检查：`npm run check:docs`

## 执行记录

- 状态：未执行
- 验证：-
- 结果：-
- 未决：无
