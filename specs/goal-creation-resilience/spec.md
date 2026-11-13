---
feature: goal-creation-resilience
status: proposed
risk: medium
created_at: 2026-11-13
delivered_at: null
supersedes: []
superseded_by: null
---

# Goal 创建可靠性与失败诊断

## 目标与范围

Web 手动创建 Goal 在名称摘要模型调用返回空正文、超时或报错时仍能完成创建，并把剩余创建失败区分为可诊断的错误码与文案。
不改变 Goal／Run／Trigger 的身份、准入与推进语义；不涉及 Activity、Trajectory、Metrics 的展示与分页；不新增配置项或外部依赖。

## 用户故事

- **S1** 作为 Web 使用者，我希望提交任务时不再因为名称摘要的模型调用而创建失败，以便稳定开始工作。
- **S2** 作为排查创建失败的使用者，我希望看到可区分原因与重试指引的文案，以便自行恢复。
- **S3** 作为本机部署者，我希望较长的临时目录不再导致本地执行通道启动失败，以便环境差异不表现为创建失败。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | Web 提交新建 Goal 且模型选择已解析 | 创建路径以原始 intent（按输入上限截断）请求一次纯文本摘要，不使用结构化输出、不携带工具；摘要结束后才构造并持久化 Trigger，既有提交顺序不变。 | 受控适配器断言请求无 `structuredOutput`、`toolChoice` 为 `none`；断言 Trigger 与首 Run 落库。 |
| R1.2 | S1 | 状态 | 摘要返回空正文、仅 reasoning、Markdown 围栏或超长文本 | 使用本地确定性名称（去围栏、折叠空白、截断到上限，全空时使用固定回退名），创建仍成功；不再要求 JSON 或非空模型正文。 | 受控适配器分别返回空、仅 reasoning、围栏与超长文本，断言名称与创建成功。 |
| R1.3 | S1 | 异常 | 摘要调用抛错、超过等待上限（默认 5 秒）或被中止 | 吞掉摘要错误并回退本地名称；创建不得因此返回失败码，等待时间不超过该上限。 | 适配器抛错与挂起（测试注入更短上限），断言创建成功且耗时受限。 |
| R1.4 | S1 | 异常 | Trigger 身份冲突或输入冲突 | 保持既有冲突码与幂等语义，摘要回退不放宽任何身份校验。 | 复用既有身份冲突与输入冲突定向测试。 |
| R2.1 | S2 | 异常 | Worker 启动、注册或控制通道不可用 | 创建返回 `execution_unavailable` 与 HTTP 503，且 `/api/control` 与 `/api/goals` 一致；浏览器显示含原因类别与重试指引的文案，不显示通用创建失败句。 | 注入 Worker 启动失败，断言错误码、两个入口的状态码与文案；服务端日志含分类与实际路径长度。 |
| R2.2 | S2 | 异常 | 准入失败、存储失败或 Worker 明确拒绝构造 Goal | 保持 `create_failed` 与 HTTP 500；浏览器显示该码的独立文案并保留可重试草稿。 | 注入准入或构造失败，断言错误码、状态码与草稿保留。 |
| R2.3 | S2 | 状态 | 创建被任一稳定错误码拒绝 | 浏览器经统一映射显示每个创建错误码的文案；未知码显示码文本，不得显示通用句或当作成功。 | 覆盖 `goal_busy`、`model_not_selectable`、`model_catalog_unavailable`、`profile_not_found`、`invalid_goal_input`、`goal_unreadable`、`service_shutting_down`、`execution_unavailable`、`create_failed` 的映射测试。 |
| R3.1 | S3 | 状态 | 临时目录使 Worker socket 路径超过平台上限 | 改用短私有根生成路径并完成创建；按平台 `sun_path` 可用长度校验（macOS 103、Linux 107 字节）。 | 注入超长临时根，断言最终路径长度与创建成功。 |
| R3.2 | S3 | 异常 | 短私有根不可复用（非本人所有、权限不足或仍超长） | 回退到平台临时目录；回退后仍不可用则创建返回 `execution_unavailable`，日志记录实际长度与上限。 | 注入不可用根与超限根，断言回退顺序、错误码与日志。 |
| R3.3 | S3 | 状态 | Worker 注册、attach 与清理 | socket 文件为 `0600`、目录为 `0700`；注册与 attach 使用同一解析结果；属主不符的目录不复用。 | 定向测试检查权限位、路径一致性与拒绝复用。 |

