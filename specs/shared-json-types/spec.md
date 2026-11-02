---
status: proposed
created_at: 2026-10-31
supersedes: []
superseded_by: null
---

# 统一 JSON 基础类型 Spec

## 目标与范围

以契约清单中“通用 JSON 递归值”候选为范围，先核对各声明及消费者的静态形状与语义；确认可共享后，收敛到不依赖 Contract AST 的独立基础模块。本步只统一静态类型，不合并各边界的校验、转换或执行语义。

## 需求与验收标准

- <a id="spec-req-1-0"></a>**1.0 先核对候选**：当实施本步时，应当逐项对照下表的声明、实际消费者及边界校验，记录类型可赋值性、领域含义和验证差异。若发现任一类型无法在保留现有静态行为与边界语义下共享，应当停止该替换，报告证据并修订 Spec；不得仅凭结构相似强行合并。

- <a id="spec-req-1-1"></a>**1.1 唯一声明**：当维护 JSON 基础类型时，独立模块应当唯一声明 `JsonScalar`、只读递归 `JsonValue` 与 `JsonObject`：值由 `null`、布尔、数字、字符串、只读数组和只读字符串键对象组成。模块不依赖 AST、Runtime 或运行时校验库。
- <a id="spec-req-1-2"></a>**1.2 消除重复**：当类型被 contracts、Runtime、model-view、Storage 和 web-contracts 使用时，应当引用上述声明，不再各自定义递归结构。保留现有公开的 `JsonValue`、`JsonObject`、`ModelJsonValue`、`SnapshotJsonValue` 和 `BrowserJsonValue` 名称及导出路径作为同源类型引用；不保留第二份结构定义。
- <a id="spec-req-1-3"></a>**1.3 静态行为**：当编译现有消费者时，嵌套标量、只读数组与对象应保持可赋值；函数、`undefined`、`bigint` 不属于该类型。不同领域名称之间的 JSON 值可相互赋值；TypeScript 的 `number` 不承诺有限数，运行时规则仍由各边界负责。
- <a id="spec-req-1-4"></a>**1.4 保持边界**：当现有边界处理 JSON 时，Web 的 `isJsonValue`、Runtime 检查、模型 `JsonValueContract`、Snapshot Schema 与 Codec 应保持现有接受、拒绝和复制行为；不得用共享类型替代运行时校验或合并边界规则。
- <a id="spec-req-1-5"></a>**1.5 依赖与文档**：当模块引用共享类型时，只增加必要的单向类型依赖；依赖检查应覆盖新模块及其调用方，不能为了通过检查放宽无关依赖。更新根导航和受影响模块说明，清楚区分类型归属与各边界校验所有权。
- <a id="spec-req-1-6"></a>**1.6 验证**：当验收时，应当通过类型检查验证 [1.3](#spec-req-1-3)，并通过现有 Web、模型、Runtime 与 Snapshot 相关测试验证 [1.4](#spec-req-1-4)；完整回归、文档及依赖检查通过，源码核对不再有本范围内的重复递归定义。

## 架构与核心决策

盘点基线为 `8da11ece`，成果位于 `codex/contract-inventory` 的 `676015c6`；清单是快照，实施前以当前源码和实际消费者复核。清单将下列声明列为相似候选，并明确“是否共享未知”：

| 候选 | 当前所有者与用途 | 核对来源 |
| --- | --- | --- |
| `JsonScalar`、`JsonValue` | contracts 通用 JSON 类型，供 Tool 与模型契约引用 | [声明](../../packages/contracts/src/types.ts) |
| `JsonObject`、`JsonValue` | Runtime 的 Action、Observation 与其他载荷 | [声明](../../packages/runtime/src/domain.ts)、[边界检查](../../packages/runtime/src/runner.ts) |
| `ModelJsonValue` | 模型可见数据投影 | [声明](../../packages/model-view/src/model-inference-view.ts) |
| `SnapshotJsonValue` | Snapshot 中 Tool 输入与 Observation | [声明与 Schema](../../packages/storage/src/goal-snapshot.ts)、[Codec](../../packages/storage/src/goal-snapshot-codec.ts) |
| `BrowserJsonValue` | Web wire JSON 载荷 | [声明](../../packages/web-contracts/src/session-input.ts)、[边界检查](../../packages/web-contracts/src/invariants/json-value.ts) |
| `JsonValueContract` | 模型输出的运行时 AST，与 TS 递归声明不同 | [AST](../../packages/model-contracts/src/model-output/canonical.ts) |

独立基础模块只声明 JSON 类型；已有领域命名只是这些类型的别名，不创建新的 wire 身份或版本。`contracts` 现有 AST 及 `JsonValueContract` 保留，改用共享 TS 类型；模型 Schema 的动态组合不在本步重构。`model-view` 对共享基础模块的类型依赖需显式纳入现有依赖规则。

[模型查询输入](../ts-provider-model-query-contract/spec.md)和 [Provider 连接测试结果](../ts-provider-profile-test-contract/spec.md)分别负责其数据契约迁移；本步不修改它们的字段或生成规则。可并行设计和实施；若共享文件发生冲突，集成时保留各自已批准行为并重跑受影响检查。

## 风险与否定性保证

风险等级：中。盘点尚未确认共享的语义等价，类型统一跨越多个模块；关键操作是迁移静态声明和更新依赖方向，需防止改变边界校验与持久化恢复。本步不调整 JSON 协议、未知字段策略、Snapshot 版本、Schema、执行契约或运行时行为，也不删除 AST。
