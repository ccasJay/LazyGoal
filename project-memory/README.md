# Project Memory

Project Memory 保存已完成且经过实现证据核验的长期决策摘要，供后续 Agent 安全召回当前设计意图。它不是功能历史、架构文档或源码的替代品。

## Authority

核验事实时按以下边界使用资料：

1. 源码和测试说明当前实现及可执行契约。
2. `docs/architecture/` 说明当前模块职责、所有权与数据流。
3. `specs/` 保存需求、设计与功能演进背景。
4. Project Memory 保存仍然有效的长期决策、理由、护栏和重新评估条件。

Memory 与当前源码、测试或架构文档冲突时，必须将其移出默认召回并完成维护审查，不能仅凭历史 Spec 判断当前行为。

## Lifecycle

- `active`：完成当前证据核验，可以安全进入默认召回。
- `needs-review`：发现疑似漂移，暂时退出默认召回；修订并重新核验后可以恢复为 `active`。
- `superseded`：决策已由其他 Capsule 替代，是终态。
- `obsolete`：决策不再适用且没有替代 Capsule，是终态。

状态迁移时才添加 `status_reason`、`supersedes` 或 `superseded_by`；不保留空字段。替代关系必须双向声明。

## Capsule Format

每篇 Capsule 的 frontmatter 必须包含：

- `feature`
- `status`
- `summary`
- `source_spec`
- `distilled_at`
- `reviewed_at`
- `tags`
- `authorities`

正文必须按以下顺序组织：

1. `Purpose`
2. `Durable Decisions`
3. `Guardrails`
4. `Revisit When`
5. `Sources`

Durable Decision 使用稳定的 `D1`、`D2` 标识。事实性命题必须引用 `Sources` 中的 Spec、实现或测试来源。

`distilled_at` 记录首次沉淀日期。每次完整证据核验更新 `reviewed_at`。版本历史由包含 Memory 修改的 Git 提交保存，不在 Capsule 中写入自引用提交 SHA。

## Maintenance Workflow

维护 Capsule 前必须：

1. 读取相关 Spec、架构文档、源码和测试。
2. 建立旧命题与当前证据的对应关系。
3. 判断每个命题应保留、修订、删除还是迁移状态。
4. 展示完整候选 Capsule、生成索引和全部逻辑写集。
5. 获得明确批准后统一写入。
6. 运行当前仓库的 Memory 检查和相关实现测试。

同一 Feature 已存在 Capsule 时进入 maintenance review，不因已有记录而跳过。新 Feature 影响现有决策时，必须在同一预览中提出正文维护或状态迁移，避免多个 Capsule 重复持有同一决策。

最后一个 Spec 任务完成只代表可以报告潜在候选，不允许自动生成或修改 Memory。

## Generated Index

`project-memory/index.md` 是生成文件，不手工维护：

```sh
npm run memory:index
npm run memory:check
npm run test:memory
```

索引只依据 Capsule frontmatter 生成。已完成 checkbox 但尚无 Capsule 的 Spec 只产生候选警告，不自动写入，也不使检查失败。
