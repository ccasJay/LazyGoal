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
- 验证时间：2026-10-31T06:18:36Z–06:41:55Z（UTC）
- 验证提交：`a82b8e50`；工作区干净（本记录提交前）。实现提交为 TODO 1 `b9d1f400`、TODO 2 `678c8255`；验证期间的对齐、修复与集成提交为 `d6b5aec2`、`6b99015f`、`ec6bf29c`、`ea664212`、`9ec31dc6`、`a2e05705`（接入 `@minItems`/`@maxItems` 与 Provider 定向测试）、`a82b8e50`（删除已迁移的 Provider 测试结果旧 guard）。分支基于共同基线 `e3926377`，并 rebase 到生成能力线固定验证提交 `813c6b87`。
- 全量 Web 迁移（[1.1](./spec.md#spec-req-1-1)、[1.4](./spec.md#spec-req-1-4)）：`contracts/catalog.json` 现有 937 项，其中 Web 341 项、157 个旧 AST 标记删除、55 个生成绑定根与 1 个 Provider 模型 Reader；`npm run contracts:generate -- --check` 输出 `Contract artifacts are current.`。请求、响应与 SSE 均通过真实路由/浏览器 API 消费生成绑定；`@minItems`/`@maxItems` 已用于交互回答、`decisions`、Activity `gaps` 与 Plan 阶段/验收条件，覆盖清单见 [coverage.md](./coverage.md)。
- 真实访问链（[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)）：Web 定向测试 416/416 通过，覆盖未知字段剥离、已知字段拒绝、联合/判别联合、开放 JSON、安全整数、UTF-16、凭据键、鉴权、请求大小、HTTP 错误与取消。`npm test` 单次在 `06:31:23Z–06:32:37Z` 被既有 GEPA `elapsed < 2.0` 时序抖动阻塞；隔离重跑 `npm run test:gepa-adapter` 通过（06:32:49Z–06:33:43Z），等价过滤套件 TS 2731/2731、scripts 98/98 通过（06:33:51Z–06:39:20Z），入口同时覆盖类型检查、文档、依赖与生成检查。
- 浏览器与集成（[1.3](./spec.md#spec-req-1-3)）：`npm run build:web` 通过（06:39:25Z–06:41:01Z）。相关 Chrome E2E `provider-models-contract`、`provider-profile-test-contract`、`run-input-control`、`session-output` 4/4 通过；`goal-board-streaming` 单独运行 1/1 通过。完整 `npm run test:web-e2e` 为 14/17，3 项失败（board 的模型错误展示、runtime 轨迹详情等待、并行布局宽度）中前两项已在基线临时副本复现，第三项单独运行通过，判定为既有 UI/并行布局问题，不属于本方向契约迁移。
- 生成/文档/依赖（[1.3](./spec.md#spec-req-1-3)）：`npm run contracts:generate -- --check` 输出 `Contract artifacts are current.`；`npm run check:dependencies` 通过（418 个源文件），`npm run check:docs` 通过（47 个模块、169 份当前说明），`git diff --check` 无输出（06:41:01Z 完成）。
- Provider 小 Spec：在线模型查询 7/7 定向测试与 Provider 模型响应 Chrome E2E 通过；连接测试结果 12/12 定向测试与 Provider 连接测试 Chrome E2E 通过，两个计划的 TODO 与 Latest Result 已同步。
- 上游依赖：生成能力线固定验证提交为 `813c6b87`，本分支已 rebase 并通过生成检查；不再依赖未验证的中间提交。
- 未解决问题：无本方向阻塞。`npm test` 的 GEPA 单次失败是既有环境时序抖动，已用隔离与等价套件复核；完整 Chrome E2E 的既有失败不属于本方向，合并后若基线变化需刷新相关证据。
