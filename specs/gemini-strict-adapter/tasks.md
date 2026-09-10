# Gemini Strict 模式适配层优化实施任务清单

## Implementation Plan

- [x] //TODO 1. 改造 Schema 展平逻辑，实施 Nullable Required 强语法约束

  - 改造 `packages/llm/src/gemini.ts` 中的 `mergeGeminiUnion`，在处理 `properties.result` 时将分支关键字段（`action`、`summary`、`completionEvidence`、`reason`、`error` 等）标注为 `nullable: true`，并将它们全部纳入顶层 `required` 列表；移除 `summary` 的单值固定枚举，保留普通的字符串约束。
  - 成功判据：生成的 `responseSchema` 顶层 `required` 包含 `action` 等决策核心键；`action` 字段具有 `nullable: true` 且保留内部工具输入的 AST 约束；`summary` 不含任何固定 `enum`。
  - 验证方式：`npx tsx --test packages/llm/test/gemini.test.ts`；新增针对 `prepareGeminiSchema` 输出 Schema 结构的断言。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3)_

- [x] //TODO 2. 改造逆向投影与空字段清洗，剥离非目标分支的 null 属性

  - 改造 `packages/llm/src/gemini.ts` 中的 `restoreGeminiResponseProjection`，在解析响应 JSON 后，根据 `kind` 判别分支，统一安全剥离非目标分支产生的 `null` 属性（如在 `tool_call` 下删除 `summary: null` 与 `completionEvidence: null`；在 `complete` 下删除 `action: null`）；保持目标分支内部合法字段完整。
  - 成功判据：包含 `action: null` 的 `complete` 响应在还原后被彻底移除 `action` 键，成功通过 `bundle.decode`；包含完整 `action` 但带其他 `null` 键的响应在还原后恢复为纯净的 `tool_call`。
  - 验证方式：`npx tsx --test packages/llm/test/gemini.test.ts`；覆盖多种带 `null` 键的逆向还原测试。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3)_

- [x] //TODO 3. 修复证据哨兵值与反向模式匹配，消除静默回滚死锁

  - 改造 `packages/llm/src/gemini.ts` 中的 `restoreGeminiProjectedValue` 与 `matchesKnownSchemaShape`，在反向匹配 Wire Schema 时正确识别并处理证据哨兵值 `"__lazygoal_absent__"`，消除因哨兵值导致的模式匹配失败；重构函数返回路径，确保清洗后的结构化数据直接作为序列化结果输出，严禁在校验未通过时静默回滚为原始破损 content。保持真正的非 JSON 文本原样透传。
  - 成功判据：带有证据哨兵值的非 complete 响应或经过纠偏清洗的响应绝不发生静默回滚；真正非法的模型损坏输出正常向上抛出 `LLMResponseProtocolError`；`prompt_only` 模式继续保持无 schema 状态。
  - 验证方式：`npx tsx --test packages/llm/test/gemini.test.ts`；`npm test`；全仓库回归全绿。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2)_
- [x] //TODO 4. 端到端真实评测与多题回归验证

  - 在真实 Gemini 3.6 Flash 端点上，针对此前失败的 `astropy__astropy-13453`（或 `astropy__astropy-13398`）以及单题 `astropy__astropy-12907` 运行 SWE-bench 容器评测。
  - 成功判据：题目多轮长程交互中不再出现 `INVALID_AGENT_DECISION` 协议错误，模型能正常完成工具交互直至结题，成功导出补丁。
  - 验证方式：执行 `node bin/lazygoal.cjs eval swebench ...` 并在输出目录中核验 `report.json` 的 `errors` 为空且存在有效 patch。
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.1](./requirements.md#req-2-1), [3.2](./requirements.md#req-3-2), [4.1](./requirements.md#req-4-1)_

---

## Feature Verification

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2)、[1.3](./requirements.md#req-1-3) | Gemini strict Schema 必须将分支字段设为 nullable 并纳入 required；移除单值 summary 枚举 | `packages/llm/test/gemini.test.ts` Schema 结构断言 |
| [2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2)、[2.3](./requirements.md#req-2-3) | 响应逆向投影安全剥离非本分支 null 键，目标分支数据无损恢复并通过 `bundle.decode` | `packages/llm/test/gemini.test.ts` 反向解码断言 |
| [3.1](./requirements.md#req-3-1)、[3.2](./requirements.md#req-3-2)、[4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2) | 消除模式匹配导致的静默回滚死锁；坏数据如实抛出；prompt_only 完全隔离 | Gemini Adapter 定向测试；`npm test`；全量回归 |
| 整体功能 | 真实 Gemini 3.6 端点下运行 SWE-bench 题目，多轮长程交互 0 协议报错 | 真实 SWE-bench 评测与 `report.json` 核对 |

### Latest Result

- **状态**: 全部验证通过 (PASS)
- **时间**: 2026-09-10 10:51 (Asia/Shanghai)
- **环境**: 分支 `feature/acp-container-runtime`，端点 Gemini 3.6 Flash (`http://100.111.254.42:8317/v1beta`)，输出模式 `strict`。
- **单元与集成测试证据**:
  - `packages/llm/test/gemini.test.ts`: 23/23 测试全部通过。完整覆盖 Nullable Required Schema 生成（关键字段全量 required、action/summary nullable、summary 无单值 enum）、多分支 null 键安全剥离（complete 剥离 action: null、tool_call 剥离 null 键）、以及证据哨兵值闭环无回退。
  - `npx tsc --noEmit`: 0 类型错误。
  - `npm test`: 798 个单元测试 + 11 个脚本测试，全部通过。
  - `npm --prefix benchmarks test`: 115 个测试全部通过。
  - `npm run check:dependencies`: 118 个源文件依赖边界验证通过。
- **真实端点 SWE-bench 容器评测证据**:
  1. 单题 `astropy__astropy-12907` (运行目录 `.lazygoal/benchmarks/swebench-runs/route2-verify-12907-20260910-1040/`):
     - `runStatus`: completed, `durationMs`: 81214, `errors`: []
     - `gradingStatus`: **resolved** (1/1 resolved, 官方评分通过)
     - `patchBytes`: 1259 字节
     - `tokenUsage`: inputTokens: 308998, outputTokens: 1846
  2. 长程多轮题 `astropy__astropy-13398` (运行目录 `.lazygoal/benchmarks/swebench-runs/route2-verify-13398-20260910-1044/`):
     - `durationMs`: 309810 (长程 50 步工具交互)
     - `errors`: [] (彻底消除此前第 16 步出现的 `INVALID_AGENT_DECISION` 协议错误)
     - `patchBytes`: 3418 字节有效补丁顺利导出
     - `tokenUsage`: inputTokens: 2554716, outputTokens: 7649

