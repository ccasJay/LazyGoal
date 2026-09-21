# Implementation Plan

- [x] //TODO 1. 创建项目级 lg-gepa-optimization Skill

  - 实现目标：新增 `.agents/skills/lg-gepa-optimization/SKILL.md`，写入精确 frontmatter、适用/排除边界和六类生命周期意图路由，不创建全局 Skill 或无需求资源目录。
  - 成功判据：从 LazyGoal 根目录及子目录可发现同名 Skill；GEPA 自进化/Run 管理请求命中，普通评测、手工 Prompt 编辑和算法开发不被声明为适用。
  - 验证方式：运行 Skill Creator 的 `quick_validate.py`；人工核对 description 与项目级路径。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3)_

- [x] //TODO 2. 编写新运行预检工作流

  - 实现目标：指导 Codex 只从用户明确提供的数据构造 `gepa-run@1` 并先执行 preflight，不扫描或猜测数据路径。
  - 成功判据：缺路径、预算或 preflight 失败时不启动，并能报告失败分类和最小修复动作。
  - 验证方式：使用 fake preflight transcript 进行无费用场景检查；覆盖成功和配置/数据失败。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3)_

- [x] //TODO 3. 编写新运行确认与启动工作流

  - 实现目标：展示当前双模型、预算和发布摘要，仅在当次摘要获得明确批准后执行 `start --yes`。
  - 成功判据：未批准时不出现 `start --yes`；批准后准确回报后台接管的 `runId`、状态和目录，不声称优化完成。
  - 验证方式：使用 fake start transcript 场景检查；覆盖拒绝、批准和后台启动响应。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

- [x] //TODO 4. 编写已有 Run 控制与恢复工作流

  - 实现目标：加入精确 runId 解析、status/stop 路由和基于当前状态重新确认的 resume 流程，禁止直接管理进程或内部 checkpoint。
  - 成功判据：歧义目标不执行；stop 保持 stop_requested 语义；resume 只在当前 Run 摘要获批后带 `--yes`，Worker 失联不会触发自动恢复。
  - 验证方式：fake CLI transcript 场景检查；覆盖缺 runId、运行中、停止请求、已停止、失联和恢复拒绝。
  - _Requirements: [3.4](./requirements.md#req-3-4), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [x] //TODO 5. 编写终态报告与安全边界

  - 实现目标：定义 report 的可读投影、优化/发布状态区分、publish_blocked 处理以及敏感信息和错误协议边界。
  - 成功判据：报告包含预算、候选、最佳分数、artifact 和 publication；冲突不建议强制覆盖；损坏输出不触发修补、重跑或 Profile 写入。
  - 验证方式：fake report transcript 与静态边界检查；扫描禁止的凭据回显、checkpoint 解析、kill、强制覆盖和直接模型调用指令。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2)_

- [x] //TODO 6. 验证项目级 Skill 完整流程

  - 实现目标：在 `gepa-run-lifecycle` 验证通过后，用无费用 fake 生命周期完成一次 preflight、确认、后台 start、status、stop/resume 和 report 场景，并记录文档检查结果。
  - 成功判据：Skill 只通过公开 CLI 完成全流程，所有关键操作受确认门保护，默认验证不调用 Docker、网络或真实模型。
  - 验证方式：`quick_validate.py`、fake 生命周期场景检查、`git diff --check`；检查现有项目 Skill 仍可加载。
  - _Requirements: [6.3](./requirements.md#req-6-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2)、[1.3](./requirements.md#req-1-3) | 项目级 Skill 命名有效、应触发请求可发现、排除请求不被声明适用 | `quick_validate.py` 与 frontmatter/description 审查 |
| [2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2)、[2.3](./requirements.md#req-2-3) | 用户数据形成 request 并先 preflight；缺失或失败时不启动 | fake preflight transcript 场景检查（待实现） |
| [3.1](./requirements.md#req-3-1)、[3.2](./requirements.md#req-3-2)、[3.3](./requirements.md#req-3-3) | 当前影响摘要获批后才 start，返回后台 Run 而非完成结论 | fake start transcript 场景检查（待实现） |
| [3.4](./requirements.md#req-3-4) | 恢复前读取当前状态并重新确认，批准不跨 Run 复用 | fake resume transcript 场景检查（待实现） |
| [4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2)、[4.3](./requirements.md#req-4-3) | status/stop 使用精确 runId，区分 stop_requested/stopped，歧义时不操作 | fake control transcript 场景检查（待实现） |
| [5.1](./requirements.md#req-5-1)、[5.2](./requirements.md#req-5-2)、[5.3](./requirements.md#req-5-3) | report 只信任 CLI，区分优化和发布完成，冲突给出 artifact 而不强制覆盖 | fake report transcript 场景检查（待实现） |
| [6.1](./requirements.md#req-6-1)、[6.2](./requirements.md#req-6-2) | Skill 不暴露敏感内容，不修补内部状态或自动重跑 | 静态边界审查与错误 transcript（待实现） |
| [6.3](./requirements.md#req-6-3) | 全部验证无真实模型、网络或 Docker，且覆盖确认门和命令路由 | validator、fake 端到端场景与 `git diff --check` |

### Latest Result

2026-09-21 08:52 CST，在 `codex/lg-gepa-optimization-skill` 工作树的当前 Skill 内容上完成验证，整体结果：通过。

1. Skill Creator `quick_validate.py` 验证新 Skill 的 frontmatter、名称和脚手架完整性通过；目标目录仅包含 `SKILL.md`。
2. 独立 fake transcript 前向测试覆盖：缺 Manifest、preflight 数据失败、成功预检后未批准、批准启动、缺少唯一 runId、Worker lost、恢复 checkpoint 损坏、`stop_requested`、`publish_blocked` 和损坏 report。未生成未授权 `--yes`，未猜测路径或 Run，未误报完成，也未执行自动恢复、进程终止、checkpoint 修补、强制发布或敏感输出回显。
3. 静态边界检查确认六个公开命令全部路由，且未出现 `--force`、进程终止信号、`GEPAState` 私有加载或凭据赋值示例。
4. `npm run test:gepa-adapter` 通过 135 个离线测试；未调用网络、Docker 或真实模型。首次 `npm test` 的 TypeScript 阶段出现 1 个瞬时失败，立即完整复跑后 GEPA、1,261 个 TypeScript 测试和 14 个 scripts 测试全部通过。
5. 其余项目 Skill 均未修改；逐项 validator 中五个通过，既有 `lg-spec-worktree-execution` 因 description 含尖括号产生与本变更无关的既存告警，但该 Skill 仍在项目发现清单中。
