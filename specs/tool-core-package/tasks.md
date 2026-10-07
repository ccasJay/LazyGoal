# Tool Core 拆包任务

实施前置与风险见 [Design 风险与待确认](./design.md#风险与待确认)。先只读确认独立 execution-control 已就绪；缺失时报告前置未满足，不在本任务中实现取消拆分。

按编号实施，每步保持现有调用链可用。迁出后仅保留新包中的一份实现；既有 Runtime 导出可在迁移过程中指向它，TODO 3 完成剩余调用方迁移后删除这些转发。

- [x] //TODO 1. 建立可独立使用的 Tool Core 注册与调用能力

  - 实现目标：迁移通用类型、Registry、注册器及暂时故障类，解除 JSON、Observation、输入诊断和取消协议对 Runtime 的引用；接入既有定义与结果表示，建立新包测试和依赖检查。
  - 成功判据：通过公开入口即可注册、查找、准备并调用 fake Tool；非法注册和输入保持现有失败结果，准备不产生工具副作用，canonical 输入只解析一次并被后续闭包复用，调用／流／取消与故障字段保持一致。
  - 验证方式：`npx tsx --test packages/tool-core/test/*.test.ts`（待创建）；`npx tsc --noEmit`、`npm run check:dependencies`、`node --test scripts/check-dependencies.test.mjs`，Core 导入 Runtime 的负向用例待实现。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4)_

