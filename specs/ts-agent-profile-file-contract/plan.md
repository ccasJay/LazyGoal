# AgentProfile 文件契约迁移执行计划

范围与风险以已批准的 [Spec](./spec.md) 为准；基于已合入的 `@lazygoal/contract-binding`，与其他迁移线独立开发并在集成时协调 Catalog 和生成器变更。

## 任务清单

- [x] //TODO 1. 从 TS 类型生成严格的 AgentProfile 文件绑定
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.5](./spec.md#spec-req-1-5)。
  - 实施目标与场景：登记文件契约并生成 Schema、Reader、Manifest 和绑定；字段、版本及非空字符串约束以 TS 为权威来源。针对数组元素非空，只扩展所需生成能力：空数组允许，含空字符串的数组失败；无效或不生效的约束使生成失败。
  - 基本验证：运行生成检查和绑定定向测试，验证空数组、空元素、额外字段及版本错误；确认约束源变化使生成结果和接受规则相应变化。

- [x] //TODO 2. 让真实 AgentProfile 文件读取使用生成绑定
  - 落实标准：[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)。
  - 实施目标与场景：`JsonFileAgentProfileStore.load` 以 `reject` 读取生成绑定，映射安全且可定位的问题，保留文件路径、ID 校验、错误码和 Runtime Profile 映射；清除无其他生产消费者的旧 Schema 及导出，不保留双读。同步 Catalog 旧声明处置和所属模块文档。
  - 基本验证：运行 `npx tsx --test packages/storage/test/agent-profile-store.test.ts`，核对合法文件、额外字段和文件 ID 不匹配的实际结果。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
| --- | --- | --- | --- |
| TS 单源与生成 | [1.1](./spec.md#spec-req-1-1)、[1.5](./spec.md#spec-req-1-5) | 版本、字段及标量和数组元素的非空约束由 TS 生成；修改临时源导致制品及行为变化，错误或失效注解、缺失制品和漂移使检查失败；生产代码无第二份字段表。 | Catalog/生成器定向测试、`npm run contracts:generate -- --check`、旧 Schema 消费者扫描；对照 Manifest 与来源。 |
| 严格读取及文件行为 | [1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4) | 空数组合法；空元素、空字段、缺字段、错类型、错误版本、额外字段失败。成功结果独立且输入不变；文件不存在、非法 JSON、不安全路径和 ID 不匹配保持约定结果。错误保留稳定码、ID、路径与安全字段问题，不包含字段值或正文。 | 生成绑定测试与真实临时文件测试；`npx tsx --test packages/storage/test/agent-profile-store.test.ts`，核对生产加载入口和错误内容。 |
| 集成与回归 | [1.3](./spec.md#spec-req-1-3)、[1.5](./spec.md#spec-req-1-5) | 真实读取后 Runtime Profile 映射及既有 Goal Snapshot 测试保持通过；生成制品干净检出可用，最终差异不包含其他文件协议或旧 Schema 回退。 | 干净检出按 CI 安装依赖后不预生成执行目标测试及生成检查；`npm test`、`npm run check:docs`、`npm run check:dependencies`、`git diff --check`。 |

### Latest Result

- 状态：passed
- 新鲜度：current
- 验证时间：2026-10-31 14:13 CST
- 被测提交：`7e9ece83`（TODO 1 `61222b85`、TODO 2 `20254ca2`、Catalog 元数据与说明修正 `7e9ece83`）；本记录只更新 `plan.md`。
- 范围与隔离：在 `.worktrees/ts-agent-profile-file-contract` 独立 worktree 执行；该 worktree 从基线 `8bfb4cef` 新建且无既有 `node_modules`，按 CI 对根目录及存在的 `packages/*`、`apps/*`、`benchmarks` lockfile 执行 `npm ci`。最终验证未先执行 `--write`。未合并 `dev`、未修改 `specs/orchestration.md`、未写 `project-memory/`。
- [1.1/1.5] TS 单源与生成：`npm run contracts:generate -- --check` -> `Contract artifacts are current.`；`node --test scripts/contract-catalog.test.mjs` -> 5/5 pass。`agent-profile-file-manifest.json` 记录 `storage.agent-profile.file` v1，来源为 `NonEmptyString,AgentProfileFile`；生成 Schema 中 `NonEmptyString` 为 `type: string` + `minLength: 1`，四个标量字段与两个数组的 `items` 均引用 `#/definitions/NonEmptyString`。生成器临时源漂移与缺失制品测试（scripts 测试段）通过；`grep -rn AgentProfileFileSchema --include="*.ts" packages apps benchmarks scripts bin` 无生产或脚本消费者；Catalog 将旧 `NonEmptyStringSchema` 与 `AgentProfileFileSchema` 标记为 `deleted` 并记录处置。
- [1.2/1.3/1.4] 严格读取与错误：`npx tsx --test packages/storage/test/agent-profile-store.test.ts packages/storage/test/agent-profile-file-binding.test.ts` -> 10/10 pass。真实临时文件覆盖合法文件、空数组、空标量、空数组元素、未知字段、错误版本、缺失字段、错误类型、非法 JSON、文件 ID 不匹配、缺失文件和不安全 ID。`JsonFileAgentProfileStore.load` 使用 `agentProfileFileBinding.read(parsed, "reject")`；文件缺失仍返回 `undefined`；不安全路径、非法 JSON、生成绑定拒绝和 ID 不一致仍抛 `AgentProfileConfigurationError`（`INVALID_AGENT_PROFILE`）。错误保留 Profile ID、文件路径与有界 `path`/`code` 问题，不含字段值或正文；非法 JSON 不再保留可能回显正文的解析异常。空数组继续接受，成功结果与输入隔离。
- [1.3/1.5] 集成与回归：`npm test` -> 全部通过（GEPA adapter 通过；TS `2748` pass / `0` fail、suites `19`；scripts `98` pass / `0` fail；含生成检查、`tsc --noEmit`、文档、依赖与完整测试段）。单独复核：`npm run check:docs` -> 47 个模块、171 份当前说明；`npm run check:dependencies` -> 481 个源文件；`git diff --check` -> 无输出。真实读取后的 Runtime Profile 映射与既有 Goal Snapshot 持久化测试通过；生成制品已提交，`--check` 不依赖预生成或未提交文件。
- 未解决问题：无。Goal Snapshot、其他 Storage 契约和 Runtime Profile 未迁移，属于本 Spec 明确范围外。
- 证据入口：`packages/storage/test/agent-profile-file-binding.test.ts`、`packages/storage/test/agent-profile-store.test.ts`、`packages/storage/src/generated/agent-profile-file-*`、`scripts/contract-catalog.test.mjs`。
