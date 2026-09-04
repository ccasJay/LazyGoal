# Implementation Plan

- [ ] //TODO 1. 建立 `@lazygoal/contracts` 包与 Contract AST 类型系统

  - 新增独立 package manifest、公共入口和 AST/builder，实现 primitive、literal/enum、strict object、optional/nullable、array、record、union、discriminated union 与递归类型标记
  - 实现 `Contract`、`InferContract` 和递归固定点类型推导，为公开类型与 builder 补齐中文契约 TSDoc
  - 添加编译期类型测试，覆盖只读 required/optional、集合、联合和递归输出，并确认公共入口不存在被禁止的规则 API
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.4](./requirements.md#req-1-4)_

- [ ] //TODO 2. 实现严格 Parser 基础与输入深复制

  - 新增 `safeParse`、`parse`、基础 Error/issue 类型和递归解释器，支持 primitive、array、strict object 与 record
  - 实现长度、范围、安全整数和 Unicode pattern 约束，拒绝额外字段与任何隐式规范化，并在成功时构造无共享引用的副本
  - 添加 Parser 测试，覆盖合法输入、缺失/额外字段、动态键、约束失败、原输入不变和深复制隔离
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [4.1](./requirements.md#req-4-1)_

- [ ] //TODO 3. 完成联合分支与公开校验错误契约

  - 实现普通 union 的首个完整匹配和 discriminated union 的唯一分支选择，保持分支试验诊断隔离
  - 完成 `ContractValidationError`、稳定 issue code 与根路径语义，使 `parse` 和 `safeParse` 对同一数据错误携带一致 issues
  - 添加联合分支、未知 discriminator、嵌套字段路径和两种解析 API 一致性测试
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [ ] //TODO 4. 实现递归定义检查与有界校验

  - 新增完整 Contract 图检查，拒绝重复递归名称、悬空 self、未受容器保护的递归和非法 optional 位置
  - 让解释器解析有限递归 JSON，并以祖先引用检测、64 层深度限制、稳定遍历顺序和 50 条 issue 上限保证有界失败
  - 添加合法递归、非法定义、循环/共享输入、深度边界、确定性顺序和诊断截断测试
  - _Requirements: [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [3.5](./requirements.md#req-3-5), [4.4](./requirements.md#req-4-4), [4.5](./requirements.md#req-4-5)_

- [ ] //TODO 5. 编译确定性 JSON Schema 2020-12

  - 新增 `compileJsonSchema` 与只读 Schema 输出类型，映射所有受支持节点、strict/optional/nullable 语义和递归 `$defs`/`$ref`
  - 统一 AST 构造参数复制、节点冻结和 compiler 返回值隔离，保证相同 Contract 的结构与 `JSON.stringify` 输出稳定
  - 添加逐节点 Schema fixture、组合结构、递归引用、重复编译和外部修改隔离测试
  - _Requirements: [1.3](./requirements.md#req-1-3), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3)_

- [ ] //TODO 6. 使用 Ajv 建立受限子集语义 oracle

  - 仅在 `packages/contracts` devDependencies 中加入 Ajv，并确认生产 manifest 与 `src/` 不依赖任何外部校验器
  - 用 Ajv 2020-12 对 primitive、约束、strict object、record、union、nullable 和递归 fixture 交叉验证本地 Parser 与派生 Schema 的接受/拒绝结果
  - 运行 contracts 完整测试与 TypeScript 编译，确认 oracle 不进入公共入口或运行时依赖图
  - _Requirements: [5.4](./requirements.md#req-5-4), [6.2](./requirements.md#req-6-2)_

- [ ] //TODO 7. 接入仓库依赖边界并完成全量回归

  - 更新依赖检查器，把 `contracts` 声明为无内部出站依赖的基础包，并允许现有 package 单向依赖它
  - 同步仓库布局、架构总览和 `docs/architecture/contracts.md`，只描述已实现 Core，不宣称现有业务协议已经迁移
  - 运行 contracts 与全部 packages 测试、`npx tsc --noEmit`、benchmark typecheck/test、Memory 测试与检查、依赖边界检查及 `git diff --check`
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4)_
