# Implementation Plan

- [x] //TODO 1. 建立 benchmarks package、Conda 环境和 ALFWorld 预检入口

  - 新增 `benchmarks/package.json`、独立 `tsconfig.json`、`alfworld/environment.yml` 及初始化/预检脚本，锁定 Python、ALFWorld、TextWorld 和平台架构配置；提供 `alfworld/README.md` 中可复制的 Conda、数据下载和 Apple Silicon 初始化命令。
  - 实现 `ALFWORLD_PYTHON`、`ALFWORLD_DATA`、版本、数据目录和 TextWorld 能力校验；普通 Node/TypeScript 测试路径不得创建 Conda 进程。
  - 增加配置成功、缺失数据、平台架构选择和未显式启用评测时的自动化测试。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [7.3](./requirements.md#req-7-3)_

- [x] //TODO 2. 实现固定任务 Manifest 解析与可复现校验

  - 新增 `benchmarks/src/alfworld/manifest.ts`，校验相对 `gameFile`、`taskId`、split、顺序、seed 和单任务步数上限。
  - 拒绝绝对路径、越出 `ALFWORLD_DATA` 的路径和不稳定的隐式任务抽样；保留 Smoke 与 Regression 的固定清单入口。
  - 为合法清单、重复 ID、非法路径和顺序稳定性增加单元测试。
  - _Requirements: [4.1](./requirements.md#req-4-1)_

- [x] //TODO 3. 实现 Python JSONL sidecar 与 TypeScript SidecarClient 生命周期

  - 编写 `benchmarks/alfworld/python/sidecar.py` 和 `benchmarks/src/alfworld/sidecar-client.ts`，支持 `health`、`reset`、`step`、`close`、单调 `requestId`、单请求串行和有界响应。
  - 使用 `spawn`、`shell: false`、超时和 `AbortSignal` 管理进程；处理中止、退出、非法 JSON、错配响应和并发/重复请求时关闭会话且不重放未知结果。
  - 使用假的 child process 覆盖初始化、单步、关闭、冲突请求、超时和基础设施退出语义。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [6.3](./requirements.md#req-6-3)_

- [x] //TODO 4. 接入 ALFWorld Profile、基础 Tool 和专用环境 Tool

  - 提供 `benchmarks/alfworld/profile/alfworld-profile.json` 模板，并实现从 `.lazygoal/profile/<profileId>.json` 加载、Schema/ID/Tool 白名单校验和 Profile 标识冻结。
  - 复用现有 `ReadFileTool`、`GrepTool`；实现 `AlfworldResetTool`、`AlfworldStepTool` 的环境状态机和 Observation 转换，不复制文件读取、搜索或路径沙箱逻辑，不注册 Bash、写入或编辑 Tool。
  - 测试 Profile 授权、基础 Tool 语义复用、reset/step 状态、领域命令失败、`won`/`done` 观察和 manual replay 行为。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [6.2](./requirements.md#req-6-2)_

- [x] //TODO 5. 实现 EvaluationRunner、Goal 驱动循环和评测报告聚合

  - 新增 `evaluation-runner.ts`，装配已校验 Profile、专用 ToolRegistry、自动放行 Policy、隔离 GoalStore、`LLMStepExecutor` 和现有 `Runner`。
  - 新增 `report.ts`，记录每次 attempt 的环境事实、Profile/Prompt/Manifest 标识、重试序号和错误类别，按 `won` 聚合成功率、平均步数和失败分类。
  - 用假的 LLM、GoalStore、Session 和 Runner 验证环境成功优先于模型 `complete`、基础设施重试不覆盖原始 attempt，并保留机器可读报告结构。
  - _Requirements: [3.4](./requirements.md#req-3-4), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2)_

- [x] //TODO 6. 增加显式 `lazygoal eval alfworld` 入口与报告阈值退出

  - 实现 benchmarks CLI 的 Profile、Manifest、报告输出和成功率阈值参数，并让根 `bin/lazygoal.cjs` 仅转发显式 `eval alfworld` 参数；普通 `lazygoal` 和 `resume` 路径保持原有加载与 Registry。
  - 在模型请求和 sidecar 启动前报告 Profile、Manifest、Conda 或 Tool 配置错误；阈值未达成时保留完整 JSON 报告并返回非零结果。
  - 增加 CLI 集成测试，验证 Profile 缺失/非法、Bash 未授权、报告解析、阈值退出和普通 CLI 不加载 ALFWorld。
  - _Requirements: [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

- [x] //TODO 7. 完成显式 Smoke/Regression 与全量回归验证

  - 增加一个固定 `valid_seen` Smoke 和固定任务集 Regression 命令，覆盖真实 Conda/ALFWorld 环境、报告生成、任务清理和失败分类；未配置环境时只在显式入口失败。
  - 增加中止、sidecar 意外退出、环境拒绝命令、任务终态和清理幂等的端到端自动化测试，确认不写入虚假成功 Observation。
  - 执行 benchmarks typecheck/test、现有 TypeScript 检查、依赖边界检查和完整测试套件。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.4](./requirements.md#req-6-4), [7.3](./requirements.md#req-7-3)_
