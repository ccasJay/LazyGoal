# Tools 共享内部模块与公共面清理 需求

## 引言

`packages/tools` 的四个文件级工具（`read-file`、`write-file`、`edit-file`、`grep`）各自逐字复制了同一套 workspaceRoot 沙箱路径规则、Node 错误到领域失败 Observation 的映射、中止感知文件系统调用模板，与架构文档"五者共享 workspaceRoot 沙箱"的声明不符；同时 `execute` 中存在 `validate` 通过后的不可达二次类型断言，`index.ts` 重导出了 6 个全仓零引用的限值常量。本功能在不改变任何公共行为的前提下，将重复实现收敛为包内单一共享模块，删除死代码并收窄公共导出面。

## 需求

### 需求 1：文件级工具共享沙箱与错误处理实现

**用户故事：** 作为 LazyGoal 维护者，我希望四个文件级工具复用同一份沙箱路径与错误处理实现，以便沙箱规则单点演进、新增工具不再复制模板。

#### 验收标准

1. <a id="req-1-1"></a> 当审计 `packages/tools/src` 源码时，系统必须提供单一的包内共享模块，统一承载 workspaceRoot 构造校验、沙箱路径规则（绝对路径、`..` 路径段、`.lazygoal` 前缀、越界符号链接）、路径解析与 Node 错误到领域失败 Observation 的映射。
2. <a id="req-1-2"></a> 当读取 `read-file`、`write-file`、`edit-file`、`grep` 任一实现时，系统必须复用该共享模块，且四个文件中不再各自保留沙箱路径 helper 与错误映射的私有副本。
3. <a id="req-1-3"></a> 当通过包的公共入口 `packages/tools/src/index.ts` 导入时，系统必须不暴露该共享模块的任何符号。
4. <a id="req-1-4"></a> 当任一工具对非法路径、缺失文件、权限不足、目录目标或越界符号链接求值时，系统必须返回与当前逐字一致的 Observation 错误码与消息文案。

### 需求 2：输入校验契约去重

**用户故事：** 作为 LazyGoal 维护者，我希望每个工具对同一次输入只校验一次，以便 `validate` 与 `execute` 的契约关系没有歧义且不存在不可达代码。

#### 验收标准

1. <a id="req-2-1"></a> 当 `execute` 接收已通过 `validate` 的输入时，系统必须不再对已保证的条件执行重复类型断言。
2. <a id="req-2-2"></a> 当 `execute` 接收未通过 `validate` 的输入时，系统必须仍然抛出携带 `INVALID_TOOL_INPUT` 前缀的稳定错误。
3. <a id="req-2-3"></a> 当 `bash` 或 `grep` 校验输入时，系统必须对结构化输入只解析一次，不在 `validate` 与 `execute` 之间重复解析同一 JSON 值。

### 需求 3：收窄包公共导出面

**用户故事：** 作为 LazyGoal 维护者，我希望包公共导出只保留有真实消费者的符号，以便调整内部限值不构成事实上的破坏性变更。

#### 验收标准

1. <a id="req-3-1"></a> 当通过 `packages/tools/src/index.ts` 导入时，系统必须不再导出 `GREP_MAX_FILES`、`GREP_MAX_MATCHES`、`GREP_MAX_DEPTH`、`GREP_MAX_LINE_CHARS`、`BASH_DEFAULT_TIMEOUT_MS`、`BASH_MAX_BUFFER_BYTES`。
2. <a id="req-3-2"></a> 如果某符号仍有生产或测试消费者，系统必须保留其导出，包括五个工具类、五个 `*_TOOL_ID` 常量以及测试使用的 `BASH_MAX_OUTPUT_CHARS`、`BASH_MAX_TIMEOUT_MS`。

### 需求 4：公共行为与跨包边界不变

**用户故事：** 作为 LazyGoal 维护者，我希望本次清理不引起任何行为或边界回归，以便安全合入。

#### 验收标准

1. <a id="req-4-1"></a> 当运行 `packages/tools` 全部既有测试时，系统必须全部通过，且测试用例的语义断言（错误码、消息文案、沙箱拒绝行为、`replayPolicy` 声明）不被修改。
2. <a id="req-4-2"></a> 当执行 `npx tsc --noEmit` 与 `npm run check:dependencies` 时，系统必须全部通过，且不新增跨包依赖。
3. <a id="req-4-3"></a> 当对比变更前后 `runtime`、`tui`、`storage`、`agent`、`llm` 包源码时，系统必须零改动。
4. <a id="req-4-4"></a> 当中止信号已触发时，各工具文件系统操作必须继续按现有语义传播 `ExecutionAbortedError`，不产生新的 Observation 或吞掉中止。
