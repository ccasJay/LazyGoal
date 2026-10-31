# 构建期契约 Catalog 执行计划

范围和风险以已批准的 [Spec](./spec.md) 为准。实施前从 `codex/contract-inventory` 的 `676015c6` 读取盘点，按执行分支的实际源码复核；盘点尚未合入时，不依赖其 worktree 路径作为构建输入。

## 任务清单

- [x] //TODO 1. 建立覆盖盘点的可查询 Catalog
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)。
  - 实施目标与场景：登记三个分册的具名声明及 Schema，保存来源、引用关系、用途和真实能力；为源码变化或已删除项记录处置。查询模型动态组合、Web AST 和 Snapshot Schema 时，可分别定位入口，且不会声称存在未生成的制品。
  - 基本验证：核对盘点与登记的逐项对应及差异记录；抽查上述三个边界，并验证内部键唯一和登记数据可被构建读取。

- [x] //TODO 2. 通过 Catalog 生成模型列表响应制品与薄 Reader
  - 落实标准：[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6)。
  - 实施目标与场景：统一生成入口读取启用项，生成 Schema、校验器、Manifest 和绑定共享读取逻辑的薄 Reader；真实浏览器 API 消费它。遇到不支持的结构、注解或无效登记时失败，合法响应和额外字段处理保持现有行为。
  - 基本验证：执行生成和只读检查；用模型列表合法及非法样本验证 Reader，构造重复身份、冲突路径和不支持项确认失败。

- [x] //TODO 3. 完成 Catalog 一致性及端到端验收接入
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6)、[1.7](./spec.md#spec-req-1-7)。
  - 实施目标与场景：让常规回归检查完整 Catalog 与生成漂移；补齐必要的生成失败、真实消费及文档证据。修改临时契约约束或制品后检查失败，恢复生成后通过，且检查过程不修改文件。
  - 基本验证：运行生成相关定向测试和 `npm run contracts:generate -- --check`，确认制品可重复生成并接入现有回归。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
| --- | --- | --- | --- |
| 全量登记与现状 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.7](./spec.md#spec-req-1-7) | 每项盘点与登记或已删除处置有对应；来源、归属、消费者、身份及能力准确；动态组合不冒充静态制品。 | 全量对应核对记录与源码复核；抽查 Web、模型、工具、Snapshot 及动态工厂。 |
| 生成与失败 | [1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[1.7](./spec.md#spec-req-1-7) | 检查重复内部键、对外身份/版本、制品路径、缺失来源、无效登记、不支持结构与注解均失败；相同输入生成一致，缺失或变更制品导致检查失败且不写文件。Manifest 与类型来源和工具版本一致。 | 生成器定向测试及隔离临时样本；`npm run contracts:generate -- --check`，比较检查前后文件状态。 |
| Reader 与真实消费 | [1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6)、[1.7](./spec.md#spec-req-1-7) | 合法、无效、非 JSON 与嵌套额外字段保持现有结果；输入不变、输出隔离，诊断有界且无值；真实浏览器 API 使用生成入口，HTTP 错误及取消行为保持。 | 现有 Reader/API 定向测试；`node --test --test-concurrency=1 apps/goal-board/e2e/provider-models-contract.test.mjs`，真实浏览器不可用须记录阻塞。 |
| 干净检出与完整回归 | [1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[1.7](./spec.md#spec-req-1-7) | 干净检出按 CI 安装依赖后不预生成即可消费已提交制品和构建 Web；全量回归及依赖、文档检查通过。 | 在目标提交的临时检出运行相关测试与 `npm run build:web`；执行 `npm test`、`npm run check:docs`、`npm run check:dependencies`、`git diff --check`。 |

### Latest Result

- 状态：passed
- 新鲜度：current
- 验证时间：2026-10-31 08:51:34 +0800
- 测试提交：`83bae30208be42d9afee5f4f1917a54d7593b79e`
- 工作树：`.worktrees/contract-catalog`；验证时仅有本地 `.execution-progress.md` 未提交。随后只更新本报告，不改变被测代码。
- 契约修订：盘点基线 `8da11ece`，盘点分册提交 `676015c6`；`contracts/catalog.json` SHA-256 `1a059535a9e190f0e2eb1754565c542c7a77ace5f377568e9aded99a3a96a779`。
- 验证摘要：

| 验收项 | 结果 | 实际检查与证据 |
| --- | --- | --- |
| 全量登记与现状 | passed | Catalog 登记 882 项（Web 286、模型与工具 308、持久化与跨进程 288）；查询可定位 Web AST、模型动态组合、Tool 输入、Snapshot Schema 与边界入口；无已删除声明，两个 Reader 辅助类型记录为 `moved`。`node --test scripts/contract-catalog.test.mjs` 5 项通过。 |
| 生成与失败 | passed | `node --test scripts/provider-models-contract-generation.test.mjs` 4 项通过，覆盖重复生成、制品漂移/缺失、重复内部键、重复身份与版本、重复制品路径、缺失来源、无效登记、错误注解和不支持结构。`npm run contracts:generate -- --check` 返回 current；`--check` 前后全部生成制品 SHA-256 完全一致，确认无写入。 |
| Reader 与真实消费 | passed | `npx tsx --test packages/web-contracts/test/provider-models.test.ts` 6 项通过，覆盖接受、拒绝、深复制、未知字段剥离、非 JSON 值、原型键与有界诊断。真实 Chrome 本地假 API 端到端测试通过，覆盖成功、无效字段、HTTP 错误与取消；`npm run build:web` 通过。 |
| 干净检出与完整回归 | passed | 在提交 `83bae302` 的临时检出按 CI 安装根与各包依赖，未预生成即通过 `npm run contracts:generate -- --check`、目标测试、真实浏览器测试与 `npm run build:web`；该检出执行 `npm test` 98 项全部通过，`npm run check:docs`（46 个模块、166 份说明）、`npm run check:dependencies`（314 个源文件）与 `git diff --check` 均通过。 |

- 未解决项：无。Web 构建保留既有 chunk size 警告，不影响退出码或产物消费。
