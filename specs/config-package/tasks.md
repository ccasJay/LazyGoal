# Config 拆包实施任务

- [x] //TODO 1. 将 Home 与 workspace 路径能力迁入配置包

  - 实现目标：建立 `@lazygoal/config` 公开入口，迁移 Home 路径、workspace 身份、manifest 与权限函数；将路径调用方改为新入口并删除 `llm` 的旧实现，登记配置包零 LazyGoal 出站依赖。
  - 成功判据：默认与绝对覆盖路径、`realpath` 身份和既有目录位置不变；纯解析不写盘，manifest 损坏或身份不匹配时拒绝使用，创建与权限修正仍发生在原调用时机。
  - 验证方式：迁移 `packages/llm/test/xdg.test.ts` 至配置包并运行路径测试；运行 `benchmarks/test/default-paths.test.ts`、`apps/goal-server/test/cli-xdg.integration.test.ts` 和 `npm run check:dependencies`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [4.4](./requirements.md#req-4-4)_

- [x] //TODO 2. 将显式环境模型配置与输出模式迁入配置包

  - 实现目标：迁移唯一的 `LLMConfig`、`LLMProvider`、`LLMConfigurationError`、`readLLMConfig` 与 `StructuredOutputMode` 定义；改接 Adapter、工厂、目录、Agent 与直接使用者，并移除旧定义或转发。
  - 成功判据：相同环境变量仍产生相同供应商、端点及输出模式；非法凭据、供应商、模式或端点仍按原时机失败，稳定错误码、`missing` 和诊断不变，仅已批准的错误类 `name` 使用新拼写；`llm` 单向依赖 `config`。
  - 验证方式：迁移 `packages/llm/test/config.test.ts` 并运行模型配置、Adapter 工厂及模型目录相关测试；运行 `npx tsc --noEmit` 与 `npm run check:dependencies`。
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [4.1](./requirements.md#req-4-1)_

- [x] //TODO 3. 将常规 TOML/Profile 与运行配置加载迁入配置包

  - 实现目标：迁移 TOML/Profile 解析和四层 `loadRuntimeConfig`，将 Goal Server、Benchmark 与 Prompt Evaluation 的常规配置入口接至配置包；移除对应旧实现并更新直接依赖规则。
  - 成功判据：相同文件、Profile 与 CLI 覆盖产生相同配置且不回写；非法输入保持既有校验、错误定位和失败时机；Goal Server 与 Benchmark 继续按原配置装配同一模型与工作区。
  - 验证方式：迁移 `packages/llm/test/toml-config.test.ts`、`config-loader.test.ts` 中的常规配置用例，运行相关 Goal Server 与 Benchmark 入口测试、`npx tsc --noEmit` 和 `npm run check:dependencies`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.3](./requirements.md#req-1-3), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.4](./requirements.md#req-3-4), [4.1](./requirements.md#req-4-1), [4.4](./requirements.md#req-4-4)_

- [ ] //TODO 4. 将 GEPA Working/Reflection 配置加载迁入配置包

  - 实现目标：迁移双模型和 Reflection 配置加载入口，改接 Prompt Evaluation 模型桥；删除 `llm` 残余配置加载实现及公开转发，并收敛配置包公开入口和依赖守卫。
  - 成功判据：Working LM 固定读取 `profiles/default.toml`，Reflection LM 读取独立 Profile 且为 `prompt_only`；缺失、同名或非法 Reflection Profile 在模型调用前失败，不回退或共用凭据；生产配置定义和加载入口仅存在于配置包。
  - 验证方式：迁移 `packages/llm/test/two-stage-config.test.ts` 中适用的配置用例并运行 `benchmarks/test/prompt-evaluation/{model-bridge,reflection-bridge,reflection-bridge-adversarial,profile}.test.ts`、`npx tsc --noEmit` 与 `npm run check:dependencies`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [3.1](./requirements.md#req-3-1), [3.4](./requirements.md#req-3-4), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
| --- | --- | --- |
| [1.1](./requirements.md#req-1-1), [1.3](./requirements.md#req-1-3) | 路径与配置调用方均从配置包导入，旧实现和公开转发不存在 | 公开入口、生产导入和源码搜索；`npm run check:dependencies` |
| [1.2](./requirements.md#req-1-2) | Adapter 与模型目录使用同一配置类型，配置包无 LazyGoal 出站依赖或循环 | `npx tsc --noEmit`、`npm run check:dependencies`、Adapter/目录测试 |
| [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2) | 默认 Home、绝对覆盖、忽略 XDG、`realpath` 身份和纯解析行为与既有路径夹具相同 | 迁移后的 Home 测试、Benchmark 默认路径测试 |
| [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4) | manifest 原子创建并拒绝损坏或身份不匹配；目录权限和 Goal/Trajectory/Trace/指标/Benchmark/GEPA/缓存位置不变 | Home 测试、Goal Server CLI 集成测试和路径夹具核对；无数据迁移操作 |
| [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2) | TOML/Profile 各小节、字段和四层覆盖结果不变，CLI 覆盖不回写 | 迁移后的 TOML 与运行配置测试，含文件内容前后比较 |
| [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4) | 环境模型配置可被同一工厂消费；非法配置保留失败时机、稳定错误码和关键诊断，错误类 `name` 使用新拼写 | 迁移后的模型配置与加载失败路径测试、Goal Server 入口测试 |
| [4.1](./requirements.md#req-4-1) | Goal Server、Benchmark、Prompt Evaluation 选择同一供应商、模型、端点和模式；请求、取消及故障处理不变 | fake Adapter/本地夹具的组合入口测试、受影响包测试，不调用真实供应商 |
| [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3) | Working/Reflection 使用独立 Profile 与凭据；缺失、同名或非法 Reflection 配置在模型调用前失败 | GEPA 模型桥、Reflection 桥与对抗测试 |
| [4.4](./requirements.md#req-4-4) | CLI 参数、配置与 manifest 格式、Goal Snapshot 等运行数据格式未改变 | 现有入口/存储回归测试及变更审查 |
| 整体集成与架构同步 | 新包职责与单向依赖已体现在仓库布局和当前架构文档；受影响代码与全仓回归通过 | 检查 `AGENTS.md`、`docs/architecture/README.md`、`docs/architecture/llm.md`、配置包架构说明；执行 `npm test` |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。
