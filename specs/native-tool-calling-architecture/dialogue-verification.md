# 原生工具对话回传专项验证

本次实施依据用户批准的“原生工具对话回传闭环”计划，仅扩展 OpenAI Chat Completions 与 Gemini 的原生历史、结果配对和恢复。保留输出模式配置、独立 Think、审批和单步单动作；不代表本目录原始 Spec 中删除输出模式或扩展其他供应商的目标已经完成。

## 实施证据

- [消息契约](../../packages/contracts/src/model-conversation.ts) 分离正文、reasoning 摘要、供应商调用 ID 和必要续接字段。
- [原生历史投影](../../packages/agent/src/native-model-history.ts) 从 Snapshot 边界内的 Trajectory 派生成对交换；[检查点提交](../../packages/runtime/src/trajectory-checkpoint-committer.ts) 保存接受的模型响应事实，不以诊断日志恢复。
- [上下文组装](../../packages/agent/src/trajectory-model-context-assembler.ts) 按完整执行单元计算原生载荷预算，保留语义 Warm 来源；切换身份后终止旧原生段。
- [协议测试](../../packages/llm/test/native-dialogue.test.ts) 覆盖两轮 OpenAI/Gemini 消息形状、独立 reasoning、Gemini Parts 顺序与签名；OpenAI 另通过真实 SDK 调用本地 HTTP fixture 验证两轮传输。后者不等于云端验证。
- [Runtime 与上下文测试](../../packages/agent/test/native-model-history.test.ts) 覆盖成功/失败/拒绝结果投影、系统确认、lookup、未结算调用、未提交 tail、签名预算、模型切换、文件存储重启、响应提交后中断、Think 恢复和审批恢复。

## 验证结果

2026-10-01：

- `npm test`：类型检查、依赖边界检查、198 个 GEPA Python 测试、1624 个 TypeScript/JavaScript 测试及 14 个脚本测试全部通过。
- 在 `prototypes/goal-board` 执行 `npm run test:e2e`：构建成功，2 个浏览器端到端测试通过。
- `git diff --check`：通过。

独立的真实 OpenAI/Gemini 云端 smoke **未验证**：smoke 环境未提供必填的 `LLM_PROVIDER`。[可配置 smoke](../../packages/llm/test/native-dialogue-smoke.ts) 已提供，配置 provider、model、API Key 和所需端点后运行 `npm run llm:native-dialogue-smoke`；每次运行产生两次模型请求。需要分别执行两家供应商的 smoke 才能确认各自云端协议闭环。

## 补充真实任务验证

同日按用户要求，从 LazyGoal Home 的 default Profile 加载 `google / gemini-3.5-flash-lite`，通过已配置 Gemini 网关运行只读任务：分别读取真实 `package.json` 与 `packages/llm/package.json`，汇总包名和 npm scripts。使用生产 ReadFileTool、Runner、文件 Snapshot、Trajectory 和 ModelInputStore；不修改业务文件。

- Plan Run 两次尝试均未生成合法提案：模型遗漏必需字段或加入顶层 `protocolVersion`，三次修复后失败。首次临时验证 Profile 还含不适用的 `memoryPatch: null` 指令；第二次修正 Profile 后仍失败。
- Normal Run 发出 5 次真实模型请求。第一轮读取结算后主动退出进程，用新进程从文件存储恢复；两个文件各读取一次，产生两个成功 Observation。恢复请求保留原始 Parts、签名和供应商调用 ID，最后请求包含两个唯一的配对结果。
- 完成阶段三次 `system_complete_task` 响应均含不允许的顶层 `protocolVersion`；第一次还含非法 `memoryPatch`。Runtime 校验和修复未被放宽，Run 最终为 `failed`。这三次未接受响应不进入 committed 原生历史。

结论：配置网关上的真实工具回传和跨进程恢复已通过，端到端任务完成**未通过**；本次没有验证 OpenAI、官方 Gemini 直连或 reasoning 摘要返回。现场产物保留在 `/tmp/lazygoal-native-live.wOaHx1/`，Normal Run 的 `attempt3/report.json` 记录断言结果，`trajectory/` 和 `inputs/` 保留提交事实与请求；临时脚本仅用于此次验证。
