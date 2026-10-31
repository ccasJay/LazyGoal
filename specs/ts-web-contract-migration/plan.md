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

- 状态：未执行
- 验证时间：-
- 验证摘要：尚未开始执行。
