# 轨迹存储性能优化 实施计划

- [x] //TODO 1. 建立压测基线(优化前)

  - 实现目标:新增 `packages/storage/test/trajectory-benchmark.test.ts`:100/1,000/10,000 事件三档,每档连续追加合成事件计时、`[N/2, N]` 范围读取计时;断言仅覆盖行为(序号连续、读取数量正确),耗时数字输出到 stdout
  - 成功判据:在当前未优化实现上完整运行,三档基线数字记录到本文件 Feature Verification(10,000 档追加耗时显著高于 1,000 档,印证 O(N²))
  - 验证方式:`npx tsx --test packages/storage/test/trajectory-benchmark.test.ts`,记录三档数字
  - _Requirements: [1.1](./requirements.md#req-1-1)_

- [x] //TODO 2. 实现尾部扫描与序号缓存

  - 实现目标:`json-file-trajectory-store.ts` 新增 sequenceCache Map 与尾部反向扫描私有方法(4 KiB 块回读、最后非空行最小校验、ENOENT/空文件返回 0、协议错误抛 `TrajectoryProtocolError`);`append` 序号确定改为缓存优先、miss 走尾部扫描,`appendFile` 成功后写回缓存;`read`/`readWithBoundary` 零改动
  - 成功判据:现有 `trajectory-store.test.ts` 全部通过;追加路径不再调用 `readStoredEvents`
  - 验证方式:`npx tsx --test packages/storage/test/trajectory-store.test.ts`
  - _Requirements: [2.1](./requirements.md#req-2-1), [3.1](./requirements.md#req-3-1), [3.3](./requirements.md#req-3-3)_

- [x] //TODO 3. 新增行为用例:重启续接与无 trailer newline

  - 实现目标:测试覆盖——新 store 实例对已有文件追加序号正确续接;手工构造末行无换行符的 JSONL 后续接正确;尾部行标识不匹配时抛 `TrajectoryProtocolError`;`readWithBoundary` committed/tail 分类不因优化改变
  - 成功判据:新用例全部通过,覆盖缓存 miss 回退路径与边界形态
  - 验证方式:待实现用例加入 `trajectory-store.test.ts`
  - _Requirements: [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [3.2](./requirements.md#req-3-2)_

- [ ] //TODO 4. 优化后重跑压测与对比记录

  - 实现目标:优化实现上重跑 benchmark 三档,与 TODO 1 基线对比;将两组数字与对比结论记录到 Feature Verification 的 Latest Result
  - 成功判据:10,000 档累计追加耗时相对基线显著下降且各档趋近线性;行为断言全部通过
  - 验证方式:`npx tsx --test packages/storage/test/trajectory-benchmark.test.ts packages/storage/test/trajectory-store.test.ts`
  - _Requirements: [1.2](./requirements.md#req-1-2)_

- [ ] //TODO 5. TSDoc 更新与全量回归

  - 实现目标:更新 `JsonFileTrajectoryStore` 类与 `append` 的 TSDoc(序号确定方式:缓存/尾部扫描;损坏检测时机后移到读取;缓存为会话级非恢复权威);运行 storage 包全部测试
  - 成功判据:TSDoc 与实现一致;`packages/storage/test/` 全部通过
  - 验证方式:`npx tsx --test packages/storage/test/*.test.ts`
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2)_

## Feature Verification

风险依据:[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) | 压测可重复运行并输出三档追加/读取耗时 | benchmark 测试(TODO 1) |
| [1.2](./requirements.md#req-1-2) | 10,000 档追加耗时显著下降、趋近线性 | 优化前后同机对比(TODO 4) |
| [2.1](./requirements.md#req-2-1) | 追加仅经缓存/尾部扫描确定序号 | 实现走查(append 不再调用 readStoredEvents)+ 现有测试回归(TODO 2) |
| [2.2](./requirements.md#req-2-2) | 重启后续接序号正确 | 重启续接用例(待实现,TODO 3) |
| [2.3](./requirements.md#req-2-3) | 无 trailer newline 仍正确续接 | 无换行边界用例(待实现,TODO 3) |
| [3.1](./requirements.md#req-3-1) | 读取协议校验语义不变 | 现有损坏文件/非单调/标识不匹配用例回归(TODO 2/5) |
| [3.2](./requirements.md#req-3-2) | committed/tail 分类不变 | readWithBoundary 用例(TODO 3) |
| [3.3](./requirements.md#req-3-3) | 按 Run 串行追加语义不变 | 现有并发追加用例回归(TODO 2) |

### Latest Result

优化前基线(2026-09-07,`npx tsx --test packages/storage/test/trajectory-benchmark.test.ts`,未优化实现):

| 规模 | 追加耗时 | 范围读取耗时 |
|---|---|---|
| 100 | 38.9ms | 0.4ms |
| 1,000 | 1,332.5ms | 2.6ms |
| 10,000 | 122,497.2ms | 25.1ms |

10,000 档追加耗时约为 1,000 档的 92 倍,印证 O(N²)。优化后对比待 TODO 4。
