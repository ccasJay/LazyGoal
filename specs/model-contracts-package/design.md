# 模型协议契约拆包设计

## Overview

将 `packages/contracts/src/model-output/` 与 `model-conversation.ts` 迁入新的 `@lazygoal/model-contracts` 私有包；`@lazygoal/contracts` 保留通用 AST、Parser、Schema 编译器和节点检查入口。以单向依赖、调用方迁移和现有协议回归覆盖需求 1–4，并同步 Working Memory 对 `WorkingMemoryPatch` 的唯一类型归属（需求 5）。

## Key Design Decisions

### 1. 按协议所有权拆包并迁移公开调用方

- `@lazygoal/contracts` 只保留 Contract 构造器、类型推导、Parser、JSON Schema 编译器、错误类型和最小节点检查 API；不保留 `model-output/`、模型消息校验或其旧转发导出。
- `@lazygoal/model-contracts` 承载完整 `model-output/` 和 `model-conversation.ts`，包括 Canonical/Wire 契约、请求级工厂、系统工具声明、Completion Review、消息与续接协议及校验器。它通过 `@lazygoal/contracts` 使用同一 AST、Parser 和 Schema 编译器，不复制通用 DSL。
- 新包以 `packages/model-contracts/src/index.ts` 为唯一公开入口，沿用仓库的 private ESM 包约定。迁入的模型协议测试归入 `packages/model-contracts/test/`；通用 DSL 测试仍归 `packages/contracts/test/`。
- 直接使用模型协议的 Agent、Runtime、LLM、Storage 和 Context Retrieval 源码迁入新入口；仍使用通用 AST 的 Tools、Permission、Context Retrieval 等代码继续导入 Contracts。Agent/Runtime 自有领域入口的类型转发仅在其仍表达本模块契约时保留，不复制协议定义。
- 依赖图保持 `model-contracts → contracts`，而 `contracts` 没有 LazyGoal 包的出站边。依赖检查器登记新包，并只开放已迁移调用方对 `model-contracts` 的依赖。

### 2. 用统一只读检查器识别核心 AST 节点

在 Contracts 新增 `inspectContractNode`，以一个入口识别核心 builder 创建的普通 Contract 节点或 optional 属性节点：

```ts
export type ContractNodeInspection =
    | {
        readonly category: "contract";
        readonly node: Contract<unknown> & Readonly<Record<string, unknown>>;
      }
    | {
        readonly category: "optional-property";
        readonly node: OptionalProperty<unknown> & Readonly<Record<string, unknown>>;
      };

export function inspectContractNode(
    value: unknown,
): ContractNodeInspection | undefined;
```

返回的 `node` 是原有冻结 AST 节点引用；函数不复制或改写 AST，也不递归验证整张图。未知值返回 `undefined`。检查器使用 Contracts 内部现有品牌判断实现，`contractBrand`、`optionalBrand` 和 `recursiveOwner` 保持非公开。`model-contracts` 按 `category` 处理 object shape 属性，再按现有公开 `kind` 与节点字段执行 Wire 派生；recursive 节点身份可被识别，但既有 Wire 可移植性规则仍拒绝其派生。新增公开类型和函数按仓库要求提供中文契约级 TSDoc 与最小示例。

这把跨包节点身份检查与品牌实现分开，避免新包复制 Symbol 或窥探 Contracts 私有文件。它不扩大 Parser 的定义校验责任，也不改变核心 AST 的结构。

### 3. Working Memory 通过类型依赖复用唯一 Patch 契约

`WorkingMemoryPatch` 的 Contract 与推导类型随模型协议迁入 `@lazygoal/model-contracts`。设计选择让 `@lazygoal/working-memory` 以 `import type` 直接依赖新包，不新增第三个 Memory 契约包；Working Memory 继续拥有自己的记忆条目、归约算法和 Patch 校验，不调用模型输出工厂或运行时模型逻辑。此前批准的 [Working Memory 拆包设计](../working-memory-package/design.md) 明确把 Patch 类型归于 Contracts，因此必须同步修订该 Spec。预期方向为：

```text
@lazygoal/working-memory --type--> @lazygoal/model-contracts --> @lazygoal/contracts
```

这避免重复定义 Patch shape，代价是 Working Memory 的类型层依赖模型协议包。已批准的 `working-memory-package` Design/Tasks 仍需按此方向修订；由于依赖归属是实质设计变化，修订文件须按该 Spec 自己的审批流程审阅后，才能执行受影响的 Working Memory 任务。本 Spec 不提前改写那组已批准文件。

