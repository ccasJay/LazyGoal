# 包内文档与语义表重构任务

需求与设计已获得明确批准。本计划按 [Design](./design.md) 实施；执行开始前记录现有 Specs 与 Memory 的受保护文件清单和内容摘要，存放于临时位置。本功能 Spec 不在受保护比较范围内。任务批准完成规划，实施仍需明确的执行指令。

- [x] //TODO 1. 交付可独立使用的只读文档检查命令

  - 实现目标：按 Design D1、D3、D6 实现 `scripts/check-docs.mjs`、`scripts/check-docs.test.mjs` 与 `npm run check:docs`；覆盖单元发现、README 导航、notes 位置、语义表结构和归属、本地链接与锚点、旧入口及扫描排除边界。新脚本测试由现有回归入口自动发现；仓库文档检查阶段在 TODO 2 完成切换时启用。
  - 成功判据：完整临时项目通过；删除必需说明、改坏归属、链接或锚点时报告对应文件与问题并返回非零；代码样板和历史材料中的失效引用不产生误报；检查前后项目文件的路径和内容保持不变。迁移前实际仓库缺少新体系时，应明确报告缺口，不能假报通过。
  - 验证方式：待实现的 `scripts/check-docs.test.mjs`，执行 `node --test scripts/check-docs.test.mjs`；调用 `npm run check:docs` 核对当前仓库的预期缺口。CLI、解析与失败路径在同一任务内验证，不运行外部链接请求或真实模型。
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [6.2](./requirements.md#req-6-2)_

- [ ] //TODO 2. 切换包内文档、语义表与维护规则并启用回归检查

  - 实现目标：按 Design 的迁移映射完成全部文档单元的 README、overview、semantics 和必要专题；从源码核验职责与限制，补齐缺页，迁移重复正文，更新根入口、项目指令及受影响 Skills。当前引用修复并核验后删除旧架构目录；在 `scripts/run-regression.mjs` 接入文档检查阶段。Skill 更新时读取 `skill-creator` 的适用规则，随项目改动提交 Git。
  - 成功判据：当前 29 个单元均有可访问的包内说明与语义表，跨模块概念能找到实际所有者，详细契约没有新增竞争副本；旧入口已删除，当前文档与 Skills 使用新规则；`check:docs` 在真实仓库通过。受保护文件集合及内容与执行基线一致，已知 Memory 失败与历史断链明确记录。
  - 验证方式：按下述 Planned Checks 核对迁移内容、配置示例、Skills 路由及保护边界；执行 `npm run check:docs`、`node --test scripts/*.test.mjs`、`npm test` 和 `git diff --check`。记录实际运行证据后再勾选，不以链接有效替代语义核验。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。结构检查和事实核验分别记录，保护边界与历史断链按已批准范围验收。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
| --- | --- | --- |
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2)、[1.3](./requirements.md#req-1-3) | 所有单元都有入口；说明覆盖实际职责、使用和限制；跨模块主题由实际所有者维护，引用方可定位它 | `check:docs` 检查覆盖与导航；逐模块核对公开入口、调用方和相邻测试，记录来源与迁移映射 |
| [2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2)、[2.3](./requirements.md#req-2-3) | 模块正文位于 notes，README 可访问正文；API 细节引用源码；Skills 资源保持其自身目录约定 | `check:docs` 验证位置与链接；核对正文与源码的契约归属，检查没有复制类型全集 |
| [3.1](./requirements.md#req-3-1)、[3.2](./requirements.md#req-3-2)、[3.3](./requirements.md#req-3-3) | 各单元语义表可访问且四列完整；跨模块概念指向实际所有者；同一概念的说明与相关引用方一致 | 待实现的表结构与错误归属测试；真实仓库 `check:docs`；搜索关键概念并核对其语义、归属及权威来源 |
| [4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2)、[4.3](./requirements.md#req-4-3) | 迁移映射中的有效主题均有去向，旧架构目录消失，当前路径和锚点有效；空页及旧说明漂移得到基于源码的处理 | 对照 Design 迁移映射检查内容；检查目录删除和新文档引用；重点核对 Runtime 恢复、LLM 配置、Browser 边界与 Benchmark 评分 |
| [5.1](./requirements.md#req-5-1)、[5.2](./requirements.md#req-5-2)、[5.3](./requirements.md#req-5-3) | 受保护文件路径和字节内容保持原样；历史断链不导致检查器写入或扩大修复范围 | 比较执行前后的清单及内容摘要；检查最终 diff；记录历史链接影响与已知 Memory 检查失败，不将其标为通过 |
| [6.1](./requirements.md#req-6-1)、[6.2](./requirements.md#req-6-2)、[6.3](./requirements.md#req-6-3) | 文档、简化审查、worktree 执行和 Benchmark 集成 Skills 均可按新路径找到说明；项目指令与 Skills 的位置和权威规则一致 | 走查 Design 指定的 Skill 入口及模板；检查当前引用和规则文本；最终 diff 只包含与此次体系直接相关的指令改动 |
| 检查器失败与排除边界 | 缺页、空表、错归属、坏路径和锚点被拒绝；重复标题与引用式链接正确处理；代码样板、历史材料和 fixture 不误报；运行不改写文件 | `node --test scripts/check-docs.test.mjs`，测试待实现，使用真实临时项目与 CLI 调用 |
| 模块到跨模块的完整阅读路径 | 根 README → Runtime README → notes 与语义表 → Storage 或 Model Contracts 的权威说明，全程可定位；配置示例包含对应解析入口要求的参数 | 当前仓库导航与语义走查；对相关配置示例进行无模型调用的解析核验，不触发模型、Docker 或环境初始化 |
| 回归接线与改动范围 | 文档检查失败能阻止回归继续，成功路径仍运行既有检查；脚本测试覆盖新工具；既有产品行为未由此次重构修改 | 用临时项目验证检查退出码；核对回归阶段的非零退出传播；`npm test`、`node --test scripts/*.test.mjs`、`git diff --check` 和最终 diff |

### Latest Result

2026-10-08，特性分支 `codex/package-documentation-system`，文档实现提交 `7850853`；Requirements SHA-256 `aeca44f1a46a0bb06ccb1c9202b2f6658c63cd9b4e29f4fc2408a1c989354ee6`，Design SHA-256 `725204103af59c0f912bdfd6388f12b02aa8c924a6174cc38783569612efc2a3`。TODO 1 已通过聚焦测试并提交 `29aa6c6`；TODO 2 的文档迁移已提交，但全量验证受环境依赖缺失阻断，故仍未勾选。

- `npm run check:docs` 通过：29 个模块、107 份当前说明；旧架构目录已删除。六个检查器测试通过，`npm run check:dependencies` 通过（218 个源文件），`git diff --check` 通过。
- 实施前后原有 `specs/`（排除本功能）与 `project-memory/` 的 311 个文件路径及 SHA-256 全部一致。当前体系不依赖其中历史架构链接；历史断链是 Design 中已接受的限制。此前已知 `memory:check` 对 `browser-trajectory` 失败，本次未修改或宣称修复。
- `npm test` 在首个类型检查阶段失败：本环境仅安装根 manifest，缺少子模块的 `zod`、ACP SDK、`smol-toml` 等依赖。`node --test scripts/*.test.mjs` 的 30 例中 26 通过，4 个 CLI 用例因缺少模块依赖提前退出；`packages/acp` 的离线安装因缓存缺少 `zod-4.0.0.tgz` 而失败。待完整依赖可安装后重跑全量检查，再勾选 TODO 2 并关闭 Feature Verification。
