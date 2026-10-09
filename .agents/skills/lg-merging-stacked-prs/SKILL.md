---
name: lg-merging-stacked-prs
description: 在 LazyGoal 中审查或按明确请求合并同仓库的 GitHub 堆叠 PR，包括确认原生 Stack 归属、逐层验收、底层起始的合并范围和落地后核验。普通单 PR 或本地功能分支集成不适用。
---

# LazyGoal 堆叠 PR 合并

GitHub 的 Stack 对象负责堆叠层级、统一规则、级联变基与合并状态，具体语义以 [GitHub Stack 文档](https://docs.github.com/en/pull-requests/reference/stacked-pull-requests) 为准。此 Skill 处理远程 PR 堆叠的落地；本地分支合入使用 [lg-feature-integration](../lg-feature-integration/SKILL.md)，涉及变基或推送时使用 [lg-pre-push-checks](../lg-pre-push-checks/SKILL.md) 核对每层变更和证据。执行时读取当前 `AGENTS.md`、仓库 CI、PR 规则及 `gh stack ... --help`，不把参考仓库的目标分支或合并方式当作 LazyGoal 的规则。

## 权限与能力

- “审查能否合并”只读取本地及 GitHub 状态。只有用户明确要求合并该堆叠或指定前缀时，才提交 Stack merge。合并授权不自动包含重写历史、推送、删除分支或合并范围外 PR；Stack 结构只允许按第 1 节的安全条件补齐。
- 先运行 `gh stack --version`，确认官方扩展与服务器 Stack 功能可用；若不可用，报告阻塞，不退化为逐个 `gh pr merge` 加手工改 base。原生 Stack 只支持同仓库的 PR head；跨 fork 链不能按此流程落地。
- `gh stack merge` 的目标若是 Stack 编号，会选中全部未合并层；若是 PR 编号，会选中从最低未合并层到该 PR 的连续前缀。用户只授权一部分时必须确定边界 PR，不能把“合并这个 PR”误读为只合并中层。

## 1. 建立当前堆叠事实

1. 从用户指定的 PR 及当前 GitHub 仓库读取各层 `gh pr view <number> --json number,author,baseRefName,baseRefOid,headRefName,headRefOid,isCrossRepository,state,isDraft,reviewDecision,mergeStateStatus,statusCheckRollup`；记录准确的 head/base OID、目标 trunk、作者和状态。不要从本地分支名或旧报告猜测当前依赖链。
2. 用 `gh api graphql` 查询 `PullRequest.stack`、`stackEntry.position`、Stack 编号、trunk、size 与 entries。entries 未取全时分页。以 GitHub Stack 成员为权威，交叉核对 PR 的实时 base：最低层指向 trunk，其余每层指向紧邻下层 head。发现多个 Stack、额外成员、顺序冲突或同名不同 OID 时，先报告精确差异，不执行变更。
3. 核对每层适用 Spec 的当前验收结果、未完成的人工或真实环境条件、未解决审查意见和当前 CI。每层独立满足 trunk 的规则；顶层通过不能替下层通过。没有 Spec 时按当前 PR 的验收合同与 CI 判断，不虚构 Feature Verification。

若用户授权合并的依赖链尚未形成原生 Stack，先给出将被连接的 PR 编号、trunk 和顺序。仅当这些 PR 均在同一仓库、作者一致、现有 Stack 是顺序兼容的子集，且本次合并授权覆盖整条依赖链时，才用 `gh stack link --base <trunk> <bottom-pr> ... <top-pr>` 补齐；多个 remote 时显式指定 `--remote`。随后重新查询 GitHub 并确认完整成员和位置。作者不同、已有成员冲突或补齐会重定向范围外 PR 时，先取得用户对具体连接方案的授权。不要自动解散或重建 Stack。

## 2. 处理失效证据与线性历史

- 仅在当前 trunk 或下层变更使 Stack 不再可合并时处理历史。纯远程合并不要求检出本地分支；需要本地同步时使用干净的专用 worktree，不覆盖现有未提交改动。
- `gh stack sync` 可能级联变基并推送每一层，必须在本次得到变基及推送授权后运行。它报告本地与远端组成冲突时停止，不选择删除或替换远端 Stack；即使退出码为零，也核对是否出现 `Sync aborted`。冲突解决使用当前 CLI 支持的 Stack rebase/push 流程，不用裸 `--force`。
- 任何服务器或本地级联变基之后，重新读取所有受影响层的 head OID、PR diff、未解决审查、批准状态和 CI；获取最新分支引用，按 `lg-pre-push-checks` 对每层运行 `change-scope --base <父层> --head <该层>` 并补齐失效的本地证据。用 `--head` 检查远程分支时，报告中的暂存、未暂存和未跟踪路径仍属于当前 worktree，不能算作远程 PR 内容。检查尚未通过时不能称为就绪，也不能发起合并。

## 3. 提交合并

提交前再查一次 Stack 成员、顺序、PR head OID、状态、审查、检查和 mergeability；所选每层必须 open、非 draft，且符合 trunk 规则。目标若已前进或任何证据失效，重新评估。选择用户指定的合并方式；未指定时核对 LazyGoal 目标分支允许的方式及现有合并约定，不依赖 CLI 上次使用的方式。

```sh
gh stack merge <stack-number-or-boundary-pr> --yes --merge-method <merge|squash|rebase>
```

此命令的目标和方式必须替换成已核实的值。不要用 `gh pr merge`、逐层手工改 base、规则绕过或 `--delete-branch` 代替 Stack merge。若 trunk 使用 merge queue，命令只是把选中前缀入队，队列决定合并方式；队列提交不是已合并。原生合并报告阻塞时定位对应 PR 和规则，修复授权范围内的问题或报告阻塞，不改用其他合并路径。

## 4. 核验与交接

逐层查询 `gh pr view <number> --json number,state,mergedAt,mergeCommit,baseRefName,headRefName`，直到选中的 PR 全部为 `MERGED` 或出现明确失败；队列中保持待完成状态。部分合并后重新查询原生 Stack，确认剩余层仍按预期顺序连接并指向新的下层或 trunk；检查 GitHub 自动变基后的 head、审查和 CI，不沿用旧 OID 的结果。

报告 Stack 编号、trunk、实际合并前缀、各 PR 最终状态与 merge commit、所用方式、检查证据、未完成事项。删除分支是独立操作；只有另获授权、对应 PR 已合并且 `gh pr list --state open --base <branch> --json number --jq length` 为零时才可删除。
