# 统一 JSON 基础类型执行计划

范围、风险及停止条件以已批准的 [Spec](./spec.md) 为准。盘点成果位于 `codex/contract-inventory` 的 `676015c6`；实施前以当前源码和消费链复核，不能将盘点快照直接视为等价证明。

## 任务清单

- [ ] //TODO 1. 核对 JSON 类型候选与边界语义
  - 落实标准：[1.0](./spec.md#spec-req-1-0)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)。
  - 实施目标与场景：逐项核对 Spec 表中声明、实际消费者及模型 AST、Web、Runtime、Snapshot 的校验和复制入口；记录静态可赋值性、用途与差异的源码和测试依据于下方核对记录。确认共享类型不会改变各边界行为；如发现不满足该条件，停止相关替换并报告，不勾选为通过。
  - 基本验证：用类型检查探针核对各现有 JSON 值类型的双向赋值、嵌套只读值及非 JSON 类型拒绝；抽查每个边界的实际校验和消费入口与记录一致。

- [ ] //TODO 2. 将已确认可共享的 JSON 类型迁入独立基础模块
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6)。
  - 实施目标与场景：建立无 AST 依赖的类型模块；将五处声明切换为同源引用，保留各公开名称和导出路径，删除重复递归结构。同步必要依赖规则、根导航与所属模块文档，保持各校验、Schema、Codec 与消费者行为不变。
  - 基本验证：运行类型检查和 `npm run check:dependencies`；确认各公开名称可双向赋值，AST 及各边界检查仍使用原路径，且基础模块无运行时依赖。

## 核对记录

未执行；实施时记录每项来源、可赋值性、用途、校验及复制差异和结论。若存在不兼容项，记录具体证据并按 [1.0](./spec.md#spec-req-1-0) 停止替换。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
| --- | --- | --- | --- |
| 候选与静态类型 | [1.0](./spec.md#spec-req-1-0)、[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3) | 每个候选的来源、用途、验证差异和共享结论可追溯；各公开名称的嵌套值和只读结构双向可赋值，函数、`undefined`、`bigint` 不可赋值，仅有一个递归结构来源。 | 核对记录与真实调用链；运行纳入常规类型检查的正反例及 `npm test` 类型检查；扫描 Spec 所列定义和公开导出。 |
| 运行时与恢复 | [1.4](./spec.md#spec-req-1-4)、[1.6](./spec.md#spec-req-1-6) | Web JSON 读取、模型 AST、Runtime Tool 输入输出、Snapshot Schema 与 Codec 的合法、非法和复制场景保持原结果；持久化往返及恢复通过。 | 检查现有相关测试是否覆盖这些场景并执行；运行完整确定性回归 `npm test`，核对最终差异没有替换边界校验。 |
| 依赖、文档和交付范围 | [1.1](./spec.md#spec-req-1-1)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6) | 新模块只提供类型，无出站运行时依赖；依赖图和文档准确反映新所有者；原有 Schema、协议和执行行为不变。 | 运行 `npm run check:dependencies`、`npm run check:docs`、`git diff --check`，检查最终 Git diff 与生成制品一致性。 |

### Latest Result

- 状态：未执行。
- 验证时间：-
- 验证摘要：尚未核对候选或执行功能验证。
