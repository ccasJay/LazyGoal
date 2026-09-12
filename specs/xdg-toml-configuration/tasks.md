# Implementation Plan

- [x] //TODO 1. 实现 XDG 基础目录解析与权限安全管理

  - 实现目标：在 `packages/llm` 中实现 `resolveXdgPaths()`，准确识别 `$XDG_CONFIG_HOME` 并缺省回退至 `$HOME/.config/lazygoal`，支持目录与敏感文件的 POSIX 安全权限管理（0700/0600）。
  - 成功判据：自定义环境变量与缺省路径均能正确解析；目录与新建配置文件权限符合 POSIX 安全预期。
  - 验证方式：待实现的 `packages/llm/test/xdg.test.ts` 单元测试。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [2.3](./requirements.md#req-2-3)_

- [x] //TODO 2. 引入轻量 TOML 解析与模式强校验器

  - 实现目标：引入轻量纯 TS TOML 解析库，实现 `config.toml` 与用户级 `profiles/<profile>.toml` 的结构化小节解析与语义校验，精准报告语法错误行号。
  - 成功判据：合法的 TOML 成功解析为对应配置对象；语法错误或未知字段精准输出包含行号、文件名的结构化异常；Profile 切换与不存在校验准确报错。
  - 验证方式：待实现的 `packages/llm/test/toml-config.test.ts` 单元测试。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2)_

- [x] //TODO 3. 实现四层配置合并引擎与 CLI 临时单向覆盖

  - 实现目标：实现 `loadRuntimeConfig()`，将“内置默认值 → `config.toml` → Profile → CLI 参数”严格按顺序合并，保证 CLI 参数仅临时生效且不写回磁盘。
  - 成功判据：各层级覆盖顺序验证正确；CLI 传入的临时参数（如 `--model`）成功覆盖且未触碰磁盘文件；必填项缺失时清晰报错退出。
  - 验证方式：待实现的 `packages/llm/test/config-loader.test.ts` 单元测试。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

- [x] //TODO 4. 清除 CLI 入口中的 .env 注入并完成端到端纯净工作区回归

  - 实现目标：从 `bin/lazygoal.cjs` 与 TUI 启动根中彻底删除 `.env` 与 `--env-file` 逻辑，对接全新 XDG 配置装配，并在无本地 `.env` 的工作区完成回归验证。
  - 成功判据：`bin/lazygoal.cjs` 零 `.env` 代码残留；在空白目录直接启动成功读取 XDG 配置；全量既有测试套件通过。
  - 验证方式：待实现的 `packages/tui/test/cli-xdg.integration.test.ts` 集成测试，并执行 `npm test` 全量回归。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [2.3](./requirements.md#req-2-3) | XDG 环境变量探测与默认路径绑定，POSIX 目录 0700/文件 0600 权限设置 | `packages/llm/test/xdg.test.ts` |
| [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2) | TOML 正常小节解析，语法与字段错误精准报告文件与行号 | `packages/llm/test/toml-config.test.ts` |
| [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3) | 四层合并顺序正确，CLI 参数临时生效且不写回，必填缺失快速失败 | `packages/llm/test/config-loader.test.ts` |
| [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2) | 动态加载指定 Profile，Profile 不存在时报错并列出可选项目 | `packages/llm/test/toml-config.test.ts` |
| [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2) | `bin/lazygoal.cjs` 零 .env 注入，全新工作区纯净启动成功 | `packages/tui/test/cli-xdg.integration.test.ts` |

### Latest Result

- 整体状态：已通过
- 时间：2026-09-12
- 被测代码状态：干净，全量 960 个测试及 13 个 scripts 校验全部通过（0 失败，0 告警）
- 逐项证据：
  - `packages/llm/test/xdg.test.ts`：通过
  - `packages/llm/test/toml-config.test.ts`：通过
  - `packages/llm/test/config-loader.test.ts`：通过
  - `packages/tui/test/cli-xdg.integration.test.ts`：通过
  - `npm test`：960 pass, 0 fail
