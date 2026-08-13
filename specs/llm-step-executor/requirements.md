# LLM Step Executor 需求文档

## 简介

本功能为现有同步 Run Loop 增加纯文本 LLM 单步执行能力：系统根据当前 `RunState` 与冻结的 Agent Profile 发起一次模型请求，并将严格 JSON 响应转换为一个既有 `StepResult`；首版不支持 Tool Calling、自动纠错重试或完整消息历史。

## 需求

### 需求 1：根据当前 Run 构造单步模型请求

**用户故事：** 作为 Runtime 调用方，我希望模型收到当前目标、执行约束和最近进度，以便每次调用都能针对同一个 Run 产出下一步结果。

#### 验收标准

1. <a id="req-1-1"></a> 当系统执行一个 `toolIds` 为空的 `RunState` 时，系统必须向注入的 `LLMAdapter` 发起且仅发起一次生成请求。
2. <a id="req-1-2"></a> 该生成请求必须包含冻结 Profile 的 `systemPrompt` 与全部 `instructions`、Goal 的 `objective` 与全部 `completionCriteria`、当前 `stepCount`，以及严格 JSON 输出协议。
3. <a id="req-1-3"></a> 当 `lastResult` 存在时，生成请求必须包含该结果；当其不存在时，系统不得虚构先前执行结果。
4. <a id="req-1-4"></a> 单步执行不得修改传入的 `RunState` 或其中的 Goal 与 Profile 数据。

### 需求 2：将严格 JSON 响应转换为 StepResult

**用户故事：** 作为 Runner，我希望每次模型响应都被确定地转换为一个既有 `StepResult`，以便状态机能够继续使用既有转换规则。

#### 验收标准

1. <a id="req-2-1"></a> 当模型返回 `{"kind":"continue","summary":"非空文本"}` 时，系统必须返回对应的 `continue` 结果。
2. <a id="req-2-2"></a> 当模型返回 `{"kind":"wait","reason":"非空文本"}` 时，系统必须返回对应的 `wait` 结果。
3. <a id="req-2-3"></a> 当模型返回 `{"kind":"complete","summary":"非空文本"}` 时，系统必须返回对应的 `complete` 结果。
4. <a id="req-2-4"></a> 当模型返回 `{"kind":"fail","error":"非空文本"}` 时，系统必须返回对应的 `fail` 结果。
5. <a id="req-2-5"></a> 系统必须只接受与所选 `kind` 匹配且字段类型正确的单个 JSON 对象，不得根据自由文本猜测结果类型或缺失内容。

### 需求 3：明确处理不受支持的 Tool

**用户故事：** 作为 Agent 配置维护者，我希望首版在 Profile 请求 Tool 能力时明确失败，以便系统不会静默忽略已声明的行为能力。

#### 验收标准

1. <a id="req-3-1"></a> 当 `RunState.profile.toolIds` 非空时，单步执行必须抛出可识别的 `TOOLS_NOT_SUPPORTED` 错误。
2. <a id="req-3-2"></a> Tool 不受支持错误发生时，系统不得调用 `LLMAdapter`。
3. <a id="req-3-3"></a> 当该错误由现有 `Runner` 接收时，Run 必须依照既有 Executor 异常语义保存为 `failed`，并且只计入一次 Step。

### 需求 4：确定地处理模型与协议错误

**用户故事：** 作为 Runtime 调用方，我希望模型调用或响应协议出错时能够确定地终止当前 Run，以便错误不会被隐藏或触发不可预期的额外调用。

#### 验收标准

1. <a id="req-4-1"></a> 当模型响应不是合法 JSON、包含不支持的 `kind`、缺少对应字段或对应字段不是非空字符串时，单步执行必须抛出可识别的响应协议错误。
2. <a id="req-4-2"></a> 响应协议错误发生后，系统不得自动修复响应或再次调用 `LLMAdapter`。
3. <a id="req-4-3"></a> 当 `LLMAdapter` 抛出错误时，单步执行必须将原错误交给调用方，不得改写为伪造的模型结果。
4. <a id="req-4-4"></a> 当模型调用或响应协议错误由现有 `Runner` 接收时，Run 必须依照既有 Executor 异常语义保存为 `failed`，并且只计入一次 Step。

### 需求 5：接入现有同步 Run Loop

**用户故事：** 作为 Agent 开发者，我希望纯文本 LLM 单步能力能复用现有 Runner 生命周期，以便无需改变既有调度与状态转换语义即可执行 Goal。

#### 验收标准

1. <a id="req-5-1"></a> 每次单步执行必须只返回一个 `StepResult`，不得自行保存 Run、执行状态转换或启动下一次 Step。
2. <a id="req-5-2"></a> 当注入的 fake LLM 依次返回合法的 `continue` 与 `complete` 响应时，现有同步 Loop 必须最终返回 `completed` 状态，且 `stepCount` 为 `2`。
3. <a id="req-5-3"></a> 同一单步能力必须适用于任何满足现有 `LLMAdapter` 契约的实现，不得要求特定模型供应商的响应对象。
4. <a id="req-5-4"></a> 自动化验证不得访问真实 LLM、网络、Tool 或文件系统，并且现有 Runtime 回归测试必须继续通过。
