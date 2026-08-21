# Implementation Plan

- [x] //TODO 1. 创建沙箱内部模块并迁移 `read-file`（最早验证设计）

  - 新建 `packages/tools/src/internal/json-input.ts`（`isJsonObject`/`invalidInput`）与 `packages/tools/src/internal/workspace-sandbox.ts`（`WorkspaceSandbox` 接口 + `createWorkspaceSandbox` 工厂 + `DomainFailureMessages` 类型），含中文契约级 TSDoc、`@example` 与 D2 的文件头 `// TODO(sandbox-extraction):` 标注
  - `read-file.ts` 迁移为复用沙箱实例（构造函数一行委托、调用点加 TODO 尾注释），删除二次类型断言并改为 `parseInput` + `checkSemantics` 结构
  - 运行 `npx tsx --test packages/tools/test/*.test.ts` 验证零回归
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.4](./requirements.md#req-1-4), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [4.1](./requirements.md#req-4-1), [4.4](./requirements.md#req-4-4)_

- [x] //TODO 2. 迁移 `write-file` 与 `edit-file` 到沙箱模块

  - 两个文件改为沙箱实例委托（`.lazygoal` 前缀规则经 `validateRelativePath` 的 `rejectSegments` 承载），消息表按 D3 参数化保留逐字文案，调用点加 TODO 尾注释
  - 删除两处 `execute` 二次类型断言死代码，统一 `parseInput` + `checkSemantics` 结构；`edit-file` 的读/写经沙箱 fs 包装统一 signal 写法
  - 运行 `npx tsx --test packages/tools/test/*.test.ts` 验证零回归
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.4](./requirements.md#req-1-4), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [4.1](./requirements.md#req-4-1), [4.4](./requirements.md#req-4-4)_

- [x] //TODO 3. 迁移 `grep` 并重组 `bash` 校验结构

  - `grep.ts` 迁移到沙箱实例（路径解析、跳过目录遍历、fs 读取），调用点加 TODO 尾注释；`bash.ts` 不涉及沙箱，仅收敛为 `parseInput` + `checkSemantics`
  - 两个文件的 `execute` 消除 `parseInput` + `validate` 双重解析，结构与语义各执行一次
  - 运行 `npx tsx --test packages/tools/test/*.test.ts` 验证零回归
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.4](./requirements.md#req-1-4), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [4.1](./requirements.md#req-4-1), [4.4](./requirements.md#req-4-4)_

- [ ] //TODO 4. 收窄公共导出面并做全量验收

  - `index.ts` 删除 6 个零引用常量重导出；`GREP_MAX_*` 与 `BASH_DEFAULT_TIMEOUT_MS`、`BASH_MAX_BUFFER_BYTES` 降级为模块私有 `const`
  - 全量验证：`npx tsc --noEmit`、`npx tsx --test packages/tools/test/*.test.ts`（测试源码零改动）、`npm run check:dependencies`
  - `git diff --stat` 确认 `runtime`/`tui`/`storage`/`agent`/`llm` 零改动与 `packages/tools/src` 净删除
  - _Requirements: [1.3](./requirements.md#req-1-3), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_
