# Agent 能力拆包执行计划

## 执行依据与边界

当前对话已批准完整 [spec.md](./spec.md)。本计划覆盖其 25 项验收标准；风险和禁止扩展的范围以 [Spec 风险章节](./spec.md#风险与否定性保证) 为准。任务按 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 执行，不启动另一份 Runtime Spec 的实施或联合编排。

每个 TODO 先建立行为对照或具体失败断言，再迁移实现；已有行为测试不要求人为制造失败。下文新包测试路径均为拟新增入口或现有测试的迁移目标，尚不存在、未执行。迁移保留原场景和断言，不借修改 fixture、跳过测试或放宽类型消除差异。

每次迁出能力即更新该组符号的全部当前调用方、测试和 Agent 根导出，删除旧实现，不添加转发文件或并行副本。尚未迁出的能力继续使用其现有实现；在每个步骤登记新包的依赖规则并保持类型检查可用，TODO 9 完成全部静态引用形式和入口约束。公共 TSDoc、所属 README/overview/semantics 与当前读者链接随归属同步，不等到最后补齐。模型请求、模板正文、调用与持久化语义均保持。

工作树中的技能、AGENTS 已有修改及 Runtime Spec 属于前序工作，不自动纳入本功能提交。仅在另行获准执行后按 executing-plan 创建隔离工作区、提交 Spec/Plan 基线并逐 TODO 实施；本阶段只编写计划。

## 任务清单

- [x] //TODO 1. 保存现有行为对照并独立消费预算与裁剪策略
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.5](./spec.md#spec-req-1-5)、[3.1](./spec.md#spec-req-3-1)、[4.4](./spec.md#spec-req-4-4)、[5.1](./spec.md#spec-req-5-1)。
  - 先验证：基于现有 Prompt、原生历史、Section 和阶段 fixture，在首次改生产源码前建立拟新增 `packages/agent/test/component-extraction-baseline.test.ts` 及明确的对照数据，记录消息/工具声明/契约、预算/frame、模板正文和关键调用后果。只规范化非确定时间、随机身份且保持配对；基线生成与测试断言分开，回归不自动覆盖基线。同时用 `context-budget` 入口验证字符/Token 计量、完整连续单元选择、最新单元软超限保留、硬超限、取消、不修改输入，以及稳定序列化。
  - 实现：迁移预算、ContextUnit、Compactor、通用 Selector 和 thought-budget 到 `context-budget`，拆出无模板依赖的确定性序列化；所有当前预算/序列化消费者直接引用新入口。迁移现有相关测试并创建最小私有 manifest，不新建算法或通用工具包。保存对照数据的来源及内容指纹，后续归入 TODO 6 的执行集成测试。
  - 检查：`npx tsx --test packages/context-budget/test/*.test.ts packages/agent/test/component-extraction-baseline.test.ts`；`npx tsc --noEmit`；`npm run check:dependencies`。已有失败先区分环境/原有问题与本次差异，不以重建基线修复。

- [x] //TODO 2. 独立消费模型表示并从已提交历史组装上下文
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.6](./spec.md#spec-req-1-6)、[3.2](./spec.md#spec-req-3-2)、[4.4](./spec.md#spec-req-4-4)、[5.1](./spec.md#spec-req-5-1)。
  - 先验证：迁移现有 View、Conversation、Trajectory、Warm、原生历史、导航和来源投影测试，增加拟新增 `packages/model-context/test/public-entry.test.ts`，仅注入当前状态、内存/文件历史 Port 与预算，核对 View、来源身份、Hot/Warm 和不变输入；未提交 tail、未结算交换、身份/阶段/Epoch 不匹配按原规则处理。拟新增 `packages/model-view/test/public-api.types.ts` 验证表示消费，字段值域与实现结果的兼容证据放在上下文包测试中，不让 View 包导入 Runtime。
  - 实现：将模型输入及历史结果 DTO 单一定义迁入 `model-view`，移除对 Runtime 及投影/Reducer 实现类型的反向引用；预算结果类型仍归预算包。将 Projector、来源适配、轨迹/原生历史、Hot/Warm 实现迁入 `model-context`，保留现有读取 Port 和提交来源筛选。同步全部消费引用，不放宽事件字段或复制领域协议；Hot/Warm 不继续拆包。
  - 检查：`npx tsx --test packages/model-context/test/*.test.ts packages/runtime/test/model-context-frame.test.ts packages/runtime/test/prompt-context-integration.test.ts`；`npx tsc --noEmit`；`npm run check:dependencies`。类型测试由根 TypeScript 检查发现，纯 DTO 不补无行为的运行时测试。

- [x] //TODO 3. 分别消费内存渲染机制与当前默认 Prompt 内容
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)、[1.9](./spec.md#spec-req-1-9)、[3.1](./spec.md#spec-req-3-1)、[4.2](./spec.md#spec-req-4-2)、[4.4](./spec.md#spec-req-4-4)、[5.1](./spec.md#spec-req-5-1)。
  - 先验证：将现有 Renderer/Loader/Registry 测试归 `prompt-renderer`，内存模板从公共入口渲染，覆盖 eager compile、引用/顺序/阶段错误、数据不二次执行、LF 与错误脱敏。默认内容、固定指令与具体 Section 测试归 `prompt-bundle`；核对模板 ID/正文、Manifest、协议拒绝和任意 cwd 下的显式资源加载。新增内存渲染无需默认 Bundle 的消费断言，保留原固定文本与 tokenizer 计量断言。
  - 实现：拆开 Section 注册机制与具体定义，拆开 Manifest 结构匹配与默认 Runtime 协议适配；Nunjucks 和类型依赖迁至渲染包并按现有安装方式维护对应锁文件，不升级依赖。模板与默认工厂归 Bundle，Section Diff 暂留原请求调用链且改用渲染入口类型，直到 TODO 4 迁移。同步当前 Worker 的资产路径、内嵌键及构建引用，保持选择规则；不留旧模板副本或扩大支持协议。
  - 检查：`npx tsx --test packages/prompt-renderer/test/*.test.ts packages/prompt-bundle/test/*.test.ts apps/goal-server/test/prompt-bundle-integration.test.ts`；`npx tsc --noEmit`；`npx tsc --noEmit -p benchmarks/tsconfig.json`；`npm run check:dependencies`。Worker 真实打包与产物消费在 TODO 8 集中验证。

- [x] //TODO 4. 独立准备阶段请求与基于提交历史的 Section 更新计划
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.4](./spec.md#spec-req-1-4)、[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[4.4](./spec.md#spec-req-4-4)、[5.1](./spec.md#spec-req-5-1)。
  - 先验证：迁移 Prompt、纯 render、Section Diff、缓存对齐及完成审查请求的现有断言到 `model-request`。拟新增 `packages/model-request/test/public-entry.test.ts`，不构造 Adapter/Binding 即获得 request、绑定契约及 frame；覆盖三阶段、strict/prompt_only、工具可见交集、原生历史去重、不可裁剪输入超限、Section 完整/替换/失效更新与恢复重建，和 TODO 1 对照一致。
  - 实现：迁移请求构造、消息组装、Section 更新算法及请求检查 helper，实际响应解析保留给 TODO 5。完成审查改收输出模式、预算和能力等必要值，原执行器在相同 Binding 上投影传参；请求包不依赖执行器或默认 Bundle，不另建 Schema、不读取恢复真源或提交 frame。同步调用方和测试，保留审查的原始用户要求、回复语境与证据来源规则。
  - 检查：`npx tsx --test packages/model-request/test/*.test.ts packages/agent/test/component-extraction-baseline.test.ts packages/runtime/test/think-decision-recovery.test.ts`；`npx tsc --noEmit`；`npm run check:dependencies`。模型调用次数断言为零，历史读取仅由已注入的现有组装 Port 发生。

- [ ] //TODO 5. 用同一请求契约独立解码文本和原生阶段响应
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.7](./spec.md#spec-req-1-7)、[3.3](./spec.md#spec-req-3-3)、[4.4](./spec.md#spec-req-4-4)、[5.1](./spec.md#spec-req-5-1)。
  - 先验证：在 `model-response` 迁移文本解析断言，并将原执行器内的原生工具/Think/Decide/完成审查解码场景归入拟新增 `packages/model-response/test/stage-response.test.ts`。从公共入口仅提供最终响应与实际请求契约/声明，验证 fenced JSON、分支、调用数、原生身份/续接、非法参数、Think 空白/工具调用、完成审查接受/拒绝及现有错误码/字段形状；不注入 Goal、Store 或 Adapter。
  - 实现：把根协议错误和全部对应响应检查迁入 `model-response`，现有执行器调用唯一解码实现；不重建请求契约，不在响应包分配 Action ID、做授权或生成 RuntimeFeedback。请求检查 helper 由 TODO 4 所有者提供；更新旧诊断、反馈和当前消费者的错误类型引用，保持同一错误类身份。
  - 检查：`npx tsx --test packages/model-response/test/*.test.ts packages/agent/test/native-step-executor.test.ts packages/agent/test/stage-feedback.test.ts packages/runtime/test/model-output-runtime-boundary.test.ts`；`npx tsc --noEmit`；`npm run check:dependencies`。TODO 6 迁移执行器测试前，原测试文件继续验证接入后果。

- [ ] //TODO 6. 独立执行单次模型调用并保持阶段 Binding、记录与解码一致
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.8](./spec.md#spec-req-1-8)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[4.4](./spec.md#spec-req-4-4)、[5.1](./spec.md#spec-req-5-1)。
  - 先验证：将流、取消、输入记录、指标和诊断测试归 `model-call`，增加拟新增 `packages/model-call/test/public-entry.test.ts`，只注入确定性 Adapter、请求和必要上下文，覆盖输入失败零调用、调用前后取消、无/重复 completed、generate/stream、来源/时长、best effort 故障及私有审查投递。将 Binding、阶段、反馈与跨组件历史测试归 `model-execution`，验证调用中换代仍固定原 Binding、解码错误复用同一 callId 且不新增 Adapter 调用或错误地重记指标。
  - 实现：先提取单次调用与最小诊断入口，再迁移 `LLMStepExecutor`、Binding、阶段结果/frame/Action 身份组装和反馈转换到 `model-execution`；收窄调用上下文，保留记录顺序与来源，不把完整 Binding 交给调用或响应包。三个阶段组合已有请求/调用/解码入口，不新增重试、关闭或 Hook。原 Agent 只剩待收敛的装配入口；原执行器消费者先直接引用实际拥有者。TODO 1 对照测试与数据迁入 `packages/model-execution/test/component-extraction-baseline.test.ts`，保留基线内容及来源指纹。
  - 检查：`npx tsx --test packages/model-call/test/*.test.ts packages/model-execution/test/*.test.ts packages/runtime/test/think-decision-recovery.test.ts packages/runtime/test/run-stage-recovery.test.ts`；`npx tsc --noEmit`；`npm run check:dependencies`。检查借用依赖未被关闭，以及流失败、解码失败和取消仍保持原分类和可见性。

- [ ] //TODO 7. 默认装配执行器并接入 Web 与 Headless 两类宿主
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[4.1](./spec.md#spec-req-4-1)、[4.4](./spec.md#spec-req-4-4)。
  - 先验证：拟新增 `packages/agent/test/create-agent-executor.test.ts` 比较默认工厂与直接执行器的同依赖后果，覆盖显式 Renderer/Compactor 原样使用、默认资源错误、构造期零模型/工具调用和无信号/端口/退出副作用。扩展现有 goal-server 模型切换/浏览器集成、Headless 组合根测试，并增加拟新增 `benchmarks/test/agent-components-recovery.integration.test.ts`，以临时文件和计数替身验证等待、重建同一 Run、已提交 frame、终态显式后继 Run及拒绝路径。
  - 实现：`agent` 仅实现并导出 `createAgentExecutor` 与自身参数契约；默认 Renderer 和 Compactor 来自所属包，借用依赖不创建全局状态或关闭机制。goal-server 与 Headless 在实际装配入口异步接入工厂，其余能力直接引用所有者；保持模型安全点、权限、Runtime 提交和资源生命周期。若此前 Runtime Spec 已实施，仅调整当时装配文件的模型接线，不迁移 Benchmark Runtime 编排或改变另一 Spec。
  - 检查：`npx tsx --test packages/agent/test/*.test.ts benchmarks/test/headless-composition-root.test.ts benchmarks/test/agent-components-recovery.integration.test.ts apps/goal-server/test/composition-root-model-switching.test.ts apps/goal-server/test/browser-session.integration.test.ts`；`npx tsc --noEmit -p apps/goal-server/tsconfig.json`；`npx tsc --noEmit -p benchmarks/tsconfig.json`。核对同一执行链和调用计数，未提交 tail 不成为恢复基线。

- [ ] //TODO 8. 从当前源码打包 Worker 并迁移全部命令和模板消费者
  - 落实标准：[3.1](./spec.md#spec-req-3-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[5.1](./spec.md#spec-req-5-1)。
  - 先验证：扩展现有 WorkerBuilder、ALFWorld/SWE-bench Worker runtime、GAIA/TUA/context 入口测试，增加拟新增 `benchmarks/test/agent-components-worker.integration.test.ts`。使用生产 Builder 与各现有 Worker 入口实际打包，核对所需模板 ID/正文、内嵌键、构建身份与缓存失效；以本机 Node 和确定性 RPC 在至少一条共享 Worker 会话运行新装配，确认脱离源码模板目录仍能取得模型请求并到达等待/结果。入口编译或文本包含断言不能替代产物运行证据。
  - 实现：补齐 TODO 3 后所有当前资产/导入/命令路径，维护脚本和付费评测命令只修接线，不运行真实模型或基准。检查实际 TypeScript include，补齐当前遗漏的 TUA 源码/测试覆盖，不另造构建配置。沿用既有 Worker 子集和摘要机制；本地打包测试通过现有注入点使用测试运行时标识，产物以本机 Node 验证，不宣称核验了固定 Linux 镜像或真实任务环境。测试基线和历史 Spec/Memory 不全局改写。
  - 检查：`npx tsx --test benchmarks/test/agent-components-worker.integration.test.ts benchmarks/swebench/test/worker-builder.test.ts benchmarks/swebench/test/worker-runtime.test.ts benchmarks/alfworld/test/worker-runtime.test.ts benchmarks/gaia/test/tools-worker.test.ts benchmarks/tua-bench/test/worker-entry.test.ts benchmarks/context/test/worker-protocol.test.ts`；`npx tsc --noEmit -p benchmarks/tsconfig.json`。记录实际 bundle、入口、摘要和产物运行结果；源码路径变化允许构建摘要变化，模板正文不变。

- [ ] //TODO 9. 强制包依赖与入口约束并验证源码发现和文档归属
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[2.3](./spec.md#spec-req-2-3)、[4.3](./spec.md#spec-req-4-3)、[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)。
  - 先验证：扩展 `scripts/check-dependencies.test.mjs` 的临时工程正反例，覆盖 Spec 的九包方向、类型泄漏、入口穿透与项目产物引用；检查 import/export、type import、import 类型表达式、side-effect 和字面量 dynamic import，以及路径归一化。合法包内引用、公共入口、第三方产物允许；跨包集成测试不能使用单元测试例外。验证默认 Agent 导出面只含装配，所有当前消费者不依赖已删除路径。
  - 实现：在现有依赖门中完成定向包/文件/入口/源码规则及相应测试扫描，迁移原 View/Renderer 规则，复用现有 TypeScript 工具而非新建框架。核对九包 manifest、测试发现、TypeScript include、Nunjucks 依赖归属、锁文件和当前文档导航；补齐各 TODO 的遗漏并更新根布局。按下方源码副本方法证明无旧产物仍可独立消费，保留历史材料身份。
  - 检查：`node --test scripts/check-dependencies.test.mjs`；`npm run check:dependencies`；`npm run check:docs`；`npx tsc --noEmit`。记录实际发现/执行的新测试与违规 fixture 诊断，不以文件总数或退出码独立证明边界。全部 TODO 完成后自动执行以下 Feature Verification，完成任务只改 checkbox，不改写 TODO 描述。

## Feature Verification

### Planned Checks

下表引用的拟新增入口均由对应 TODO 建立；迁移目标使用上述确定命令。现有验证方法可按最终非实质文件布局等价调整，但必须保留每个验收后果、实际证据与当前源码对应关系。

| 验收项 | 对应标准 | 场景与可观察预期 | 检查入口 / 证据 |
| --- | --- | --- | --- |
| 九包独立消费 | [1.1](./spec.md#spec-req-1-1) | 仅经所属入口使用能力，不依赖 Agent、宿主或具体 Storage；无跨包内部穿透。 | TODO 1—6 的包入口测试、TODO 9 依赖正反例及导出审阅。 |
| 预算与模型表示 | [1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6) | 无 Goal/模板的计量裁剪保持软硬预算与取消；View 只引用表示类型，值域、来源与只读关系不被放宽。 | TODO 1/2 命令、类型消费文件、预算边界与字段兼容证据。 |
| 已提交历史组装 | [1.2](./spec.md#spec-req-1-2)、[3.2](./spec.md#spec-req-3-2) | 内存/文件 Port 给出相同 View/Hot/Warm；排除未提交、未结算与错误身份/阶段/Epoch，原状态不改写。 | TODO 2 的公共入口与既有原生历史/Section 恢复测试；TODO 6/7 重建。 |
| 渲染与默认内容分离 | [1.3](./spec.md#spec-req-1-3)、[1.9](./spec.md#spec-req-1-9) | 内存渲染不加载 Bundle；默认资产从任意 cwd 可读；结构、缺失模板、协议错误保留，默认 Section 定义完整。 | TODO 3 命令及模板正文/固定指令对照，TODO 9 禁止依赖 fixture。 |
| 请求与 Section 更新计划 | [1.4](./spec.md#spec-req-1-4)、[3.1](./spec.md#spec-req-3-1) | 三阶段 request/bundle/frame 匹配，消息顺序与预算一致；Section 首次、变化、失效和重建正确，超限时零模型调用。 | TODO 4 命令与 TODO 1 保存、TODO 6 迁移后的等价对照；拒绝/超限断言。 |
| 响应单独解码 | [1.7](./spec.md#spec-req-1-7)、[3.3](./spec.md#spec-req-3-3) | 相同请求契约接受/拒绝相同文本和原生阶段结果，错误码/路径/形状保持；无 Goal、Adapter、Action 分配或反馈写入。 | TODO 5 命令及 TODO 6 端到端阶段/反馈测试。 |
| 单次调用与记录失败 | [1.8](./spec.md#spec-req-1-8)、[3.4](./spec.md#spec-req-3-4) | 输入写入失败零调用，取消不继续解码；流结束错误、来源归类、最终响应和记录顺序保持，指标/诊断失败不改接受条件。 | TODO 6 调用包测试、deferred Adapter/Store、事件和 Recorder 计数。 |
| 同代 Binding 与私有审查 | [3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4) | 进行中发布新代不影响本阶段；请求/解码契约和 callId 对应同次调用；审查不公开文本/函数参数且不多记模型调用。 | TODO 6 Binding、审查、流和指标场景，既有 Runtime 阶段恢复测试。 |
| 默认装配与替换 | [2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.4](./spec.md#spec-req-2-4)、[4.4](./spec.md#spec-req-4-4) | 工厂/直接执行器同依赖后果一致，覆盖注入原样使用，构造期无执行副作用；模板故障拒绝，不关闭借用资源。 | TODO 7 工厂测试；TODO 1—6 各入口的替换/错误/取消断言。 |
| 真实宿主与恢复 | [4.1](./spec.md#spec-req-4-1)、[3.2](./spec.md#spec-req-3-2) | Web、Headless 经默认工厂运行；等待后文件重建恢复同一 Run，终态后显式新 Run；模型、权限与原提交链保持。 | TODO 7 命令；下述应用回归、Runtime 恢复与浏览器验收。 |
| Worker 模板及产物 | [4.2](./spec.md#spec-req-4-2) | 当前入口实际打包、唯一新模板真源，正文与 ID 保持；共享 Worker 产物无源码模板仍能运行，缓存按新输入失效。 | TODO 8 命令；真实 esbuild bundle、内嵌资产对照、受控 RPC 进程结果与摘要。 |
| 全部消费者与有限导出 | [2.3](./spec.md#spec-req-2-3)、[4.3](./spec.md#spec-req-4-3) | 当前源码/测试/脚本/命令只引用实际所有者，无旧路径与转发；历史材料不被全局替换。 | TODO 7—9 的接入与规则测试、当前调用方检索及 Agent 导出审阅。 |
| 依赖与类型引用门 | [5.2](./spec.md#spec-req-5-2) | 所有承诺静态引用形式的反向依赖、内部穿透与表示泄漏产生定位诊断，合法入口/包内调用不误报。 | `node --test scripts/check-dependencies.test.mjs`；`npm run check:dependencies`。 |
| 发现与源码独立性 | [5.1](./spec.md#spec-req-5-1)、[5.3](./spec.md#spec-req-5-3) | 九包源码/类型/测试被实际发现，含 TUA 类型覆盖；无项目产物仍可消费，项目产物导入拒绝、第三方依赖允许。 | TODO 9 规则证据、根回归实际测试输出与下述临时源码副本检查。 |
| 文档与唯一事实归属 | [5.4](./spec.md#spec-req-5-4) | 公共契约/示例在源码，九包当前文档和导航指向所有者，Agent 只解释装配，不复制契约或历史结论。 | `npm run check:docs`、公共接口与文档所有权审阅；检查器不覆盖的 Spec/Plan 链接另行验证。 |

任务完成后的综合检查：

```sh
npx tsc --noEmit
npx tsc --noEmit -p apps/goal-server/tsconfig.json
npx tsc --noEmit -p benchmarks/tsconfig.json
npm run check:dependencies
npm run check:docs
npm test
npm --prefix apps/goal-server test
npm run build:web
node --test --test-concurrency=1 apps/goal-board/e2e/*.test.mjs
git diff --check
```

根回归已发现并运行过的相同当前测试可以复用证据，应用 test 命令不必机械重复运行；必须记录发现范围和当前状态，不能把根类型检查当成覆盖应用/Benchmark 的配置。

源码独立检查使用临时副本：复制当前源码、配置、测试、模板及必要源资源，保留可解析的已安装依赖，省略项目 `dist/lib/build` 等派生产物；运行根类型检查和 TODO 1—7 的包级/入口测试（不启动 Worker 产物或 Web 构建）。记录实际文件范围、命令、源码及契约内容指纹；不清理用户目录或执行 git clean。TODO 8 的真实 Worker 产物及 Web 构建另行验证，不能代替源码独立性。

验证只使用确定性 Adapter、临时数据和受控进程；不运行付费评测命令、真实 Provider、完整 Benchmark 或 GEPA 优化。Worker 本地打包/消费不要求下载官方任务镜像或 ALFWorld 数据；缺少 Node、esbuild、依赖、Chrome、macOS 沙箱、Python/uv 等所需条件时如实记录阻塞，不能跳过必需检查后报告通过。既有失败记录原因并按授权边界处理，不改验收要求。

### Latest Result

- 状态：未执行。
- 验证时间：未执行。
- 测试提交与相关未提交改动：尚无实现或行为测试结果；运行时记录候选提交、相关未提交文件与差异/内容指纹。
- 验收契约：当前对话批准的完整 spec.md；运行时记录对应内容指纹。
- 验证摘要：尚未实施或执行 Feature Verification；本计划的文档校验不代表上述行为通过。
- 未解决项：九个 TODO 及全部功能验收待执行；当前无新增需用户裁决的范围问题。
