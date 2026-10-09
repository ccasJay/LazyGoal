---
name: lg-code-review
description: 审查指定的 LazyGoal GitHub PR，核对实时差异、当前架构契约、行为风险与验证证据，并报告可定位的问题。默认只在对话中报告；合入就绪审查与代码修改不适用。
---

# LazyGoal PR 代码评审

评审目标是找到有证据的正确性、安全和契约问题，不按文件数量罗列意见。用户指定的 PR 是评审范围；只读请求不修改工作区文件、本地分支指针或 GitHub 状态。默认在对话中报告发现，只有用户明确要求向 GitHub 发布评论时才执行该写入。合入就绪与落地分别交给 [lg-feature-integration](../lg-feature-integration/SKILL.md) 或 [lg-merging-stacked-prs](../lg-merging-stacked-prs/SKILL.md)。

## 确定当前 PR 差异

1. 读取 `git status --short --branch`，保留工作区已有改动。用 `gh pr view <pr> --json number,baseRefName,baseRefOid,headRefName,headRefOid,isCrossRepository,state,isDraft,mergeStateStatus,statusCheckRollup` 获取实时 PR 及准确 base/head OID。堆叠 PR 以这一层的直接 base 为准，不把整条 Stack 当成单层差异。
2. 确认本地 Git 对象与这些 OID 一致；缺失时从已核实的 GitHub 仓库获取 base 和 PR head 对应引用，跨 fork PR 可使用 GitHub 的 `refs/pull/<number>/head`。获取后再次核对 OID，不用本地同名分支或过期的 `origin/*` 代替。
3. 运行 `npm run --silent change-scope -- --base <base OID> --head <head OID>`，并核对 `resolved`。只有 `paths.committed` 属于该 PR 的提交范围；`staged`、`unstaged`、`untracked` 描述当前 worktree，不能作为 PR 缺陷。按报告与 `resolved.mergeBaseSha` 阅读完整 diff、必要上下文、生产调用方和相邻测试；脚本的路径清单不替代语义审查。
4. 报告前再次查询 PR 的 base/head OID。若 head 更新、base 移动或 PR 改目标，重新获取对象、计算范围并复查失效结论；不能把旧提交上的发现标为当前 PR 问题。

## 读取权威契约并追踪行为

- 从根 `AGENTS.md` 和 `README.md` 进入受影响模块的 `README.md`、`notes/overview.md`、`notes/semantics.md`，再核对源码和真实消费入口。适用 Spec 只提供已批准的验收条件；其历史陈述不能代替当前实现。需要历史理由时只读取相关且有效的 Project Memory。
- 领域术语、状态转换与跨上下文规则先核对所属模块的权威契约及适用 `AGENTS.md`；Markdown、TSDoc、注释、Prompt、诊断及用户可见文案使用 [lg-prose-standard](../lg-prose-standard/SKILL.md)，文档位置和架构同步使用 [lg-doc-standards](../lg-doc-standards/SKILL.md)。Benchmark 管线改动按 [lg-benchmark-integration](../lg-benchmark-integration/SKILL.md) 核对真实 Worker 契约。按实际改动加载相关 Skill，不执行无关的全仓审计。
- 优先追踪变更跨越的行为边界：Goal/Run 转换与 Snapshot 提交、Trajectory 恢复、模型决策与 Tool Action/Observation、权限与沙箱执行、取消/关闭竞态、进程或 wire 输入校验。核对新公开接口及消费方的契约、错误和副作用；同进程已类型化值按根规则处理，不机械添加防御校验。对新增抽象、状态或兼容路径，要求当前生产消费者或明确合同支撑。
- 对 Prompt、工具 Schema、模型或终端可见输出，检查实际生成内容和消费路径。对持久化、授权或拒绝行为，沿真实调用链追到最终执行点；单独检查不能证明绕过路径安全。

## 验证证据

从当前 manifest、CI 与受影响测试发现检查入口。核对作者证据是否适用于当前 head，PR CI 是否对应当前 head、直接 base 与适用的 Stack trunk，并覆盖本次变更风险；`pull_request` 工作流可能检查合成合并提交，不能机械要求检查 SHA 等于 head OID。需要补证时选择有辨识力的局部测试或真实入口测试。检查正常、拒绝、恢复及取消等适用场景，断言应观察外部状态、事件或效果，而非重复实现。资源、异步和平台相关测试还要核对同步、隔离与清理。已通过且仍有效的检查不因评审而重复；缺失的人工、真实环境或付费模型证据按缺口报告，不写成通过，也不擅自启动有外部费用的入口。

## 报告

优先报告可复现或可从调用链证明的行为缺陷。每项写明严重程度、最窄的相关代码位置、触发条件、实际影响和证据；跨文件问题指出权威 owner 与受影响消费方。阻塞问题与改进建议分开，不把风格偏好、无证据猜测或已由当前绿色检查覆盖的问题充作发现。没有可证实问题时，说明已审查范围、实际运行或核对的检查，以及仍未覆盖的风险。只有明确授权发布 GitHub 评论时，才把已核实的局部发现放到对应 diff 行；评审本身不批准、合并或改写 PR。
