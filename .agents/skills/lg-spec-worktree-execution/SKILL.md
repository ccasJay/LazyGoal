---
name: lg-spec-worktree-execution
description: "在 LazyGoal 仓库中把一个已批准的功能 Spec 放入独立 worktree 执行：基于 main 创建 feature/<spec> 分支，按 tasks.md 的 //TODO 编号逐任务实现、验证、勾选并用中文提交信息逐条 commit，全部完成并通过全量回归后停在 worktree 内等待用户验证。用户要求在隔离环境执行 Spec、并发推进多个 Spec、或要求逐 todo 提交时使用。"
---

# LazyGoal Spec worktree 执行

把一个已批准的 Spec（`specs/<name>/`）转化为独立 worktree 分支上一串可验证、可恢复的提交。核心纪律：一个 `//TODO` 任务对应一次实现、一次验证、一次勾选、一次提交；验证失败不得勾选，不得跳过任务，完成后停在 worktree 内等用户决定合并方式。

## 输入与前置检查

1. 输入是 spec 目录名 `<name>`；确认 `specs/<name>/tasks.md` 存在，并完整读取 `requirements.md`、`design.md` 与 `tasks.md`，三者共同构成本次执行的契约。
2. 统计 `tasks.md` 中的顶层任务 `- [ ] //TODO N.`；若全部已是 `- [x]`，直接报告"无待执行任务"并停止，不重建 worktree。
3. 在主工作区运行 `git status` 确认没有未提交改动；有则先报告并等用户处理，避免把主工作区状态误带入本流程。`.lazygoal/` 下的运行时快照不是源码，不要提交或搬运。

## 建立 worktree

1. 从默认主干分支（`main`）创建分支 `feature/<name>`，worktree 路径必须包含 spec 名，保证多会话并发执行不同 Spec 时互不冲突；会话内若有 worktree 工具（如 EnterWorktree）优先使用，否则用 `git worktree add` 手工创建。
2. 若 `feature/<name>` 分支或其 worktree 已存在（上次中断的残留），不要重建：进入现有 worktree，从第一个未勾选任务继续。
3. **spec 目录经常是未跟踪的**（如 `?? specs/<name>/`），而新 worktree 只包含已提交内容。进入 worktree 后若 `specs/<name>/` 缺失，从主工作区完整复制该目录（`cp -R`），并以一条独立提交先行入库，提交信息形如 `规格：沉淀 <name> 实施计划`，再开始执行任务。
4. 在 worktree 内运行 `npm install`；worktree 拥有独立的 `node_modules`，不与主工作区共享。
5. 只有当任务验证命令需要真实 LLM 请求（如 `npm run llm:agent-smoke`）时，才从主工作区复制 `.env`，并在执行前提醒用户这会产生 provider 费用。

## 逐任务执行循环

按 `//TODO N.` 编号顺序执行，禁止跳号或并行推进多个任务。每个任务内：

1. 读取任务标题、子 bullet（改动点、验证命令、文档同步）和 `_Requirements: [N.M](./requirements.md#req-N-M)` 链接，回读对应验收标准与 `design.md` 决策，再动手。
2. 实现改动。涉及架构文档时按 [lg-doc-standards](../lg-doc-standards/SKILL.md) 同步 `docs/architecture/*.md`；涉及 TSDoc、注释、Prompt 或 UI 文案时按 [lg-prose-standard](../lg-prose-standard/SKILL.md) 编写；新增公共 TypeScript 接口必须带中文契约级 TSDoc 与最小 `@example`。
3. 运行该任务子 bullet 给出的验证命令（如 `npx tsc --noEmit`、对应包的 `npx tsx --test packages/<pkg>/test/*.test.ts`）。验证失败只能在当前任务内修复重试；确认无法完成时停止整个流程，如实报告任务编号与失败原因。
4. 验证通过后勾选：只把 `[ ]` 改成 `[x]`，禁止改写 `//TODO` 标记及其后的任何任务文本，禁止改动无关任务的缩进或顺序。
5. 提交：checkbox 翻转与本次代码、测试、文档改动进入同一个 commit。提交信息用简洁中文，前缀风格跟随 `git log` 现状（`功能：`、`测试：`、`文档：`、`规格：` 等），不 push。

## 全量回归与收尾

1. 所有任务完成后运行全量验证：`npx tsc --noEmit`、`npx tsx --test packages/agent/test/*.test.ts packages/llm/test/*.test.ts packages/runtime/test/*.test.ts packages/tools/test/*.test.ts packages/tui/test/*.test.tsx`、`npm run check:dependencies`；若 `tasks.md` 本身含「全量验证」类任务，以其中列出的命令为准。
2. 回归全部通过后**停止在 worktree 内**，按 `AGENTS.md` 的最终总结格式（每项改动配可点击位置链接）汇报：worktree 路径、分支名、逐任务提交清单、验证结果、遗留事项。
3. 明确禁止自行执行：merge、push、建 PR、删除 worktree、切回主工作区或转向其他任务。这些动作留给用户验证后决定。

## 失败、中断与恢复

- 单个任务验证失败且无法修复：停止流程，报告失败任务编号、失败输出和已尝试的修复；后续任务保持未勾选、不提交。
- 会话中断：`tasks.md` 的勾选状态加上分支上的 commit 序列就是进度账本。恢复方式是进入该 worktree，从第一个未勾选任务继续；不要重做已提交任务。
- 主工作区与各 worktree 是隔离副本；本流程只在目标 worktree 内改动，不在主工作区或属于其他会话的 worktree 内写任何文件。

## 验证和收尾检查

- Skill 自身变更：运行 `git diff --check`，核对 frontmatter 只有 `name` 与 `description`、Markdown 链接与既有 skill 的相对引用格式一致。
- 执行期每个任务的验证命令必须真实运行并展示结果，不得以"应当通过"代替输出；全量回归失败时如实报告，不用部分通过冒充完成。
- 结束时明确列出：已提交任务数、跳过或失败的任务数（若有）、worktree 与分支名，以及"等待用户验证合并"的状态。
