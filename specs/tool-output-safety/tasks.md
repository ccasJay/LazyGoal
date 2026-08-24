# Tool 输出安全与搜索工具选择优化实施计划

- [x] //TODO 1. 实现流式 Bash 执行与 bounded tail collector

  - 在 `packages/tools/src/bash.ts` 中以 `spawn` 替换 `exec`，接入私有 stdout/stderr 尾部收集器，移除 `maxBuffer` 依赖并保持成功 Observation 形状。
  - 保留 workspaceRoot、shell、timeout 上限、UTF-8 解码和现有省略标记语义；确保输出预算达到后继续消费并等待命令退出。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [3.5](./requirements.md#req-3-5), [4.1](./requirements.md#req-4-1)_

- [x] //TODO 2. 保持 Bash 命令生命周期与错误语义

  - 完善 `spawn` Promise 的 `close`、`error`、timeout 和 AbortSignal 竞态处理，保留 `COMMAND_FAILED`、`COMMAND_TIMEOUT`、`ExecutionAbortedError` 和基础设施异常映射。
  - 保持 `BashTool` 的 `manual` replay policy、输入校验、cwd 和现有公共导出，不新增错误码或公共接口。
  - _Requirements: [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [4.5](./requirements.md#req-4-5), [4.6](./requirements.md#req-4-6)_

- [x] //TODO 3. 增加 Bash 超大输出与生命周期回归测试

  - 扩展 `packages/tools/test/bash.test.ts`，覆盖单行超过 1 MB、stdout/stderr 同时超量、超量后完成标记、UTF-8 截断、正常退出、非零退出、超时、中止和 shell 启动失败。
  - 断言输出仅保留尾部、命令不会因输出预算提前终止，且既有错误文案与 replay 行为不变。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

- [x] //TODO 4. 注册兼容 v1/v2 的 Prompt Bundle v3

  - 新增 `packages/agent/src/step-prompt/agent-decision@3.njk` 与 `AGENT_DECISION_TEMPLATE_V3`，建立只替换 executing 模板的 `PROMPT_BUNDLE_V3_MANIFEST`。
  - 将默认版本切换为 v3，同时保留并注册 v1、v2 的原资产和原字符渲染；补齐默认 Renderer 的版本集合与 supported versions 测试。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [5.4](./requirements.md#req-5-4)_

- [x] //TODO 5. 写入 v3 专用 Tool 优先与 Bash 回退规则

  - 在 v3 executing Prompt 中加入专用 Tool 优先、`grep` 搜索优先、无适用专用 Tool 时 Bash 回退，以及搜索路径和输出限制规则。
  - 保持 v2 的 Observation 证据、checkpoint、终止条件、严格 JSON 协议和 Authorized Tool ID 约束；不引入命令重写或语义拦截。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [2.5](./requirements.md#req-2-5)_

- [ ] //TODO 6. 锁定 Prompt 选择规则与旧 Goal 恢复兼容

  - 扩展 `packages/agent/test/prompting-default-bundles.test.ts` 与入口集成测试，验证 v3 关键规则、v1/v2 字符级不变、v3 默认冻结和旧版本恢复。
  - 断言 Runtime 不根据 Bash 命令文本改写或替换 Agent 选择，未授权 Tool 仍由现有边界拒绝。
  - _Requirements: [2.6](./requirements.md#req-2-6), [5.3](./requirements.md#req-5-3), [6.4](./requirements.md#req-6-4)_

- [ ] //TODO 7. 完成协议边界、架构文档与全量回归

  - 核对 `ToolObservation`、Goal Snapshot、Run、Action 和 Runner 无结构化截断字段或协议变化，并同步更新 `docs/architecture/agent.md` 与 `docs/architecture/runtime.md` 的当前实现说明。
  - 运行 tools、agent、runtime、storage、tui 相关测试、`npx tsc --noEmit`、`npm run check:dependencies`、完整测试套件和 `git diff --check`。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [6.5](./requirements.md#req-6-5)_
