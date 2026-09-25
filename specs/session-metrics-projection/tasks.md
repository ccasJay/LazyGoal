# 会话指标投影 实施任务

- [x] //TODO 1. 建立模型调用指标记录契约与持久化 Store

  - 实现目标：在 Runtime 定义调用事实与 `MetricsStore`，在 Storage 实现工作区范围的追加、严格读取和重启恢复。
  - 成功判据：同一 Run 的开始与结束事实重开 Store 后仍可读取；损坏记录和冲突身份返回明确错误，已确认写入的记录不因重复读取增加。
  - 验证方式：新增 `packages/storage/test/session-metrics-store.test.ts`（待实现）；执行 `npx tsx --test packages/storage/test/session-metrics-store.test.ts`。
  - _Requirements: [2.1](./requirements.md#req-2-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [x] //TODO 2. 在模型调用边界记录可信用量与生成计时

  - 实现目标：让 `LLMStepExecutor` 在每次 Adapter 调用前后记录事实，并在真实流式文本增量与完成事件之间计算解码时长；隔离指标写入故障。
  - 成功判据：原生 Provider 上报用量进入事实，pi-ai 诊断数与无用量调用记为缺失；非流式回退、无文本流及记录失败不产生虚假的速度或改变 Step 结果。
  - 验证方式：新增 `packages/agent/test/llm-step-executor-metrics.test.ts`（待实现）；执行 `npx tsx --test packages/agent/test/llm-step-executor-metrics.test.ts`。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [4.3](./requirements.md#req-4-3)_

- [x] //TODO 3. 实现 Goal 与 Run 的计数、用量及覆盖状态投影

  - 实现目标：在 `@lazygoal/session-metrics` 从 Goal 快照和调用事实生成按 Run 与 Goal 汇总的快照，并按 `callId` 去重。
  - 成功判据：多 Run、空 Run 和同 Run 恢复得到正确轮数与 Step 合计；真实 token 与缺失调用分别统计，全部缺失时合计不可用。
  - 验证方式：新增 `packages/session-metrics/test/session-metrics-service.test.ts`（待实现）；执行 `npx tsx --test packages/session-metrics/test/session-metrics-service.test.ts`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.3](./requirements.md#req-2-3)_

- [x] //TODO 4. 补齐缓存命中率与生成速度的参与范围

  - 实现目标：在投影中按真实缓存读取字段、正输入量、真实输出量与正解码时长计算比率，并给出参与和排除调用数。
  - 成功判据：缺少缓存字段的调用不被当作零命中；缺少首文本增量或权威输出用量的调用不参与速度；无合格调用时两项均不可用。
  - 验证方式：扩充 `packages/session-metrics/test/session-metrics-service.test.ts`（待实现）；执行 `npx tsx --test packages/session-metrics/test/session-metrics-service.test.ts`。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4)_

- [x] //TODO 5. 接入运行中订阅、接入标记与故障覆盖语义

  - 实现目标：让指标服务在事实写入和 Goal 快照提交后发布新快照，持久标识未覆盖历史，并明确报告可检测的记录缺口。
  - 成功判据：订阅交接期间的更新不会丢失；新 Run 与 Step 提交产生更新，未结束调用不贡献最终用量；重启后旧会话和已知缺口仍显示非完整覆盖，写入故障不影响 Goal 提交。
  - 验证方式：扩充 `packages/session-metrics/test/session-metrics-service.test.ts` 并新增跨存储故障测试（待实现）；执行 `npx tsx --test packages/session-metrics/test/*.test.ts`。
  - _Requirements: [2.3](./requirements.md#req-2-3), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [x] //TODO 6. 建立可复用的本机 HTTP 服务包

  - 实现目标：新增基于 Hono 与 Node 适配器的 `@lazygoal/http`，提供通用子路由挂载与显式启动、关闭，不引入指标依赖。
  - 成功判据：宿主能在回环地址启动、挂载独立路由并释放端口；未挂载指标模块时不存在指标路径，监听失败明确返回给启动方。
  - 验证方式：新增 `packages/http/test/http-service.test.ts`（待实现）；执行 `npx tsx --test packages/http/test/http-service.test.ts` 和 `npm run check:dependencies`。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.3](./requirements.md#req-5-3)_

- [x] //TODO 7. 实现指标 JSON 与 SSE 路由及本机读取边界

  - 实现目标：由 `@lazygoal/session-metrics` 向 HTTP 宿主挂载只读快照与更新路由，处理不存在、读取错误、订阅取消和慢客户端。
  - 成功判据：JSON 查询返回完整快照或可区分错误；SSE 首份快照后持续更新；断开或阻塞的客户端不拖慢执行，非 GET、非法 Host 与跨域浏览器请求不能读取或修改指标。
  - 验证方式：新增 `packages/session-metrics/test/session-metrics-http.test.ts`（待实现）；执行 `npx tsx --test packages/session-metrics/test/session-metrics-http.test.ts`。
  - _Requirements: [4.4](./requirements.md#req-4-4), [4.5](./requirements.md#req-4-5), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 8. 接入实际运行组合入口并验证跨层行为

  - 实现目标：在 `packages/tui/src/cli.tsx` 的现有组合入口连接指标 Store、Recorder、Goal 提交通知与投影服务；集成测试显式启动 HTTP 宿主。
  - 成功判据：一次实际 Goal 执行产生可由已挂载指标路由读取的 Run 指标；重启后读取值与已记录事实一致，指标或 HTTP 故障不改变 Goal 结果与恢复状态，TUI 不自动监听端口。
  - 验证方式：新增 `packages/session-metrics/test/session-metrics.integration.test.ts`（待实现），并执行 `npx tsx --test packages/session-metrics/test/session-metrics.integration.test.ts` 与 `npm test`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.1](./requirements.md#req-2-1), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) | Goal 的当前及已完成 Run 均出现在汇总和明细中，Run 身份稳定 | 指标服务测试（待实现） |
| [1.2](./requirements.md#req-1-2) | 零 Step Run 不计轮，同 Run 恢复后仍只计一轮 | 指标服务测试（待实现） |
| [1.3](./requirements.md#req-1-3) | Step 提交与 Run 结束后的数值匹配 Goal 快照，总数等于逐 Run 之和 | 指标服务测试（待实现） |
| [2.1](./requirements.md#req-2-1) | 原生 Provider 的多次用量正确归属；重复读取、重复事实与重启不增加合计 | Agent、Store 与集成测试（待实现） |
| [2.2](./requirements.md#req-2-2) | pi-ai 诊断数、缺失用量和无权威用量的失败调用只增加缺失调用数 | Agent 与指标服务测试（待实现） |
| [2.3](./requirements.md#req-2-3) | 混合用量显示部分覆盖；全部缺失时真实合计为不可用 | 指标服务测试（待实现） |
| [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2) | 仅缓存字段明确存在且输入为正的调用参与比率；全缺失时不可用 | 指标服务测试（待实现） |
| [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4) | 真实流式首文本到完成的时长参与速度；非流式、无文本及缺失用量不参与 | Agent 与指标服务测试（待实现） |
| [4.1](./requirements.md#req-4-1) | 开始后未结束的调用不提前计量，事实写入和 Step 提交后客户端收到新快照 | 指标服务与 SSE 测试（待实现） |
| [4.2](./requirements.md#req-4-2) | 重建 Store 与服务后可读已记录历史；接入前旧会话不伪装成完整统计 | Store、指标服务与集成测试（待实现） |
| [4.3](./requirements.md#req-4-3) | 指标写入失败不改变执行或恢复；坏记录、已知缺口得到错误或非完整覆盖 | 故障注入与跨层集成测试（待实现） |
| [4.4](./requirements.md#req-4-4) | HTTP 查询返回快照，并区分 Goal 不存在与读取失败 | 指标 HTTP 测试（待实现） |
| [4.5](./requirements.md#req-4-5) | SSE 先有快照再有更新；断开与慢客户端不阻塞 Goal | 指标 HTTP 测试（待实现） |
| [5.1](./requirements.md#req-5-1) | 指标实例只绑定回环地址，不接受非回环监听 | HTTP 宿主与指标路由测试（待实现） |
| [5.2](./requirements.md#req-5-2) | 指标实例只读，非法 Host 与跨域 Origin 被拒且没有允许跨域读取的响应头 | 指标 HTTP 测试（待实现） |
| [5.3](./requirements.md#req-5-3) | 通用宿主可独立挂载其他路由、启动与关闭，无需指标模块 | HTTP 宿主测试（待实现） |
| 跨层与工程边界 | 一个 Goal 的写入、重启读取和订阅流程贯通；JSONL 无正文或凭据；新增公开接口 TSDoc 与架构文档符合仓库规则 | 集成测试、源码与架构文档检查（待执行）；`npm test` |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。
