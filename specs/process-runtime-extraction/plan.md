# 进程会话组件提炼与生命周期收敛执行计划

## 执行依据与边界

当前 [spec.md](./spec.md) 已在本对话批准。本计划覆盖全部 22 项验收标准；风险、权限和否定性保证以 [Spec 风险章节](./spec.md#风险与否定性保证) 为准，不新增工具协议、存储格式、PID 恢复或其它工具拆包。

任务按 1 → 2 → 3 → 4 → 5 → 6 推进。TODO 1–4 可独立验证管理器；TODO 5 的组合关闭必须使用已实现并验证的 RuntimeLifecycle/资源注册表，前置契约见 [Spec 依赖说明](./spec.md#依赖契约与验收归属)。不要求 Runtime 整份交付，不依赖 Agent 拆包；前置缺失时如实记录组合验证阻塞，不复制生命周期算法或以旧吞错注册表、替身结果代替验收。本文件不定义跨 Spec 分支编排，也不授权执行其它 Spec。

每个 TODO 先建立能观察对应行为的验证，确认失败来自缺失行为，再实现并运行相关回归；有效的已有断言可直接复用。下文新包及测试入口均为拟新增、尚未执行。保留迁移测试的场景与断言强度，不用固定 sleep 或资源集合清空替代进程退出和写入结算证据。

测试只使用临时目录、受控 Node 子进程和符合 Port 的可控 Store。故障注入发生在真实异步/存储边界，不增加仅为测试存在的公开 spawn、时钟或故障配置。每个进程探针保留独立于被测 close 的清理路径，测试失败或超时也须清理本次拥有的子进程；不使用用户进程、历史 PID、用户 Goal 或付费模型。

## 任务清单

- [x] //TODO 1. 通过独立包入口管理进程，并迁移现有消费者
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[6.1](./spec.md#spec-req-6-1)、[6.3](./spec.md#spec-req-6-3)。
  - 先验证：在拟新增 `packages/process-runtime/test/process-manager.test.ts` 中，经 `src/index.ts` 注入内存/临时文件 Store，直接启动输出探针、等待/读取输出、停止并关闭；核对进程身份、真实退出、记录及宿主继续运行。构造不 spawn 或读取配置，不需要 Agent、ToolRegistry 或 HTTP，借用资源不被关闭。迁移已有管理器场景，保留 tools 的真实工具生命周期回归。
  - 实现：迁入 ProcessManager 与额度常量，创建最小包入口，移除 tools 的旧文件及转导出；搜索并迁移全部当前源码、测试和所属模块说明的引用，goal-server 只调整当时装配位置中的进程接线。沿用私有包与直接源码消费方式，登记必要依赖门条目使当前消费者可检查，不新增发布/构建机制。补齐公开契约中文 TSDoc、示例和新包 README、overview、semantics，按职责更新 Tools/宿主链接；历史 Spec/Memory 不批量改写，相关记忆的权威路径变化仅记录为维护候选。竞态与失败语义在后续任务落实，不将正常路径通过表述为完整关闭保证。
  - 检查：`npx tsx --test packages/process-runtime/test/process-manager.test.ts packages/tools/test/process-tools.test.ts packages/storage/test/process-session-store.test.ts apps/goal-server/test/process-lifecycle.integration.test.ts`；`npx tsc --noEmit`；`npx tsc --noEmit -p apps/goal-server/tsconfig.json`；`npm run check:dependencies`；搜索确认旧导入和管理器重复定义已移除。

- [ ] //TODO 2. 结算并发启动、额度与启动关闭竞态
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[5.4](./spec.md#spec-req-5-4)。
  - 先验证：在拟新增 `packages/process-runtime/test/process-startup.test.ts` 中控制 list/初始保存/running 保存的完成顺序，覆盖每 Goal 4、宿主 16 和历史 32 的临界并发；已落盘会话与未落盘预留不重复计数，拒绝不排队或 spawn。覆盖初始保存失败、spawn/异步 error、快速退出、running 写入失败及关闭插入每个异步边界；关闭后不产生新的命令标记，已有句柄仍能被清理，迟到 running 不覆盖终态，初始错误不被 failed 记录写入错误覆盖。
  - 实现：在首次异步操作前预留启动并纳入统一结算，按真实失败/退出释放额度；在后续异步边界检查 closing。初始记录先于 spawn；取得句柄即安装事件与输出处理，再进行异步 running 写入。以同一会话所有者协调状态写入，资源登记只保留管理器一项；注册失败时不能继续启动，已接收启动不因尚未进入活跃集合而逃逸。建立必要的组件错误分类与原因保留，具体输出和停止结算在 TODO 3/4 完成。
  - 检查：`npx tsx --test packages/process-runtime/test/process-startup.test.ts packages/process-runtime/test/process-manager.test.ts packages/tools/test/process-tools.test.ts`；核对接收/拒绝数、记录数、命令执行标记和独立清理结果，而非仅观察调用返回。

- [ ] //TODO 3. 保持输出顺序并等待日志与终态写入结算
  - 落实标准：[2.3](./spec.md#spec-req-2-3)、[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)。
  - 先验证：在拟新增 `packages/process-runtime/test/process-output.test.ts` 中，以分段 stdout/stderr 和可控 append/终态保存验证每通道顺序、退出后仍等待已接收写入、追加失败可辨识及无未处理拒绝。分别通过输出结算、进程退出、关闭与等待超时唤醒 waitForOutput，核对监听器/定时器释放及后续读取以 Store 为准。复用文件 Store 的轮转与绝对游标/gap 断言，保留工具输出截断和等待上限。
  - 实现：每通道串行追加，跟踪写入与终态结算，保留已知失败且继续其它清理；不能通过清空句柄丢弃未完成写入。统一事件失败的接收路径，补齐等待者的结束与清理，复用 Store 协议和工具读取映射。移除因缺少结算证据而使用的测试固定延迟，改由实际完成信号确认，不降低原断言。
  - 检查：`npx tsx --test packages/process-runtime/test/process-output.test.ts packages/process-runtime/test/process-startup.test.ts packages/tools/test/process-tools.test.ts packages/storage/test/process-session-store.test.ts`；核对通道字节顺序、追加/终态任务结算与失败阶段，进程退出本身不能充当持久化成功证据。

- [ ] //TODO 4. 如实停止与关闭进程，允许强制升级且不丢失错误
  - 落实标准：[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[5.4](./spec.md#spec-req-5-4)。
  - 先验证：在拟新增 `packages/process-runtime/test/process-shutdown.test.ts` 中，验证 stop 确认本实例句柄退出和最终记录，重复停止不重复终态；现有等待窗口到期但无法确认退出时失败，历史记录不授予杀进程权。覆盖 close 同步拒绝启动、重复调用共享清理结果、启动/日志/终态写入 pending、写入失败仍清理其它进程；close 等待时或直接 forceClose 均能终止受控进程组，不先等待 Store。核对错误分类/身份/阶段/原因、无重复终态或泄漏监听/定时器，以及借用依赖和其它管理器进程保持原所有权。
  - 实现：统一启动、句柄、输出与最终记录的结算结果；stop 不能以 stopped 字段或已发送信号报告成功，超时保留未确认状态。close/forceClose 复用同一所有者和清理工作，强制升级不被普通清理的存储等待阻塞；所有可继续的清理仍执行，移除吞错路径并保留类型化原因。清理自身计时与监听资源，不新增实例期限、Goal 状态、宿主退出或按 Goal 关闭接口。同步公开方法的失败、所有权及直接调用可能持续等待的契约。
  - 检查：`npx tsx --test packages/process-runtime/test/process-shutdown.test.ts packages/process-runtime/test/process-startup.test.ts packages/process-runtime/test/process-output.test.ts packages/tools/test/process-tools.test.ts`；以独立观测的进程退出、保存完成、错误与调用次数判定结果。不响应 Store 场景在观测后释放受控 Promise，外层有界性留给 TODO 5。

- [ ] //TODO 5. 由真实生命周期和 goal-server 验证关闭、工具及重启行为
  - 落实标准：[1.3](./spec.md#spec-req-1-3)、[4.5](./spec.md#spec-req-4-5)、[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)。
  - 先验证：扩展现有 `apps/goal-server/test/process-lifecycle.integration.test.ts`，将真实管理器交付给真实 RuntimeLifecycle；验证正常/强制期限、启动和写入阻塞、失败可见、迟到结果及借用资源。拟新增 `apps/goal-server/test/process-runtime-composition.integration.test.ts`，通过当时的应用装配入口及确定性模型依赖，验证默认工具使用同一管理器，正常关闭、装配失败和持久化故障均由同一路径清理；受控宿主关闭后继续输出成功标记。扩展工具/存储回归覆盖跨 Goal 拒绝、跨 Run 读取、原 Schema/失败映射/replayPolicy，以及新宿主对 starting/running 的只读 interrupted 投影且不重放、不操作旧 PID。
  - 实现：以前置生命周期组件及其验证证据可用为门槛，按当前实际位置调整进程装配与资源登记；若已有无界面 runtime 装配则在其中接入，否则只修改现有组合根进程段，不自行提炼 HTTP 或模型层。tools 仍拥有可信身份、输入验证、沙箱准备和结果映射；保留 manual 未知结果恢复及 Goal 删除/归档流程。只处理本包和消费者的接线，不修复或复制其它 Spec 的生命周期算法；发现前置违约时回到其所有者记录缺口，不降低本项验收。
  - 检查：`npx tsx --test apps/goal-server/test/process-lifecycle.integration.test.ts apps/goal-server/test/process-runtime-composition.integration.test.ts packages/tools/test/process-tools.test.ts packages/storage/test/process-session-store.test.ts packages/runtime/test/permission-grant-recovery.test.ts packages/storage/test/action-observation-recovery.test.ts`；`npm --prefix apps/goal-server test`；`npx tsc --noEmit -p apps/goal-server/tsconfig.json`。组合证据记录真实子进程、写入与外层期限结果；前置未落实不得打勾或报告 Feature Verification passed。

- [ ] //TODO 6. 用机器约束包边界，并确认源码、测试与文档实际被发现
  - 落实标准：[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3)。
  - 先验证：扩展 `scripts/check-dependencies.test.mjs` 的正反样本，覆盖普通/类型 import/export、import 类型表达式、侧效与字面量 dynamic import；非法依赖 tools/Agent/应用/Storage 实现、Runtime 反向依赖、跨包内部穿透、宿主退出/信号监听及项目产物导入均定位失败。合法 Runtime/Sandbox 依赖、Node 子进程 API、向自有进程组发信号和包内单测不误禁。核对新测试由根回归实际发现，并从无项目旧产物的源码副本经公开入口独立调用和替换 Store。
  - 实现：在既有检查器中补齐本包依赖、入口及引用形式检查，复用已有解析能力和其它 Spec 已加入的规则，不另建架构框架或扩大白名单掩盖违规。检查 tsconfig、回归发现、文档和 CI 对扁平新包的覆盖，只有存在缺口才作最小修正。补齐公共 TSDoc/示例及新包说明，更新根导航/AGENTS 布局和受影响所有者的 overview/semantics；存储与沙箱契约链接原所有者，不复制为本包协议。
  - 检查：`node --test scripts/check-dependencies.test.mjs`；`npm run check:dependencies`；`npm run check:docs`；`npx tsc --noEmit`。随后执行完整 Feature Verification，核对实际测试文件清单与新包条目；任务完成只改 checkbox，保留 TODO 描述。

## Feature Verification

### Planned Checks

所有新测试均为上述 TODO 的拟新增入口。每项需要观察下表结果；仅有目录、对象或退出码不足以证明行为成立。

| 验收项 | 对应标准 | 场景与可观察预期 | 检查入口 / 证据 |
| --- | --- | --- | --- |
| 独立入口与唯一实现 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[6.1](./spec.md#spec-req-6-1) | 无 Goal/Agent/HTTP 也能使用；内存/文件 Store 经同入口替换，借用资源未关闭；所有消费者已迁移，无 tools 旧实现或转导出。 | TODO 1；拟新增 process-manager 测试、全仓引用检查及公开导出审阅。 |
| 工具、权限与结果保持 | [1.3](./spec.md#spec-req-1-3)、[5.1](./spec.md#spec-req-5-1) | 原 ID/Schema、成功结构、失败码和 replayPolicy 保持；跨 Goal 拒绝，跨 Run 可读，沙箱计划与可信身份继续在工具边界。 | TODO 1/5；process-tools、现有工具/授权与恢复回归，核对原契约和实际调用。 |
| 并发额度 | [2.1](./spec.md#spec-req-2-1) | 同时卡住异步启动，4/16/32 临界仍准确；已保存记录不被预留重复计数，拒绝无进程副作用。 | TODO 2；process-startup 的预留/记录数、实际启动数和命令标记。 |
| 启动顺序与竞态 | [2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4) | 初始保存失败无 spawn；spawn/error 和快速退出均被接收；关闭发生于各等待点无句柄逃逸，终态不被 running 覆盖，原始故障保留。 | TODO 2/3；process-startup、process-output 的受控 Promise、真实退出、记录顺序及错误原因。 |
| 输出与等待 | [3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3) | 每通道顺序和字节游标/gap 保持；退出/关闭等待写入，失败不丢失；等待在输出/退出/关闭/超时后释放资源，读取仍来自 Store。 | TODO 3；process-output、process-tools、process-session-store 的输出字节、追加完成与监听/定时器证据。 |
| 明确停止结果 | [4.1](./spec.md#spec-req-4-1)、[4.4](./spec.md#spec-req-4-4) | 当前句柄退出且记录结算才成功；仅写 stopped 或发信号不能成功；超时失败可辨识，重复停止不重复终态或影响其它归属。 | TODO 4；process-shutdown 的实际退出、写入完成、错误分类与调用计数。 |
| 清理所有权与强制升级 | [4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[5.4](./spec.md#spec-req-5-4) | close 立即拒绝启动；重复关闭不重复工作；Store 阻塞/失败不阻止强制终止其它自有句柄；启动、输出、终态和监听均如实结算，无重复注册或借用资源误关。 | TODO 2/4/5；process-startup、process-shutdown 及装配失败场景，独立子进程清理与错误证据。 |
| 真实生命周期与宿主接入 | [4.5](./spec.md#spec-req-4-5)、[5.2](./spec.md#spec-req-5-2) | 默认装配使用单个新包管理器；真实 RuntimeLifecycle 两阶段有界，已知失败或 pending 不被吞掉；关闭后宿主仍可工作，应用决定退出。 | TODO 5；前置生命周期契约证据、process-lifecycle 和 process-runtime-composition 集成测试、受控宿主成功标记。 |
| 重启与未知副作用 | [5.3](./spec.md#spec-req-5-3) | 新宿主只读投影 interrupted，磁盘协议不变；不连接/杀旧 PID、不重放命令、不替代 Goal 证据；manual 未知结果仍需原恢复确认。 | TODO 5；文件 Store 前后记录、调用计数及现有 action-observation/权限恢复断言。 |
| 依赖、源码与发现 | [6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3) | 各种非法引用可定位失败，合法引用通过；新源码/测试/说明确实纳入检查；无旧产物仍能独立调用，TSDoc/示例和权威链接齐全。 | TODO 6；检查器正反样本、实际导入图、根回归文件清单、临时源码副本与文档检查。 |

完成任务后运行：

```sh
npx tsc --noEmit
npx tsc --noEmit -p apps/goal-server/tsconfig.json
npm run check:dependencies
npm run check:docs
npm test
git diff --check
```

根回归会递归发现新包 `test/` 和应用测试；执行时核对新入口确实被运行。综合检查复用前述证据，不以全量通过掩盖缺失的场景。源码验证在临时副本省略项目 dist/lib/build 等派生产物、保留必要依赖，运行 TODO 1–4 的相同入口命令；不删除用户目录或执行 git clean。文件清单、命令和结果一并记录，产物目录拒绝规则仍需正反样本验证。

不运行真实 Benchmark、GEPA 或付费模型。Node、平台沙箱或根回归需要的 Python/uv 等环境缺失时记录 blocked，不跳过必需检查后报告通过。前置生命周期仅需组件级证据；组合验证必须记录所用组件版本，既不把 Process 完成作为 Runtime 的反向前置，也不把其它 Spec 完整交付作为本轮门槛。

### Latest Result

- 状态：未执行。
- 验证时间：未执行。
- 测试提交与相关未提交改动：尚无实现测试状态；执行时记录提交、涉及文件的差异或内容指纹。
- 验收契约：当前 spec.md 已批准；实际测试时记录其内容指纹，以及前置生命周期组件的版本和验证证据。
- 验证摘要：本阶段只编写计划，文档检查不代表进程、工具或组合关闭行为通过。
- 未解决项：6 个 TODO 及完整组合验收尚未执行；RuntimeLifecycle 前置在组合验证前核验，当前不宣称其已经交付。完整 Plan 待用户审阅。
