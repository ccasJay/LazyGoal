# Web 数据契约迁移执行计划

本计划为待审阅草案；[Spec](./spec.md)不取代既有 Provider 两份已批准 Spec 的验收。

## 任务清单

- [x] //TODO 1. 核对 Web 契约族及既有 Provider 迁移
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.4](./spec.md#spec-req-1-4)。
  - 实施目标与场景：按 Catalog 和真实 HTTP/SSE/浏览器入口核对范围，记录现有 Provider 小 Spec 的接入及剩余契约族；每项明确所有者和消费者。
  - 基本验证：抽查一个请求、响应和 SSE 事件的定义及调用链。
- [x] //TODO 2. 按契约族迁移真实 Web 边界
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)。
  - 实施目标与场景：各族使用 TS、生成绑定和真实 HTTP/SSE 及浏览器消费者；宽容提取未知字段，保留鉴权、敏感键、长度与错误规则，移除已迁移旧 AST 和重复字段表。
  - 基本验证：运行请求、响应及 SSE 定向测试，核对非法字段与未知字段处理。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 场景与预期 | 证据/入口 |
| --- | --- | --- | --- |
| 全量 Web 迁移 | [1.1](./spec.md#spec-req-1-1)、[1.4](./spec.md#spec-req-1-4) | Catalog 与实际边界逐项对应，Provider 已批准标准有实测证据，旧 AST 不再用于已迁移 Web 契约。 | 完成清单、源码扫描、Provider 两份计划验收结果。 |
| 真实访问链 | [1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3) | 宽容提取、联合和开放 JSON 正确；鉴权、大小、UTF-16、凭据限制、HTTP 错误及取消不退化。 | 真实服务路由、SSE 和浏览器端到端测试，检查日志不泄漏测试凭据。 |
| 集成回归 | [1.3](./spec.md#spec-req-1-3) | 合并后生产生成器与真实浏览器制品可用。 | `npm test`、`npm run build:web`、相关 Chrome E2E、生成/文档/依赖检查与 `git diff --check`。 |

### Latest Result

- 状态：passed
- 新鲜度：current
- 验证时间：2026-10-31T04:52:59Z–2026-10-31T05:51:25Z（UTC）
- 验证提交：`6c89dbc3`；工作区干净。实现提交为 TODO 1 `a20e53fc`、TODO 2 `d70e4d72`；验证期间的对齐提交为 `703768b8`（模型选择未知字段断言）与 `6c89dbc3`（真实轨迹详情绑定断言）。分支基于共同基线 `e3926377`，并堆叠生成能力线提交 `54d0db4e`。
- 全量 Web 迁移（[1.1](./spec.md#spec-req-1-1)、[1.4](./spec.md#spec-req-1-4)）：`contracts/catalog.json` 现有 937 项，其中 Web 341 项、157 个旧 AST 标记删除、55 个生成绑定根与 1 个 Provider 模型 Reader；`npm run contracts:generate -- --check` 输出 `Contract artifacts are current.`。请求、响应与 SSE 均通过真实路由/浏览器 API 消费生成绑定；覆盖清单见 [coverage.md](./coverage.md)。
- 真实访问链（[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)）：`npx tsx --test packages/web-contracts/test/*.test.ts packages/browser/test/*.test.ts apps/goal-board/test/*.test.ts apps/goal-board/test/*.test.tsx` 402/402 通过，覆盖未知字段剥离、已知字段拒绝、联合/判别联合、开放 JSON、安全整数、UTF-16、凭据键、鉴权、请求大小、HTTP 错误与取消。`npm test` 在 05:43:52Z–05:50:14Z 通过：446 个 `.ts/.tsx` 与 7 个 `.mjs`，TS 测试 2714/2714、scripts 98/98；入口同时覆盖类型检查、文档、依赖、生成检查与 GEPA adapter。
- 浏览器与集成（[1.3](./spec.md#spec-req-1-3)）：`npm run build:web` 通过（05:50:20Z–05:51:11Z）。相关 Chrome E2E `provider-models-contract`、`goal-board-streaming`、`run-input-control`、`session-output` 4/4 通过；完整 `npm run test:web-e2e` 为 14/17，通过项覆盖 Provider 模型响应、SSE、统一输入与流式输出。3 项失败（board 的模型错误展示、runtime 轨迹详情等待、并行布局宽度）在基线 `54d0db4e` 的临时副本复现 board/runtime 两项，且活动宽度在单独运行时通过，判定为既有 UI/并行布局问题，不属于本方向契约迁移。
- 生成/文档/依赖（[1.3](./spec.md#spec-req-1-3)）：`npm run check:dependencies` 通过（418 个源文件），`npm run check:docs` 通过（47 个模块、169 份当前说明），`git diff --check` 无输出。
- 上游依赖：本方向使用生成能力线 `54d0db4e` 的 `@asType integer` 支持；该提交尚未出现在生成能力线 plan 的 Latest Result 验证提交中。本方向全量回归已覆盖其生成检查与绑定测试，但协调者合并时应以生成能力线最终验证提交为准并重跑生成检查。
- 未解决问题：无本方向阻塞。已知完整 Chrome E2E 的 3 项既有失败不属于本方向；合并后若基线变化，需刷新相关 E2E 证据。
