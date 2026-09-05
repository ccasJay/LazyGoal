# LazyGoal To Fix

记录日期：2026-09-05。依据：`dsl/contract-dsl-core` 分支分析时的工作树。

本清单保存问题、优化建议与开发方向，尚未实施；建议方案不代表已批准的功能设计。实施前应核对当前源码。优先级表示建议处理顺序，证据状态区分已复现问题、源码分析与待验证收益。

## 待处理清单

### P0-01：保证 Bash 超时与中止能够结束执行

- [ ] 修复命令终止与清理机制。

**证据：已复现。** [runShellCommand](packages/tools/src/bash.ts) 在超时或 abort 时只向直接子进程发送一次 `SIGTERM`，随后等待 `close`。执行 `trap "" TERM; sleep 0.6`，设置 `timeoutMs: 50`，实际约 620ms 后才返回 `COMMAND_TIMEOUT`。当前超时不能保证执行时长上限；后代进程持有输出管道的情况仍需专项验证。

**建议：** 明确进程树所有权，终止宽限期后强制结束仍存活的受管进程，并确保输出管道与监听器清理完成。

**验收：** 覆盖正常退出、忽略 SIGTERM、派生子进程、超时和 abort；在定义的超时与清理宽限内返回，无遗留受管进程。保留 `manual` Tool 的 `outcome_unknown` 恢复语义，不自动重放可能已产生副作用的命令。

### P1-01：测量并降低长轨迹读写开销

- [ ] 建立轨迹性能基线，根据结果实施增量读写优化。

**证据：源码分析，未压测。** [JsonFileTrajectoryStore](packages/storage/src/json-file-trajectory-store.ts) 每次追加事件前都会读取、解析和校验完整历史；范围查询也是全量读取后过滤。事件大小近似稳定时，追加 N 条事件的累计历史处理量呈 O(N²)。模型输入裁剪不会消除底层文件处理成本。

**建议：** 先测量 100、1,000、10,000 条事件的累计追加耗时、范围读取耗时与内存，再评估单写者会话维护末尾序号、增量读取或偏移索引。缓存和索引只能作为可重建派生数据。

**验收：** 给出优化前后同规模数据；降低重复历史处理量；重启、追加失败、损坏文件和未提交 tail 的处理仍符合 Snapshot 提交边界。不因优化引入未经要求的多版本兼容或跨进程一致性承诺。

### P1-02：为任务完成增加可验证的验收结果

- [ ] 在明确任务类型中验证完成条件与证据内容的对应关系。

**证据：源码边界。** [Runner.validateCompletionEvidence](packages/runtime/src/runner.ts) 检查完成条件覆盖与证据引用合法性，[Evidence Gate](packages/runtime/src/evidence-gate.ts) 检查来源范围；这些检查不能独立证明证据内容满足对应条件。合法但不充分的 Observation 仍可能被模型用于宣布完成。

**建议：** 优先针对编码任务接入测试结果、产物断言或用户验收结果。沿用 [ALFWorld 报告](benchmarks/alfworld/src/report.ts) 由环境 `won` 决定成功的原则，将模型声明与可验证成功事实分开记录。

**验收：** 覆盖证据无关、证据不足、产物验证失败及真实成功；模型声明不能覆盖明确失败的验收结果。不要一律禁止失败 Observation 作证据，验证预期失败的任务可能需要它。

### P1-03：补齐长任务资源预算与成本反馈

- [ ] 记录实际模型用量，并定义跨阶段任务预算与耗尽行为。

**证据：源码分析。** [Launcher](packages/runtime/src/launcher.ts) 的 `maxSteps` 默认是 0，表示不限制，且只约束 executing；[OpenAI Adapter](packages/llm/src/openai-compatible.ts) 返回的 metadata 未包含 usage；[评测报告](benchmarks/alfworld/src/report.ts) 记录成功、步数和时长，未记录 token 消耗。

**建议：** 先记录供应商提供的输入、输出及缓存 token 用量，明确缺失值语义；再评估覆盖 Preparation/Execution 的调用次数和总时长预算，以及可解释的预算耗尽恢复点。

