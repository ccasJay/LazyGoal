---
name: storage-codec-structuredClone
overview: 用 Node 内置 structuredClone 替换 storage 包 GoalSnapshotCodec 中手写的 cloneJsonValue 深拷贝实现，清理相关 import，验证测试，并同步确认架构文档语义不变。
todos:
  - id: replace-clone
    content: 删除 goal-snapshot-codec.ts 中 cloneJsonValue 与无用导入，4 处调用点改用 structuredClone
    status: completed
  - id: update-tsdoc
    content: 更新 Codec 顶部 TSDoc @remarks，记录深复制基于 Node 内置 structuredClone
    status: completed
    dependencies:
      - replace-clone
  - id: verify
    content: 运行 npx tsc --noEmit 与 storage 测试，重点验证对象隔离与 round-trip 用例
    status: completed
    dependencies:
      - update-tsdoc
---

## 产品概述
实现简化审计中唯一达到证据门槛的候选：用 Node 内置 `structuredClone` 替换 `@lazygoal/storage` 包 Codec 中手写的 `cloneJsonValue` 递归深拷贝，减少手写基础设施代码，同时严格保持快照 round-trip 与对象隔离语义不变，并同步相关文档。

## 核心功能
- 删除手写 `cloneJsonValue` 函数（约 20 行 + 2 个 overload 声明）
- 4 处调用点（encode/decode 的 Tool input 与 Observation output）改用 `structuredClone`
- 清理因此不再使用的 `JsonValue`、`SnapshotJsonValue` 类型导入
- 更新 Codec TSDoc 记录深复制实现选择；确认架构文档无需改动


## 技术栈
- TypeScript，Node 20+（`structuredClone` 为 Node 17+ 全局内置，项目基线满足）
- 保留现有 zod `GoalSnapshotV3Schema` 校验链，保证输入为纯 JSON 值

## 实现方案
修改目标仅为 `packages/storage/src/goal-snapshot-codec.ts`，公开 API（`GoalSnapshotCodec` 接口与 `goalSnapshotCodec` 实例）完全不变：

1. 删除第 66–84 行的 `cloneJsonValue` 函数（两个 overload + 实现）。
2. 删除不再使用的导入：第 7 行 `JsonValue`（来自 `../../runtime/src/index`）与第 17 行 `SnapshotJsonValue`（来自 `./goal-snapshot`）；保留 `SnapshotJsonValue` 不涉及的其他类型导入不动。
3. 替换 4 处调用点（第 222、233、372、383 行）：`cloneJsonValue(x)` → `structuredClone(x)`。
4. 更新文件顶部 `GoalSnapshotCodec` 接口 TSDoc 的 `@remarks`，补充"深复制基于 Node 内置 `structuredClone` 实现"一句，记录实现选择且不影响契约语义。

## 实施要点
- **类型兼容性**：`JsonValue` 与 `SnapshotJsonValue` 为结构同构的 readonly JSON 类型；`structuredClone<T>` 泛型返回原类型，直接赋值应编译通过；若 TS 类型收窄报错，fallback 是在 4 个调用点各加一次 `as SnapshotJsonValue` 断言（不引入新公共类型）。
- **行为等价**：`structuredClone` 对非可克隆值抛 `DataCloneError`，但 encode 前已有严格 Schema 校验、decode 前已有 `GoalSnapshotV3Schema.safeParse`，该路径不可达，无新增失败面。
- **文档同步范围**：`docs/architecture/storage.md` 中"深复制转换/深复制"与 `docs/architecture/agent.md` 的 Projector 描述均为语义级表述，不涉及克隆机制细节，按 AGENTS.md 原则（架构文档不记录实现机制、API 契约留在 TSDoc）不做内容修改——"同步相关文档"由 Codec TSDoc 更新承载。
- **性能**：`structuredClone` 为 V8 原生实现，对 JSON 值的克隆开销与手写递归相当或更低，无性能回退。

## 验证
- `npx tsc --noEmit` 通过，确认无未使用导入告警。
- 运行 `npx tsx --test packages/storage/test/*.test.ts` 全绿，重点核对 `GoalSnapshotCodec isolates objects between Runtime and Snapshot`（goal-store.test.ts:474-514 附近）与 round-trip 用例——它们验证的正是本改动的语义保证。

