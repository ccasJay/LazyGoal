# Implementation Plan

- [x] //TODO 1. 收敛 Agent 的 Trajectory Context 组装链路

  - 删除语义 `ContextCompactAdapter`、Compact Trace 类型与专用测试，保留 Conversation Compactor
  - 从 Assembler 移除 Warm Sidecar/版本输入，改写测试覆盖确定性 Warm、Hot 连续性、tail 排除和预算错误
  - 运行 Agent package 测试与 TypeScript 编译
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [5.3](./requirements.md#req-5-3)_

- [ ] //TODO 2. 删除 Runtime 的 Warm 维护生命周期

  - 删除 Warm Sidecar Runtime 契约、`ContextMaintenanceWorker` 与 Committer 的维护端口
  - 更新提交测试，确认 Snapshot 保存、provenance tail 校验和 `state_committed` 顺序不变
  - 运行 Runtime package 测试与 TypeScript 编译
  - _Requirements: [2.2](./requirements.md#req-2-2), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

- [ ] //TODO 3. 以严格协议替代 Context Source Router

  - 删除 Router 实现和依赖注入，让 Coordinator 与 Runner 把规范化请求直接交给 `invokeContextLookup`
  - 更新 Runtime 测试，覆盖三类历史需求、非法请求、权威来源限制和 lookup chain 上限
  - 运行 Runtime package 测试与 TypeScript 编译
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4)_

- [ ] //TODO 4. 清理 Warm Storage 与 Composition Root 装配

  - 删除 Warm Sidecar Store/Codec，并从 TUI Composition Root 移除 Store、Worker 和相关资源注册
  - 更新 Storage/TUI 测试，确认旧 Warm 文件不被处理且 Retrieval Index Sidecar 仍正常读写
  - 运行 Storage、TUI package 测试与 TypeScript 编译
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.3](./requirements.md#req-2-3), [5.1](./requirements.md#req-5-1)_

- [ ] //TODO 5. 收窄上下文公共 API

  - 删除旧 `TrajectoryContextUnitAdapter`、重复 helper 别名及 Agent/Runtime/Storage barrel exports
  - 增加或调整编译期测试，确认规范接口保留且被删接口不再可导入
  - 运行受影响 package 测试、TypeScript 编译和依赖边界检查
  - _Requirements: [2.4](./requirements.md#req-2-4), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [ ] //TODO 6. 完成跨包集成回归

  - 更新受影响集成 fixture，确认现有 Provider 选择、Gemini Adapter 和协议版本均未变化
  - 运行全部 package、benchmark、Memory 工具测试，以及 TypeScript、依赖、Memory 和 diff 检查
  - _Requirements: [5.2](./requirements.md#req-5-2), [6.1](./requirements.md#req-6-1)_
