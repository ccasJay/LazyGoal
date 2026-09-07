# 多 Spec 编排

## 编排目标

依据 tofix.md 清单完成五项已批准修复(统一回归入口、Bash 进程终止、轨迹存储性能、模型用量记录、可验证完成证据),统一实现并依次合入 dev,使仓库具备可复现回归、有界工具执行、低开销长轨迹、用量可审计与客观完成判定。

## 涉及的 Spec

| Spec | 路径 | 批准状态 | 完成条件 |
|---|---|---|---|
| unified-regression-entry | specs/unified-regression-entry/ | 已批准 | Feature Verification passed |
| bash-process-termination | specs/bash-process-termination/ | 已批准 | Feature Verification passed |
| trajectory-store-performance | specs/trajectory-store-performance/ | 已批准 | Feature Verification passed |
| model-usage-recording | specs/model-usage-recording/ | 已批准 | Feature Verification passed |
| verifiable-completion-evidence | specs/verifiable-completion-evidence/ | 已批准 | Feature Verification passed |

## 依赖关系与执行顺序

`unified-regression-entry → bash-process-termination → trajectory-store-performance → model-usage-recording → verifiable-completion-evidence`

- 回归入口最先:后续四个 Spec 的全量验证统一使用其交付的 `npm test`,保护所有后续改动。
- 轨迹性能 Spec 软依赖回归入口:基线压测结果的可复现性由统一入口保证。
- 用量记录先于完成证据:两者共改 `benchmarks/src/headless-composition-root.ts`,先 usage 累计后 descriptor 声明注入,后者吸收前者对同一文件的改动。
- 完成证据最后:设计空间最大,吸收前面全部经验,且其 codec 演进与轨迹优化同在 `packages/storage`(不同文件,顺序执行避免干扰)。

## 可并行执行的部分

无。`bash-process-termination`(packages/tools)与 `trajectory-store-performance`(packages/storage)触及面不相交,理论上可并行;但单执行者串行更简单,且统一回归入口本身串行化验证收益有限,选择全程串行堆叠。

## 分支与合并策略

自 `dev` 起按执行顺序堆叠建分支,每个 Spec 在前一 Spec 的分支之上创建;全部完成并跨 Spec 集成验证通过后,按相同顺序依次 merge 回 `dev`:

```text
dev
 └─ feature/unified-regression-entry
     └─ feature/bash-process-termination
         └─ feature/trajectory-store-performance
             └─ feature/model-usage-recording
                 └─ feature/verifiable-completion-evidence
```

合并顺序与分支顺序一致:unified-regression-entry → bash-process-termination → trajectory-store-performance → model-usage-recording → verifiable-completion-evidence。

## 跨 Spec 协调约束

- 回归入口必须以目录级模式收纳测试文件(非硬编码清单),保证后续四个 Spec 新增的测试文件自动进入回归,执行期间无需修改入口。
- 全部 Spec 的全量回归验证统一调用 `npm test`(P1-04 交付后);实施前(P1-04 交付前)沿用既有单包测试命令。
- `headless-composition-root.ts` 由用量记录与完成证据两个 Spec 先后修改:后者实施前必须基于前者分支的最新状态核对受影响结论(证据时效)。
- 每个 Spec 的完成以其自身 tasks.md 的 Feature Verification passed 为准,不以任务勾选完为准;验证证据记录在各 Spec 的 Latest Result。
- 各 Spec 内部任务执行、修复路由遵循各自批准的 tasks.md 与 delivery-loop,本编排不干预。

## 跨 Spec 集成验证

在最终分支(含全部五项改动)执行:

| 场景 | 预期结果 | 检查方式 |
|---|---|---|
| 统一回归入口收纳全部新测试 | `npm test` 全绿,包含五个 Spec 新增的全部测试文件与两项静态检查 | 运行 `npm test` 并核对测试文件清单 |
| 共改文件合并正确性 | `headless-composition-root.ts` 同时具备 usage 累计与 descriptor 声明注入,两者行为互不干扰 | 相关 benchmark 测试 + 类型检查通过 |
| storage 包双重演进共存 | 轨迹追加优化与 Snapshot codec 演进同包共存,回归通过 | `npm test` 中 storage 相关测试全绿 |
| 组合冒烟 | 一次 headless benchmark 评测运行同时体现:有界 bash 终止(超时行为)、轨迹低开销追加、报告含用量、声明任务完成校验生效 | 人工检查一次运行的 trace/报告产物 |

## 生命周期状态

- [x] 编排已获用户批准
- [ ] 各 Spec Feature Verification 全部 passed
- [ ] 跨 Spec Integration Verification passed
- [ ] Memory 沉淀门完成(需要的写入已获批准并完成,或用户明确确认无需沉淀)
- [ ] 用户确认最终交付
- [ ] 已删除 orchestration.md
