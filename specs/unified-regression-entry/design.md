# 统一确定性回归入口 设计

## 审批摘要

### 方案

新增一个 Node 编排脚本按序执行类型检查、依赖边界检查与全部确定性测试,根 `npm test` 指向该脚本;测试文件发现由脚本按目录约定递归扫描实现,新增测试文件零配置纳入。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 编排载体 | 新增 `scripts/run-regression.mjs` 由 `npm test` 调用,而非 package.json 内联 shell 串联;串联逻辑可打印各段开始/结束与失败环节,满足失败可定位 | 新增一个脚本文件;`npm test` 语义从占位变为完整回归 |
| 测试文件发现 | 脚本递归扫描 `packages/*/test`、`benchmarks/*/test`、`benchmarks/test`、`scripts/*.test.mjs` 约定目录,而非硬编码文件清单 | 新增确定性测试文件自动纳入,无配置维护;漏放目录约定的文件不会被纳入(与现状一致) |
| 测试运行器 | packages/benchmarks 的 `.ts/.tsx` 用 `tsx --test` 一次进程跑全部文件,scripts `.mjs` 沿用 `node --test` | 单进程批量运行保留现有 runner 行为;不引入新测试框架 |
| 类型检查范围 | `tsc --noEmit` 维持现有 tsconfig(`packages/**`),不为本 Spec 扩展 benchmarks 覆盖 | benchmarks 类型缺口是既有现状,如实保持;失败语义仍由 tsc 输出定位 |
| 顺序与失败语义 | 固定顺序 类型检查 → 依赖边界 → 测试;任一段非零即停止并原样透传退出码 | 静态检查最快失败在前;`check:dependencies` 与 `test:memory` 复用既有入口命令 |

### 风险与待确认

- 风险等级:low;理由:纯本地命令编排,无公共接口、持久化或权限变更,完全可逆。
- 关键操作:无。
- 风险:全量回归耗时随测试规模增长(单次全量属于预期成本);`tsc --noEmit` 依赖当前 tsconfig 严格模式,新增失败均为真实回归信号。
- 待确认:无。

## Overview

用一个 Node 脚本把仓库既有的确定性检查命令按固定顺序串联,替换 `npm test` 占位。脚本自身不含测试逻辑,只负责发现测试文件、按序执行子命令、透传退出码并输出各段状态。

## Key Design Decisions

### 编排脚本与 package.json 接线

`scripts/run-regression.mjs` 顺序 `spawn` 三段:

```text
npm test
  └── scripts/run-regression.mjs
        1. npx tsc --noEmit
        2. npm run check:dependencies
        3. 测试段:
           a. npx tsx --test <packages/*/test 与 benchmarks 测试目录发现的 .ts/.tsx 文件>
           b. node --test scripts/*.test.mjs
```

- 每段开始前打印 `[regression] <段名>` 一行;失败时打印 `[regression] 失败于 <段名>` 并 `process.exit(子命令退出码)`。
- 各段子命令输出原样透传(inherit stdio),tsc/tsx/node 自身的失败详情即失败定位信息,不额外解析。
- 测试段拆为 tsx 与 node 两个子命令但同属一段:任一失败即整段失败,测试段整体算一段。

### 测试文件发现规则

脚本以目录约定递归收集,不维护文件清单:

- `packages/<pkg>/test/**/*.{test.ts,test.tsx}`(六包固定顶层遍历,与 tsconfig 覆盖一致)
- `benchmarks/<name>/test/**/*.test.ts` 与 `benchmarks/test/**/*.test.ts`
- `scripts/*.test.mjs`

发现的文件排序后一次性传给 `tsx --test`,与现有 CLAUDE.md 文档化的 glob 行为等价但不受 shell glob 展开差异影响。`package.json` 无需为新测试文件改动。

### 既有入口零变更

`llm:agent-smoke`、`eval` 转发、`check:dependencies`、`test:memory`、`memory:*` 脚本与各包手工测试命令全部保持原样;`npm test` 仅从占位改为调用编排脚本,是仓库内唯一行为变化点。

## Testing Strategy

- 干净验证:`npm install && npm test` 在当前工作树全绿(93 个测试文件 + 两项静态检查)。
- 失败快停验证:临时向 packages 源码注入类型错误,确认 `npm test` 停在第一段并以非零码退出、不执行后续段;恢复后临时让任一测试文件失败,确认测试段非零退出。两处注入均在验证后还原,不提交。
- 覆盖完整性验证:脚本输出统计发现的测试文件数,与 `ls` 清点(packages 80 + benchmarks 11 + scripts 2 = 93)比对一致。
- 入口不变验证:抽查 `npm run check:dependencies`、`npm run test:memory` 行为与改动前一致;`llm:agent-smoke` 不被 `npm test` 调用(脚本内无该命令)。
