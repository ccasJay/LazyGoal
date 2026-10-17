# Runtime 独立组件提炼执行计划

## 执行依据与边界

当前 [spec.md](./spec.md) 的解耦修订已在本对话批准。本计划保留原有 6 个 TODO，补齐 ManagedResource 成功、拒绝与未完成的验证，以及资源注册表的错误保留与强制升级证据；本次完整 Plan 待审阅。

本计划覆盖 19 项验收标准，风险与限制以 [Spec 风险章节](./spec.md#风险与否定性保证) 为准。任务顺序为 1 → 2 → 3 → 4 → 5 → 6；每个 TODO 包含行为、实现和相应验证。

本轮不依赖 Agent 或 Process Spec 完成。TODO 1 验证通用生命周期和注册表，不读取具体进程内部状态；真实进程的启动竞态、输出/终态写入及故障关闭由 [Process Spec](../process-runtime-extraction/spec.md) 验收。既有正常进程回归仍保留；本轮受控资源通过不能证明旧 ProcessManager 的已知缺陷已经修复。后续 Process 组合验收消费 TODO 1 的组件及证据，不要求本计划全部完成，也不将其故障测试回推成本轮前置。

新增测试入口均标记为“拟新增”，尚不存在、未执行；现有测试迁移到新入口时保留原场景与断言强度。每个 TODO 先建立其可观察验证，确认失败原因对应缺失行为，再实现并运行相关回归；不要求已有有效断言机械重跑失败。

本计划不新建 SDK 包或迁移 Benchmark，不改变持久化格式与授权语义。源码、公开契约 TSDoc 及所属模块说明在对应 TODO 同步；目录变化按需更新根布局说明。当前工作树中的技能和 AGENTS 已有修改属于前序工作，不自动纳入功能实现提交。

## 任务清单

- [x] //TODO 1. 单独关闭运行时实例，保护检查点并明确资源结算结果
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[5.1](./spec.md#spec-req-5-1)。
  - 先验证：在拟新增 `packages/runtime/test/runtime-lifecycle.test.ts` 中使用可控保存、受管资源和 fake clock，验证关闭立即拒绝新受理、冻结新写入、中止实例活动、等待在途保存及受理操作；借用资源和宿主共享控制器不被关闭。覆盖同一关闭 Promise、正常和强制阶段期限、关闭异常、不响应资源及迟到拒绝；超时失败不得报告 closed 或允许重用实例。用受控 Node 子进程证明 close 后仍能输出成功标记并正常结束。
    资源场景分别提供确认完成、明确拒绝、正常阶段未完成但可强制结算，以及两阶段均未完成的实现；核对注册表保留失败原因与未结算身份，不因移除注册项或空集合报告成功，仍对需要升级的资源调用 forceClose。上述替身必须如实遵守 ManagedResource 契约，不把不透明资源内部状态另行纳入生命周期。
  - 实现：从 shutdown 提取 `lifecycle/index.ts`、关闭核心与资源管理实现，保留原 Checkpoint Gate；维护受理操作、资源拒绝/未完成信息与强制升级资格，不新增 Goal 业务状态。同步 ManagedResource 的成功、失败及未完成语义，不通过注销丢弃已观察到的清理错误。将 ExitPort、ProcessExitPort 和退出协调移到 goal-server，最小调整现有组合根使当前服务继续可用；退出适配调用唯一关闭核心，删除迁移后的旧实现与陈旧导出。保留 `shutdown.test.ts` 的 Gate/资源断言，将进程退出断言归入应用测试，并同步 Runtime 契约与说明。
  - 检查：`npx tsx --test packages/runtime/test/runtime-lifecycle.test.ts packages/runtime/test/shutdown.test.ts apps/goal-server/test/process-lifecycle.integration.test.ts`；`npx tsc --noEmit`；`npx tsc --noEmit -p apps/goal-server/tsconfig.json`。应用自有 HTTP 资源与实例资源的最终分离在 TODO 4 完成。

- [x] //TODO 2. 通过组件入口注入现有 Port，独立组合并推进 Goal
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[3.1](./spec.md#spec-req-3-1)、[5.1](./spec.md#spec-req-5-1)、[5.4](./spec.md#spec-req-5-4)。
  - 先验证：在拟新增 `apps/goal-server/test/execution-composition.test.ts` 中从 `src/runtime/index.ts` 消费组件，仅注入确定性 StepExecutor、Profile Registry、工具和 Store。验证 launch 到等待/终态、只读恢复不推进、continue 创建新 Run、各执行对象共享同一 Store/Trajectory/提交边界，以及初始保存失败不调用执行器或工具；替换执行器、Store 和工具不改组件源码，输入依赖仍归调用方拥有。
  - 实现：新增 `runtime/execution-composition.ts` 与最小目录入口，组合既有 Launcher、Runner、InlineScheduler、Coordinator 和共享提交器，返回所需 commands Port；复用已有类型和业务结果。此层不解析环境或准备具体模型、文件存储和默认工具；不返回内部执行对象或增加插件配置。为新契约补中文 TSDoc 与最小示例，并在 goal-server 说明中记录该组件职责。
  - 检查：`npx tsx --test apps/goal-server/test/execution-composition.test.ts packages/runtime/test/launcher.test.ts packages/runtime/test/goal-coordinator.test.ts packages/runtime/test/trajectory-checkpoint-committer.test.ts`；检查导入图和测试调用不经过 CLI、HTTP 或原组合根，生命周期接线在 TODO 3 完成。

- [x] //TODO 3. 无需 HTTP 构造应用运行时，并统一操作受理与自有资源管理
  - 落实标准：[1.4](./spec.md#spec-req-1-4)、[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[4.1](./spec.md#spec-req-4-1)、[5.1](./spec.md#spec-req-5-1)。
  - 先验证：在拟新增 `apps/goal-server/test/runtime-composition.integration.test.ts` 中用临时 Home/工作区和确定性 Adapter，经目录入口构造、运行与关闭。验证不创建 HTTP、不注册进程信号或退出；配置路径和优先级保持；冲突推进明确拒绝而 Steer、Interrupt 和读取可用。覆盖成功保存后通知、订阅解除/故障不取消执行、构造中途失败清理自有资源并保留初始故障，以及在途权限、模型、归档和删除操作参与关闭结算。
  - 实现：将现有默认依赖装配移入 `runtime/composition.ts`，复用 TODO 1/2，同一 Gate、根信号与受理边界贯穿实例调用。区分自建与借用资源，跟踪实际受理操作及其失败；对既有模型、查询和管理能力只暴露消费者所需 Port，不建立通用 SDK 操作组。移动时保留当时已有的模型与进程接线，不为等待其它拆包增加兼容路径或重写 ProcessManager。同步配置、数据目录、资源所有权及事件契约说明。
  - 检查：`npx tsx --test apps/goal-server/test/runtime-composition.integration.test.ts apps/goal-server/test/execution-composition.test.ts apps/goal-server/test/sandbox-persistence.test.ts apps/goal-server/test/prompt-bundle-integration.test.ts`；`npx tsc --noEmit -p apps/goal-server/tsconfig.json`。故障注入只使用临时数据和受控替身，不以真实 Provider 或用户 Goal 验证。

- [x] //TODO 4. goal-server 消费独立组件，保留 Web 控制、查询和服务退出行为
  - 落实标准：[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)。
  - 先验证：扩展现有 `browser-session.integration.test.ts`、`composition-root-model-switching.test.ts` 和 `process-lifecycle.integration.test.ts`，经真实 HTTP 服务验证受理后断连/SSE 关闭不取消执行，审批/恢复、稳定身份重试、busy/旧 Run 拒绝、模型绑定恢复与保存失败保持；补齐权限模式、授权撤销、归档/终态删除及历史/指标读取的实际服务路径。验证 SIGINT 及普通退出均释放应用资源，运行时关闭失败时 HTTP 仍被尝试关闭，SIGINT 退出码仍为 130。
  - 实现：外层 composition-root 只消费 runtime 目录入口并装配 HTTP、路由和 Browser Port，CLI 负责信号与退出。HTTP/浏览器资源归应用，执行实例资源归生命周期；移除重复 Runner/Coordinator、关闭算法及不再需要的内部对象依赖，不增加兼容壳。更新原调用方与测试接线，保持 wire 契约与断言强度；同步 goal-server overview、semantics 及受影响布局导航。
  - 检查：`npm --prefix apps/goal-server test`；`npx tsc --noEmit -p apps/goal-server/tsconfig.json`；保留现有工具、配置和持久化回归。浏览器整体验收命令列于 Feature Verification，使用现有确定性服务替身。

- [x] //TODO 5. 用现有检查入口约束组件依赖、调用入口及源码使用
  - 落实标准：[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)。
  - 先验证：扩展现有 `scripts/check-dependencies.test.mjs` 的临时工程样本，确认合法入口及目录内部引用通过；宿主反向导入、执行装配引用具体 Provider/文件存储、生命周期引用应用、跨目录穿透、直接退出/信号 API 和项目产物导入均定位失败。覆盖 import/export、侧效导入、字面量动态导入与路径归一化，允许第三方依赖产物；生产入口规则与内部单元测试例外均有证据。
  - 实现：在现有依赖检查中增加 Spec 的定向目录与入口约束，识别所需模块引用和直接进程 API；可复用已安装 TypeScript 解析能力，不另建架构框架。将本次组件及消费型测试纳入相应扫描，增量保留原有及其它 Spec 已加入的包间/DTO 规则与确定性错误；证明新目录源码和测试被实际发现，不为既有包层级重写 CI。所属说明只记录约束含义，源码规则持有实际判定。
  - 检查：`node --test scripts/check-dependencies.test.mjs`；`npm run check:dependencies`；`npm run check:docs`。执行时核对新组件测试在根回归输出中被运行，并记录无旧产物验证，不能仅以命令退出码证明没有漏扫。

- [ ] //TODO 6. 从文件快照重建实例并恢复同一 Run，验证未知副作用与显式后继 Run
  - 落实标准：[2.4](./spec.md#spec-req-2-4)、[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[5.4](./spec.md#spec-req-5-4)。
  - 先验证：在拟新增 `apps/goal-server/test/runtime-recovery.integration.test.ts` 中，经 runtime 目录入口跑“launch → 问答/审批等待 → close → 重建 → restore → resume”，核对同一 goalId/runId、匹配交互身份、累计 stepCount、已提交轨迹与工具实际调用次数。另覆盖终态后 continue 归档旧 Run 并创建新 Run，错 Run/requestId/actionId、损坏 Snapshot、缺失工具拒绝，以及关闭后的结果未知工具不被包装层盲重试；关闭超时的旧实例不能被当作安全重建依据。
  - 实现：补齐实际装配路径的恢复接线及对应测试，沿用原 RecoveryReader、Coordinator、Tool replay policy 和模型绑定规则，不增加迁移、后继 Run 自动调度或第二套状态真相。资源与作用域断言使用临时文件存储和可计数的执行/工具替身，复用有效既有夹具；更新 owning overview 的恢复说明及 Spec 中事实来源链接，使其指向最终唯一实现。
  - 检查：`npx tsx --test apps/goal-server/test/runtime-recovery.integration.test.ts packages/runtime/test/goal-multi-run-recovery.test.ts packages/runtime/test/permission-grant-recovery.test.ts packages/runtime/test/run-interrupt.test.ts packages/runtime/test/run-steer.test.ts`。随后执行以下完整 Feature Verification；任务打勾与功能验收通过分别记录，完成 TODO 不改写其描述。

## Feature Verification

### Planned Checks

下列新增测试均在相应 TODO 实现。测试文件位于既有模块的 `test/` 下；要求断言实际效果、调用次数、身份与持久化事实，不以对象存在或目录名称作为独立性证明。

| 验收项 | 对应标准 | 场景与可观察预期 | 检查入口 / 证据 |
| --- | --- | --- | --- |
| 独立执行链与一致提交 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3) | 仅注入现有 Port 完成推进；无应用配置/HTTP 依赖；初始保存、pendingAction、Observation 与下一调用顺序不变。 | TODO 2 命令；拟新增 execution-composition 测试及既有 Launcher/提交器测试。 |
| 装配失败与资源归属 | [1.4](./spec.md#spec-req-1-4)、[2.2](./spec.md#spec-req-2-2) | 在资源创建、配置或初始保存处故障；已创建资源释放，借用资源不关闭；未保存初始 Goal 时模型/工具调用数为零，原始故障可辨识。 | TODO 3 命令；拟新增 runtime-composition 故障场景。 |
| 活动关闭与在途写入 | [2.1](./spec.md#spec-req-2-1)、[2.3](./spec.md#spec-req-2-3) | 阻塞保存/写控制时发起关闭；立即关闭受理、保留进入边界的写入结算；无伪造取消终态、不启动新的模型/工具调用；重复关闭不重复清理。 | TODO 1/3 命令；fake clock、deferred 保存/管理操作与 Snapshot 断言。 |
| 有界强制与失败后果 | [2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4) | 正常/强制资源不响应、异常与迟到拒绝；两个期限均生效，剩余类别与原因可查，失败实例不可重新受理，不声称持久化位置可安全立即复用。 | 拟新增 runtime-lifecycle 测试与子进程探针，记录期限、结果和宿主继续工作的成功标记。 |
| 资源契约与强制升级 | [2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3) | 资源成功、拒绝及正常关闭 pending 分别可辨识；未完成资源仍可被强制关闭，已知错误不因注销或集合清空消失，不能假报成功。 | TODO 1 的资源调用计数、注册表剩余身份与类型化结果；真实 ProcessManager 故障组合归 Process Plan。 |
| 等待后重建与身份匹配 | [2.4](./spec.md#spec-req-2-4)、[3.2](./spec.md#spec-req-3-2) | 文件落盘后关闭并重建，读取不执行，合法交互恢复同一 Run；错身份、损坏快照或缺失实现拒绝；未知副作用按现有恢复路径等待确认。 | TODO 6 命令；拟新增恢复测试中的 Snapshot、轨迹及调用计数。 |
| 结果与后继 Run | [3.1](./spec.md#spec-req-3-1) | 等待不是完成；终态后显式 continue 创建新 Run 并保留旧记录，不重置 Goal 策略、不自动消费 Todo。 | TODO 2/6 命令，核对 Goal/Run 身份、消息和历史记录。 |
| 冲突推进与控制通道 | [3.3](./spec.md#spec-req-3-3) | 活动执行中冲突推进拒绝，Steer/Interrupt 仍可受理并按原规则保存；Plan Mode 与权限拒绝保持。 | TODO 3/4 命令及既有 run-steer、run-interrupt、权限恢复测试。 |
| 事件不控制执行 | [3.4](./spec.md#spec-req-3-4)、[4.3](./spec.md#spec-req-4-3) | 保存后才通知；退订、回调异常、慢消费者或 HTTP/SSE 断开不取消已受理任务；查询恢复仍读取已提交事实。 | TODO 3/4 命令；`npx tsx --test packages/runtime/test/execution-stream-runtime.test.ts packages/execution-stream/test/execution-stream.test.ts`。 |
| 单一无界面装配与真实接入 | [4.1](./spec.md#spec-req-4-1) | 独立实例不创建服务或注册信号；Web 使用同一组件入口与执行链，受理后可观察模型/工具事实。 | TODO 3/4 命令，代码依赖门及真实 HTTP 服务测试。 |
| Web 行为与宿主退出 | [4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3) | 控制、模型/权限、查询、归档/删除和错误保持；失败关闭仍尝试 HTTP 清理；SIGINT 由宿主产生退出码 130。 | `npm --prefix apps/goal-server test`；下述浏览器验收；既有 CLI/进程测试与新增退出断言。 |
| 目录入口和机器边界 | [5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2) | 从入口消费成功；各类非法依赖/引用形式、进程 API 和穿透路径产生可定位违规，合法重导出和内部引用不误报。 | TODO 5 命令及实际源码检查；审阅入口导出只包含需要的契约。 |
| 源码与发现范围 | [5.3](./spec.md#spec-req-5-3) | 新源码与测试均被检查/回归实际发现；项目产物导入拒绝，第三方产物允许；没有旧构建产物仍能运行组件。 | TODO 5 命令与根回归输出；在临时源码副本运行 TODO 2/3/6 的相同测试命令并记录文件范围。 |
| 依赖替换与所有权 | [5.4](./spec.md#spec-req-5-4) | 从同一入口替换执行器、内存/文件 Store 和工具；行为、故障及借用资源契约保持，无内部源码修改或插件平台。 | TODO 2/3/6 命令，替身调用计数、文件恢复事实及 close 计数。 |

完成任务后的综合检查：

```sh
npx tsc --noEmit
npx tsc --noEmit -p apps/goal-server/tsconfig.json
npm run check:dependencies
npm run check:docs
npm test
npm run build:web
node --test --test-concurrency=1 apps/goal-board/e2e/*.test.mjs
git diff --check
```

源码独立验证在临时副本中进行：复制当前候选源码、配置、测试和必要 Prompt/源资源，保留可解析的已安装依赖，省略项目派生产物后运行 TODO 2/3/6 的入口命令。记录源码与 Spec 指纹、测试入口和结果；不清理用户目录，不运行 git clean，不删除当前工作区已有产物。Web 的构建产物仅供浏览器验收使用，与组件源码验证分别记录。

根回归包含既有 Benchmark 确定性测试，不迁移其装配，也不运行真实 Benchmark、GEPA 或付费模型。macOS 沙箱、Chrome、Node、Python/uv 等必要环境缺失时记录阻塞，不能跳过所需检查后报告通过。可由自动化建立的结果无需额外手工体验门槛；分支验收与合入仍由 executing-plan 的审批流程处理。

### Latest Result

- 状态：未执行。
- 验证时间：未执行。
- 测试提交与相关未提交改动：尚无实现测试状态；待运行时记录提交及涉及文件的差异或内容指纹。
- 验收契约：当前 spec.md 的解耦修订已批准；本 Plan 已对齐，待完整计划审阅。实际测试时记录对应内容指纹。
- 验证摘要：尚未开始实现或功能验证；本计划的文档检查不代表上述行为通过。
- 未解决项：上述实现、确定性测试与组合验收均待执行；当前没有新增需用户裁决的范围问题。
