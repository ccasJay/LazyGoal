# TUI 沙箱透明代理运行时实施计划

## 实施任务

依次完成下列任务及其子任务；当前均未实施，新增测试入口均标为“待实现”。涉及公共契约和架构的实现同步遵守 [设计中的文档要求](./design.md#components-and-interfaces)。

- [x] //TODO 1. 实现 TUI 主运行时的外部沙箱扩展配置接口
  - 实现目标：扩展 `packages/tui/src/cli.tsx` 的通用依赖注入并拆出可挂载已有 Controller 的入口，支持显式 Profile、Registry、Policy、PreparationExecutor、LLMAdapter 和执行控制；不导入 EnvironmentSpec。
  - 成功标准：注入一个外部工具集时只装配该工具集；默认启动仍使用当前配置，并且不加载 Benchmark 模块。
  - 验证方式：扩展 `packages/tui/test/cli.test.ts`（新增场景待实现），覆盖显式注入、Profile 未注册工具和默认接线。
  - Requirements: [2.3](./requirements.md#req-2-3), [3.1](./requirements.md#req-3-1), [4.4](./requirements.md#req-4-4)

- [x] //TODO 2. 实现虚拟工作区 (Virtual Workspace) 持久化重定向
  - 实现目标：为 TUI 装配增加独立 dataDirectory，将 Store、Trace 和 Sidecar 接入同一尝试目录；Catalog 继续使用现有 GoalStore 查询。
  - 成功标准：空输出目录无需默认 Profile 即可启动；不同尝试不覆盖，所有本次状态均在 output-dir 内，原工作区文件及 Catalog 查询结果不变，且没有独立 catalog.json。
  - 验证方式：`packages/tui/test/sandbox-persistence.test.ts`（待实现），检查真实临时目录、查询结果及文件内容指纹。
  - Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4)

- [ ] //TODO 3. 拦截沙箱工具并双向代理至 ToolRegistry
  - [ ] //TODO 3.1 实现工具 RPC 与 Mux 通道
    - 实现目标：扩展 `benchmarks/src/multiplex.ts` 并新增 `tool-rpc.ts`，实现 describe/execute/cancel/backend 消息、关联校验、顺序控制和有界等待；保持 ACP/LLM 原行为。
    - 成功标准：合法调用得到对应 Observation；非法帧、重复执行 ID、工具契约不匹配、超时和断线均失败且不重发执行。
    - 验证方式：扩展 Mux 测试并新增 `benchmarks/test/tool-rpc.test.ts`（待实现），使用双向内存流和执行计数验证。
    - Requirements: [3.1](./requirements.md#req-3-1), [3.5](./requirements.md#req-3-5), [4.4](./requirements.md#req-4-4)
  - [ ] //TODO 3.2 接入两个 Benchmark 的工具服务入口
    - 实现目标：在 GAIA/SWE-bench 各自目录抽取共用 manifest 并新增 tools-worker-entry，复用各自工具构造与环境预检；GAIA 网络工具接入受限宿主后端。
    - 成功标准：工具 Worker 不创建 Goal 或 LLM；文件与命令只影响指定容器工作目录，未配置后端在启动期失败，Worker 无宿主凭据；取消终止在途工具及子进程。
    - 验证方式：`benchmarks/gaia/test/tools-worker.test.ts`、`benchmarks/swebench/test/tools-worker.test.ts`（待实现），真实子进程加临时目录、脚本化后端，另跑依赖检查。
    - Requirements: [1.1](./requirements.md#req-1-1), [3.1](./requirements.md#req-3-1), [3.5](./requirements.md#req-3-5)
  - [ ] //TODO 3.3 将远程工具代理接入宿主 Runtime
    - 实现目标：在 `benchmarks/src/` 实现以共享 manifest 构造的远程 ToolRegistration，经 runAgent 的 Mux 接入 TUI Registry；prepare 不发送 execute。
    - 成功标准：宿主模型看到目标工具；实际执行来自唯一 Worker，宿主同名工具不会被调用；响应身份不符或连接失败时中止执行并保留检查点。
    - 验证方式：`benchmarks/test/remote-tool-registry.test.ts`（待实现），让真实 Runner 驱动代理，检查出站消息与提交事实。
    - Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.5](./requirements.md#req-3-5)

- [ ] //TODO 4. 实现自动 (Auto) 与人工审批 (Review) 的双模 ToolPolicy
  - 实现目标：在 Benchmark 组合层构造 allow/require_approval 策略，注入现有 Runner；接通 SessionScreen 的单次批准和带理由拒绝。
  - 成功标准：auto 自动执行合法授权动作；review 中 bash、写入、submit_answer 及未知名单工具均暂停，批准后只执行一次，拒绝产生 rejected Observation 且 Worker 执行次数为零。
  - 验证方式：`benchmarks/test/tui-tool-policy.test.ts`（待实现），使用 Runner、Coordinator、代理及 Worker 计数的组合测试，不能仅断言 Policy 返回值。
  - Requirements: [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4)

- [ ] //TODO 5. 绑定沙箱回收接口至 ShutdownCoordinator
  - [ ] //TODO 5.1 为环境运行增加有界强制清理
    - 实现目标：扩展 `benchmarks/src/isolated-environment.ts` 的 forceSignal 和共享清理预算，仍由 run() 统一停止 Worker、收集产物、删除容器，处理取消期间的迟到启动。
    - 成功标准：正常、启动失败和取消都不跳过已取得资源的回收；30 秒总宽限期耗尽后停止收集，再以最多 5 秒尝试强制清理；删除失败可定位且不宣告成功。
    - 验证方式：扩展 `benchmarks/test/isolated-environment.test.ts`（新增场景待实现），注入时钟和进程边界，覆盖慢回收、失败删除、重复取消及原 Headless 行为。
    - Requirements: [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [1.5](./requirements.md#req-1-5)
  - [ ] //TODO 5.2 接入 TUI 全阶段清理与退出
    - 实现目标：新增 `benchmarks/src/tui-benchmark-runner.ts`，在环境启动前注册生命周期资源与信号入口，复用取消/强制路径；正常完成与 SIGINT 分别接入退出处理。
    - 成功标准：初始化、执行、审批和清理阶段的 Ctrl-C 都保留最后成功快照并返回 130；正常终态返回 0，运行/清理失败返回 1；每次只收集一次产物，无并发删除。
    - 验证方式：`benchmarks/test/tui-benchmark-runner.test.ts`（待实现），检查真实 Gate 的保存顺序、注入 ExitPort 和 raw-mode/SIGINT 的幂等接线。
    - Requirements: [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [1.5](./requirements.md#req-1-5), [4.3](./requirements.md#req-4-3)

- [ ] //TODO 6. 接通单任务 CLI 与确定性 Preparation
  - 实现目标：修改两个 Benchmark CLI 的显式 --tui 分支，接入任务选择、模式、输出目录、Profile/模型/预算配置；抽取复用 descriptor PreparationExecutor，创建唯一 Goal 并通过 Coordinator 自动批准预定义任务。
  - 成功标准：有效命令进入目标任务；无效模式、缺失参数、非唯一任务和恢复参数在容器创建前返回 2；auto 无 intent/Planning 等待，遇到用户输入阻塞以未完成结果退出，未带 --tui 的入口保持原行为。
  - 验证方式：扩展两个基准的 CLI 测试和 `benchmarks/test/tui-benchmark-runner.test.ts`（新增场景待实现），检查零额外 Goal、任务字段与配置传递。
  - Requirements: [2.5](./requirements.md#req-2-5), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4)

- [ ] //TODO 7. 实现已提交执行进展的实时投影
  - 实现目标：在 TUI 装配层发布成功保存通知，扩展 SessionController、ViewModel 和 SessionScreen，显示初始化、模式、任务、执行事实及清理状态，并注销订阅。
  - 成功标准：阻塞下一次模型响应时，上一已提交 Action/Observation 和 Step 数已经可见；tail、旧读取结果和关闭后的事件不污染界面，busy 期间不能重复审批。
  - 验证方式：`packages/tui/test/session-progress.test.tsx`（待实现），结合真实 Store 和受控 Promise，用 Ink 渲染断言中间帧、去重及输入门控。
  - Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3)

- [ ] //TODO 8. 接通领域产物、Attempt 与结束摘要
  - 实现目标：抽取两个基准现有答案/补丁导出逻辑，TUI 路径只回收领域产物，组合宿主 persistence locator 写入 Attempt，渲染执行、评分和清理结果。
  - 成功标准：回收不覆盖宿主 Goal；GAIA 错误答案明确显示 correct=false，SWE-bench 补丁不被标记为 resolved；必要产物缺失或清理失败返回 1，错误诊断保留。
  - 验证方式：在两个基准的 environment-spec/report 测试中增加 TUI 场景（待实现），检查真实输出文件、统一身份及原 Headless 导出行为。
  - Requirements: [2.2](./requirements.md#req-2-2), [2.4](./requirements.md#req-2-4), [4.3](./requirements.md#req-4-3), [5.4](./requirements.md#req-5-4)

- [ ] //TODO 9. 建立完整 TUI 沙箱链路的自动化验证入口
  - 实现目标：新增隔离的进程集成测试及显式 Docker 冒烟脚本，使用脚本化 LLM、最小任务和可控工具阻塞点，覆盖 CLI 到产物/退出的完整路径。
  - 成功标准：auto 无按键结束；review 拒绝不执行、批准只执行一次；任务结束前出现进展；启动和执行中 SIGINT、回收超时均能检查清理结果及输出隔离。
  - 验证方式：`benchmarks/test/tui-sandbox.integration.test.ts`、`benchmarks/scripts/tui-sandbox-smoke.ts`（待实现）；容器检查按本次名称/ID 查询，不能用全局容器列表为空代替。
  - Requirements: [1.3](./requirements.md#req-1-3), [1.5](./requirements.md#req-1-5), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [5.2](./requirements.md#req-5-2)

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。以下是待审批的计划检查，不是已执行证据。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[2.3](./requirements.md#req-2-3)、[4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2)、[5.1](./requirements.md#req-5-1) | 两个基准各以空输出目录启动单任务；预检/握手之前无模型调用；task/Profile/模型/预算正确；默认 review；auto 自动通过 Preparation，遇到用户输入等待以未完成结束；非法输入零容器创建 | CLI、装配、Runner 集成测试（新增场景待实现） |
| [2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2)、[2.4](./requirements.md#req-2-4)、[2.5](./requirements.md#req-2-5) | 两次尝试目录独立，实际 Snapshot/Trajectory/Trace/Sidecar/Attempt 与产物均位于 output-dir；原工作区指纹及 Catalog 不变，无 catalog.json；拒绝恢复已销毁环境 | 真实文件系统及产物测试（待实现） |
| [3.1](./requirements.md#req-3-1)、[3.2](./requirements.md#req-3-2)、[3.3](./requirements.md#req-3-3)、[3.4](./requirements.md#req-3-4) | 模型只看到目标 manifest；auto 不绕过 Profile/输入校验；review 的 bash/write/edit/submit/未知名单工具等待；批准前及拒绝后远端计数为零，批准后恰好一次，后续动作重新审批 | Runtime + RPC + Worker 组合测试及两个基准的容器冒烟（待实现） |
| [3.5](./requirements.md#req-3-5) | 错误 Schema、非法响应、重复/错误 ID、超时和断线不触发重发或宿主执行；backend 只能服务当前已授权动作，缺失配置或未知后端方法失败 | 协议失败路径及真实子进程测试（待实现） |
| [5.2](./requirements.md#req-5-2)、[5.3](./requirements.md#req-5-3) | 下一次模型响应尚未完成时显示上一提交；tail 不显示为完成，晚到读取不回退状态；模式、审批、清理状态准确，busy 输入被禁止，卸载后无更新 | Ink 中间帧断言和受控进程集成测试（待实现），不只搜索最终 stdout |
| [1.2](./requirements.md#req-1-2)、[1.3](./requirements.md#req-1-3)、[1.4](./requirements.md#req-1-4)、[1.5](./requirements.md#req-1-5)、[4.3](./requirements.md#req-4-3) | 正常、各启动阶段失败、审批/执行中取消、重复 SIGINT、回收超时、删除失败；验证唯一清理顺序、30+5 秒预算、最后检查点及退出码；Docker 删除失败必须带本次身份诊断 | 注入时钟/ProcessRunner 的故障测试，进程退出断言及实际容器 ID 检查（待实现） |
| [5.4](./requirements.md#req-5-4)、[2.4](./requirements.md#req-2-4)、[4.3](./requirements.md#req-4-3) | GAIA 正确/错误答案、SWE-bench 补丁、缺失必要产物和清理失败均有准确摘要/Attempt；SWE-bench 未运行官方评分时不出现 resolved 成功结论 | 领域结果和 TUI 摘要组合断言（待实现） |
| [4.4](./requirements.md#req-4-4) | 原 Headless 批量评测、普通 TUI、ACP/LLM Mux、容器状态回收和依赖边界保持原行为 | 现有回归及新增分支隔离场景 |

验证顺序：先静态与离线回归，再运行显式容器冒烟。现有入口为 `npm test`、`npm --prefix benchmarks run typecheck`；前者包含 packages 类型检查、依赖检查和确定性测试。新测试按仓库现有发现规则接入，不把 Docker 冒烟混入默认测试。待实现脚本的计划命令为 `npx tsx benchmarks/scripts/tui-sandbox-smoke.ts`，使用假模型且同时覆盖 GAIA/SWE-bench；缺少 Docker 时记录未验证，不能标记通过。

### Latest Result

- 状态：未执行；TODO 均未完成，新增验证入口尚待实现。
- 证据：本次仅修订 Spec；此前基线测试不构成本修订功能的验收证据。
- 执行后记录：逐项实际结果、证据路径、时间、被测提交或文件指纹、对应 Spec 指纹、整体状态及证据时效。
