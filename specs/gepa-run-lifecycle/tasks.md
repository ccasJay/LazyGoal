# Implementation Plan

- [x] //TODO 1. 扩展 GEPA 与双模型配置边界

  - 实现目标：为主 TOML 增加 `[gepa].reflection_profile`，提供 default Working LM 与独立 Reflection LM 的安全解析，并让 Prompt Evaluation 按 `model.configId` 使用 XDG Profile。
  - 成功判据：有效双 Profile 返回不同模型身份；缺失、同名或非法 Reflection Profile 在模型调用前失败；Prompt Evaluation 不从请求读取凭据。
  - 验证方式：待扩展的 `packages/llm/test/toml-config.test.ts`、`config-loader.test.ts` 与 `benchmarks/test/prompt-evaluation/cli.test.ts`。
  - _Requirements: [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [7.1](./requirements.md#req-7-1)_

- [x] //TODO 2. 实现 Reflection LM 机器桥

  - 实现目标：增加内部 `lazygoal gepa reflect --request` 路由，校验 GEPA 字符串或消息 Prompt，以独立 Profile 执行无 Tool 的纯文本生成并返回有界结果。
  - 成功判据：fake LLM 收到专用反思消息且 Working Profile 未被加载；非法角色、超限输入和 Provider 故障产生分类诊断，不回退到 Working LM。
  - 验证方式：待实现的 Reflection bridge 单元与 CLI 协议测试；运行相关 TypeScript test 文件。
  - _Requirements: [3.2](./requirements.md#req-3-2), [3.4](./requirements.md#req-3-4), [7.1](./requirements.md#req-7-1)_

- [x] //TODO 3. 建立运行请求、Profile seed 与持久 Run Store

  - 实现目标：在 `prompt-evaluation/gepa` 中实现 `gepa-run@1` 解析、单 benchmark 数据预检、default Agent Profile 快照、候选编码和原子 `run/state/owner` 存储。
  - 成功判据：合法请求生成包含全部 Prompt 组件的确定 seed；非法数据、预算或 Profile 不创建 Run；并发 owner 只能有一个成功。
  - 验证方式：待实现的 Python request、profile、run store 与 ownership 测试；执行 `npm run test:gepa-adapter`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [2.1](./requirements.md#req-2-1), [2.4](./requirements.md#req-2-4)_

- [x] //TODO 4. 实现后台 start、status 与 stop 控制面

  - 实现目标：增加生命周期 CLI、显式确认门、后台 Worker 启动、JSON 状态查询和只写官方停止标记的 stop 命令，并接入 `bin/lazygoal.cjs`。
  - 成功判据：`start` 立即返回可查询 `runId`，调用进程退出后 Worker 继续；未确认不启动；`status` 只读；`stop` 不向 PID 发信号且最终得到 `stopped`。
  - 验证方式：待实现的 Python CLI/后台进程集成测试与 `benchmarks/test/package-wiring.test.ts`；使用临时目录和 fake Worker。
  - _Requirements: [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [4.1](./requirements.md#req-4-1), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 5. 接入官方优化、进度报告与 checkpoint 恢复

  - 实现目标：Worker 组合现有 Adapter、Reflection client 与 `gepa.optimize(run_dir=...)`，投影进度/错误，并让 `resume` 在冻结身份校验后复用同一 checkpoint。
  - 成功判据：fake 链路形成多组件候选和可查询预算/分数；停止后的同一 Run 从已有候选继续；失联、配置漂移和存活 Worker 均拒绝恢复且不丢产物。
  - 验证方式：待扩展的官方 GEPA fake 集成测试与生命周期恢复测试；执行 `npm run test:gepa-adapter`。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4)_

- [ ] //TODO 6. 实现稳定状态报告

  - 实现目标：从原子状态和官方结果投影稳定 report，不解析日志或私有 checkpoint，并区分运行、Worker 健康、优化终态和 publication 状态。
  - 成功判据：报告完整提供冻结身份、预算、候选、最佳分数、artifact 和错误分类；未形成、损坏或失联状态不会被报告为成功。
  - 验证方式：待实现的 report 协议与损坏/失联测试；覆盖运行中和全部终态。
  - _Requirements: [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [ ] //TODO 7. 实现最佳 Profile 安全发布

  - 实现目标：从 `GEPAResult` 生成最佳完整 Profile、原子保存 artifacts/report，并在原摘要未变化时写回 `.lazygoal/profiles/default.json`。
  - 成功判据：成功 Run 同时更新 `systemPrompt` 与全部 `instructions` 且保留冻结字段；相同候选记录 unchanged；冲突、停止或失败均不覆盖目标文件并返回可定位报告。
  - 验证方式：待实现的 publisher、report 和 lifecycle 端到端测试；覆盖原子写入失败与外部修改。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4)_

- [ ] //TODO 8. 完成回归接线、架构文档和显式 smoke

  - 实现目标：把确定性生命周期测试接入现有回归，更新 GEPA/LLM/benchmark 当前架构文档，并增加不会进入默认回归的真实双模型 smoke。
  - 成功判据：默认回归无 Docker、网络和凭据即可验证跨语言停止恢复及发布；普通 CLI 不加载 GEPA；真实 smoke 启动前明确提示费用。
  - 验证方式：执行 `npm run test:gepa-adapter`、相关 TypeScript 测试、`npm test`、`git diff --check`；显式 smoke 仅在具备环境并获确认后运行。
  - _Requirements: [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3), [7.4](./requirements.md#req-7-4)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2) | default Agent Profile 的 systemPrompt 与全部 instructions 形成固定顺序 seed，候选只覆盖这些文本 | Profile/Candidate 单元测试（待实现） |
| [1.3](./requirements.md#req-1-3)、[1.4](./requirements.md#req-1-4) | Working/Reflection 配置独立解析，任一无效时无 Run、模型或容器副作用 | TOML、配置与 preflight 测试（待扩展） |
| [2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2) | preflight 输出安全摘要，未确认 start 被拒绝 | 生命周期 CLI 测试（待实现） |
| [2.3](./requirements.md#req-2-3)、[2.4](./requirements.md#req-2-4) | start 返回后台 Run；重复 Worker 无法取得 owner | 后台进程与 ownership 集成测试（待实现） |
| [3.1](./requirements.md#req-3-1)、[3.3](./requirements.md#req-3-3) | 官方 GEPA 使用现有 Adapter、单一 benchmark 和持久 run_dir 产生候选 | fake CLI 官方 GEPA 集成测试（待扩展） |
| [3.2](./requirements.md#req-3-2) | 反思只调用独立 Profile 的无 Tool 文本生成 | Reflection bridge TypeScript/Python 契约测试（待实现） |
| [3.4](./requirements.md#req-3-4) | 评测或反思故障保留 checkpoint、进入 failed 且不发布 | Worker 故障注入测试（待实现） |
| [4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2)、[4.3](./requirements.md#req-4-3) | 状态和报告只读取权威文件，并区分未形成、损坏和 Worker 失联 | status/report 协议测试（待实现） |
| [5.1](./requirements.md#req-5-1)、[5.2](./requirements.md#req-5-2) | stop 仅写标记，Worker 安全停止且不发布 | 停止集成测试（待实现） |
| [5.3](./requirements.md#req-5-3)、[5.4](./requirements.md#req-5-4) | 合法恢复复用同一 checkpoint；身份漂移、存活 Worker和已成功 Run 被拒绝 | 恢复集成测试（待实现） |
| [6.1](./requirements.md#req-6-1)、[6.2](./requirements.md#req-6-2) | 最佳多组件候选形成完整 Profile 并原子发布或标记 unchanged | Publisher 单元与端到端测试（待实现） |
| [6.3](./requirements.md#req-6-3)、[6.4](./requirements.md#req-6-4) | 外部修改、写入失败、停止和优化失败均不覆盖 default.json | 发布冲突/失败测试（待实现） |
| [7.1](./requirements.md#req-7-1) | 运行树和诊断不包含注入的测试 secret、thinking 或完整 Trace | 产物递归敏感串扫描测试（待实现） |
| [7.2](./requirements.md#req-7-2)、[7.3](./requirements.md#req-7-3) | 默认 fake 回归覆盖跨语言、停止恢复和发布，无外部依赖 | `npm run test:gepa-adapter`、相关 TypeScript tests、`npm test` |
| [7.4](./requirements.md#req-7-4) | 显式真实 smoke 提示费用且不属于默认回归 | package scripts 与 smoke 入口检查；获确认后的真实运行 |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。