### 4. 迁移只改变所有权与导入路径

Canonical 解析、Wire nullable 投影与解码、Provider Schema、Shape Guide、模型消息校验及其错误结果保持现状；不改 Schema 形状、排序、消息 DTO、持久化内容或协议版本。删除 `@lazygoal/contracts` 的模型协议导出并迁移调用方，不增加开发期旧导出兼容层。

## 风险与待确认

- 风险等级：medium；原因：多个包的公开导入路径与依赖图变化，但协议行为和持久化格式不变且改动可回滚。
- 关键操作：无。
- 已知风险：节点检查若绕过唯一品牌身份会使跨包 Wire 派生失败；遗漏旧导入会使 Contracts 仍被当作模型协议入口；Working Memory 的类型层依赖与旧 Design 不一致，须先完成其独立 Spec 修订审批。
- 待确认：无；本设计采用统一 AST 检查器，并选择 Working Memory 对 `model-contracts` 的类型依赖以复用唯一 Patch 契约。

## Architecture

```text
tools / permission -----------------------> contracts
context-retrieval -----------------------> contracts
context-retrieval / agent / runtime
       / llm / storage ------------------> model-contracts
model-contracts ------------------------> contracts
working-memory (planned, type-only) -----> model-contracts
```

所有箭头表示源码依赖。`model-contracts` 只依赖 DSL 核心；Contracts 不反向引用模型协议。Working Memory 的依赖只用于 `WorkingMemoryPatch` 类型，记忆核心不取得模型执行能力。

## Components and Interfaces

| 位置 | 拆分结果 |
| --- | --- |
| `packages/contracts/src/node-inspection.ts` | 新增统一 AST 节点检查器及 `ContractNodeInspection`；内部品牌仍由 `internal.ts` 唯一保存。 |
| `packages/contracts/src/index.ts` | 移除模型输出、系统工具与消息协议导出；导出 DSL API 和检查器。 |
| `packages/model-contracts/src/model-output/` | 迁入 Canonical、Wire、Provider Schema、factory、system-tools、Completion Review 与模型契约错误实现；内部 DSL 引用改从 Contracts 公共入口进入。 |
| `packages/model-contracts/src/model-conversation.ts` | 迁入模型消息、供应商续接 DTO 与边界校验。 |
| `packages/model-contracts/src/index.ts` | 聚合并公开模型输出和模型消息协议；不重新导出通用 DSL。 |
| Agent、Runtime、LLM、Storage、Context Retrieval | 其模型协议引用改到新包；继续使用 generic DSL 的代码保持 Contracts 导入。 |
| `scripts/check-dependencies.mjs` | 注册 `model-contracts → contracts`，为经代码确认的直接消费者开放依赖边，并保持 Contracts 零出站边。 |

实现同时更新 `AGENTS.md` 仓库布局，以及 `docs/architecture/README.md` 和 Contracts 架构说明；增加 Model Contracts 当前职责页，避免把未来设计留作当前架构事实。

## Testing Strategy

- 验证需求 1、4：检查 Contracts 唯一入口只包含通用 DSL 和检查器；Model Contracts 唯一入口完整覆盖迁入协议；仓库生产导入不再从 Contracts 获取模型协议，旧模型导出没有兼容转发。
- 验证需求 2：迁移现有 Canonical、Wire、Schema、Shape Guide 和模型消息测试；以迁移前的 fixture/精确断言确认接受结果、解码值、Schema 内容和 Guide 文本一致，而非只比较同一实现的两次输出。
- 验证需求 3：从 Contracts 构造 object、optional 与 recursive 节点并检查类别；Wire 派生对可移植节点保持原结果，对 recursive 节点保持现有定义错误。覆盖伪造/未知节点的识别失败，并确认品牌 Symbol 未从公开入口导出。
- 验证需求 5：类型检查 `WorkingMemoryPatch` 唯一来源及 Working Memory 直接类型依赖；检查 Working Memory Spec 修订后的 owner 与依赖图一致。Working Memory 自身的实现验证仍由其独立 Spec 的 Feature Verification 承担。
- 跨包验证使用当前 TypeScript 检查、Contracts/Model Contracts/Agent/Runtime/LLM/Storage/Context Retrieval 相关测试、`npm run check:dependencies` 与仓库回归；Architecture 文档和 Spec 间链接在迁移后复核。
