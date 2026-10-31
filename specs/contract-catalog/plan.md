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

- [ ] //TODO 3. 完成 Catalog 一致性及端到端验收接入
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

- 状态：未执行
- 验证时间：-
- 验证摘要：尚未开始执行。