**验收：** 能按任务比较成功率与实际用量，缺失用量不能记作零；预算统计覆盖准备与执行阶段，恢复后的累计规则明确；耗尽时保留一致检查点。供应商重试是否计入调用预算需在设计时明确。

### P1-04：建立统一的确定性回归入口

- [ ] 替换根目录占位测试命令，提供可复现的统一检查入口。

**证据：已确认配置。** 根 [package.json](package.json) 的 `npm test` 仍是直接失败的占位命令。已有测试通过不等于仓库具备统一的全量回归入口。

**建议：** 将确定性测试、类型检查和依赖边界检查接入明确命令；真实模型及外部环境评测使用独立入口。

**验收：** 新环境按已声明的依赖安装与检查步骤即可复现结果；任一检查失败均返回非零退出码；不遗漏已有确定性测试，不把付费模型调用混入默认测试。

### P2-01：用生产试点验证 Contracts 的整合收益

- [ ] 选择一个 Tool 输入，验证单份 Contract 能否替代重复结构声明。

**证据：整合候选，收益待验证。** [Contracts 导出](packages/contracts/src/index.ts) 已提供 AST、Parser 和 JSON Schema 编译能力；业务层仍有 [Agent Zod Schema](packages/agent/src/response-schema.ts) 与 [Bash 输入 Schema、解析和校验](packages/tools/src/bash.ts)。分析时 Contracts 尚未形成业务生产接入收益。

**建议：** 以一个 Tool 为试点，从同一 Contract 推导类型、执行结构校验并生成模型 Schema；保留 Tool 业务语义与 Runtime 授权校验。

**净收益与验收：** 实际删除试点中的重复结构声明与解析分支，验证类型推导、Parser 和 Schema 的一致性，并明确错误语义变化。若仅增加包装层而未减少维护面，应重新评估接入方案。

**范围与风险：** 不直接全仓替换 Zod，也不删除正在开发的 Contracts；不得将不同所有者的业务状态、Storage DTO 和模型协议机械合并。当前置信度中等，需生产试点证明收益。

## 开发方向

建议定位：能中断恢复、能说明完成依据、能控制成本的长任务编码 Agent。

| 阶段 | 重点 | 验证指标 |
| --- | --- | --- |
| 第一阶段 | 进程终止、统一回归、轨迹性能基线 | 超时与清理时长、检查可复现性、历史增长成本 |
| 第二阶段 | 编码任务验收、usage 统计、跨阶段预算 | 客观完成结果、误报完成率、用量与失败归因 |
| 第三阶段 | 固定任务集比较上下文和记忆策略 | 成功率、恢复成功率、token 消耗与耗时 |

复用 [HeadlessCompositionRoot](benchmarks/src/headless-composition-root.ts) 接入编码任务评测，保留 ALFWorld 的环境任务验证。通过固定任务集证明 Working Memory、检索和 Prompt 缓存的收益，再决定后续扩展。

保留 Runtime、Agent 与 Storage 的职责边界，以及 [共享提交器](packages/runtime/src/trajectory-checkpoint-committer.ts) 的事实与 Snapshot 提交顺序。审批、未知副作用结果和恢复边界有独立语义，不以文件长度作为合并理由。本次没有形成可直接删除的强简化候选。

## 分析时的验证记录

- `npx tsc --noEmit`：通过。
- `npm run check:dependencies`：通过，检查器报告 105 个源文件。
- `npx tsx --test packages/tools/test/bash.test.ts packages/storage/test/trajectory-store.test.ts packages/runtime/test/runner.test.ts packages/contracts/test/*.test.ts`：90 项通过，无失败或跳过；仅代表选取的测试，不是全量回归。
- Bash 50ms 超时复现：约 620ms 后返回，命令自行结束。
- 未运行真实模型评测、长轨迹压测或跨进程恢复专项验证；实际成功率、成本收益与性能幅度尚无结论。
