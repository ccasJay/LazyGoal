# 按需暴露工具 Schema 实施计划

- [x] //TODO 1. 实现工具发现协议与可恢复的 Run 发现状态

  - 实现目标：增加 `system_find_tools` 与 `tool_discovery` 协议；Runtime 按已批准 Design 的确定性规则查询 Profile/Registry 交集，合并 `exposedToolIds` 并计入 Run Step；将该字段写入当前 Snapshot 严格 Schema 与 Codec。
  - 成功判据：合法查询只返回授权且已注册工具、最多 5 项并按规则排序；零命中成功返回空列表；新 Run 集合为空，Snapshot 往返和恢复保留已发现集合；发现决策推进 Step 且遵守 `maxSteps`。
  - 验证方式：待实现/扩展 `system-tools.test.ts`、`model-output-canonical.test.ts`、`runner.test.ts`、`goal-snapshot-current.test.ts`；运行 `npx tsx --test packages/contracts/test/system-tools.test.ts packages/contracts/test/model-output-canonical.test.ts packages/runtime/test/runner.test.ts packages/storage/test/goal-snapshot-current.test.ts`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [x] //TODO 2. 统一模型可见 Schema 与直接调用和 PTC 执行边界

  - 实现目标：把已暴露集合传入 Agent；让 Prompt、Wire Contract、原生 Tool declarations 与 `execute_program` 子工具只使用相同集合；Runner 在直接 Tool Action 执行前校验可见性，并保留既有 Profile、Registry、Policy、审批和沙箱检查。
  - 成功判据：初始请求只含发现系统工具而无业务 Schema；发现后下一请求的 Prompt 与模型 Schema 只包含累计匹配集合；Think 不含发现工具；直接伪造未暴露调用及 PTC 越界子调用均在副作用前拒绝，获暴露工具仍经过既有授权流程。
  - 验证方式：待实现/扩展 `prompt.test.ts`、`llm-step-executor.test.ts`、`runner.test.ts` 与 `program-execution.test.ts`；加入确定性 Agent/Runtime 组合测试并用 `js-tiktoken` 对比全量与按需请求输入；运行相关测试后执行 `npm test`。
  - _Requirements: [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [4.3](./requirements.md#req-4-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#审批摘要)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) | 发现查询只返回当前 Profile 授权且已注册的工具 ID 与描述。 | Contracts 与 Runtime 搜索测试（待实现/扩展）。 |
| [1.2](./requirements.md#req-1-2) | 超过上限时至多返回 5 项且排序稳定；无匹配时返回成功空列表。 | Runtime 目录匹配边界测试（待实现）。 |
| [1.3](./requirements.md#req-1-3) | 发现只出现在 Decide；Think 和 PTC 不暴露发现控制。 | Agent Decide/Think 声明及 PTC 集成测试（待实现/扩展）。 |
| [2.1](./requirements.md#req-2-1) | 一次发现后下一次模型请求出现匹配工具完整 Schema。 | Runner + Agent 组合测试（待实现）。 |
| [2.2](./requirements.md#req-2-2) | 多次查询的匹配集合累积，未匹配工具始终没有 Schema。 | 多轮发现 Prompt/Schema 投影测试（待实现）。 |
| [2.3](./requirements.md#req-2-3) | Prompt 描述、Wire Contract 与原生 Tool 声明 ID 集合完全一致。 | Agent 请求构造断言（待实现/扩展）。 |
| [3.1](./requirements.md#req-3-1) | 直接调用未暴露或未注册工具时，工具执行 spy 未触发。 | Runner 真实授权入口测试（待实现/扩展）。 |
| [3.2](./requirements.md#req-3-2) | PTC 只能调用暴露集合内的工具，子调用仍经过既有检查。 | `program-execution.test.ts` 越界子调用测试（待实现/扩展）。 |
| [3.3](./requirements.md#req-3-3) | 暴露工具不会绕过 Policy、审批或沙箱检查。 | Runner 已有授权回归与新增集成测试。 |
| [4.1](./requirements.md#req-4-1) | Snapshot 保存并恢复同一 Run 的可见集合。 | Snapshot Codec 与恢复测试（待实现/扩展）。 |
| [4.2](./requirements.md#req-4-2) | 新 Run 从空集合开始，不继承其他 Run 暴露的 Schema。 | Run 创建与多 Run 隔离测试（待实现）。 |
| [4.3](./requirements.md#req-4-3) | 不再授权或未注册的已保存 ID 不进入模型 Schema，也不能执行。 | 恢复后 Profile/Registry 变化测试（待实现）。 |
| 高风险授权边界 | 未暴露直接调用及 PTC 子调用在任何工具副作用前被拒绝；授权工具仍遵守现有审批和沙箱策略。 | Runtime + Registry + Policy 的确定性组合测试及完整 `npm test`。 |
| Token 效果 | 初始请求不带业务 Schema；发现后只携带累计集合，输入 token 少于同目录全量 Schema 请求。 | 相同请求上下文使用 `js-tiktoken` 统计模型输入；记录可复现的比较断言。 |
| 兼容性与文档契约 | 当前 Snapshot 格式包含必需的暴露数组；缺字段严格失败；新增/扩展公共 TypeScript 契约具有中文 TSDoc 与示例。 | Snapshot 严格解析测试、TypeScript 类型检查及 `npm test`。 |

### Latest Result

| 验收范围 | 结果与证据 |
|---|---|
| 工具发现协议与 Run 恢复状态 | `system_find_tools` 查询已实现；发现集合按稳定相关度排序、最多 5 项并累计写入 Run/Snapshot。Contracts、Runtime 与 Snapshot 定向测试通过。 |
| Decide Schema 按需暴露 | Prompt、Wire Contract 与原生 Tool 声明共享当前发现集合；初始请求只暴露发现控制，Think 不暴露发现控制或结果。定向 Agent/Runtime 测试通过。 |
| 直接调用与 PTC 执行边界 | 未暴露直接 Action 和 PTC 子调用在 Registry 副作用前拒绝；获暴露工具仍受 Profile、Registry、Policy、审批及沙箱检查。Runtime + PTC 测试通过。 |
| Token 效果 | Agent 组合测试以 `js-tiktoken` 确认按需请求输入少于同 Profile 全量 Schema 请求。 |
| 架构文档与兼容性 | 更新 Agent、Contracts、Runtime、Storage 当前架构文档；当前 Snapshot 要求 `exposedToolIds` 且严格拒绝缺失字段。 |
| 全量回归 | `npm test`：1,734 TypeScript 测试与 14 个维护脚本测试全部通过；`git diff --check` 通过。 |
| 整体状态 | `passed/current`；2026-10-04；验证时工作树包含本 Spec 的未提交改动。 |
