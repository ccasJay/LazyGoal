# LLM 能力拆包与默认装配收敛执行计划

依据已批准的 [Spec](./spec.md) 实施，风险沿用其“风险与否定性保证”。本计划待批准；当前没有实施或功能验收结果。五个新能力包中的 pi-ai 适配包统一命名为 `llm-pi-ai`。

实施前记录基线提交、相关未提交修改及 Spec 内容指纹，核对当前实际消费者和安装/锁文件方式。先运行现有 `packages/llm/test/*.test.ts`、`packages/config/test/*.test.ts` 的确定性对照，保留相同请求样本、原生身份、错误、用量及目录分支断言；不得通过更新期望值吸收拆包引入的行为差异。发现基线失败先区分既有问题与本轮影响，不将其记作迁移通过。

按下列依赖顺序推进，每个 TODO 同时完成对应入口、调用方、测试和所属文档。核心契约先迁移，尚未迁出的实际实现暂留原位置并直接消费新契约；某项能力迁出时同步修改调用方、删除其旧实现，不新增临时转发、重复类型或兼容实现。依赖检查同步登记已落地的包与方向，最终全面约束在 TODO 8 完成。

## 任务清单

- [x] //TODO 1. 经独立 core 消费模型契约、配置错误与归一化用量
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[3.3](./spec.md#spec-req-3-3)、[3.5](./spec.md#spec-req-3-5)、[5.1](./spec.md#spec-req-5-1)、[6.1](./spec.md#spec-req-6-1)、[6.4](./spec.md#spec-req-6-4)。
  - 先验证：拟新增 `packages/llm-core/test/core-consumption.test.ts`，经公共入口实现确定性 Adapter，检查请求/响应/流类型可消费、正常与缺失用量、共享错误身份和既有故障分类。迁移现有 `model-request-failure.test.ts`，扩展 Config 测试，比较环境、TOML/Profile、CLI 覆盖、GEPA 双模型配置及错误的 code/name/missing；环境和 TOML 对 two_stage 的既有差异分别断言。类型与模块依赖检查必须识别 core 无供应商 SDK、config 单向依赖 core。
  - 实现：新建 `llm-core` 的私有 manifest、入口和所属说明，迁入 Spec 指定契约、配置类型/错误、通用用量读取和无 SDK 的故障分类。保持原生消息类型引用 model-contracts、取消/暂时故障身份引用 execution-control。供应商原始用量提取暂归各自现有适配实现，复用 core 的同一数值规则，随后随实现迁包。Config 仅保留读取/合并/校验，删除旧契约导出；同步迁移全部当前共享类型与用量消费者，包括实际 Agent 或已存在的 Agent 能力包，不建立 Agent/LLM 的转导出替代入口。删除已迁出的旧 core 文件和 adapter 类型门面，为公共契约补中文 TSDoc 与示例。
  - 检查：`npx tsx --test packages/llm-core/test/*.test.ts packages/config/test/*.test.ts packages/llm/test/*.test.ts`；`npx tsc --noEmit`；`npx tsc --noEmit -p apps/goal-server/tsconfig.json`；`npx tsc --noEmit -p benchmarks/tsconfig.json`。此时旧供应商实现仍须使用唯一 core 契约，不能为通过检查保留两套错误类或用量类型。

- [x] //TODO 2. 直接使用 OpenAI 适配包完成原生调用与结果回传
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[6.1](./spec.md#spec-req-6-1)、[6.4](./spec.md#spec-req-6-4)。
  - 先验证：将 `openai-compatible.test.ts` 迁入拟新增的 `packages/llm-openai/test/`，经包入口验证 strict/prompt_only、无工具与 Function Calling 两种请求、toolChoice、输出上限、模式错误零派发、用量缺省及 SDK 重试关闭。保留跨供应商 native-dialogue/native-tool-calling 测试中的 OpenAI 断言，覆盖 callId、reasoning_content、原生身份、续接回传及不匹配拒绝；取消前零请求、在途取消及返回后取消使用现有替身检查实际调用次数与错误身份。
  - 实现：迁移 `OpenAICompatible`、其参数契约及原始用量提取至 `llm-openai`，只从 core/model-contracts/execution-control 取得共享能力。将 OpenAI SDK 依赖按当前约束归入本包，同步当前工厂、Config 集成测试、对话测试和其它直接消费者，删除原实现文件；不增加 Provider、不改变 SDK 构造和消息映射。补所属文档及变更契约说明。
  - 检查：`npx tsx --test packages/llm-openai/test/*.test.ts packages/llm/test/native-dialogue.test.ts packages/llm/test/native-tool-calling.test.ts packages/llm/test/execution-control.test.ts packages/config/test/llm-config.test.ts`；`npx tsc --noEmit`；核对独立构造不发网络请求且不加载其它 LazyGoal 供应商包，完整入口隔离探针在 TODO 8 汇总。

- [x] //TODO 3. 直接使用 Google 适配包保持 strict 投影与原生对话
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[5.1](./spec.md#spec-req-5-1)、[6.1](./spec.md#spec-req-6-1)、[6.4](./spec.md#spec-req-6-4)。
  - 先验证：将 `gemini.test.ts` 迁入拟新增的 `packages/llm-google/test/`，保留全部 Schema、nullable/required、单值枚举、哨兵、证据与非法响应断言，特别保留直接构造 two_stage 并传入 structuredOutput 的测试。经公共入口验证工具与非工具请求、prompt_only 不带原生 Schema、输出上限、端点/协议身份、原始 Parts/签名及工具结果回传；覆盖用量、取消与错误路径，不将适配层投影测试替换为仅能解析 JSON 的检查。
  - 实现：迁入 `Gemini`、参数契约、Schema 转换/逆向投影和原始用量提取，Google SDK 依赖归本包并保留当前版本约束。修改工厂及直接消费者，删除原文件；不将 Provider 特定逻辑搬入 core 或 Agent 解码包，不收窄既有模式、不增加输出修复。同步文档及契约。
  - 检查：`npx tsx --test packages/llm-google/test/*.test.ts packages/llm/test/native-dialogue.test.ts packages/llm/test/native-tool-calling.test.ts packages/llm/test/execution-control.test.ts packages/config/test/llm-config.test.ts`；`npx tsc --noEmit`。对照迁移前相同样本的发送 Schema、规范化响应和拒绝后果，不修改基线解释差异。

- [x] //TODO 4. 直接使用 pi-ai 适配包保持增量流与失败语义
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[2.2](./spec.md#spec-req-2-2)、[2.4](./spec.md#spec-req-2-4)、[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[6.1](./spec.md#spec-req-6-1)、[6.4](./spec.md#spec-req-6-4)。
  - 先验证：将 `pi-ai.test.ts` 迁入拟新增的 `packages/llm-pi-ai/test/`，经入口检查离线构造、模型与容量拒绝、前置 system 合并、角色顺序、中途 system 拒绝，以及当前 SDK 文本/thinking/tool-call 增量到统一事件的转换。比较 generate 聚合与 stream 的既有完成结果，保留截断、错误、异常结束、未知异常和取消样本；piUsage 始终不取得正式 usage 身份，配置失败使用 core 同一错误构造器。
  - 实现：迁移 `PiAiAdapter` 与 `PiAiProviderError`，保持现有 Provider 工厂集合和锁定 SDK；仅依赖 core 与 execution-control，不为静态目录反向依赖 model-catalog，也不创建共享可变模型注册表。迁移当前工厂及其它直接引用，删除原文件，补所属契约与说明。
  - 检查：`npx tsx --test packages/llm-pi-ai/test/*.test.ts packages/llm/test/native-tool-calling.test.ts packages/llm/test/two-stage-config.test.ts packages/config/test/llm-config.test.ts`；`npx tsc --noEmit`。使用既有受控 SDK/流替身，禁止真实 Provider 调用；不能为原生 Adapter 顺带增加 stream 接口。

- [x] //TODO 5. 独立查询模型目录并保持选择与故障边界
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[6.1](./spec.md#spec-req-6-1)、[6.4](./spec.md#spec-req-6-4)。
  - 先验证：将 `model-catalog.test.ts` 和 `provider-fetchers.test.ts` 迁入拟新增的 `packages/model-catalog/test/`，从入口注入 Fetcher/fetch，逐一覆盖六类 Provider 的端点、鉴权、多页结果、循环游标、共享期限、外部取消与脱敏错误。比较默认工厂在线查询和直接构造无 Fetcher 的离线路径，以及去重、排序、能力/来源补全、字符/Token/strict 可选择性；分别保留自定义兼容模型在线与配置兜底分支。鉴权/权限/协议/取消均不得兜底，允许兜底的错误保持原范围。
  - 实现：迁入目录及 Fetcher 实现、描述与错误契约，通过包内契约文件消除实现循环；仅依赖 core 和实际所需的同版本 pi-ai 静态目录 SDK。同步 goal-server 装配、CLI、模型切换及其它目录消费者，删除旧位置；不增加缓存、后台刷新或模型 Binding 所有权，补所属文档和 Config/LLM 读者链接。
  - 检查：`npx tsx --test packages/model-catalog/test/*.test.ts apps/goal-server/test/composition-root-model-switching.test.ts`；`npx tsc --noEmit`；`npx tsc --noEmit -p apps/goal-server/tsconfig.json`。所有在线场景使用受控 fetch；核对本包不通过生成适配器取得目录或发出生成请求。

- [x] //TODO 6. 经默认工厂入口装配现有模型并清理旧调用路径
  - 落实标准：[1.2](./spec.md#spec-req-1-2)、[1.4](./spec.md#spec-req-1-4)、[2.1](./spec.md#spec-req-2-1)、[5.1](./spec.md#spec-req-5-1)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[6.1](./spec.md#spec-req-6-1)、[6.4](./spec.md#spec-req-6-4)。
  - 先验证：拟新增 `packages/llm/test/default-adapters.test.ts`，从 `src/index.ts` 检查三个工厂对现有供应商/模式的实际类型、固定模式、端点、模型和容量拒绝；相同输入与直接构造路径比较请求/结果。扩展现有 `two-stage-config.test.ts` 和 Config 集成测试，保留 Think/Decide 与 Reflection 的选择差异，并验证构造零网络调用和统一配置错误身份。检查入口只公开三个工厂及自有阶段结果类型，旧 factory/adapter/core/目录路径不再存在或被消费。
  - 实现：将默认装配收进拟新增 `llm/src/default-adapters.ts` 并建立唯一公共入口，删除旧 `factory.ts`，迁移所有工厂调用者；llm 只依赖 core 和三个适配包，不直接依赖 config、model-catalog 或生成 SDK。将 src 下 smoke 可执行入口移入 `test/`，保持现有两条付费 smoke npm 命令的显式语义，更新直接运行路径和宿主依赖归属。同步测试、脚本与当前文档，不批量重写历史 Spec/Memory，不新增路径兼容文件。
  - 检查：`npx tsx --test packages/llm/test/*.test.ts packages/config/test/*.test.ts`；三处 TypeScript 检查；搜索所有当前源码、脚本、测试和构建引用，区分历史记录与活跃引用。smoke 只使用其已有本机模拟端点测试和入口检查，不运行真实付费命令。

- [x] //TODO 7. 由服务、Headless、RPC 与反思评测验证消费迁移
  - 落实标准：[2.3](./spec.md#spec-req-2-3)、[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.5](./spec.md#spec-req-3-5)、[4.4](./spec.md#spec-req-4-4)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[6.4](./spec.md#spec-req-6-4)。
  - 先验证：扩展现有 goal-server 模型切换、Headless、LLM RPC、Reflection Bridge、Context paired-runner/CLI 测试，用确定性 Adapter、内存或临时文件 Store 验证实际请求、调用数、用量缺失、等待/重建恢复与原生身份。服务覆盖候选 Binding 构造、Snapshot 保存后发布、保存失败不切换及恢复不静默换模型；RPC 覆盖取消与迟到响应，不改 wire 字段；反思与 Context 记录口径保持，付费入口仍需既有显式授权。
  - 实现：补齐所有当前消费者到 core、目标适配包、model-catalog 和 llm 工厂的入口引用，包括实际存在的旧 Agent 或已拆九包、Worker 与本地构建脚本。只调整模型依赖与装配段，保留当时已有的 Runtime 生命周期、进程接线及其它包规则；不为等候前三份 Spec 增加适配层。迁移必要的测试夹具与构建定位，更新所属读者文档。
  - 检查：`npx tsx --test apps/goal-server/test/composition-root-model-switching.test.ts benchmarks/test/headless-composition-root.test.ts benchmarks/test/llm-rpc.test.ts benchmarks/test/prompt-evaluation/*.test.ts benchmarks/context/test/*.test.ts`；`npm --prefix apps/goal-server test`；三处 TypeScript 检查。对有活跃引用的 Worker 执行现有本地打包/确定性消费入口，记录实际命令与观测，不启动容器题目、真实 Benchmark 或 GEPA。

- [x] //TODO 8. 以入口隔离、依赖门和源码验证约束五包边界
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4)。
  - 先验证：扩展 `scripts/check-dependencies.test.mjs` 的合法/违规临时工程，覆盖 Spec 依赖矩阵、core SDK 泄漏、Config 反向边、跨包内部穿透、旧路径转发与项目产物引用，包括普通/类型 import/export、import 类型表达式、侧效及字面量 dynamic import。拟新增 `packages/llm/test/package-entry-isolation.test.ts`，为 core、Config、每个适配包和目录分别在新子进程记录或拦截模块解析/加载；入口导入与构造不发请求、不读隐式凭据、不注册信号/退出，core/Config 无 SDK，单个适配包不经 LazyGoal 源码加载其它适配包或默认门面。类型依赖另由静态检查验证，不以运行时探针代替。
  - 实现：复用现有检查入口及可用 TypeScript 解析能力增量约束所有承诺引用形式，生产入口与包内单测例外分别处理，不覆盖其它 Spec 规则。核对 manifest/锁文件中 SDK 的实际归属、版本和 Node 解析位置，目录与 pi-ai 包使用同一锁定版本；不引入发布配置。同步五包与 llm/config 的 README、overview、semantics，根导航和 AGENTS 布局，以及实际读者链接；明确测试发现与源码/产物界限。
  - 检查：`node --test scripts/check-dependencies.test.mjs scripts/check-docs.test.mjs`；`npm run check:dependencies`；`npm run check:docs`；入口隔离测试。然后在不含项目 dist/lib/build 的临时源码副本重复独立调用及受影响消费者验证，保留第三方依赖且不修改用户目录，记录新包测试确实被根回归发现。执行下面完整 Feature Verification，任务完成只改复选框，保留 TODO 原文。

## Feature Verification

### Planned Checks

下表中的新测试在对应 TODO 实现；当前路径是迁移入口，最终归属以本计划及落地后的唯一所有者为准。已有断言优先迁移和复用，只有不足以证明批准行为时补测试。模块加载探针只约束 LazyGoal 自身的选择路径，不宣称第三方 SDK 的全部传递依赖可分离。

| 验收项 | 对应标准 | 场景与可观察预期 | 检查入口 / 证据 |
| --- | --- | --- | --- |
| 共享契约与 Config | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[5.1](./spec.md#spec-req-5-1) | 直接实现 Adapter；环境/TOML/Profile/CLI/GEPA 配置结果及拒绝保持；解析/工厂/pi-ai 的错误为 core 同一个构造器；三个模式值与已有 two_stage 差异保持 | 新 core-consumption、迁入 core 的故障分类测试，Config 测试，two-stage-config 和 default-adapters 测试；类型检查与错误身份断言 |
| 入口与构造隔离 | [1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[6.1](./spec.md#spec-req-6-1) | 各入口新进程导入/构造零网络与宿主副作用；core/Config 无 SDK 生产依赖；单适配包不加载其它 LazyGoal 适配实现；目录不加载生成实现 | 新 package-entry-isolation；静态引用/manifest/锁文件检查，记录被解析/加载模块及禁止调用计数；不依靠同一进程缓存造成假通过 |
| 默认选择与公共门面 | [2.1](./spec.md#spec-req-2-1)、[5.4](./spec.md#spec-req-5-4) | 三个工厂在相同配置下产生原有实际实现和模式；不支持模式、未知模型、容量错误保持；llm 仅公开默认工厂与自有结果类型，无旧路径转发 | default-adapters、two-stage-config、Config 集成测试及门面导出/旧路径扫描；直接构造对照 |
| OpenAI 原生请求与续接 | [2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4) | 捕获相同消息/Schema/工具/上限；两轮 callId 与 reasoning_content/身份保持；模式错误零派发，取消与 SDK 错误后果保持，原始用量缺失不补零 | llm-openai 单测，native-dialogue、native-tool-calling、execution-control；受控 SDK 或本机端点请求记录 |
| Google 原生与 strict 投影 | [2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[5.1](./spec.md#spec-req-5-1) | 相同 Schema 与响应样本得到相同 nullable/required、哨兵、证据和非法输出后果；原始 Parts/签名和工具结果回传保持；直接 two_stage 覆盖不删；取消/用量/错误保持 | 迁入 llm-google 的完整 Gemini 单测，native-dialogue/native-tool-calling/execution-control；迁移前后样本对照 |
| pi-ai 增量与完成 | [2.2](./spec.md#spec-req-2-2)、[2.4](./spec.md#spec-req-2-4)、[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4) | 同样本生成相同文本/thinking/tool-call 事件和完整响应；异常结束、模式/容量拒绝与取消保持；piUsage 不变为 usage，不新增重试 | llm-pi-ai 单测与跨供应商工具测试；事件序列、最终响应及调用次数对照 |
| 目录发现与选择 | [4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4) | 六类发现与分页、共享期限、来源补全和排序保持；明确失败与允许兜底分开；字符/Token/strict、自定义模型在线/离线路径各自保留结果；错误脱敏 | model-catalog 单测、provider-fetchers 测试与服务模型切换测试；受控 fetch 断言请求、结果、分类和凭据未泄露 |
| 真实服务与恢复 | [2.3](./spec.md#spec-req-2-3)、[3.2](./spec.md#spec-req-3-2)、[4.4](./spec.md#spec-req-4-4)、[5.2](./spec.md#spec-req-5-2) | 实际装配执行至等待并重建恢复，模型身份保持；候选 Binding 在快照成功后发布、失败不切换；不改 Runtime/Process 接线或新增供应商依赖到 Agent | goal-server 模型切换及相关服务回归、Headless 测试；检查实际装配差异、保存顺序、身份和计数，沿用临时 Store 与确定性 Adapter |
| Headless、RPC、反思与 Context | [3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.5](./spec.md#spec-req-3-5)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3) | 请求/结果和有权威/缺失用量记录保持；RPC 取消与迟到结果不污染后续调用；反思/Context 运行既有确定性流程，付费授权仍生效；Worker 活跃构建引用已迁移 | Headless、llm-rpc、prompt-evaluation 与 context 测试；必要的既有本地构建证据，不运行真实题目、线上目录或付费模型 |
| 机械边界与公共契约 | [5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[6.4](./spec.md#spec-req-6-4) | 合法依赖通过；禁止方向、core SDK 类型、穿透、转发与旧产物引用均定位失败；全消费者无旧活跃引用，类型/运行依赖归属正确，公共中文契约与文档各有唯一归属 | checker 正反工程、check:dependencies、check:docs、类型检查、入口/API 与当前引用核对；历史材料只记录影响候选 |
| 无旧产物与测试发现 | [1.1](./spec.md#spec-req-1-1)、[6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4) | 临时源码副本无项目 dist/lib/build 仍能直接消费各包及当前消费者；根回归实际运行五包测试，不因漏扫假绿；本机端点测试证明 SDK 消费路径可用 | 临时副本中的类型、入口隔离、五包单测和受影响消费者验证记录；根回归测试名称/路径，实际构建消费者另记证据 |

任务证据满足当前状态且覆盖上表时可复用，不机械重复无变化的检查。整体验收至少完成以下当前已有入口：

```sh
npx tsc --noEmit
npx tsc --noEmit -p apps/goal-server/tsconfig.json
npx tsc --noEmit -p benchmarks/tsconfig.json
npm run check:dependencies
npm run check:docs
npm --prefix apps/goal-server test
npm test
git diff --check
```

执行时确认新包测试、相关消费者和 checker 样本确实被上述入口覆盖；补跑未被根入口覆盖的本机模拟或当前构建消费检查。模块隔离与无旧产物证据须可归属到当前源码。最终记录各项实际检查、结果、证据位置与剩余问题，标明验证时间、提交或未提交状态及内容指纹、Spec/Plan 指纹；跳过和环境缺失不得记作通过。真实供应商 smoke 本轮不要求，不执行时明确该限制。

### Latest Result

- 状态：已完成；TODO 1–8 全部勾选，Feature Verification passed。
- 验证时间：2026-10-17 22:18–22:21 +0800。
- 测试提交与工作树指纹：worktree `feature/llm-component-extraction` @ `59b2df67` + TODO 8 未提交变更；验证树指纹（`git diff HEAD` 与 `git status --porcelain` 合并 sha256）`42fdb388eb2dfc5946accd0fa061d9c020b2adf5c47d53e63a111f00e82c8299`。
- Spec / Plan 指纹：执行前 spec.md sha256 `406be74a41f3dec2378b72c64bd8ebed40d74a95c54b6b3339d35226e864a92a`；plan.md 执行前 sha256 `637d1600d510009b6221a46ada86e00b46c662ecd1fde1561e6a96fc5548f900`。
- 验证摘要：
  - 类型检查：`npx tsc --noEmit`、`npx tsc --noEmit -p apps/goal-server/tsconfig.json`、`npx tsc --noEmit -p benchmarks/tsconfig.json` 全部通过。
  - 依赖与文档门：`npm run check:dependencies` 通过（237 个源文件）；`npm run check:docs` 通过（35 个模块、131 份说明）；`node --test scripts/check-dependencies.test.mjs scripts/check-docs.test.mjs` 27/27，含 SDK 泄漏、跨能力包入口穿透、旧路径与构建产物引用的合法/违规正反工程。
  - 确定性回归：`npm test` 全部阶段通过（类型检查、文档、依赖、GEPA adapter、全量 TS 测试、scripts 测试）；五包 + config + llm 聚焦套件 167/167。
  - 消费者与评测：`npm --prefix apps/goal-server test` 21/21；模型切换、Headless、LLM RPC、反思与 Context 目标套件 120/120；swebench RPC 取消/迟到响应 5/5；worker 本地打包与 preflight 9/9（未启动容器题目或真实 Benchmark）。
  - 入口隔离：`packages/llm/test/package-entry-isolation.test.ts` 6/6，core、config、三个适配包与目录分别在独立子进程导入并构造：零网络请求、零信号/退出注册、不读取 LazyGoal 配置键与跨供应商凭据、单包不加载其它适配包或默认门面；类型依赖由三处静态类型检查另行覆盖。
  - 无产物副本：不含项目 dist/lib/build 的临时源码副本中通过 root tsc、五包套件 89/89、入口隔离 6/6、受影响消费者 8/8；新包测试被根回归发现（llm-core 2、llm-openai 1、llm-google 1、llm-pi-ai 1、model-catalog 2，共 7 个文件）。
  - SDK 归属核对：manifest 与锁文件确认 openai `^7.4.0`→7.19.0（llm-openai）、@google/genai `^2.15.0`→2.21.0（llm-google）、pi-ai `1.3.0`（llm-pi-ai 与 model-catalog 同一锁定版本，各自解析到本包 node_modules）；llm-core 与 config 无供应商 SDK。
  - 未运行：真实供应商付费 smoke（本轮不要求）；未启动容器题目、真实 Benchmark 或 GEPA 运行。
  - 遗留观察：既有 FILE_BOUNDARY_RULES（其它 Spec 已批准约束）维持原相对 `from` 检测范围；`packages/agent/src/model-inference-view.ts` 的两处 import 类型表达式引用 runtime/context-retrieval 未在本轮处理，留作影响候选。
