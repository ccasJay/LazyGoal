# Implementation Plan

- [x] //TODO 1. 实现宿主代理网页工具 `web_search` 和 `web_fetch`

  - 实现目标：在 `packages/tools/src/` 新增 `web-search.ts` 和 `web-fetch.ts`，实现 `ToolDefinition` 接口。`web_search` 接收查询字符串并返回有界结果列表；`web_fetch` 接收 URL 并返回有界纯文本。两个工具在宿主执行网络请求，通过已有 ACP 工具通道传递请求和结果。
  - 成功判据：伪搜索后端下 `web_search` 返回符合 schema 的结果列表（title、url、snippet）；`web_fetch` 返回有界纯文本且超过 `maxChars` 时截断；两个工具的 JSON Schema 通过 `ToolRegistry` 注册校验。
  - 验证方式：待实现的 `packages/tools/test/web-search.test.ts` 和 `web-fetch.test.ts`；不依赖外部网络。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3)_

- [x] //TODO 2. 实现 GAIA 数据集加载器和 Manifest 构建

  - 实现目标：在 `benchmarks/gaia/src/` 实现 `GaiaDatasetLoader`，通过 HuggingFace Hub API 下载 GAIA Gated Dataset 元数据和附件文件，构建 `GaiaManifest`。实现 `GaiaManifestTask` 类型和 Manifest 序列化。
  - 成功判据：fixture JSONL 数据构建出包含 taskId、question、expectedAnswer、level、split 和 attachments 的 Manifest；validation split 包含 expectedAnswer，test split 的 expectedAnswer 为 null；附件路径与 dataRoot 正确关联。
  - 验证方式：待实现的 `benchmarks/gaia/test/manifest.test.ts`；使用 fixture 数据不依赖 HuggingFace API。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [x] //TODO 3. 实现 `GaiaEnvironmentSpec`

  - 实现目标：在 `benchmarks/gaia/src/environment-spec.ts` 实现 `GaiaEnvironmentSpec`，声明 managed 镜像安装命令、`/workspace` 工作目录、附件注入、Python 文件处理库预检和答案文件回收。
  - 成功判据：`resolveImage` 返回 managed 模式和正确的安装命令；`prepareEnvironment` 通过伪 `EnvironmentHandle` 验证附件 `copyInto` 和 question.txt 写入；`preflight` 验证 Python 和关键库；`collectArtifacts` 回收 `/workspace/answer.json`。
  - 验证方式：待实现的 `benchmarks/gaia/test/environment-spec.test.ts`；伪 `EnvironmentHandle` 验证所有操作。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4)_

- [ ] //TODO 4. 实现 GAIA Worker 入口和 `submit_answer` 工具

  - 实现目标：创建 `benchmarks/gaia/src/worker-entry.ts`，装配 `HeadlessCompositionRoot` 并注册 `read_file`、`web_search`、`web_fetch`、`submit_answer` 工具。`submit_answer` 使用 `O_EXCL` 写入 `/workspace/answer.json`，保证单次提交。
  - 成功判据：`submit_answer` 首次调用写入答案文件并返回成功；第二次调用返回拒绝；Worker 工具注册表包含且仅包含四个工具。
  - 验证方式：待实现的 `benchmarks/gaia/test/submit-answer.test.ts`；覆盖单次提交和重复拒绝。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

- [ ] //TODO 5. 实现 GAIA 答案评分逻辑

  - 实现目标：在 `benchmarks/gaia/src/grading.ts` 实现 GAIA 官方归一化精确匹配函数和独立 `grade` CLI 入口。归一化步骤：小写 → 去冠词 → 去标点 → 压缩空格 → 数字标准化 → trim。`grade` 读取 Attempt 记录和答案文件，执行评分后更新 `domainResult`。
  - 成功判据：归一化函数覆盖大小写（"Paris" = "paris"）、冠词（"the answer" = "answer"）、标点（"answer." = "answer"）、数字（"1,000" = "1000"，"1.0" = "1"）；`grade` 入口在无 LLM 环境变量时可运行。
  - 验证方式：待实现的 `benchmarks/gaia/test/grading.test.ts`；纯函数测试覆盖各归一化场景。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3)_

