# 契约迁移并行编排草案

本文件用于审阅编排思路，不是已批准的 `specs/orchestration.md`，不授权实施、分发或合并。七份方向级 Spec 与计划均待用户审阅批准；已有的 Provider 两份小 Spec 和 AgentProfile 小 Spec 的既有批准不自动覆盖方向级文件。正式编排前，应基于最终批准的内容重新核对本草案。

## 目标与参与范围

将生产数据契约逐步迁移到 TS 类型、Catalog 生成制品和实际边界读取，完成所有消费者迁移并验证后删除旧 Contract AST。数据与执行职责保持分离。

| 方向 | Spec 与计划 | 状态 | 主要交接 |
| --- | --- | --- | --- |
| 生成能力 | [Spec](../ts-contract-generation-capabilities/spec.md) / [计划](../ts-contract-generation-capabilities/plan.md) | 已批准 | 已验证的生成器、绑定和模型投影提交 |
| 工具 | [Spec](../ts-tool-input-migration/spec.md) / [计划](../ts-tool-input-migration/plan.md) | 已批准 | 全部业务、Program、评测工具绑定及真实注册链 |
| 模型 | [Spec](../ts-model-contract-migration/spec.md) / [计划](../ts-model-contract-migration/plan.md) | 已批准 | 动态组合、全部 system tools 和模型解码链 |
| Web | [Spec](../ts-web-contract-migration/spec.md) / [计划](../ts-web-contract-migration/plan.md) | 已批准 | HTTP、SSE 和浏览器实际消费者 |
| Storage | [Spec](../ts-storage-contract-migration/spec.md) / [计划](../ts-storage-contract-migration/plan.md) | 已批准 | 文件、Snapshot、Codec 和恢复链 |
| 其他边界 | [Spec](../ts-other-boundaries-migration/spec.md) / [计划](../ts-other-boundaries-migration/plan.md) | 已批准 | 剩余 Runtime、Worker、跨进程和外部边界 |
| 删除 AST | [Spec](../remove-legacy-contract-ast/spec.md) / [计划](../remove-legacy-contract-ast/plan.md) | 已批准 | 清理旧 AST 专属实现及保留 JSON 原语 |

## 依赖与并行

- 参考共同基线为当前 `dev` 的 `0bee171be597654807241569c919ea1bdc01ba4c`；实际派发前重新固定基线、核对各文件和批准状态。每个方向采用独立分支与 worktree，由一个执行者负责，协调者不与执行者共享可写 worktree。
- 以 **最多三个执行者并发**为规划上限，另由主 agent 协调；实际可用容量不足时降低上限。优先启动生成能力、工具准备和模型准备；有空位时立即安排 Web、Storage 或其他边界，不等待整批完成。工具与模型的前期工作以已明确的绑定接口及局部替身并行验证；替身结果不构成真实集成通过。
- 领域线所需的新生成能力必须来自通过相关验证并固定提交的生成能力分支，才可完成真实制品与正式验收。已可使用现有实现的部分无需等待整个生成方向完成；仅在确有代码依赖时从固定上游提交建立堆叠分支，记录依赖和验证新鲜度。
- 工具和模型方向互相需要实际产物，**不设置循环的先完成依赖**：各自先完成可独立准备的工作，再由协调者在独立集成 worktree 汇集两线与所需生成能力，完成全部工具和 system tools 的统一切换及联合验证。未完成联合验证前，不能将任一分支作为已独立交付的生产切换合入。
- Web、Storage 和其他边界按各自实际依赖独立推进；已批准的 Provider 查询输入、Provider 测试结果和 AgentProfile 小 Spec 继续保持各自范围和验收，不作为新批准确立的假设。涉及其接入方案的实质变化先回到相应 Spec 处理。
- 删除 AST 是最后阶段：等待前六方向真实消费者迁移、联合验收及交付证据齐全，固定实际基线后再派发；仍有必要 AST 消费者即停止删除。

## 共享资源与集成

- 各 worktree、测试目录、端口和进程资源独立；Catalog、生成器、公共导出和模块说明等共享文件允许分支并行修改，由协调者在集成 worktree 处理冲突并重新生成制品。共享文件本身不是整条工作线串行的理由。
- 生成能力线拥有共享生成与绑定语义；工具线拥有工具输入和注册，模型线拥有动态输出与 system tools，Web 拥有 HTTP/SSE DTO，Storage 拥有文件 Codec，其他边界线只负责其余部分。出现接口或范围冲突时先修订对应 Spec/计划，不在编排中暗设行为。
- 每条线记录执行者、分支、基线、实际提交、Feature Verification 状态和未解决问题。协调者建立独立集成 worktree，固定所有参与提交；使用真实生成器及绑定验证 Catalog 一致性、模型→授权工具→Runtime、Web 路由/SSE/浏览器、文件写入/恢复和 Worker 链路，再运行完整回归、构建、文档和依赖检查。适用 Spec 的具体验收均须保留。
- 以固定提交和当前证据申请审核；按依赖顺序串行合入。工具与模型须作为经过验证的共同切换交付，不能为方便逐分支合入而制造生产混用。若实际 Git 合并方式无法保证这一点，先确定可审阅的原子集成候选再申请合并批准。提交或相关基线变化后重跑受影响验证。

## 审阅与交付状态

- 七份方向级 Spec / 计划批准：未完成。
- 正式编排文件及其批准：未完成。
- 执行派发、各方向验收、跨 Spec 集成验证：未开始。
- 审核与合并：未开始；编排批准不代替具体提交的合并批准。
- 项目记忆：交付验证后提出候选，由用户决定是否沉淀；未获批准前不写入。
