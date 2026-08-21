# Tools 共享内部模块与公共面清理 设计

## Overview

将 `packages/tools/src` 四个文件级工具（`read-file`、`write-file`、`edit-file`、`grep`）逐字复制的沙箱路径规则、错误映射与中止感知 fs 模板收敛为自包含的沙箱单元 `packages/tools/src/internal/workspace-sandbox.ts`，其接口按"后续可整体迁移为独立包"预留（见 D1）；删除 `execute` 中的二次类型断言死代码；重组 `bash`/`grep` 的 `validate` 为单次解析；从 `index.ts` 移除 6 个零引用常量重导出。公共行为（Observation 错误码、消息文案、沙箱规则、`replayPolicy`、导出的工具类与 ID）逐字不变，覆盖需求 1–4。

## Key Design Decisions

### D1：沙箱单元形态——按可迁移独立包预留接口（需求 1）

新建自包含模块 `packages/tools/src/internal/workspace-sandbox.ts`，导出单一接口 `WorkspaceSandbox` 与工厂 `createWorkspaceSandbox(workspaceRoot)`。本期不经 `index.ts` 导出（req-1-3）；接口按以下约束设计，使后续迁移为独立包（如 `packages/sandbox`）时只是物理移动 + 导出与 import 路径变更：

- **依赖自包含**：只依赖 `node:*`、`../../runtime/src/index` 的类型与 `execution-control`（`sandbox → runtime` 与 `tools → runtime` 方向一致，迁移时不改变依赖方向）；不导入任何工具实现文件，无反向依赖。
- **状态封装**：实例持有构造期解析的 `workspaceRoot`（空串检查 + `resolve()`），四个工具的构造函数收敛为一行委托，不再各自保存路径字符串。
- **按操作组织的方法面**（非散置 helper），全部附中文契约级 TSDoc 与最小 `@example`：
  - `validateRelativePath(path, opts?)`：非空/NUL/绝对路径/`..` 段校验；`opts.rejectSegments` 承载 `write_file`/`edit_file` 的 `.lazygoal` 前缀规则。返回 `ToolValidationResult` 失败或 `undefined`。
  - `resolveTarget(requestedPath, control?)`：`resolve` + `realpath` + `isWithinRoot` 组合，返回解析后绝对路径或 `PATH_OUTSIDE_WORKSPACE` failure；中止按现有语义抛出。
  - `readTextFile(path, control?)` / `writeTextFile(path, content, control?)`：统一为 `{ encoding: "utf8", signal: control?.signal }` 单次调用（Node 20+ 接受显式 `signal: undefined`），消除 5 处 signal 二分写法，内部完成 abort-catch-rethrow 模板。
  - `toDomainFailure(error, messages)`：errno → `failure` Observation 映射（见 D3）。
- **显式排除**：`firstPathSegment`、`hasParentPathSegment`、`isAbsolutePath`、`isNodeError`、`isWithinRoot` 为模块私有实现细节，不进接口；迁移独立包、经 `index.ts` 导出、`check-dependencies.mjs` 加白名单均为后续工作，不在本 Spec 范围。
- `isJsonObject` / `invalidInput` 不属于沙箱职责，收入独立的 `internal/json-input.ts`，避免污染沙箱单元的可迁移边界。

### D2：沙箱提取 TODO 标注约定（需求 1）

用标准 `// TODO(sandbox-extraction):` 注释标注未来独立成包的开发方向（沿用 `TODO(<topic>):` 格式，可 `rg "TODO\(sandbox-extraction\)"` 一次检索），出现在且仅出现在以下位置：

- `workspace-sandbox.ts` 文件头 TSDoc 之后紧跟一行：`// TODO(sandbox-extraction): 迁移为独立包 @lazygoal/sandbox —— 物理移动本文件 → 经入口导出 → check-dependencies.mjs 加白名单 → 替换消费方 import 路径`，作为提取操作的既定步骤说明。
- 四个文件级工具中 `createWorkspaceSandbox` 的调用点：单行尾注释 `// TODO(sandbox-extraction): 迁移独立包后替换为 @lazygoal/sandbox`。
- 除此之外不扩散标注。该标注是纯注释约定，不影响代码行为与测试；提取任务启动时由对应 Spec 的 tasks.md 接管并逐条清除。

### D3：`domainFailure` 参数化策略（需求 1）

不合并各工具的消息文案，只合并 errno 分支结构。`WorkspaceSandbox.toDomainFailure(error, messages)` 只负责 `switch` 骨架与返回 `ToolObservation | undefined`；消息表类型 `DomainFailureMessages`（`errno → (requestedPath) => message`）由沙箱模块导出，各工具在模块顶部保留私有消息表常量（`ENOENT`→"文件不存在"/"父目录不存在"/"搜索范围不存在"等），保证 req-1-4 的逐字一致可由现有测试直接锁定。

### D4：校验去重方式（需求 2）

五个工具统一为同一结构（`bash` 的沙箱无关字段校验除外）：

- 私有 `parseInput(input): Parsed | undefined` 只做结构与类型收窄（纯函数，无文件系统访问）。
- 私有 `checkSemantics(parsed): ToolValidationResult` 承载语义规则（非空、唯一性、超时上限等）；路径类规则委托 `sandbox.validateRelativePath`。
- `validate(input)` = `parseInput`（`undefined` 即 `invalidInput`）+ `checkSemantics`。
- `execute` = `parseInput`（`undefined` 即抛 `INVALID_TOOL_INPUT`）+ `checkSemantics`（`!ok` 即抛同内容错误）。结构与语义在每条路径上各执行一次，满足 req-2-3；`execute` 不再调用 `this.validate()` 整体重跑，也不再保留 `validate` 后的第二段类型断言死代码（req-2-1、req-2-2）。

### D5：导出面收窄（需求 3）

`index.ts` 删除 6 个零引用常量重导出；常量定义保留在 `bash.ts`/`grep.ts` 模块内（`BASH_MAX_OUTPUT_CHARS`、`BASH_MAX_TIMEOUT_MS` 维持导出供测试使用，其余 6 个降级为模块私有 `const`，不再 `export`）。测试若引用被降级常量则改为字面量断言（当前仅 `bash.test.ts` 引用 2 个保留导出的常量，零测试改动）。

### D6：不改动的边界（需求 4）

`runtime`/`tui`/`storage`/`agent`/`llm` 零改动；`check-dependencies.mjs` 白名单不变（`internal/` 在包内）；`docs/architecture/runtime.md` 已声明"五者共享 workspaceRoot 沙箱"，实现收敛后与文档一致，无需文档变更。

## Error Handling

错误语义完全继承现状：领域失败走 `failure` Observation（文案由 D3 消息表保证逐字不变）；协议/基础设施异常直接抛出；`ExecutionAbortedError` 在共享 fs 包装内统一识别并原样传播。无新增错误码。

## Testing Strategy

以现有测试为回归基线，不新增测试文件：

1. `npx tsx --test packages/tools/test/*.test.ts` 全绿且测试源码零改动——直接证明 req-1-4、req-2-2、req-4-1、req-4-4。
2. `npx tsc --noEmit` 通过——证明 req-3-1 删除导出后无残留引用、req-1-3 共享模块不外泄。
3. `npm run check:dependencies` 通过——证明 req-4-2。
4. `git diff --stat` 确认 `packages/tools/src` 净删除行数与 `runtime`/`tui`/`storage` 零改动（req-4-3）。
