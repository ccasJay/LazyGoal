---
name: lg-pre-push-checks
description: 在 LazyGoal 分支推送前选择与实际外发改动对应的本地验证，并在已获推送授权时安全推送、核对远程提交和跟踪 PR CI。仅审查、提交或合入任务本身不触发推送。
---

# LazyGoal 推送前检查

目标是在本地取得足以证明本次外发改动的最小有效证据集；PR 的完整确定性回归、Web 构建和浏览器验收由当前 CI 执行。此 Skill 不代替 Spec、功能合入或用户明确要求的验收检查；若这些流程要求全量验证，照其要求执行。技能适用于推送准备和已授权的推送，不单独授予 commit、push、变基、`gh stack sync` 或 PR 就绪/合并权限。

## 1. 确定外发范围

1. 运行 `git status --short --branch`，确认所在 worktree、分支、未提交改动与上游。查看适用的 `AGENTS.md`、当前 manifest、测试入口及 `.github/workflows/ci.yml`；不要沿用本 Skill 中可能过期的命令。
2. 从用户指定的目标、现有 PR 的实际 base，或明确的堆叠父分支确定 **本层** 基线。核对分支名与当前提交；远程基线先获取最新引用。无法唯一确定时，说明缺少哪个 base，暂不宣称外发范围或执行推送。不要默认 `main`、`dev` 或当前 upstream 就是 PR base。
3. 运行 `npm run --silent change-scope -- --base <已核实的引用>`，读取 JSON 中的 `resolved` 和 `paths`。它分别列出已提交、暂存、未暂存和未跟踪文件；`committed` 从唯一 merge-base 比较到 `HEAD`，重命名按旧路径与新路径分别列出。按需使用 `--head <ref>` 比较其他提交。检查删除、配置影响及堆叠父层，不把未提交文件误认为已推送。若基线未解析、没有唯一 merge-base 或脚本失败，停止并查清原因。

   核对 `git log <base>..HEAD`，区分本层改动与堆叠父层。脚本只报告路径，不判断测试充分性；后三类路径不是推送内容，但可能需要纳入即将提交的验证。

## 2. 选择和记录证据

按变更的行为面、依赖方和失败风险选择实际存在的检查。先查相关测试和脚本；同一已通过检查在被测源码、测试、依赖、配置和基线都未改变时可复用，记录执行时的提交或工作树状态。检查失败必须修复或如实报告，不能删减失败用例来取得通过状态。

| 变更面 | 常见本地证据 |
| --- | --- |
| `packages/`、`apps/goal-server/`、`benchmarks/` 的局部逻辑 | 运行受影响测试，如 `npx tsx --test <实际测试路径>`；覆盖跨包调用方和必要集成测试。|
| 类型、包导入、公开入口或依赖边界 | 按影响运行 `npx tsc --noEmit`、`npx tsc --noEmit -p apps/goal-server/tsconfig.json`、`npm --prefix benchmarks run typecheck`、`npm run check:dependencies` 等现有入口。|
| 文档、Skill、架构说明 | 核对内容与权威源码、链接及适用规则；运行 `npm run check:docs` 和 `git diff --check`。|
| Prompt、模型决策或用户可见输出 | 找到该输出的生成者与消费者，运行对应的确定性回放、测试或评测入口；当前仓库没有通用 `test:snapshot` 命令。|
| Web 构建、页面或浏览器交互 | 按影响运行 `npm run build:web`、相关 `npx tsx --test apps/goal-board/test/<测试文件>` 或 `npm run test:web-e2e`。浏览器环境不可用时如实报告。|
| GEPA、Benchmark Worker 或真实 Provider | 运行相应确定性测试、Python 测试或无外部费用的 smoke。真实模型、付费评测和需要外部环境的入口只在本次任务明确要求且条件具备时运行。|

覆盖率只在当前任务有覆盖率目标且仓库存在适用测量入口时计算受影响源码的覆盖率；不凭测试通过声称覆盖率达标。当前根脚本没有通用局部覆盖率或包卫生命令，不引用 DeepSeek-Harness 的 `vitest`、`doc-sync` 或 `hygiene`。若变更触及整仓公共基座、CI 故障排查，或用户/已批准 Spec 要求全量检查，执行 `npm test` 等当次明确要求的入口；不能用最小证据原则削弱这些验收条件。

## 3. 提交与推送

1. 汇总外发文件、选定检查、通过结果与未覆盖风险。若检查后发生改变，判断哪些证据失效，只重跑受影响部分。提交后检查 `git status` 与提交内容，确认验证证据适用于将推送的 `HEAD`，不能用未提交改动上的通过结果证明旧提交；若实际 Hook 或 fixer 改写文件，重新审查并补跑失效证据。不要假设本仓库安装了 pre-commit 或 pre-push Hook。
2. 只有获得本次 push 授权且目标远程、分支明确时才推送。普通推送使用 `git push origin HEAD:<branch>`。禁止裸 `--force`。变基后确需覆盖独占远程分支时，先用 `git ls-remote --heads origin "refs/heads/<branch>"` 观察远端 OID，再用 `git push --force-with-lease=refs/heads/<branch>:<observed-oid> origin HEAD:refs/heads/<branch>`；若远端已变化，停止并重新评估，绝不更新租约值后直接重试。共享或受保护分支不按独占分支处理。
3. 推送后用 `git rev-parse HEAD` 与 `git ls-remote --heads origin "refs/heads/<branch>"` 比对提交 OID；不要只依赖可能尚未更新的 `origin/<branch>`。不一致时报告实际状态，不能宣称推送完成。

`gh stack sync` 会变基并推送多层分支，只有本次明确授权同步堆叠时才能使用。完成后对每层重新确认 base、外发范围和证据有效性；所有层的受影响检查通过前，不把 PR 标记为就绪或合并。若同步后证据失效，修复并按授权范围重新推送。

## 4. 跟踪远程结果

有关联 PR 时运行 `gh pr checks`，记录当前提交的检查结论；未结束的检查继续跟踪，失败则定位日志并处理。没有 checks 时，先确认工作流触发条件、当前提交及事件状态，再运行 `gh pr view <number> --json mergeable,mergeStateStatus`。若状态显示冲突，用 `git merge-tree --write-tree <已核实的目标引用> HEAD` 在不改工作树的情况下定位冲突；解决后重新验证并按授权更新分支。无检查也可能由工作流过滤、触发延迟或配置错误造成，不以空提交或关闭 PR 代替诊断。

交接时列出 base、外发提交、运行及复用的检查、跳过原因、远程 HEAD 与 PR checks 状态。CI 仍在运行时只报告待完成状态，不写成已通过。
