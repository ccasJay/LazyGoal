# 契约迁移路线执行记录

本文件记录 [契约渐进迁移](./README.md) 路线本轮的批量执行结果，不新增功能范围，也不替代各 Spec 的批准内容与验收证据。

## 已交付 Spec

- [x] [TS 契约生成能力](../ts-contract-generation-capabilities/spec.md)
- [x] [工具输入契约迁移](../ts-tool-input-migration/spec.md)
- [x] [模型数据契约迁移](../ts-model-contract-migration/spec.md)
- [x] [Web 数据契约迁移](../ts-web-contract-migration/spec.md)
- [x] [Storage 数据契约迁移](../ts-storage-contract-migration/spec.md)
- [x] [其他数据边界契约迁移](../ts-other-boundaries-migration/spec.md)
- [x] [AgentProfile 文件契约迁移](../ts-agent-profile-file-contract/spec.md)
- [x] [在线模型查询输入迁移](../ts-provider-model-query-contract/spec.md)
- [x] [Provider 连接测试结果迁移](../ts-provider-profile-test-contract/spec.md)
- [x] [删除旧 Contract AST](../remove-legacy-contract-ast/spec.md)

## 交付与验证

- 集成分支 `feat/contract-migration-integration` 汇入生成能力、Storage、工具与模型联合切换、Web、AgentProfile 与其他边界；用户批准后合并到 `dev`（`788d4c19`）。
- 删除旧 Contract AST 经用户批准后合并到 `dev`（`7fd0c8ff`）。
- 最终 `dev` 完整回归通过：TypeScript `2686/2686`、scripts `98/98`、GEPA adapter 通过；`npx tsc --noEmit`、`contracts:generate -- --check`、`check:dependencies`、`check:docs`、`npm run build:web`、`git diff --check` 通过。
- 各 Spec 已标记 `delivered`；共享 JSON 原语保留在 `@lazygoal/contracts`，旧 AST/DSL/Parser/Schema 编译器已删除。
