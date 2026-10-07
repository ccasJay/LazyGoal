# Implementation Plan

- [ ] //TODO 1. 为核心 Contract AST 增加统一只读检查器

  - 实现目标：在 `@lazygoal/contracts` 增加 `inspectContractNode` 与 `ContractNodeInspection`，复用现有私有品牌检查，并补充普通、optional、recursive 与未知节点的测试。
  - 成功判据：核心 DSL 创建的普通、optional、recursive 节点均返回正确类别及原节点引用；未知值返回 `undefined`；公开入口不导出品牌 Symbol，既有 AST 构造与冻结行为不变。
  - 验证方式：`npm test` 中 Contracts 类型检查与新增 AST 检查测试通过。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2)_

- [ ] //TODO 2. 迁移模型输出协议并保持派生结果

  - 实现目标：建立 `@lazygoal/model-contracts` 包，将 `model-output/` 实现和 Canonical、Wire、Provider Schema、Shape Guide 等测试迁入；内部 DSL 访问改用 Contracts 公共入口及统一 AST 检查器。
  - 成功判据：模型输出契约可从新包入口使用；相同输入的 Canonical 接受／拒绝与解析值、Wire 派生和解码值、Provider Schema 及 Shape Guide 内容与迁移前一致；递归节点保留既有 Wire 派生限制。
  - 验证方式：`npm test` 中 Model Contracts 的迁移测试、全仓 TypeScript 检查及回归通过；保留的既有断言能验证协议结果，而不是只比较同一实现的重复输出。
  - _Requirements: [1.2](./requirements.md#req-1-2), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [3.1](./requirements.md#req-3-1)_

- [ ] //TODO 3. 迁移模型消息与续接协议

  - 实现目标：将 `model-conversation.ts` 及其消息、供应商续接 DTO 和校验测试迁入 `@lazygoal/model-contracts`，并由新包唯一公开入口导出。
  - 成功判据：合法与非法消息的接受／拒绝结果、解析语义及续接字段保持不变；新包入口不要求调用方绕过公开入口访问内部文件。
  - 验证方式：`npm test` 中迁移后的模型消息协议测试与全仓 TypeScript 检查通过。
  - _Requirements: [1.2](./requirements.md#req-1-2), [2.3](./requirements.md#req-2-3)_

- [ ] //TODO 4. 迁移生产调用方并收紧包依赖边界

  - 实现目标：将 Agent、Runtime、LLM、Storage 与 Context Retrieval 的模型协议导入改为 `@lazygoal/model-contracts`；从 `@lazygoal/contracts` 删除模型协议旧导出；登记新包依赖和调用方边，并更新仓库布局及当前架构文档。
  - 成功判据：模型协议生产导入全部经过新包公共入口；Contracts 仅导出通用 DSL 与 AST 检查器，且没有 LazyGoal 包出站依赖；仍需通用 DSL 的调用方继续使用 Contracts；依赖检查不接受未登记边。
  - 验证方式：`npm run check:dependencies` 与 `npm test` 通过；检索源码确认生产代码无从 Contracts 导入模型协议的遗留引用，文档准确描述新包职责。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2)_

- [ ] //TODO 5. 同步 Working Memory 的 Patch 契约归属

  - 实现目标：修订 `working-memory-package` 的 Design 与 Tasks，将 `WorkingMemoryPatch` 的唯一权威归属改为 `@lazygoal/model-contracts`，并使 Working Memory 仅以类型依赖使用该契约；按 Working Memory Spec 流程分别取得必要审批后，再执行受影响的 Working Memory 实现任务。
  - 成功判据：Working Memory 计划不再把 Patch 契约归于 Contracts，也不复制其定义；Patch 的结构与类型只由 Model Contracts 持有；未获 Working Memory Spec 对修订文件的批准前，不开始其受影响的实现任务。
  - 验证方式：检查修订后的 Working Memory Design/Tasks、契约导入位置与依赖图，并确认该 Spec 的审批状态满足其自身流程。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) | 只用 DSL 的调用方仍能通过 Contracts 获取 AST、Parser、Schema 编译及类型，不依赖模型协议 | `npm test` 全仓 TypeScript 检查及 Contracts 测试 |
| [1.2](./requirements.md#req-1-2) | 模型输出和消息协议可由 Model Contracts 公共入口取得，并复用 Contracts AST | Model Contracts 测试与全仓 TypeScript 检查 |
| [2.1](./requirements.md#req-2-1) | 固定 Canonical 输入保持接受／拒绝结果及解析值 | 迁移后的 Canonical 测试断言 |
| [2.2](./requirements.md#req-2-2) | 固定 AST 与输入保持 Wire 解码、Schema 和 Shape Guide 结果；递归 Wire 派生继续按既有规则失败 | 迁移后的 Wire、Provider Schema 与 Shape Guide 测试断言 |
| [2.3](./requirements.md#req-2-3) | 固定模型消息输入保持合法性判定及语义 | 迁移后的模型消息测试断言 |
| [3.1](./requirements.md#req-3-1) | 检查普通、optional、recursive AST 并驱动既有 Wire 行为 | AST 检查和 Wire 测试 |
| [3.2](./requirements.md#req-3-2) | 跨包检查使用 Contracts 的唯一节点身份，且公开入口不暴露品牌 Symbol | AST 检查测试、公开导出检查与 TypeScript 检查 |
| [4.1](./requirements.md#req-4-1) | Agent、Runtime、LLM、Storage、Context Retrieval 的生产调用方使用 Model Contracts 入口 | 全仓 TypeScript 检查及源码导入检索 |
| [4.2](./requirements.md#req-4-2) | Contracts 不再转发模型协议，依赖图只包含获准的单向边 | `npm run check:dependencies`、公开导出检查与源码导入检索 |
| [5.1](./requirements.md#req-5-1) | Working Memory 使用唯一 Patch 类型且不重复定义 | Working Memory 计划、类型导入及依赖图检查 |
| [5.2](./requirements.md#req-5-2) | Working Memory Design 更新契约归属，相关 Tasks 与新设计一致 | 审阅更新后的 Design/Tasks，并记录各自审批状态 |

### Latest Result

未执行。
