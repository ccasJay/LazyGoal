# LazyGoal Home 统一存储实施任务

- [x] //TODO 1. 实现 LazyGoal Home 与 workspace 路径解析

  - 实现目标：将 `XdgPaths` 扩展为 `LazyGoalHomePaths`，增加 `WorkspaceHomePaths`、绝对 `LAZYGOAL_HOME` 校验、realpath/SHA-256 workspace ID 和 manifest 路径。
  - 成功判据：默认与环境覆盖路径稳定；相对 Home、realpath 失败和 manifest 身份不一致在持久化前失败；解析函数不创建目录。
  - 验证方式：新增路径与 workspace 单测，覆盖权限、符号链接、不同 checkout 和 manifest mismatch。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [2.5](./requirements.md#req-2-5), [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.4](./requirements.md#req-7-4)_

- [x] //TODO 2. 将 LLM 配置、Agent Profile 和 TUI Composition Root 接入 Home

  - 实现目标：迁移配置 loader、全局 Agent Profile、Goal/Trajectory/Trace/Sidecar 和当前 workspace benchmark 聚合的默认路径，同时保持显式目录注入和 workspace 工具沙箱。
  - 成功判据：不同 workspace 共用 config/Profile；普通运行只写 Home；历史只显示当前 workspace；缺失配置不访问旧路径。
  - 验证方式：更新 `packages/llm`、`packages/storage`、`packages/tui` 单测和 CLI 集成测试；断言项目 `.lazygoal` 不产生。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_

- [x] //TODO 3. 迁移 benchmark 与 GEPA 的默认运行边界

  - 实现目标：将 GAIA、SWE-bench、ALFWorld、TUA-Bench、Prompt Evaluation 和 GEPA 的默认运行结果切换到当前 workspace Home，将可重建资源切换到全局 cache，并将 benchmark Agent Profile 切换到全局目录。
  - 成功判据：无显式输出时结果、attempt、报告和内部快照不写项目 `.lazygoal`；显式输出原样生效；不同 workspace 运行目录隔离且 cache 可复用；GEPA 仅在成功发布时更新全局 Profile。
  - 验证方式：更新各 benchmark/GEPA 测试，使用临时 Home 覆盖默认路径，覆盖成功、失败、停止和显式输出。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [5.5](./requirements.md#req-5-5), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

- [x] //TODO 4. 完成旧路径隔离、文档和全量回归

  - 实现目标：移除生产默认路径中的项目 `.lazygoal`/`XDG_CONFIG_HOME` 依赖，更新架构与仓库布局文档，移除 `.gitignore` 运行保障，并补充源码守卫。
  - 成功判据：源码默认值和文档只描述 LazyGoal Home；旧路径不被读取、复制、删除；相关 TypeScript、单元、集成和 benchmark 回归通过。
  - 验证方式：执行相关 workspace typecheck/test、全量测试和源码搜索；记录失败或环境缺失，不以退出码单独作为成功证据。
  - _Requirements: [7.3](./requirements.md#req-7-3), [7.4](./requirements.md#req-7-4), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2)、[1.3](./requirements.md#req-1-3)、[1.4](./requirements.md#req-1-4) | 默认/覆盖 Home、非法相对路径和 XDG 输入得到确定结果，解析不创建文件 | `packages/llm/test/xdg.test.ts`、`benchmarks/test/default-paths.test.ts` |
| [2.1](./requirements.md#req-2-1)–[2.5](./requirements.md#req-2-5) | realpath、符号链接、移动路径和 manifest 不一致保持预期隔离或失败 | workspace 路径单测与 manifest 校验 |
| [3.1](./requirements.md#req-3-1)–[3.4](./requirements.md#req-3-4) | 多 workspace 共用配置/Profile，缺失配置不访问旧路径 | LLM/Profile/TUI 单测与集成测试 |
| [4.1](./requirements.md#req-4-1)–[4.4](./requirements.md#req-4-4) | 普通运行只写 Home，工具仍受 workspaceRoot 沙箱，显式目录优先 | TUI Composition Root 测试 |
| [5.1](./requirements.md#req-5-1)–[5.5](./requirements.md#req-5-5) | benchmark 运行按 workspace，cache 全局，显式输出和 task 隔离有效 | benchmark 回归测试（236 tests） |
| [6.1](./requirements.md#req-6-1)–[6.3](./requirements.md#req-6-3) | GEPA run 在 workspace，成功才发布全局 Profile | GEPA adapter 测试（136 tests） |
| [7.1](./requirements.md#req-7-1)–[7.4](./requirements.md#req-7-4) | 权限、旧路径不变、写入失败保留已有数据 | 权限测试、源码搜索与全量回归 |
| [8.1](./requirements.md#req-8-1)–[8.3](./requirements.md#req-8-3) | TUI 历史仅当前 workspace，空或损坏状态不串库 | TUI 集成测试与全量回归 |

### Latest Result

已通过（2026-09-21）：根 TypeScript 类型检查通过；`npm test` 最终全量回归通过（含依赖边界和 scripts 测试，1266 个测试、0 失败）；benchmark 回归通过（236 个测试）；GEPA adapter 通过（136 个测试）；路径、LLM 配置、TUI Composition Root 和 benchmark Home 单测通过；源码守卫确认生产代码不再依赖 `XDG_CONFIG_HOME`、`resolveXdgPaths` 或项目 `.lazygoal` 默认持久化路径。验证针对当前工作树实现。
