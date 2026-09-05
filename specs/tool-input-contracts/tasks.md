# Implementation Plan

> 前置条件：`contract-dsl-core` 已实现并通过验证；若其公共 API 与本设计不一致，先返回 Design 阶段处理，不在本 Spec 内复制 DSL。

- [x] //TODO 1. 原子迁移 Tool Contract 公共接口与仓库内消费者

  - 在 Runtime 实现泛型 `Tool<C>`、`ToolRegistration`、`createToolRegistration`、Registry 查询和 `PreparedToolAction`，并补齐公共接口的中文契约级 TSDoc。
  - 同步迁移七个 Tool、Agent Projector、TUI/benchmark 组合根以及仓库内测试替身，移除 `inputSchema`、重复输入类型和结构解析器。
  - 更新公共导出和依赖边界配置，运行 TypeScript 与受影响包的 smoke tests，确保破坏性替换后仓库保持可编译。
  - _Requirements: [1.1](./requirements.md#req-1-1), [3.1](./requirements.md#req-3-1), [4.1](./requirements.md#req-4-1), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2)_

- [x] //TODO 2. 强制新 Action 的单次 Contract 准备边界

  - 调整 Runner 的新 `tool_call` 路径，在 Profile 与 Registry 检查后、Policy 和任何 Action 事实或状态写入前完成结构解析、语义校验与 canonical Action 重建。
  - 让 Policy、pending Action、`tool_started` 和执行闭包共享隔离后的解析结果，删除同一尝试中的重复解析入口。
  - 增加 Runtime 测试，覆盖非法结构不调用 Policy/Tool、不写 pending 或 `decision_received`，以及原始输入突变不能影响已准备 Action。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [3.4](./requirements.md#req-3-4), [5.1](./requirements.md#req-5-1)_

- [ ] //TODO 3. 验证七个 Tool Contract 与领域语义分层

  - 为 Bash、Read File、Write File、Edit File、Grep、ALFWorld Reset 和 ALFWorld Step 增加类型推导、合法/非法输入和确定性 Schema 测试。
  - 保留现有跨字段、正则、Workspace 沙箱、NUL、`.lazygoal`、超时和空白规则，确认校验与执行不 trim、coerce 或补默认值。
  - 删除失去生产消费者的 JSON 字段解析 helper，并运行 Tools 与 ALFWorld 的现有行为回归。
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [2.4](./requirements.md#req-2-4), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

- [ ] //TODO 4. 保持审批、恢复、中止与提交顺序

  - 让等待审批路径只持久化 canonical Action，并在批准或新恢复尝试中重新 prepare；safe 恢复把当前 Prepared 对象传入首轮执行，manual 恢复继续进入 `outcome_unknown`。
  - 增加 Runner、Storage 恢复和 Trajectory 测试，断言每次尝试只解析一次、原 `actionId` 与 replay policy 不变，Action/Observation/Snapshot 顺序不变。
  - 覆盖解析、语义校验与执行边界上的 `ExecutionAbortedError` 原样传播。
  - _Requirements: [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4)_

- [ ] //TODO 5. 从 Input Contract 投影稳定的模型 Tool Schema

  - 在 `ModelInferenceProjector` 中编译每个授权 Tool 的 JSON Schema，只省略根 `$schema` 元数据，并保持 Tool ID 排序与 View 数据隔离。
  - 增加 Agent 与 Prompt 测试，确认 AST 不进入 `ModelInferenceView`、重复投影字符稳定、字段和 optional 语义不变。
  - 对编译结果断言七个当前 Contract 不含开放 record、递归引用或其它非可移植结构，可供后续模型输出组合直接消费。
  - _Requirements: [1.4](./requirements.md#req-1-4), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4)_

- [ ] //TODO 6. 同步当前架构说明并完成全量回归

  - 更新 Runtime、Agent 与 Benchmark 架构文档中的 Tool 输入事实源、注册、单次解析和模型 Schema 投影边界，不修改历史 Spec 或 Project Memory。
  - 全仓搜索并删除旧 `inputSchema` 定义面、旧输入解析入口和悬空导出，确认模型响应、Provider、Observation 与持久化协议没有随本特性变化。
  - 运行 TypeScript、全部 packages tests、benchmark tests、依赖边界、Memory checks 与 `git diff --check`。
  - _Requirements: [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4)_