组合：创建成功、摘要回退、执行不可用与 socket 回退（`npx tsx --test apps/goal-server/test/*.test.ts`）；浏览器文案（`npm --prefix apps/goal-board test`）。最终运行 `npm test`、`npm run check:docs`、`npm run check:dependencies`。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| 名称摘要保留模型调用，但固定使用 prompt_only 文本适配器并 best-effort：空正文、异常或超时（默认 5 秒）都回退本地派生名称。 | 名称只用于识别，创建不应依赖一次非确定性的文本生成。 | 结构化 JSON 摘要：空正文与 Markdown 围栏都会导致解析失败。 |
| 删除 `trigger-name-summary` 模型输出契约及其 Catalog 生成物，并以 `createSummaryAdapterForSelection` 取代只有一个消费者的 `createDecideAdapterForSelection`。 | 改为纯文本后契约与 Decide 装配入口均无消费者，保留即死代码。 | 保留契约待将来复用；会让生成物长期无消费者。 |
| 新增 wire 错误码 `execution_unavailable`（HTTP 503）；`create_failed` 只表示未分类的内部失败（HTTP 500）。 | 把可恢复的执行环境问题与不透明内部错误分开，便于文案与重试决策。 | 全部沿用 `create_failed`；无法给出可行动文案。 |
| 浏览器统一经 `errorMessage` 映射创建错误码，移除创建路径的硬编码通用句与特例分支。 | 单一映射避免新增错误码被静默吞成通用文案。 | 每个调用点各自判断错误码。 |
| Worker socket 使用短私有根并校验平台长度与属主，而不是只校验后失败。 | 长临时目录是已观测到的真实环境，仅报错仍会让创建不可用。 | 仅检测并拒绝；不解决环境差异。 |

边界：`create_session` 的 wire 形状与控制收据语义归 [Browser 控制契约](../browser-control-contract/spec.md)，本规范只新增一个错误值；创建幂等与收据归 [Runtime 会话创建与执行所有权](../runtime-create-answer-execution-ownership/spec.md)，本规范沿用其现有语义（R1.4）。

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| medium | 涉及共享 wire 错误码、模型契约生成物与本机 Worker 通道；socket 私有目录创建有文件系统副作用。 | 重新生成 contracts 并审阅 diff；只在临时根下创建私有目录，不删除既有目录；不执行持久化迁移。 |

- 摘要回退只影响 `Trigger.name`，不得改写 material、Goal intent、模型选择或授权（R1.2、R1.3）。
- 新增错误码不改变既有错误码的含义与 HTTP 状态（R2.3）。
- 不改动 Trigger 准入的确定性、身份与幂等语义（R1.4）。

## 任务

- [ ] //TODO 1. 将名称摘要改为 prompt_only 纯文本 best-effort，加入本地确定性回退与固定等待上限 → R1.1、R1.2、R1.3、R1.4；检查：受控适配器定向单测（空正文／仅 reasoning／围栏／超长／抛错／挂起）与既有身份冲突回归。
- [ ] //TODO 2. 删除 `trigger-name-summary` 契约与生成物，并收敛装配入口为摘要适配器工厂 → R1.1；检查：`npm run contracts:generate` 后 `npm run contracts:generate -- --check` 通过且仓库无残留引用。
- [ ] //TODO 3. 将 Worker 启动、注册与控制通道失败归类为 `execution_unavailable` 并映射 503 → R2.1；检查：Worker 启动失败定向测试断言错误码与状态码。
- [ ] //TODO 4. 统一浏览器创建错误码文案并保留可重试草稿 → R2.1、R2.2、R2.3；检查：`npm --prefix apps/goal-board test` 文案映射单测。
- [ ] //TODO 5. 加固 Worker socket 路径解析：短私有根、平台长度校验、属主与权限校验、回退顺序 → R3.1、R3.2、R3.3；检查：registry 定向测试（超长根、不可用根、权限位）。
- [ ] //TODO 6. 同步更新 goal-server 与 model-contracts 的 overview／semantics 及公开 TSDoc → R1.1、R2.1、R3.1；检查：`npm run check:docs`。

## 执行记录

- 状态：未执行
- 验证：-
- 结果：-
- 未决：无
