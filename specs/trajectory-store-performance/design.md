# 轨迹存储性能优化 设计

## 审批摘要

### 方案

`append` 的序号确定改为两级:先查进程内 Goal/Run 序号缓存,miss 时从文件尾部反向扫描出最后一个非空 JSONL 行并解析其 `sequence`;追加成功后写回缓存。读取路径与对外契约零改动。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 序号缓存归属 | `Map<goalId/runId, number>` 挂在 store 实例上,与 `appendQueues` 同生命周期;串行队列保证同 Run 写缓存无竞争 | 缓存是会话级性能数据,非恢复权威;store 实例重建即自然失效 |
| 尾部扫描实现 | `fs.open` + `read` 从文件尾按块(如 4 KiB)向前读,找最后一个换行分隔的非空行;解析该行并校验 `goalId/runId/sequence` 为非负整数 | 不依赖 trailer newline;单行超大(远超块大小)时扩大读取窗口直至含完整行,极端单行巨大事件退化为一次全读(仍正确) |
| 尾部行校验范围 | 只做定位序号所需的最小校验:JSON 可解析、`goalId`/`runId` 匹配、`sequence` 为正整数;完整协议校验仍由读取路径负责 | 追加不再提前发现历史中途损坏,检测时机后移到读取时(fail-closed 语义不变) |
| 压测形态 | `packages/storage/test/trajectory-benchmark.test.ts`,node:test 计时,三档规模 × (追加 + 范围读取);以测试断言只验证行为,数字以注释/console 输出供人工对比,不做脆弱的耗时断言 | 可重复执行、零仓库遗留;绝对数字不进 CI 判定 |
| 缓存一致性边界 | 缓存只在自身 `append` 成功后写回;外部进程并发写入导致的序号跳变不在缓存可见范围,由 JSONL 读取时的序列单调校验兜底 | 与现状一致:当前 store 本就不承诺跨进程并发安全 |

### 风险与待确认

- 风险等级:medium;理由:触碰存储追加核心路径与恢复相关语义,但读取路径零改动、变更局部可逆。
- 关键操作:无。
- 风险:尾部单行超块大小的罕见事件使该次追加退化为一次较大读取;压测数字受机器负载影响,以同机相对对比为准。
- 待确认:无。

## Overview

现状 `append` 每次全量读取历史仅为计算 `lastEvent.sequence + 1`,长轨迹累计 O(N²)。优化把序号确定改为"缓存 → 尾部扫描"两级,`readStoredEvents` 仍原样服务读取路径。整体数据流:

```text
append(draft)
  │
  ├─ 命中 sequenceCache[goalId/runId] ──────────────┐
  │                                                │
  └─ miss → tail scan(按块回读,定位最后非空行)   │
             解析该行 → sequence 校验              │
                                                    ▼
                    appendFile(JSONL 行) 成功 → 写回缓存
```

## Key Design Decisions

### 序号缓存与串行队列的关系

缓存写入点在 `appendFile` 成功之后、同一 `appendQueues` 队列任务内,与现有按 Goal/Run 串行语义共享同一互斥边界,无需额外锁。缓存 key 与 `appendQueues` 的 key 使用同一 `keyFor` 结果,避免两套编码逻辑。文件不存在(ENOENT)时尾部扫描返回 0,与现有 `readStoredEvents` 空文件语义对齐,首个事件序号为 1。

### 尾部扫描的边界行为

- 从 `fileSize` 起向前按 4 KiB 块读,累积到出现至少一个换行(或读到文件头)为止;最后非空行即目标行。
- 文件全部内容不足一块且无换行:整个文件即最后非空行(无 trailer newline 的正常形态)。
- 目标行解析失败或 `goalId`/`runId` 不匹配:抛 `TrajectoryProtocolError`,错误信息含行位置上下文(文件偏移),与读取路径同类错误语义一致。
- 空文件或只有空行:视为序列 0,与现状一致。

### 压测设计

node:test 内用 `performance.now()` 计时,分三档生成合成事件(draft 结构与生产事件同形):每档先连续追加 N 个事件计时,再对 `[N/2, N]` 范围读取计时。测试断言只覆盖行为正确性(追加成功、序号连续、读取结果数量正确);耗时数字打印到 stdout 供优化前后人工对比,并记录到 Feature Verification。基线在优化前以同一测试于旧实现上运行取得(git 切换前后各跑一次),避免为基线保留旧代码副本。

### 变更收敛范围

`packages/storage/src/json-file-trajectory-store.ts`:新增缓存 Map、尾部扫描私有方法,`append` 内部替换 `readStoredEvents` 调用;公共接口、`read`、`readWithBoundary`、错误类型零改动。新增测试文件一个。

## Testing Strategy

- 行为回归:现有 `packages/storage/test/trajectory-store.test.ts` 全部通过(含损坏文件、序列非单调、标识不匹配、ENOENT 等失败语义)。
- 新增用例:重启续接(新建 store 实例对已有文件追加,序号正确续接,req-2-2);无 trailer newline(手工构造末行无换行的文件,续接序号正确,req-2-3);缓存命中路径(同实例连续追加不触发全量读——以行为断言序号正确 + 压测数字佐证,req-2-1)。
- 压测:`trajectory-benchmark.test.ts` 三档运行,优化前后各跑一次记录数字(req-1-1/1-2);断言部分只验证行为,不断言绝对耗时。
- 并发串行语义:现有并发追加用例回归(req-3-3);读取语义用例回归(req-3-1/3-2)。
