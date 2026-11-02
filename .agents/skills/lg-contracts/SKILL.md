---
name: lg-contracts
description: "在 LazyGoal 中新增或修改组件、模块、事件、命令、持久化结构、共享类型或界面展示状态时使用，用于判断是否需要契约、契约属于哪一层、放在哪里，以及如何发现现有契约。纯文案、样式调整和局部重构不适用。"
---

# LazyGoal 契约放置与建立

先确认事实归属，再决定要不要契约，最后才选制品。本 Skill 不维护契约清单，也不替代 `using-lazyspec` 的规划与审批流程。

## 先纠正两个直觉

- `contracts/catalog.json` 不是全量契约清单。它只登记启用生成的边界根；Runtime 领域类型、config、ACP、permission、llm-core 与 UI 投影都不在其中。查不到不等于不存在。
- 契约不是新增内容的默认动作。同进程、单一消费者、结构简单的值不需要契约；多建一层会制造第二份权威。

## 四问决策门

按顺序判断，命中即停止：

1. 会跨进程、跨语言、落盘、或进入模型上下文吗？→ 边界契约，且必须在该边界做运行时校验。
2. 同一进程内会被两个以上模块共享，或需要稳定身份／版本吗？→ 领域契约或 wire 契约。
3. 只是某个界面的展示派生吗？→ `apps/goal-board/src` 内的投影契约，不进 wire、不进 Catalog。
4. 以上都不是（单组件、单字段、同进程）？→ 不加契约，直接使用 Props 或既有类型。

第 4 条是合法结论，不是遗漏。任何新增前先确认现有层是否已经表达同一事实；重复表达优先合并，而不是再建一套。

## 分层地图

只描述层，不描述成员。具体有哪些声明用本节的查询命令和所属模块 README 现查。

| 层 | 声明位置 | 生成与校验 | 最小制品 |
| --- | --- | --- | --- |
| Web wire | `packages/web-contracts/src/wire.ts` | Catalog 登记；HTTP／SSE 边界校验 | 生成 Schema、Ajv 与 binding |
| 持久化文件 | `packages/storage/src/goal-snapshot.ts`、`agent-profile-file.ts` | Catalog 登记；文件读取时校验 | 生成绑定与对应 codec |
| 领域状态 | `packages/runtime/src/domain.ts` 等模块源码 | 不登记；同进程类型 | TS 类型、行为函数与 TSDoc |
| 控制协议 | wire 控制段与 `apps/goal-board/src/control` | wire 部分登记；reducer 不登记 | intent、receipt、event 与纯 reducer |
| 工具输入输出 | `packages/tools/src/<tool>.ts` | Catalog 登记；工具 JSON 边界 | 生成的 Schema 与 binding |
| 模型输出 | `packages/model-contracts/src/model-output/` | Catalog 登记；模型 JSON 解码 | 生成的 Schema 与 binding |
| 基准工具 | `benchmarks/<suite>/src/` | Catalog 登记 | 生成的 Schema |
| Prompt 与配置 | `packages/prompt-bundle/src`、`packages/config/src` | 不登记 | 模板与 section 注册；TOML 解析时手写校验 |
| UI 投影 | `apps/goal-board/src` | 不登记；同进程 | 类型、纯 selector 与映射测试 |
| 文档与记忆 | 模块 `notes/` 与 `project-memory/` | 不适用 | semantics 表与 Capsule |

生成制品位于各模块的 `src/generated/`，只由生成器写入。

## 各层建立指导

- **边界契约**：声明写在源文件，用 JSDoc 注解表达约束；新增边界根同时登记 Catalog 的协议身份与版本；消费方必须使用生成的 binding，不手写第二套校验。生成制品禁止手改。
- **领域契约**：类型加行为函数或 reducer；不配套运行时 Schema；TSDoc 写清生命周期、失败语义与所有权边界。
- **控制契约**：复用既有 intent、receipt 与 event；展示派生只读控制状态，不把 UI 意图写进领域事件，不新增第二份 busy／unknown 状态。
- **UI 投影**：只有当展示词汇不同于协议词汇、需要跨来源组合、或需要表达协议中不存在的不变量时才建立；形态是类型加纯 selector 加映射测试，不 fetch、不 dispatch、不缓存派生结果。
- **文档与记忆**：契约变更在同一变更内更新所属模块的 `notes/overview.md` 与 `notes/semantics.md`；只有长期决策才沉淀 Capsule。

## 新增组件或模块的检查清单

1. 它拥有什么事实，谁写入、谁读取？
2. 读取方是否跨进程或跨模块？
3. 失败时哪些状态已经提交？
4. 现有哪一层已经表达同一事实，会不会形成第二份权威？
5. 验证入口是哪条命令或哪个测试？

答不出第 1 和第 4 条时，先查所属模块的 README 与 `notes/overview.md`，不要直接新建声明。

## 反模式

- 用 Catalog 是否存在来判断契约是否应存在。
- 为同进程已类型化的值重复加运行时校验。
- 只有一个消费者就新开 package 或新目录层。
- 给每个组件建立独立数据模型或配套 Schema。
- 只新增类型而没有 selector、映射测试或行为入口。
- 手改 `src/generated/` 下的制品。
- 为开发期数据保留兼容分支、旧版本适配或第二套并行实现。

## 发现与校验

```bash
node scripts/contract-catalog.mjs query <key|declaration|source|protocol|module|composition>
npm run contracts:generate -- --check
npm run check:dependencies
npm run check:docs
npm run memory:check
```

Catalog 的 `key` 格式为 `模块/源码相对路径#声明名`，可按声明名或模块直接查询。

## 变更传播

- 声明变更后重新生成制品，并复查手写校验点是否仍与生成约束一致。
- 公开契约变更同步所属模块的 `notes/overview.md`、`notes/semantics.md` 与相关 TSDoc。
- 长期决策走 Memory 沉淀流程；不要改写 Spec 的历史文本。
- 不因为实现变化就提升 schema 或协议版本；只有多版本需要共存时才引入新版本。

## 与其他 Skill 的分工

| Skill | 负责 |
| --- | --- |
| [lg-domain-development](../lg-domain-development/SKILL.md) | 概念、状态转换、不变量与跨上下文规则 |
| 本 Skill | 事实归属、是否需要契约、契约形态与落点 |
| [lg-ui](../lg-ui/SKILL.md) | 视觉层级与交互状态呈现 |
| [lg-sdk-extraction](../lg-sdk-extraction/SKILL.md) | 跨宿主边界与共享装配 |
| [lg-doc-standards](../lg-doc-standards/SKILL.md) | 文档层级与放置 |
| [lg-find-simplifications](../lg-find-simplifications/SKILL.md) | 识别重复契约与无消费者抽象 |

## 边界

- 不判断业务规则是否正确，交给领域所有者与 `lg-domain-development`。
- 不决定视觉与排版，交给 `lg-ui`。
- 不创建或修改 Spec；需求与审批继续交给 `using-lazyspec`。
- 审查或讨论请求只报告事实归属、重复契约与缺失校验；用户要求实施时才在授权范围内修改文件。
