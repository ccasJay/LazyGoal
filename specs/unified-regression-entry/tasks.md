# 统一确定性回归入口 实施计划

- [x] //TODO 1. 实现回归编排脚本并接线 npm test

  - 实现目标:新增 `scripts/run-regression.mjs`,按序 spawn `npx tsc --noEmit` → `npm run check:dependencies` → 测试段(递归发现 `packages/*/test/**` 与 `benchmarks/**/test/**` 的 `.test.ts/.test.tsx` 传给 `npx tsx --test`,`scripts/*.test.mjs` 传给 `node --test`);每段打印段名,失败打印失败段并透传退出码;根 package.json 的 `test` 改为 `node scripts/run-regression.mjs`
  - 成功判据:当前工作树 `npm test` 依次执行三段并全绿,输出可发现测试文件总数(93);`llm:agent-smoke`、`test:memory`、`eval` 等既有脚本未被调用且行为不变
  - 验证方式:`npm test` 完整运行
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [2.1](./requirements.md#req-2-1), [2.3](./requirements.md#req-2-3), [3.1](./requirements.md#req-3-1)_

- [x] //TODO 2. 失败快停与可定位验证

  - 实现目标:临时向 packages 源码注入类型错误验证第一段失败快停(不执行依赖检查与测试段);恢复后临时制造一个测试失败验证测试段非零退出;两处注入验证后还原
  - 成功判据:类型错误注入时 `npm test` 停在类型检查段、退出码非零、后续段未运行;测试失败注入时测试段非零退出;输出可定位失败环节与详情
  - 验证方式:`npm test` 注入前后各运行一次,`git diff` 确认注入已还原
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.3](./requirements.md#req-1-3)_

- [x] //TODO 3. 新增测试零配置纳入验证与文档更新

  - 实现目标:临时添加一个空的 `.test.ts` 文件确认被自动发现纳入后删除;更新 CLAUDE.md 的测试命令说明(根 `npm test` 为统一回归入口,保留单包快速命令)
  - 成功判据:空测试文件使脚本统计数 +1 且被执行;CLAUDE.md 与入口实际行为一致
  - 验证方式:`npm test` 观察(可中断测试段后的统计输出);文档 diff 走查
  - _Requirements: [2.2](./requirements.md#req-2-2), [3.2](./requirements.md#req-3-2)_

## Feature Verification

风险依据:[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) | 三段按固定顺序执行,前段失败不执行后段 | 注入类型错误的失败快停验证(TODO 2) |
| [1.2](./requirements.md#req-1-2) | 全绿退出码 0,任一段失败非零 | `npm test` 完整运行与注入验证(TODO 1/2) |
| [1.3](./requirements.md#req-1-3) | 失败时可定位到具体环节与详情 | 注入验证时的段名输出与 tsc/tsx 原样透传(TODO 2) |
| [2.1](./requirements.md#req-2-1) | 覆盖 packages 80 + benchmarks 11 + scripts 2 | 脚本统计数与 `ls` 清点比对(TODO 1) |
| [2.2](./requirements.md#req-2-2) | 新增测试文件零配置纳入 | 临时空测试文件验证(TODO 3) |
| [2.3](./requirements.md#req-2-3) | 外部环境用例保持隔离,入口无新外部依赖 | `npm test` 全绿即证(当前全部确定性测试通过;llm:agent-smoke 未被调用) |
| [3.1](./requirements.md#req-3-1) | 既有入口行为不变 | 抽查 `check:dependencies`、`test:memory` 与脚本内容走查(TODO 1) |
| [3.2](./requirements.md#req-3-2) | 新环境 npm install && npm test 可复现 | 干净验证步骤(TODO 1 的完整运行;环境差异属外部条件) |

### Latest Result

状态:**passed**。验证时间:2026-09-07。被测代码:`feature/unified-regression-entry` 分支(基于 dev @ a1306dd)。

- [1.1]/[1.2]:类型错误注入(bash.ts 追加错误类型)→ `[regression] 失败于 类型检查`,exit=1,依赖检查与测试段未运行;注入已还原(`git checkout` 确认)。
- [1.3]:失败段名与 tsc/tsx 原始错误详情均透传(`error TS2322` / `injected` 可见于输出)。
- [2.1]:发现 96 个 .ts/.tsx(packages 85 + benchmarks 11,含 benchmarks/test 直属 3 个——规划时估算 93,实际清点 96)+ scripts 2 个 = 98 个文件;665 + 11 项测试。
- [2.2]:临时空测试文件 → 统计 96→97、666 项测试被执行,零配置纳入。
- [2.3]:全量运行未调用 llm:agent-smoke/eval;benchmarks 测试无需 Conda 全绿。
- [3.1]:check:dependencies、test:memory 经入口复用通过;其余 npm scripts 未改动。
- [3.2]:连续 8 轮全量 `npm test` 全绿(修复后累计 12 轮全绿)。
- 附加必要修复:预存在的 TUI Ink 测试时序脆弱(固定 25ms 等待,单包即约 20% 间歇失败率)在本 Spec 验收下不可复现,已改造三个测试文件引入 `waitForFrame` 轮询等待(含 setImmediate yield 保证 useInput handler 重注册先于后续 stdin 写入);TUI 包单包连跑 10/10 通过。
