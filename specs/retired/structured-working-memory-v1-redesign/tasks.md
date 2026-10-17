# Implementation Plan

- [ ] //TODO 1. 重构 Working Memory 领域协议与 Runtime 准入核心

  - 替换 Fact、Hypothesis、PlanItem、Blocker 与 model/canonical Patch 类型
  - 实现 canonical identity、Runtime ID、证据门、冲突与 no-op 抑制
  - 添加核心协议单元测试
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2)_

- [ ] //TODO 2. 实现 Memory 生命周期与确定性容量控制

  - 实现状态转换、依赖保护、容量排序、候选抑制与 protected overflow
  - 将 `evict_entries` 和 `supersede_scope` 固化为 canonical operation
  - 添加连续投影与 canonical replay 测试
  - _Requirements: [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [5.5](./requirements.md#req-5-5)_

- [ ] //TODO 3. 新增 ToolMemoryProjector Port 并接入 Runner 提交边界

  - 提供同步 Registry、默认空实现、输出验证和 Diagnostic Trace
  - 预分配 Observation sequence，并原子提交 Observation、Projector Patch 与 Snapshot
  - 使用 Fake Projector 覆盖成功、no-op、异常和非法输出
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [4.5](./requirements.md#req-4-5)_

- [ ] //TODO 4. 集成阶段、终态与恢复语义

  - 在 phase transition 与 terminal commit 中生成内部生命周期操作
  - 保留 revision 可达性校验并验证连续/恢复等价
  - _Requirements: [1.4](./requirements.md#req-1-4), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4)_

- [ ] //TODO 5. 发布 Agent Prompt Bundle v7 与响应 Schema

  - 更新 preparation/decision prompt、render schema 与 model inference view
  - 强制 durable semantic delta，移除 finding、nextAction 与 `set_next_action`
  - 添加 Prompt manifest、render 与 response validation 回归
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.5](./requirements.md#req-7-5)_

- [ ] //TODO 6. 发布 Snapshot v10 与协议兼容边界

  - 编解码新 Working Memory shape，并保留 v7–v9 decode
  - 在调用模型或重建 Memory 前拒绝 v4–v6 structured Goal
  - 验证 v1–v3 checkpoint Goal 兼容
  - _Requirements: [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3), [7.4](./requirements.md#req-7-4)_

- [ ] //TODO 7. 更新组合入口、架构文档与全量回归

  - 导出公共 Runtime contracts 并更新 composition root 默认依赖
  - 更新 `docs/architecture/` 当前实现说明
  - 运行 workspace 类型检查、测试与依赖边界校验
  - _Requirements: [1.1](./requirements.md#req-1-1), [3.1](./requirements.md#req-3-1), [6.4](./requirements.md#req-6-4), [7.1](./requirements.md#req-7-1)_
