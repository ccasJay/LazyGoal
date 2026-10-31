# 删除旧 Contract AST 前置审计

审计基线：`feat/remove-legacy-contract-ast` 的 `80110d57`，其父链包含编排固定的全部迁移交付。以下结论基于当前 worktree 源码、Catalog、测试、脚本与评测入口，不以盘点快照替代消费证明。

## 交付依赖核对

以下提交均为当前 HEAD 的祖先：

| 方向 | 固定提交 | 结果 |
| --- | --- | --- |
| 生成能力 | `813c6b87` | 是 |
| 工具输入迁移 | `a716a723` | 是 |
| 模型数据契约迁移 | `e424d86a` | 是 |
| Web 数据契约迁移 | `53867a1e` | 是 |
| Storage 数据契约迁移 | `ffcc8a6b` | 是 |
| 其他数据边界迁移 | `8f930aa3` | 是 |
| AgentProfile 文件契约 | `aab67b03` | 是 |
| 跨 Spec 集成验证 | `f2f90e6a` | 是 |
| 编排交付标记 | `80110d57` | 是 |

检查命令：`git merge-base --is-ancestor <commit> HEAD`。九个提交全部返回成功。

## Catalog 核对

`contracts/catalog.json` 共 1071 条登记。与 `packages/contracts` 相关的现存项只有：

- `contracts/src/types#JsonScalar`
- `contracts/src/types#JsonValue@L10`

两项均为 `present`、`generation: runtime` 的 JSON 静态类型，不是 AST 生成根。Catalog 中不存在 `present` 状态的 `contract-ast` 登记；260 条 `contract-ast` 全部为 `deleted`，对应旧 Web、模型、工具等已迁移声明。没有启用项从 `packages/contracts` 生成制品。

## 生产导入扫描

扫描范围包括 `packages/*/src`、`apps/*/src`、`benchmarks/**/src`、`bin` 与 `scripts`：

- `compileJsonSchema`、`safeParse`、`inspectContractNode`、`ContractDefinitionError`、`ContractDefinitionReasonCode`、`ContractBuilders`、`InferContract` 在 `packages/contracts` 之外没有生产引用。
- `contract` 标识符只出现在 53 个测试或历史残留导入中；逐文件核对后均无对应表达式引用。四个 benchmark 生产文件（`alfworld-tools.ts`、`context-shell.ts`、`submit-answer.ts`、`bash-exec-tool.ts`）只保留未使用的 `contract` 导入，实际输入已由相邻 `generated/*/binding` 消费。
- `packages/tools/test/read-file.test.ts` 只导入未使用的 `contract`、`Contract`、`InferContract`，真实行为测试不依赖 AST。
- 模型、工具、Web、Storage、Runtime、评测与跨进程入口没有必要的旧 AST 消费者。

结论：不存在阻止删除的必要旧 AST 消费者。

## 保留原语与真实调用者

| 原语 | 真实生产调用者 |
| --- | --- |
| `canonicalJson` | `context-budget/src/stable-json.ts`、`context-retrieval/src/context-document.ts`、`context-protocol.ts`、`context-retrieval-index.ts`、`permission/src/grant-matching.ts`、`tool-grant-matcher.ts`、`runtime/src/action-approval.ts`、`context-retrieval.ts`、`runner.ts`、`session-input.ts`、`tools/src/internal/cursor.ts`、`working-memory/src/core.ts` |
| `canonicalizeJson` | `working-memory/src/core.ts` |
| `compareCodeUnits` | `context-budget/src/index.ts`、`stable-json.ts`、`context-retrieval/src/context-document.ts`、`context-protocol.ts`、`context-ranking.ts`、`context-retrieval-index.ts`、`context-tokenizer.ts`、`model-context/src/goal-context-navigation.ts`、`model-inference-projector.ts`、`runtime/src/context-retrieval.ts` |
| `deepFreeze` | `context-retrieval/src/context-document.ts`、`context-retrieval-index.ts`、`context-tokenizer.ts`、`model-context/src/context-lookup-projection.ts`、`model-inference-projector.ts`、`trajectory-event-projector.ts`、`trajectory-model-context-assembler.ts`、`storage/src/context-retrieval-index-sidecar.ts`、`goal-context-index-store.ts` |
| `isRecord` | Web、Runtime、Storage、LLM、模型、工具、Benchmark 与 Worker 边界的 50 余个生产源码；代表入口包括 `runtime/src/runner.ts`、`storage/src/goal-snapshot-codec.ts`、`model-contracts/src/model-conversation.ts`、`web-contracts/src/validation.ts`、`benchmarks/swebench/src/worker-runtime.ts` |
| `JsonScalar`、`JsonValue` | `llm-core/src/types.ts`、`model-contracts/src/model-output/schema-types.ts`、`runtime/src/domain.ts`、`tool-core/src/types.ts`、`benchmarks/src/remote-tool-registry.ts` 等 JSON 边界 |
| `JsonSchemaValue`、`JsonSchema202012` | `llm-core/src/types.ts`、`llm-google/src/gemini.ts`、`model-contracts/src/model-output/bundle.ts`、`provider-schema.ts`、`tool-declaration.ts`、`bound-factory.ts` |
| `ContractValidationError`、`ContractIssueCode`、`ContractIssue` | `model-contracts` 的生成绑定解码与 system tool 校验、`model-response` 的模型响应错误映射；沿用现有 `code`、`issues`、`truncated` 形状 |

这些能力保留在 `@lazygoal/contracts`，只删除 AST、推导、Parser、Schema 编译器、节点检查与仅供它们使用的复制实现。`ContractValidationError` 继续作为共享校验诊断类型，文档改述为生成绑定校验错误，不再引用 Parser 或 AST 示例。

## 删除清单

- `packages/contracts/src/contract.ts`
- `packages/contracts/src/definition.ts`
- `packages/contracts/src/parser.ts`
- `packages/contracts/src/json-schema.ts`（仅保留其中 JSON Schema 静态类型到 `types.ts`）
- `packages/contracts/src/node-inspection.ts`
- `packages/contracts/src/internal.ts`
- `packages/contracts/src/json-value-copy.ts`
- `packages/contracts/src/types.ts` 中的全部 Contract AST 类型（保留 JSON 类型）
- 仅覆盖 AST、Parser、Schema 编译或节点检查的测试
- `contract`、`Contract`、`InferContract` 残留导入
- 仅为 AST Schema oracle 存在的 `ajv` 包级开发依赖与锁文件

## 定向验证

命令：`npx tsx --test packages/contracts/test/json.test.ts packages/contracts/test/single-implementation.test.ts`

结果：20/20 通过。覆盖 canonical JSON、代码单元比较、对象守卫、深冻结、共享实现 allowlist 与 `contracts` 无 Node 依赖约束。
