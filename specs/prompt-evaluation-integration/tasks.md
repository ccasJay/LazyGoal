# Implementation Plan

- [x] //TODO 1. 定义并验证 Prompt Evaluation 当前版本协议

  - 实现目标：在 `benchmarks/src/` 定义请求、事件、结果与稳定错误/退出分类，并实现严格 JSON 解析、未知字段拒绝、路径和 benchmark ID 预检。
  - 成功判据：有效单候选请求可规范化；旧版本、未知字段、无效路径、多候选形状和未注册 benchmark 在任何模型或容器调用前失败。
  - 验证方式：待实现的协议解析与副作用隔离测试；执行仓库发现的 TypeScript 与 benchmark 测试入口。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [3.4](./requirements.md#req-3-4)_

- [x] //TODO 2. 实现候选 Profile 派生与冻结校验

  - 实现目标：从 benchmark 基准 Profile 只覆盖 `systemPrompt`、`instructions`，计算规范化哈希和摘要，并提供宿主与 Worker 共用的不变量校验。
  - 成功判据：派生 Profile 保持 `id`、`toolIds` 及全部非 Prompt 字段；非法 Prompt 返回字段级稳定错误；有效 Profile 在 Goal 中冻结候选文本。
  - 验证方式：待实现的 Profile 派生、哈希稳定性、冻结字段和 Worker 重验测试。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [5.1](./requirements.md#req-5-1)_

- [x] //TODO 3. 建立公共 Benchmark 注册与单候选 Runner

  - 实现目标：定义窄 `PromptEvaluationBenchmarkAdapter`、注入式 registry 和顺序任务 runner，隔离公共编排与领域 Manifest、环境及评分逻辑。
  - 成功判据：伪 adapter 的多个任务各自获得独立执行上下文；runner 只聚合 adapter 判定，不解释领域结果；取消后不再启动新任务。
  - 验证方式：待实现的 registry 与 runner 集成测试；`npm run check:dependencies`。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [4.1](./requirements.md#req-4-1), [6.2](./requirements.md#req-6-2)_

- [ ] //TODO 4. 扩展 Attempt 与汇总结果持久化

  - 实现目标：为 `BenchmarkAttemptRecord` 增加可选 Prompt 评测元数据，保持原子校验与读写；实现只基于已提交事实生成并原子提交 `result.json`。
  - 成功判据：Attempt 可读取候选、模型和 Prompt 哈希摘要；中断不损坏已提交记录；汇总明确列出已完成、失败、取消和未完成任务及产物定位器。
  - 验证方式：扩展 `benchmarks/test/attempt-recorder.test.ts`；待实现的汇总原子写入与部分完成测试。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [6.3](./requirements.md#req-6-3)_

- [ ] //TODO 5. 接入 ALFWorld Prompt Evaluation Adapter

  - 实现目标：复用 ALFWorld Manifest、Profile 校验、Supervisor 与评分，将候选 Profile 经 ACP metadata 传入 Worker 并在 Headless Root 创建前重验。
  - 成功判据：同一 Manifest 使用默认 Profile 与候选 Profile 时分别冻结对应 Prompt；领域 `won` 决定 passed/failed；现有 `eval alfworld` 行为不变。
  - 验证方式：待实现的 ALFWorld adapter/Worker 测试；现有 ALFWorld CLI 与 benchmark 回归。
  - _Requirements: [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [3.1](./requirements.md#req-3-1), [3.3](./requirements.md#req-3-3), [4.1](./requirements.md#req-4-1)_

- [ ] //TODO 6. 接入 GAIA Prompt Evaluation Adapter

  - 实现目标：复用 GAIA Manifest、Supervisor 与评分，为 GAIA 基准 Profile 增加候选派生校验和 Worker 注入，不改变领域答案评分。
  - 成功判据：GAIA 与 ALFWorld 消费同一公共 runner 且无横向导入；GAIA 领域评分生成 passed/failed；现有 `eval gaia` 行为不变。
  - 验证方式：待实现的 GAIA adapter/Worker 测试；现有 GAIA CLI 与 benchmark 回归；`npm run check:dependencies`。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.3](./requirements.md#req-3-3), [4.1](./requirements.md#req-4-1), [7.1](./requirements.md#req-7-1)_

- [ ] //TODO 7. 实现 `lazygoal eval prompt` CLI 与事件流

  - 实现目标：增加 CLI 路由、请求装配、NDJSON 进度/终态投影、信号处理和 `0/1/2/130` 退出码映射。
  - 成功判据：领域失败仍以 `0` 返回；基础设施失败、校验失败和取消分别返回约定退出码；事件包含评测/任务/阶段/时间且标记非权威；重复调用不复用旧会话。
  - 验证方式：待实现的 CLI 集成测试，使用伪 registry、模型和隔离环境覆盖全部终态及重复调用。
  - _Requirements: [1.1](./requirements.md#req-1-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.4](./requirements.md#req-6-4)_

- [ ] //TODO 8. 完成回归与显式隔离 smoke

  - 实现目标：补齐公共协议、两种 adapter、状态映射、取消、持久化和兼容性回归，并增加小型 ALFWorld Prompt Evaluation 容器 smoke 入口。
  - 成功判据：默认回归不启动 Docker 或真实模型；现有 TUI、ALFWorld 与 GAIA CLI 语义不变；显式 smoke 完成 CLI 到领域评分及产物回收全链路。
  - 验证方式：`npm test`；`npm run check:dependencies`；从仓库配置发现并执行 TypeScript/benchmark 检查；待实现的显式 Prompt Evaluation smoke 命令。
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2)、[1.3](./requirements.md#req-1-3) | 单候选当前版本请求产生 NDJSON；旧版本、未知字段、坏路径和多候选在副作用前拒绝 | 协议与 CLI 测试；模型/容器调用计数断言 |
| [2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2)、[2.3](./requirements.md#req-2-3)、[2.4](./requirements.md#req-2-4) | 只替换 Prompt，冻结字段不变；无效候选被两层校验拒绝；Goal 保存候选 Profile | Profile 派生、Worker 配置与 Snapshot 断言 |
| [3.1](./requirements.md#req-3-1)、[3.2](./requirements.md#req-3-2)、[3.3](./requirements.md#req-3-3)、[3.4](./requirements.md#req-3-4) | ALFWorld/GAIA 共用 runner，各任务独立且外部无需 ACP；未知 benchmark 被拒绝 | registry/runner 测试；adapter 集成测试；依赖检查 |
| [4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2)、[4.3](./requirements.md#req-4-3)、[4.4](./requirements.md#req-4-4) | 领域判定与执行状态分离；领域失败为有效结果；基础设施失败不产生伪分数；退出码稳定 | 状态投影与 CLI 全终态测试 |
| [5.1](./requirements.md#req-5-1)、[5.2](./requirements.md#req-5-2)、[5.3](./requirements.md#req-5-3)、[5.4](./requirements.md#req-5-4) | Attempt 记录候选元数据；部分中断保留记录；汇总只引用已提交事实并原子落盘 | Attempt codec、部分完成与汇总持久化测试 |
| [6.1](./requirements.md#req-6-1)、[6.2](./requirements.md#req-6-2)、[6.3](./requirements.md#req-6-3)、[6.4](./requirements.md#req-6-4) | 进度有界且非权威；取消停止新任务并保留已提交事实；重复调用创建新执行身份 | 事件、AbortSignal 和重复执行测试 |
| [7.1](./requirements.md#req-7-1)、[7.2](./requirements.md#req-7-2) | 现有入口无回归，默认测试无 Docker、模型或供应商凭据 | `npm test`；依赖和 TypeScript 检查；现有 CLI 测试 |
| [7.3](./requirements.md#req-7-3) | 小型 ALFWorld Manifest 走通 CLI、隔离环境、ACP、LLM RPC、领域评分与产物回收 | 显式 Prompt Evaluation 容器 smoke（待实现） |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。