- [x] //TODO 2. 接入 Runtime 授权调度与 Action 恢复

  - 实现目标：Runtime 的 Runner、Policy、授权过滤、StepExecutor 与程序注册直接使用 Core；保留现有身份注入、输入重新准备、沙箱派生、重试和持久化流程，并补齐具体集成覆盖缺口。
  - 成功判据：未授权、旧身份或输入失败不执行工具；批准后同一 Action 重新准备，可信 context/plan 与既有结果正确传递；safe/manual、暂时故障、不确定结果等待和程序子调用保持原控制结果。
  - 验证方式：`npx tsx --test packages/runtime/test/runner.test.ts packages/runtime/test/execution-control.test.ts packages/runtime/test/tool-grant.test.ts packages/runtime/test/sandbox-plan-recovery.test.ts packages/runtime/test/program-execution.test.ts packages/storage/test/action-observation-recovery.test.ts`；`npx tsc --noEmit`，保留原测试覆盖并补充缺失断言。
  - _Requirements: [1.3](./requirements.md#req-1-3), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [3.1](./requirements.md#req-3-1), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4)_

- [ ] //TODO 3. 迁移外部调用方并完成唯一公开入口

  - 实现目标：迁移具体 Tools、Agent、组合根、Benchmark、测试与 smoke 的剩余 Core 导入，移除 Runtime 的旧转发；保持模型投影、远程工具协议及默认装配，并完成入口与 Schema 回归。
  - 成功判据：迁出符号只从新包取得，调用方无旧导入且无重复定义；相同授权目录生成相同 Tool 描述和 Schema，远程请求／结果与真实工具适配仍保持既有结构与调用次数。
  - 验证方式：`npx tsx --test packages/agent/test/model-inference-projector.test.ts packages/agent/test/model-output.test.ts packages/tools/test/read-file.test.ts packages/tools/test/web-fetch.test.ts benchmarks/test/remote-tool-registry.test.ts benchmarks/test/tool-rpc.test.ts`；导入／导出检查、`npx tsc --noEmit`、`npm run check:dependencies`，随后执行 Feature Verification。
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [4.1](./requirements.md#req-4-1), [4.4](./requirements.md#req-4-4)_

## Feature Verification

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
| --- | --- | --- |
| 实施前置 | 独立 execution-control 提供所需接口与唯一中止错误定义；Runtime 已可引用同一协议。 | 只读核对其公开入口和 Runtime 引用；缺失时不得把取消实现复制进 Core。 |
| [1.1](./requirements.md#req-1-1) | 无 Goal/Runner/Store 即可通过 Core 公开入口完成注册、准备与一次调用。 | 新包独立 fake Tool 测试（待实现）。 |
| [1.2](./requirements.md#req-1-2) | Core 无 Runtime 导入，实际和人为构造的反向依赖均被检查拒绝。 | 依赖检查与 `scripts/check-dependencies.test.mjs` 负向用例（待实现）。 |
| [1.3](./requirements.md#req-1-3) | Tool 实现、Runtime、Agent 与远程 Registry 使用同一组定义，字段一致。 | 类型检查、公开导出检查与跨包集成测试。 |
| [2.1](./requirements.md#req-2-1) | 非法 Contract、空 ID 与重复 ID 保持现有拒绝结果，未调用工具。 | 新包注册与 Registry 测试（待实现）。 |
| [2.2](./requirements.md#req-2-2) | 结构解析后才执行语义校验，合法输入无隐式转换，每次 prepare 只解析一次。 | 新包准备测试与 Runner 现有单次准备测试；核对解析调用点。 |
| [2.3](./requirements.md#req-2-3) | 结构或语义输入失败得到稳定诊断，工具与业务沙箱操作均未启动。 | 新包失败路径测试与 Runner 执行次数断言。 |
| [2.4](./requirements.md#req-2-4) | 派生与执行共享 canonical 输入；批准或恢复后重新准备原 Action。 | 输入隔离／复用测试、Runner 批准后重新准备与 Storage 恢复测试。 |
| [3.1](./requirements.md#req-3-1) | Action/context/plan 原样按现有规则传递，成功与领域失败结果结构一致。 | 新包调用测试、Runner 与远程 Registry/RPC 集成测试。 |
| [3.2](./requirements.md#req-3-2) | 一次流式入口只启动一次工具调用，保持分片与最终结算；失败不追加 execute 或隐式重试。 | 新包 fake stream 测试与 Tools/Runtime 流式回归。 |
| [3.3](./requirements.md#req-3-3) | 各准备和执行边界传递中止，不产生普通失败 Observation；错误来自同一共享定义。 | Core 与 Runtime 取消测试，Tool 调用次数及错误身份断言。 |
| [3.4](./requirements.md#req-3-4) | 暂时故障字段与普通异常传播一致；未知错误或 retryable 结果不取得额外重试资格。 | Core 故障测试、Runner 现有重试／非重试场景。 |
| [4.1](./requirements.md#req-4-1) | 原有 Profile、可见集合、Policy、Grant 和沙箱约束均生效，Schema 暴露不授予执行权。 | Runtime 工具发现、授权、沙箱测试与 Agent Projector 测试。 |
| [4.2](./requirements.md#req-4-2) | 直接调用和程序子调用仍由 Runtime 注入身份并授权，Core 不控制 Goal/Run 或审批。 | Runner、程序执行与程序中断测试。 |
| [4.3](./requirements.md#req-4-3) | safe 仅在有效批准下重放，manual 不确定结果仍等待人工处理，尝试记录保持一致。 | Runner 重试与 Storage Action/Observation 恢复回归。 |
| [4.4](./requirements.md#req-4-4) | Tool 描述、模型 Schema、Action/Observation 与 Snapshot 编码保持既有内容。 | Agent/Contracts 输出测试、Storage 恢复测试及编解码改动核对。 |
| 完整调用链 | 原有工具经过发现、准备、授权、批准／恢复、执行和 Observation 提交后产生一致结果；失败不提前产生副作用。 | 受影响集成测试后执行 `npm test`；前置或必需测试缺失不算通过。 |
| 仓库文档约束 | 布局、当前架构职责、新包接口 TSDoc 与实际依赖一致。 | 按 Design 同步布局与相关架构说明，检查示例、链接和 `git diff --check`。 |

新增 Core 测试入口均待实现；既有测试通过 `npx tsx --test <测试入口>` 运行。验证只使用确定性 fixture、fake Tool 或本地测试服务。

### Latest Result

未执行。实施后记录逐项实际结果、证据、整体状态与时效、验证时间、被测提交或未提交改动，以及对应的需求与设计版本。
