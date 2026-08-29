# Implementation Plan

- [x] //TODO 1. 冻结 Retrieval 协议并扩展 Snapshot v9

  - 在 Runtime Domain、Prompt Manifest、Agent Response 类型与 Storage Codec 中增加 `none@1`/`bm25-lite@1`、Snapshot v9 及 v5–v8 只读映射。
  - 增加 Prompt/Memory/Model Context/Retrieval 协议矩阵、未知组合、恢复不写回和 legacy 分支不变测试，并补齐公共 Interface 契约 TSDoc。
  - _Requirements: [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2)_

- [ ] //TODO 2. 实现 Context Lookup 分支与 Runtime 生命周期

  - 为 Preparation Result、AgentDecision、StepRecord 和 Trajectory 增加独占 lookup 请求及 requested/completed/not_found/failed 事实，统一 Snapshot 提交顺序。
  - 在 Coordinator/Runner 中实现 Executing 单 Step、Preparation 三次链式上限、稳定 lookupId、中断恢复和非法请求无副作用测试。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4)_

- [ ] //TODO 3. 实现 committed ContextDocumentBuilder

  - 从 Trajectory committed boundary 构建完整 execution/preparation 文档，排除 tail、marker、lookup 周期并生成稳定字段与 source ranges。
  - 增加全量/增量等价、闭合单元、身份与 sequence 校验、损坏来源 fail-closed 和输入不变测试。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4)_

- [ ] //TODO 4. 实现版本化 Field Tokenizer 与索引统计

  - 增加字段提取、NFKC/case normalization、raw exact Token、路径与 snake/camel/数字拆分，以及倒排表、df 和字段长度统计。
  - 使用 golden/property tests 覆盖代码标识、Unicode、locale 隔离、重复构建和 Tokenizer 版本确定性。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

- [ ] //TODO 5. 实现 Fielded BM25-lite 排序与相邻扩展

  - 按设计固定 k1/b、字段权重、精确 boost、6 位舍入和稳定 tie-break，实现 filters、Top-K 去重及有界前后相邻文档扩展。
  - 增加评分 golden tests，覆盖路径/对象/Tool/Action/错误码优先、正文相关性、recency 仅作 tie-break 和完整单元预算。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4)_

- [ ] //TODO 6. 实现 Lookup Result、Not Found 与 Evidence 边界

  - 增加有界 found/not_found/lookup_error DTO，返回 source refs、matched fields、rounded score、历史/截断标识，并严格区分低分与检索故障。
  - 扩展 Evidence Gate 与模型投影，禁止 lookup 事件本身成为 Finding/Completion Evidence，并提示可变历史状态必须重新观察。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [6.4](./requirements.md#req-6-4)_

- [ ] //TODO 7. 实现 Retrieval Index Sidecar 与查询 LRU

  - 在 Runtime 定义索引 Store Port，在 Storage 实现安全路径、严格 Codec、来源摘要、原子替换、权限和落后边界增量更新。
  - 实现 64 项查询 LRU 与包含 canonical query/filters/boundary/version 的 key，测试损坏/领先/hash 失配回退、跨边界隔离和删除重建。
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3), [7.4](./requirements.md#req-7-4)_

- [ ] //TODO 8. 接入 ContextSourceRouter 与 Prompt Bundle v6

  - 实现历史执行/决策理由的封闭查询路由，将当前 Workspace/Environment/验证状态保留给授权 Tool，并从 Goal Task/Conversation 提供任务契约。
  - 在三阶段 Prompt 与 Executor 中接入 lookup 结果和历史时效提示，增加错误路由、无外部 Tool 副作用及下一轮恢复测试。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

- [ ] //TODO 9. 固化检索评测并完成跨包回归

  - 建立固定精确标识、自然语言和负查询语料，自动断言 Recall@5、`not_found` 精确率、byte-stable ranking、增量/重建与中断恢复等价。
  - 更新受影响的 `docs/architecture/` 当前实现说明，并完成新旧协议、Sidecar 故障、lookup_error 与 ALFWorld/SWE 检索 fixture 的自动化集成测试。
  - 运行 Runtime、Agent、Storage、TUI、Benchmark 相关测试、`npx tsc --noEmit`、`npm run check:dependencies` 与 `git diff --check`。
  - _Requirements: [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_