- [ ] //TODO 6. 实现 GAIA AttemptRecorder 集成和汇总报告

  - 实现目标：在 GAIA Supervisor 中集成共享 `AttemptRecorder`，`domainResult` 使用 `GaiaDomainResult` 类型。实现 `aggregateReport` 按 Level 和 split 分组统计正确率。
  - 成功判据：Attempt 记录包含 `submittedAnswer`、`correct`、`level`；中途退出后已完成记录可读取；汇总报告分 Level 统计正确率。
  - 验证方式：待实现的 `benchmarks/gaia/test/report.test.ts`；使用 fixture Attempt 记录。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

- [ ] //TODO 7. 实现 GAIA CLI 入口和 Supervisor 编排

  - 实现目标：创建 `benchmarks/gaia/src/cli.ts` 和 `supervisor.ts`，提供 `eval`（评测）、`load`（数据集加载）、`grade`（独立评分）子命令。Supervisor 消费 `IsolatedEnvironment` + `GaiaEnvironmentSpec`，驱动逐题评测循环。
  - 成功判据：CLI `eval` 接受 Manifest 路径和 LLM 配置参数；Supervisor 正确构造 `GaiaEnvironmentSpec` 并传递给 `IsolatedEnvironment`；`grade` 子命令不触发模型调用。
  - 验证方式：CLI 参数解析测试；Supervisor 编排逻辑通过伪 `IsolatedEnvironment` 验证。
  - _Requirements: [1.1](./requirements.md#req-1-1), [4.1](./requirements.md#req-4-1), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 8. 确定性回归与容器 smoke

  - 实现目标：确保 GAIA 全部确定性测试纳入 `npm test` 自动发现；新增 GAIA 容器 smoke 入口。依赖检查确认 `benchmarks/gaia` 无交叉导入。
  - 成功判据：`npm test` 包含 GAIA 测试且全量通过；依赖检查拒绝 `gaia←→swebench`/`gaia←→alfworld` 交叉导入；容器 smoke 使用固定任务完成完整链路。
  - 验证方式：`npm test`；`npx tsc --noEmit`；`npm run check:dependencies`；显式 GAIA 容器 smoke 入口。
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2) | `GaiaEnvironmentSpec` 使用 managed 模式声明安装命令；附件通过 `copyInto` 注入容器 | EnvironmentSpec 测试；伪 Handle 操作断言 |
| [1.3](./requirements.md#req-1-3) | preflight 验证 Python 和文件处理库可用性 | EnvironmentSpec preflight 测试 |
| [1.4](./requirements.md#req-1-4) | collectArtifacts 回收 answer.json | EnvironmentSpec 产物回收测试 |
| [2.1](./requirements.md#req-2-1)–[2.4](./requirements.md#req-2-4) | 宿主代理工具请求通过 ACP 传递并返回结果；容器无网络时工具可用 | 工具协议测试；ACP 通道伪实现 |
| [3.1](./requirements.md#req-3-1)–[3.3](./requirements.md#req-3-3) | submit_answer 首次写入成功、重复拒绝、提交后 Session 完成 | Worker 工具测试 |
| [4.1](./requirements.md#req-4-1)–[4.3](./requirements.md#req-4-3) | Manifest 覆盖 validation/test split 和三个 Level；附件路径可消费 | Manifest 构建测试（fixture） |
| [5.1](./requirements.md#req-5-1)–[5.3](./requirements.md#req-5-3) | 归一化精确匹配覆盖各场景；grade 不触发模型调用 | 评分纯函数测试；无 LLM 环境 |
| [6.1](./requirements.md#req-6-1)–[6.3](./requirements.md#req-6-3) | Attempt 记录完整；中途退出可恢复；按 Level 统计 | AttemptRecorder 集成测试 |
| [7.1](./requirements.md#req-7-1)–[7.3](./requirements.md#req-7-3) | 确定性回归不依赖 Docker；无交叉导入；容器 smoke 通过 | `npm test`；依赖检查；显式 smoke |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。
