# 模型输出流与有序内容块执行计划

## 任务清单

本计划以已批准的 [spec.md](./spec.md) 为完整契约，沿用其 [high 风险评估](./spec.md#风险与否定性保证)。仅执行本功能时不以前三份待实现 Spec 为前置条件：使用当前正式 Adapter、阶段执行器、Runtime 装配和 Browser 活动接口，不实现新的 Session 或 Web 消息协议。

顺序为：先原子迁移完整响应及当前消费方，再贯通块流和 pi-ai，随后补齐两个原生协议，最后验证失败、隐私和实际执行链。每项先加入可失败的断言再实施；新增测试下文均标为待实现。新接口的中文 TSDoc、最小示例及变化所有者的概览／语义表在对应任务内同步。完成任务只勾选复选框，保留 `//TODO` 原文。

执行前核对工作树、适用规则和实际消费者。主工作区已有 model-catalog、模型绑定修复及其他规划文件不属于本次实现写集；不得为迁移响应协议混入这些改动。若其他 Spec 届时已落地，沿其现行入口接入，不恢复旧入口或添加双协议检测；只有必须改变获批行为时才回到 Spec 修订。

- [x] //TODO 1. 用有序完整块提供一致的正文、工具与推理读视图，并迁移现有完整响应消费方

  落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.5](./spec.md#spec-req-1-5)、[7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)。
  - **先验证**：输入文本／reasoning／工具交错的完整响应，检查顺序、原始参数、正文不含推理且不隐式 trim／加换行；无跨字段时序的响应遵循明确映射。strict JSON 的 format 来自请求，不从正文猜测。原生 Assistant／tool 历史仍能配对，续接签名原样保留。旧正文／工具平行字段不再是可构造的 LLM 输出，当前源码和测试通过唯一读投影消费。
  - **实现**：在 llm-core 定义三种完整块和唯一 `LLMResponse.blocks`，实现共享纯读投影；在三个 Adapter 的完整响应归一化中接入，修改 model-response、model-execution、model-call／诊断及实际依赖方。迁移现有确定性 Adapter、共享 fixture、示例、应用与 Benchmark 的响应构造；保持输入消息角色和历史结构，避免把 fixture 包装器写成旧／新响应识别器。本任务先迁移最终响应，增量事件在 TODO 2 原子切换，不增加永久双实现。
  - **验证**：新增 `packages/llm-core/test/content-blocks.test.ts`（待实现），扩展现有 `core-consumption.test.ts`、`packages/model-response/test/stage-response.test.ts`、`packages/model-execution/test/native-step-executor.test.ts`、`packages/model-context/test/native-model-history.test.ts`、`packages/llm/test/native-dialogue.test.ts` 及三个 Adapter 原有测试；运行相应 `npx tsx --test`、`npx tsc --noEmit`、`npm --prefix apps/goal-server run build` 和 `npm run build:web`。核对实际响应生产与读取位置，不能只批量替换断言或重录基线掩盖语义改变。

- [x] //TODO 2. 贯通有稳定身份的内容块流，并在正常流结束后才交付成功响应

  落实标准：[1.4](./spec.md#spec-req-1-4)、[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)、[3.4](./spec.md#spec-req-3-4)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[7.1](./spec.md#spec-req-7-1)。
  - **先验证**：确定性流交错输出两个块、晚到工具身份、whole 块和 reasoning，断言每个事件与最终响应同源。对未知索引、重复边界、结束后追加、类型冲突、缺失／重复完成、未封口和最终块失配逐项拒绝。完成候选后以屏障延迟 EOF，调用不能提前返回；尾部再抛错必须失败。只实现 generate 的 Adapter 在返回前已发开始状态，整块观察不拆字；stream 失败时 generate 调用计数为零。
  - **实现**：更新 LLMStreamEvent 和无 I/O 组装／核验规则，model-call 将现有 callId 贯穿输入、指标、诊断和观察，成功终止延迟到正常 EOF。将 pi-ai 真实块边界、内容索引、thinking、参数分片及最终结果接入同一协议；有原始参数文本时保留，SDK 对象只用于语义核对。更新旧增量生产者、测试 Adapter 和当前 Browser 读投影，使切换后类型和正常路径可用；各块事件从首次接入就沿 Spec 可见性发布，TODO 6 再完成独立泄漏与背压矩阵。
  - **验证**：新增 `packages/model-call/test/content-block-stream.test.ts`（待实现），扩展 `packages/model-call/test/public-entry.test.ts`、`packages/llm-pi-ai/test/pi-ai.test.ts`、`packages/llm-core/test/core-consumption.test.ts` 和 `packages/browser/test/browser-stream.test.ts`；运行对应 `npx tsx --test` 与类型检查。pi-ai 正常路径至少有一组真实 SDK 加本地 SSE fixture，不能仅伪造 SDK 内部事件；断言观察终止和返回／抛错顺序，而非只检查事件名称。

- [x] //TODO 3. 通过原生 OpenAI Chat Completions 实时生成文本和工具块

  落实标准：[1.3](./spec.md#spec-req-1-3)、[1.5](./spec.md#spec-req-1-5)、[2.3](./spec.md#spec-req-2-3)、[3.1](./spec.md#spec-req-3-1)、[3.5](./spec.md#spec-req-3-5)、[4.3](./spec.md#spec-req-4-3)、[5.2](./spec.md#spec-req-5-2)。
  - **先验证**：本地服务记录真实 SDK 请求，分片返回文本、两个调用索引、跨 chunk 的工具名／ID／参数、reasoning 扩展与 usage-only 尾部。检查独立块、参数字节、最终用量及正常终结；分别注入 length、content_filter、异常 EOF 和不支持内容，不能仅因已有完整工具对象而成功。generate／stream 等价 fixture 保持读视图和原生续接语义，缺失 usage 仍缺省。
  - **实现**：在 llm-openai 增加真实 stream 路径并与完整调用共享请求构造和响应归一化，保持 Chat Completions、tools／tool choice、strict、现有 reasoning 扩展、输出上限、取消与 maxRetries=0。按工具索引累计，收齐合法结束及用量尾部后产生最终结果；不切换 Responses、不因兼容端点拒绝 stream 再发非流式请求。
  - **验证**：新增 `packages/llm-openai/test/openai-stream.test.ts`（待实现），扩展 `openai-compatible.test.ts`，运行 `npx tsx --test packages/llm-openai/test/openai-compatible.test.ts packages/llm-openai/test/openai-stream.test.ts packages/llm/test/native-tool-calling.test.ts`。使用本机随机端口、虚拟密钥和真实 SDK，检查网络请求次数、请求体、chunk 到达前后观测及原始参数，不访问线上端点。

- [x] //TODO 4. 通过 Gemini 流保持 Part 续接，并将需要逆向投影的 strict JSON 整块交付

  落实标准：[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[2.3](./spec.md#spec-req-2-3)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.5](./spec.md#spec-req-3-5)、[5.2](./spec.md#spec-req-5-2)、[7.2](./spec.md#spec-req-7-2)。
  - **先验证**：真实 SDK 消费本地 SSE 的多段普通文本、thought／签名和整块函数参数，检查输出归属、whole 标记及下一请求的原始 Parts／签名；缺失调用 ID 只分配一次本地身份，不改写供应商原文。strict fixture 覆盖空值／缺省哨兵、联合分支清理与证据字段恢复，规范块在投影完成前不结束，generate／stream 结果等价。截断、安全阻断、未知 Part 和无正常结束均失败。
  - **实现**：在 llm-google 使用 generateContentStream，与 generate 共用请求配置、Part 归一化和既有 strict 逆向投影；普通文本真实增量，函数参数和需要整体归一化的 JSON 明确 whole。保持 ANY／AUTO／NONE、输出上限、Schema 不变性、原生续接及 attempts=1，不开启不支持的参数流字段、不迁移 Interactions、不用占位原文替代规范结果。
  - **验证**：新增 `packages/llm-google/test/gemini-stream.test.ts`（待实现），扩展 `gemini.test.ts`；运行 `npx tsx --test packages/llm-google/test/gemini.test.ts packages/llm-google/test/gemini-stream.test.ts packages/llm/test/native-dialogue.test.ts`。本地 fixture 穿过真实 Google SDK 并检查 generateContent 对应路由、请求体和下一轮续接；不能用直接调用归一化函数替代该验证。

- [x] //TODO 5. 在取消、截断和失败重试中隔离每次生成，防止残缺响应触发操作

  落实标准：[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)、[4.1](./spec.md#spec-req-4-1)、[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5)。
  - **先验证**：让完整工具块已到达但响应／EOF 被屏障阻塞，实际阶段执行器和 Runner 不得创建该块的待审批操作或执行工具。随后分别正常结束、失败、取消，只有正常完整响应才进入原审批／执行。对失败调用冻结后续重试或使用非暂时协议错误，断言本次工具效果为零；再独立放行合法重试，检查新 callId、无旧分片混入和没有额外 generate 请求。派发前取消、chunk 间取消和迭代清理失败均保留主错误并关闭本次传输。
  - **实现**：统一三个 Adapter 的正常终结检查和本次资源清理，model-call 对失败／取消发安全终止摘要后传播原类型化原因，保持 Runtime 的预算、退避、Interrupt 和 unknown 规则。对已经出现工具对象的截断／阻断同样拒绝；不为部分块创建 Observation 或成功消息，不新增自动重发、模型降级和借用 Adapter 的全局关闭。
  - **验证**：新增 `packages/runtime/test/model-stream-execution-boundary.test.ts`（待实现），扩展三个协议流测试、`packages/model-execution/test/execution-control.test.ts`、`packages/runtime/test/execution-control.test.ts`、`runtime-feedback.test.ts` 和 `run-interrupt.test.ts`；运行相应 `npx tsx --test`。分别记录 Provider 请求、每次调用终止、审批等待、工具执行及已提交事实，避免将正常后续重试误算为失败响应的工具效果。

- [x] //TODO 6. 在公开活动、诊断和慢订阅者之间保持内容隔离与调用归属

  落实标准：[2.5](./spec.md#spec-req-2-5)、[5.5](./spec.md#spec-req-5-5)、[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4)、[6.5](./spec.md#spec-req-6-5)。
  - **先验证**：同一 Goal／Run 的不同调用分别产生普通正文和 strict JSON，在支持的调用中加入参数、reasoning、签名和 metadata 的不同标记，同时读取默认／诊断／显式 reasoning 订阅及真实 Browser SSE；每次请求保持合法模式，仅允许对应内容出现在相应入口，开始、块结束和完整响应事件也不能旁路泄漏。让同块相邻增量合并、跨块／跨调用不合并，慢订阅者 backpressure 关闭后快订阅者和模型调用继续成功；发布抛错不改变响应，断开不产生 Interrupt。
  - **实现**：完成 model-call 的类型／格式／用途可见性投影和调用／块／字段合并键；如需扩展执行流合并，仅保留通用 JSON／队列职责，不让 Core 解释业务工具。Browser 直接消费新内部协议并映射当前安全活动 DTO，公共结束只发摘要，不携带整个响应；完成审查保持私有。流采集保留一份所需输出，不保存每个累计前缀或逐片写持久化文件。
  - **验证**：扩展 `packages/execution-stream/test/execution-stream.test.ts`、`packages/browser/test/browser-stream.test.ts`、`packages/model-call/test/content-block-stream.test.ts`（TODO 2 新增）与 `llm-diagnostic-trace.test.ts`；运行对应 `npx tsx --test`。真实 SSE 和序列化后的完整事件都做标记排查，不能只过滤某个 delta；检查大段受控分片的最终内容和实现中的累积存储方式，不以不稳定堆内存阈值测试替代归属与背压断言。

- [x] //TODO 7. 保持流式调用的指标、阶段业务解码和已提交原生历史一致

  落实标准：[1.5](./spec.md#spec-req-1-5)、[4.5](./spec.md#spec-req-4-5)、[7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)。
  - **先验证**：对三种协议的成功、取消和失败各检查一次 call_started／call_finished；多块不增加模型调用计数，缺失用量不补零，pi-ai 的诊断计数不变成正式 usage。whole 输出不伪造逐 token 时间；输入记录失败为零请求，诊断／指标写失败不改变调用结果。将完整块送入 Decide／Think／完成审查，空结果和无效参数仍由阶段协议拒绝；原生两轮请求保留调用 ID、参数及签名，未提交片段不进入历史或 Goal 对话。
  - **实现**：补齐新块契约下指标计时、受限诊断与 response-to-message 的实际接线，消除迁移遗漏的旧字段读取；维持现有应用观察速率定义和阶段业务检查。迁移真实调用方与示例的派生访问，不顺带修改 Session 消息 Schema、历史裁剪或权限。当前基线若含原响应形状，只更新有新行为断言支撑的期望，不降低原业务验收。
  - **验证**：扩展 `packages/model-call/test/llm-step-executor-metrics.test.ts`、`model-input-recording.test.ts`、`llm-diagnostic-trace.test.ts`、`packages/model-response/test/stage-response.test.ts`、`packages/model-execution/test/native-step-executor.test.ts`、`completion-review.test.ts`、`packages/model-context/test/native-model-history.test.ts`、`packages/llm/test/native-dialogue.test.ts` 和 `packages/model-contracts/test/model-conversation.test.ts`；运行对应 `npx tsx --test`，检查下一请求消息及实际记录而不只断言最终 result.kind。

- [x] //TODO 8. 从正式无界面装配完成流式执行与恢复验证，并保持现有 Web 活动可用

  落实标准：[4.1](./spec.md#spec-req-4-1)、[6.4](./spec.md#spec-req-6-4)、[6.5](./spec.md#spec-req-6-5)、[7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)、[7.4](./spec.md#spec-req-7-4)。
  - **先验证**：经 `apps/goal-server/src/runtime/index.ts` 的 createRuntimeComposition 注入连接本地协议 fixture 的正式 Adapter，走生成、既有工具准入／必要审批、执行、完成或等待、关闭和文件存储重建。屏障前无工具，合法完整响应后按原规则执行，重建只读不恢复分片；已提交历史和后续模型请求来源可核验。现有 Web 仍显示公开正文／调用状态并可继续对话，不依赖新的 Session API 或 UI。
  - **实现**：新增装配层端到端场景并修复本功能接线遗漏，保持 CLI／Headless 生命周期、原协议和单一执行链。同步 llm-core、三个 Adapter、model-call、model-response／model-execution、实际受影响 model-context、execution-stream 和 browser 的公开契约与模块说明；仅在应用读法变化时同步相应说明。检查无旧输出生产路径、无双协议解析、无新增 SDK 包或 Provider 依赖反转。
  - **验证**：新增 `apps/goal-server/test/model-output-streaming.integration.test.ts`（待实现），扩展 `runtime-composition.integration.test.ts`、`runtime-recovery.integration.test.ts` 和实际受影响的 `apps/goal-board/e2e/test-service.ts` fixture；运行新增测试、现有装配／恢复测试及 `node --test --test-concurrency=1 apps/goal-board/e2e/runtime.test.mjs`。按下方完整 Feature Verification 执行仓库回归、独立应用构建、依赖和文档检查；真实 Chrome 缺失或必要检查失败应记为未满足，不能据静态 DTO 测试宣称现有页面链路已通过。

## Feature Verification

### Planned Checks

每项验收均须有当前实现状态下的证据。下表的新增测试在相应 TODO 中创建；现有测试需要加入对应断言，原有绿灯不等于新增行为通过。测试只使用本地 HTTP／SSE 服务、虚拟凭据、临时数据与确定性工具，不访问线上模型。

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
| --- | --- | --- | --- |
| 完整响应单一来源 | [1.1](./spec.md#spec-req-1-1) | 只能构造 blocks 权威响应，读视图从块派生；生产者不维护第二份可变正文。 | TODO 1，core 块测试、实际消费者核对与类型检查。 |
| 三种块与文本格式 | [1.2](./spec.md#spec-req-1-2) | 普通文本、请求要求的 JSON、工具和 reasoning 正确分离；summary 不自动产生新块。 | TODO 1，format fixture 和阶段读视图。 |
| 可证明的顺序 | [1.3](./spec.md#spec-req-1-3) | 交错 Part／索引不被跨工具合并；非流完整字段遵循约定映射，无虚构时序。 | TODO 1／3，完整响应及真实 SDK 流 fixture。 |
| 已结束块与最终响应一致 | [1.4](./spec.md#spec-req-1-4) | 类型、索引、顺序和内容匹配；结束后修改或最终矛盾明确失败，Gemini 投影不后改。 | TODO 2／4，采集器异常序列和 strict fixture。 |
| generate／stream 语义等价 | [1.5](./spec.md#spec-req-1-5) | 等价确定性响应保留正文、参数和续接；不要求独立生成的随机 ID 或分片相同。 | TODO 1／3／4／7，双路径 fixture 与两轮原生请求。 |
| 调用与块身份 | [2.1](./spec.md#spec-req-2-1) | 记录、指标、诊断和事件共享 callId；块可定位，Provider 调用 ID 不冒充 Action ID。 | TODO 2，正式 callModel 输出与捕获记录比对。 |
| 生命周期合法性 | [2.2](./spec.md#spec-req-2-2) | 合法交错被接收，未知索引、重复边界、类型冲突和结束后追加失败。 | TODO 2，content-block-stream 异常序列表。 |
| whole 与晚到身份 | [2.3](./spec.md#spec-req-2-3) | 整块可无 delta；工具名／ID 晚到不换块，最终字段完整，无伪造分片。 | TODO 2／3／4，各协议 fixture 和事件交付标记。 |
| 非成功终止 | [2.4](./spec.md#spec-req-2-4) | 取消／断流发相应观察终止，打开的块不被标为完整，已结束块也不代表执行。 | TODO 2／5，终止事件与工具计数。 |
| 重试和合并隔离 | [2.5](./spec.md#spec-req-2-5) | 新阶段／重试使用新 callId，旧片段不串接，同块同字段才可合并。 | TODO 2／5／6，双调用屏障、事件来源及合并键。 |
| OpenAI 真实流 | [3.1](./spec.md#spec-req-3-1) | SDK 请求仍为 Chat Completions，分片名称／ID／参数、正文及用量尾部正确。 | TODO 3，openai-stream 本地 HTTP/SSE 记录。 |
| Gemini 真实流 | [3.2](./spec.md#spec-req-3-2) | generateContent 流分离文本／thought／函数，Part 和签名保持，不迁新协议。 | TODO 4，gemini-stream 路由、内容及后续请求。 |
| strict 整块归一化 | [3.3](./spec.md#spec-req-3-3) | 哨兵／联合分支先归一再交付规范块，普通文本仍增量，两个调用入口规则相同。 | TODO 4，投影前后屏障及双路径 fixture。 |
| pi-ai 块语义 | [3.4](./spec.md#spec-req-3-4) | 实际索引、thinking 和参数被保留；required／prompt_only 与正式 usage 缺省不变。 | TODO 2，pi-ai 真实 SDK 流及既有协议请求测试。 |
| 能力和内容边界 | [3.5](./spec.md#spec-req-3-5) | 未知／多模态内容拒绝；没有的时序、字节、推理和用量不补造。 | TODO 3／4，并在 pi-ai fixture 覆盖不支持内容和缺失字段。 |
| 完整响应后执行 | [4.1](./spec.md#spec-req-4-1) | 完整工具块到达仍无待审批 Action 或工具效果，整体成功后才走原准入／审批。 | TODO 5／8，实际 LLMStepExecutor／Runner／装配屏障。 |
| 唯一合法完成 | [4.2](./spec.md#spec-req-4-2) | 缺失／重复完成、未封口、内容失配或提前结束均失败，不用旧内容补齐。 | TODO 2，采集器拒绝序列与返回值。 |
| EOF 与尾部检查 | [4.3](./spec.md#spec-req-4-3) | 完成候选后继续等待，尾部抛错或额外事件无成功发布；usage 先于最终结果归集。 | TODO 2／3，EOF 屏障、终止事件和指标。 |
| 非流 Adapter 与无自动回退 | [4.4](./spec.md#spec-req-4-4) | generate 在等待期间已有开始状态，返回后 whole 交付；stream 失败不调用 generate。 | TODO 2，计数 Adapter、异步屏障和事件序列。 |
| 一次调用一次指标 | [4.5](./spec.md#spec-req-4-5) | 多块不重复计数；输入写失败零请求；诊断／指标错误隔离，whole 不伪造速度。 | TODO 7，model-input／metrics／trace 实际记录。 |
| 中止和资源所有权 | [5.1](./spec.md#spec-req-5-1) | 派发前及 chunk 间取消均传播取消，关闭本次流，不接收迟到片段、不关借用实例。 | TODO 5，真实 SDK 连接关闭、迭代器计数。 |
| 截断和阻断拒绝 | [5.2](./spec.md#spec-req-5-2) | length、过滤、安全阻断和异常 EOF 即使已有工具块仍失败；空业务结果归阶段校验。 | TODO 3／4／5，三协议负向 fixture 与阶段检查。 |
| 错误分类和既有重试 | [5.3](./spec.md#spec-req-5-3) | 限流／网络与鉴权／配额／协议保持分类，SDK／采集器不自行重发或换模型。 | TODO 5，本地响应状态、请求计数和 Runtime 下一次调用身份。 |
| 失败响应零工具效果 | [5.4](./spec.md#spec-req-5-4) | 完整块后失败不产生该响应的审批、工具、Observation、正式消息或完成证据。 | TODO 5，非暂时错误或冻结重试后的实际存储和执行计数。 |
| 清理与观察断开 | [5.5](./spec.md#spec-req-5-5) | 主错误保留，迭代器／传输清理可观察；慢订阅／断开不 abort 调用或创建 Interrupt。 | TODO 5／6，清理异常和独立快慢订阅。 |
| 观察身份与安全完成 | [6.1](./spec.md#spec-req-6-1) | 全部块活动可关联来源；公开完成不附带整份受限响应。 | TODO 6，序列化事件审查及来源断言。 |
| 默认隐私 | [6.2](./spec.md#spec-req-6-2) | 普通正文可见，JSON／参数／reasoning／签名／metadata 不越界，显式 reasoning 才获得对应内容。 | TODO 6，三个订阅级别、私有审查和 Browser SSE 标记检查。 |
| 合并、背压与线性存储 | [6.3](./spec.md#spec-req-6-3) | 同块保序，跨块不合并；溢出明确关闭，控制不静默丢失，无累计前缀列表／逐片持久化。 | TODO 6，execution-stream 压力场景、文件写入及实现核对。 |
| 观察旁路 | [6.4](./spec.md#spec-req-6-4) | 发布失败／订阅退出不改变响应；不从残缺片段恢复或承诺重启回放。 | TODO 6／8，发布故障、文件重建和正式装配状态。 |
| 当前 Browser 活动 | [6.5](./spec.md#spec-req-6-5) | 新内部块映射旧安全活动视图，普通正文和调用提示可用，无完整工具／推理载荷。 | TODO 6／8，Browser HTTP/SSE 和现有 Chrome runtime 场景。 |
| 全部当前消费者切换 | [7.1](./spec.md#spec-req-7-1) | 生产、解码、诊断、历史、fixture 和示例使用新形状，无旧输出／双协议路径。 | TODO 1／2／7／8，代码调用点核对、类型／构建及全量回归。 |
| 已提交原生历史 | [7.2](./spec.md#spec-req-7-2) | 完整块派生当前角色／结果配对，签名和参数不改，未提交片段不进对话。 | TODO 1／4／7／8，两轮 SDK 请求、轨迹和文件恢复。 |
| 真实链路交付 | [7.3](./spec.md#spec-req-7-3) | 本地 SSE 穿过真实 SDK、阶段执行及 Runtime，正常／异常和隐私矩阵均有证据。 | TODO 7／8，各协议流测试与装配集成测试。 |
| 契约与文档 | [7.4](./spec.md#spec-req-7-4) | TSDoc／示例／所有者说明同步，依赖和构建通过，无后续 Session／UI 功能混入。 | TODO 8，同任务文档审查及最终检查命令。 |

组合验收还需贯通以下流程，而非只汇总单元测试：

1. **原生工具调用**：正式无界面装配 → 真实 SDK／本地 SSE → 完整工具块屏障 → 整体成功 → 原准入／必要审批 → 工具一次执行 → 后续合法响应。核对请求、调用身份、参数和已提交结果，确认生成流没有另起执行链。
2. **Gemini 续接与 strict**：真实流分别走普通 Part／函数／签名路径及 strict 整块逆向投影路径，核对下一次请求的原始续接和两个入口的规范内容；不要求不相容的两种请求模式在一次请求中混用。
3. **失败与恢复边界**：完整工具块后异常 → 无该响应的工具效果 → 新调用身份执行既有合法重试或明确等待 → 关闭并重建读取已提交状态；前一调用的碎片和未提交消息不能被恢复成操作。
4. **观察隔离**：同一 Goal／Run 的多次合法模式调用连接默认、诊断、显式 reasoning、快／慢订阅和 Browser SSE，注入发布故障／断开；检查内容不越界、独立订阅关闭、模型与 Runtime 真实结果保持。现有 Chrome 页面完成原有对话链路，无新内容块 UI 要求。

最终命令以执行时实际新增文件为准，不得在文件尚不存在时宣称已验证：

```sh
npx tsx --test packages/llm-core/test/content-blocks.test.ts packages/model-call/test/content-block-stream.test.ts packages/llm-openai/test/openai-stream.test.ts packages/llm-google/test/gemini-stream.test.ts packages/runtime/test/model-stream-execution-boundary.test.ts apps/goal-server/test/model-output-streaming.integration.test.ts
npm test
npm --prefix apps/goal-server run build
npm --prefix apps/goal-board test
npm run build:web
node --test --test-concurrency=1 apps/goal-board/e2e/runtime.test.mjs
npm run check:dependencies
npm run check:docs
git diff --check
```

`npm test` 依当前回归脚本运行包／应用／Benchmark 的确定性测试及脚本检查；独立应用构建和 Chrome 场景补足其覆盖之外的入口。必要环境或依赖缺失记为 blocked，失败记为 failed；不修改要求、跳过或缩短检查来取得绿灯。使用现有数据的验证只读，清理仅限本次临时目录。

### Latest Result

- 状态：passed（含 1 项与本 Spec 无关的预存环境未满足项：goal-board Chrome 页面链路；本记录不据此宣称现有页面链路通过）。
- Freshness：current。
- 验证时间：2026-10-18 20:49–21:05（+08:00）。
- 被测提交：`e7304c21ccdfb37c4aed83ceb9b72f0f634b2f15`（分支 `codex/model-output-streaming`，工作树 `.worktrees/model-output-streaming`；HEAD~8 基线 `ae417629`，文档基线 `31602fd0`）。本记录提交只改 `plan.md` 的勾选与本节。
- 契约基线：已批准的 `spec.md` SHA-256 `d66dbaed073e795ae972c0ee34be7e1ec649b15f3c481e8985b89610cd994716`（未修改）；验证时的 `plan.md` SHA-256 `4e0f32c2288eedc2b0927b2db08e9ca68d15843c53b33cf5660fd219a06cc0ba`，写入本记录后 `plan.md` SHA-256 `2d1aeb1373ce9092486328867710cc2fe23c08cf2e008b2d873125859b2d3ae4`。
- 验证摘要（逐项实际结果）：
  - **新增功能测试命令**（计划最终命令第一行）：`packages/llm-core/test/content-blocks.test.ts`、`packages/model-call/test/content-block-stream.test.ts`、`packages/llm-openai/test/openai-stream.test.ts`、`packages/llm-google/test/gemini-stream.test.ts`、`packages/runtime/test/model-stream-execution-boundary.test.ts`、`apps/goal-server/test/model-output-streaming.integration.test.ts` → 35 pass / 0 fail。
  - **`npm test`**：全部通过（类型检查、包内文档检查、依赖边界检查、GEPA adapter 198 项、TS 测试 2120 pass / 0 fail、scripts 测试 70 pass / 0 fail）；`[regression] 全部通过`。
  - **`npm --prefix apps/goal-server run build`**：通过（`tsc --noEmit` 无输出）。
  - **`npm --prefix apps/goal-board test`**：81 pass / 0 fail。
  - **`npm run build:web`**：构建成功（`✓ built`）。
  - **`node --test --test-concurrency=1 apps/goal-board/e2e/runtime.test.mjs`**：**失败（未满足，预存环境）**。首条 UI 断言 `document.querySelector('.primary')?.disabled === true` 得到 `undefined`；独立 CDP 探针显示无 token 页面渲染 "Open the local link printed by `lazygoal web` to connect this board."，因此 Composer 不存在。已在纯文档基线 `31602fd0`（本 Spec 任何改动之前）复现同一断言失败，本次未修改 `apps/goal-board/src`，故判为环境／夹具既有问题，不作为本 Spec 的通过证据，也不宣称页面链路通过。
  - **`npm run check:dependencies`**：通过（259 个源文件）。
  - **`npm run check:docs`**：通过（45 个模块，161 份当前说明）。
  - **`git diff --check`**：无输出（通过）。
  - **装配与恢复回归**：`apps/goal-server/test/runtime-composition.integration.test.ts`、`runtime-recovery.integration.test.ts`、`model-output-streaming.integration.test.ts` → 10 pass / 0 fail。
- 验收对照证据（Planned Checks 各项）：
  - 1.1／1.2／1.3：`packages/llm-core/test/content-blocks.test.ts`（块顺序、格式、投影不 trim），三个 Adapter 测试的块顺序／分片断言。
  - 1.4：`packages/model-call/test/content-block-stream.test.ts`（最终块失配、改写、未封口全部拒绝）与 Gemini strict 投影用例。
  - 1.5：`openai-stream.test.ts`、`gemini-stream.test.ts` 的 generate／stream 等价用例；`packages/llm/test/native-dialogue*.test.ts` 续接回归。
  - 2.1–2.5：`content-block-stream.test.ts`（身份、交错、晚到身份、非法序列、终止摘要、合并键）。
  - 3.1／3.5：`openai-stream.test.ts`（真实 SDK + 本机 SSE、负例、非字符串内容拒绝）。
  - 3.2／3.3：`gemini-stream.test.ts`（Part 顺序、签名回放、whole 投影、generateContent 路由）。
  - 3.4：`packages/llm-pi-ai/test/pi-ai.test.ts`（真实 SDK 分片参数、thinking 受限、索引）。
  - 4.1：`packages/runtime/test/model-stream-execution-boundary.test.ts` 与 `apps/goal-server/test/model-output-streaming.integration.test.ts` 的屏障断言。
  - 4.2／4.3：`content-block-stream.test.ts`（缺失／重复完成、EOF 屏障与尾部异常）。
  - 4.4：`content-block-stream.test.ts`（generate-only 整块观察与开始状态）。
  - 4.5：`packages/model-call/test/llm-step-executor-metrics.test.ts`（多块单次计数、取消／失败结果、整块不伪造解码耗时、诊断按调用计数）。
  - 5.1–5.5：`model-stream-execution-boundary.test.ts`（合法重试新身份、零工具效果、迭代清理不覆盖主错误），三个 Adapter 的迭代器释放用例。
  - 6.1–6.5：`content-block-stream.test.ts` 隐私矩阵、`packages/execution-stream/test/execution-stream.test.ts` 合并与背压、`packages/browser/test/browser-stream.test.ts` 真实调用链活动投影。
  - 7.1／7.2：源码级旧字段审计＋`packages/model-context/test/native-model-history.test.ts`、`packages/llm/test/native-dialogue.test.ts`、装配集成测试的下一轮请求断言。
  - 7.3：上述真实本地服务／真实 SDK／Runtime 链路与隐私矩阵证据；页面链路见未满足项。
  - 7.4：本文件与各模块 overview／semantics 同步；`check:docs`、`check:dependencies`、`tsc` 通过。
- 未解决项与说明：
  1. `apps/goal-board/e2e/runtime.test.mjs` 未满足（预存环境／夹具问题，基线复现）；如需页面级证据，请在能通过该断言的机器或修正夹具后重跑。
  2. 工作树本地新增了 `benchmarks/node_modules` 符号链接（gitignore 覆盖）以便运行 benchmark 测试与类型检查；不属于提交内容。
  3. `.execution-progress.md` 是仓库既有被跟踪文件，按本地恢复约定保持未提交修改，因此 `git status --short` 不会完全干净；提交内容本身不含该文件。
  4. 已知与本次无关的负载型 flake 曾在并行全量运行中出现（goal-server browser-session、benchmarks/context CLI 子进程超时、composition-root-model-switching），单跑或低负载复跑均通过，最终一次 `npm test` 全绿。
