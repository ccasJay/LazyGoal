# 多 Spec 编排

## 编排目标

完成 LazyGoal 四个核心拆包 Spec（Execution Control、Model Contracts、Tool Core、Working Memory）的协同与并行交付，彻底消除跨层反向依赖（如 `@lazygoal/llm` 依赖 `@lazygoal/runtime`）并纯化通用 Contracts DSL，同时严格保持所有既有执行控制、模型协议、工具调度与工作记忆算法的行为、持久化和数据契约不变。

## 涉及的 Spec

| Spec | 路径 | 批准状态 | 完成条件 |
|---|---|---|---|
| Execution Control | `specs/execution-control-package/` | 已批准 | Feature Verification passed |
| Model Contracts | `specs/model-contracts-package/` | 已批准 | Feature Verification passed |
| Tool Core | `specs/tool-core-package/` | 已批准 | Feature Verification passed |
| Working Memory | `specs/working-memory-package/` | 已批准 | Feature Verification passed |

## 依赖关系与执行顺序

四个 Spec 呈现出两条正交、低耦合的领域执行流水线：

```text
       dev (主开发基线)
      /                \
     v                  v
[Pipeline A: 控制与工具链]    [Pipeline B: 契约与记忆链]
Execution Control          Model Contracts
      |                          |
      v                          v
  Tool Core                Working Memory
```

1. **Pipeline A（控制信号与通用工具链）**：`execution-control-package` → `tool-core-package`
   - `execution-control-package` 建立底层的 `@lazygoal/execution-control`，作为进程内取消信号与暂时性模型故障分类的单一事实源，零 LazyGoal 出站依赖。
   - `tool-core-package` 明确以前者为前置：复用 `@lazygoal/execution-control` 的 `ExecutionControl` 和 `ExecutionAbortedError`。因此 `tool-core-package` 在 `execution-control-package` 完成后推进。
2. **Pipeline B（模型协议与记忆核心链）**：`model-contracts-package` → `working-memory-package`
   - `model-contracts-package` 从 `@lazygoal/contracts` 中拆分出 `@lazygoal/model-contracts`，承载模型输出协议、系统工具与模型消息，包含 `WorkingMemoryPatch` 的权威契约定义。
   - `working-memory-package` 依据 `model-contracts` 的设计（Req 5），将其 Patch 契约归属对齐到 `@lazygoal/model-contracts`，以类型依赖复用该定义。因此在 `model-contracts-package` 完成后推进 `working-memory-package`。
3. **跨链关系**：
   - Pipeline A 与 Pipeline B 彼此正交，无横向代码依赖，两条流水线完全可以并发并行推进。

## 可并行执行的部分

- **阶段一并行（Phase 1 Parallel）**：
  - 流 A1：`execution-control-package`（在独立 worktree 中执行）
  - 流 B1：`model-contracts-package`（在独立 worktree 中执行）
  - 两者均基于 `dev` 分支独立拉出，无重叠文件冲突，完全并发推进。
- **阶段二并行（Phase 2 Parallel）**：
  - 流 A2：`execution-control-package` 验收通过后，推进堆叠的 `tool-core-package`；
  - 流 B2：`model-contracts-package` 验收通过后，推进堆叠的 `working-memory-package`；
  - 两个后继 Spec 同样保持跨链并行推进。

## 分支与合并策略

采用**双链堆叠分支（Stacked Branches）**策略与**独立 Worktree**执行：

1. **分支拓扑**：
   - Pipeline A:
     - 分支 `feature/execution-control-package` 基于 `dev` 创建。
     - 分支 `feature/tool-core-package` 基于 `feature/execution-control-package` 创建。
   - Pipeline B:
     - 分支 `feature/model-contracts-package` 基于 `dev` 创建。
     - 分支 `feature/working-memory-package` 基于 `feature/model-contracts-package` 创建。
2. **Worktree 路径规划**：
   - `.worktrees/wt-execution-control` 对应 `feature/execution-control-package`
   - `.worktrees/wt-model-contracts` 对应 `feature/model-contracts-package`
   - `.worktrees/wt-tool-core` 对应 `feature/tool-core-package`
   - `.worktrees/wt-working-memory` 对应 `feature/working-memory-package`
3. **合并顺序**：
   - 各 Spec 必须在其所属 worktree 内完成全部 `//TODO` 且 Feature Verification 全部 passed；
   - 先将 `feature/execution-control-package` 合入 `dev`；
   - 再将 `feature/tool-core-package` 合入 `dev`；
   - 接着将 `feature/model-contracts-package` 合入 `dev`；
   - 最后将 `feature/working-memory-package` 合入 `dev`；
   - 合并完成后在 `dev` 主工作区执行全量回归与跨 Spec 集成验证。

## 跨 Spec 协调约束

1. **取消与中止错误身份唯一性**：
   `@lazygoal/tool-core` 必须且仅能使用 `@lazygoal/execution-control` 提供的取消原语（`ExecutionControl`、`throwIfAborted`、`ExecutionAbortedError`），严禁在 `tool-core` 重新定义或捕获不一致的错误类。
2. **Working Memory Patch 权威契约唯一性**：
   `@lazygoal/working-memory` 中的 `WorkingMemoryPatch` 必须通过 `import type` 从 `@lazygoal/model-contracts` 导入，严禁在 `working-memory` 复制 AST 契约或回退引用已移除旧导出的 `@lazygoal/contracts`。
3. **依赖边界增量注册约束**：
   `scripts/check-dependencies.mjs` 中的 `ALLOWED_PACKAGE_DEPENDENCIES`：
   - `execution-control`: `[]`（无出站依赖），`llm` 移除对 `runtime` 的依赖；
   - `model-contracts`: `["contracts"]`；`contracts` 保持 `[]` 且移除旧模型协议导出；
   - `tool-core`: `["contracts", "execution-control", "sandbox"]`；
   - `working-memory`: `["contracts", "model-contracts"]`。
4. **统一 TSDoc 与架构文档规范**：
   每个新包的公共接口必须配备契约级中文 TSDoc 与最小使用 `@example`；架构文档必须只记录各阶段已实现的职责，不超前引入未实现内容。

## 跨 Spec 集成验证

在所有 Spec 分支合入后，在主工作区执行以下验证：

1. **依赖边界检查**：
   - 运行 `npm run check:dependencies`，确认全仓源文件零依赖违规，特别确保 `llm`、`tool-core`、`working-memory` 均无反向 `runtime` 导入，`contracts` 零出站依赖。
   - 运行 `node --test scripts/check-dependencies.test.mjs`，负向用例全绿。
2. **静态类型安全**：
   - 运行 `npx tsc --noEmit`，全仓 TypeScript 类型检查 0 错误。
3. **全量确定性回归**：
   - 运行 `npm test`（即 `node scripts/run-regression.mjs`），确保所有包的单测、集成测试、快照测试全部通过。
4. **关键跨层流端到端验证**：
   - **执行控制与模型故障流**：
     `npx tsx --test packages/llm/test/model-request-failure.test.ts packages/runtime/test/execution-control.test.ts packages/agent/test/execution-control.test.ts`
   - **模型输出契约与 AST 检查**：
     `npx tsx --test packages/contracts/test/*.test.ts packages/model-contracts/test/*.test.ts`
   - **工具定义、准备与沙箱执行**：
     `npx tsx --test packages/tool-core/test/*.test.ts packages/runtime/test/runner.test.ts packages/tools/test/bash.test.ts`
   - **记忆准入、恢复与快照提交**：
     `npx tsx --test packages/working-memory/test/*.test.ts packages/runtime/test/working-memory-session.test.ts packages/storage/test/goal-snapshot-current.test.ts`

## 生命周期状态

- [x] 编排已获用户批准
- [ ] 各 Spec Feature Verification 全部 passed
- [ ] 跨 Spec Integration Verification passed
- [ ] Memory 沉淀门完成（需要的写入已获批准并完成，或用户明确确认无需沉淀）
- [ ] 用户确认最终交付
- [ ] 已删除 orchestration.md
