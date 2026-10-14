# Context Benchmark

本模块拥有固定脚本、检查点候选、人工批准版本、配对执行与评分；容器、Worker 构建、模型 RPC、
Attempt 与 Runtime 生命周期由 [共享评测框架](../../README.md) 提供。

## 执行与恢复

[场景](../src/scenario.ts) 在宿主冻结初始文件、Profile、阶段、预算和评分材料。
[脚本驱动](../src/script-driver.ts) 每次仅向 ACP Worker 发送当前操作与消息。
Worker 使用共享 Headless 会话调用真实 launch、continue 或 resume；终态续接创建新 Run，
等待回答保留 Run。错误状态停止推进，预期失败可触发后继阶段。

[EnvironmentSpec](../src/environment-spec.ts) 使用无网络、无宿主挂载的共享 Docker 环境。
初始材料只来自场景文件，不导入宿主项目。恢复导入已核验字节，在容器中重建普通文件；
不继承宿主权限。检索索引从 committed histories 重建。模型仅通过宿主 RPC 调用；宿主声明的原生模型身份传到 Worker，用于正常的已提交原生调用历史回放。

capture 在声明的终态或 waiting 阶段边界停止 Worker，再核对新增子进程已退出。
[检查点](../src/checkpoint.ts) 保存该时刻 Snapshot、历史、完整模型输入、项目文件及其哈希，
记录实际 Worker 源码、模板和镜像身份。Worker 启用独立诊断 Trace，并随 state 回收至 traces；请求、响应、schema 与校验错误按 callId 关联，超限内容带截断标记。Snapshot 是恢复权威；模型输入和诊断不参与回放。Agent 源码和模板可在当前协议下演进；检查点保留采集构建身份，报告另记录实际执行 Worker 和宿主评测源码身份。
原生普通文件场景拒绝 executing 中途捕获、符号链接、隐藏文件、node_modules 和超出归档上限的材料。来源型场景使用完整容器文件系统归档，不把仓库转换为普通文件树。

## 候选与版本

[Corpus](../src/corpus.ts) 对完整候选树计算内容身份。freeze 要求显式批准哈希、批准人、
集合与版本；核心集和挑战集均不可覆盖。修改材料需重新采集或复核并发布新版本。
挑战集晋升使用新的明确批准，不自动晋升。

## 评分与报告

[Runner](../src/runner.ts) 在独立容器和目录中运行恢复后缀与完整脚本。
两组使用同一执行角色、冻结 Profile 和预算；采集角色与成本单独保留。
教师检查点与从头组前缀可能不同，报告不声称证明 context 的因果贡献。

agent 完全停止后执行隐藏 verifier，比较评分前后文件哈希；修改被评产物记为隔离违规。
[Judge](../src/judge.ts) 独立调用显式模型角色，保留 rubric、请求、响应、证据、用量和错误。
[综合判定](../src/evaluator.ts) 让确定性失败和隔离违规优先；Judge 不可用记为 incomplete，
缺失用量记为 null。JSON 与英文报告保留双方结果、计划分母和可配对性。
未完成和失败样本不被过滤。检索与输入暴露是审计材料，不自动证明模型使用了信息。

## SWE-bench 来源

[来源场景](../src/source-scenario.ts) 保留固定任务包的完整 issue，分别生成跨 Run 调查后 continue 与 ask_user 后 resume 的脚本。waiting 模板固定单个确认问题，Runtime 分配 q-1；实际问题不匹配时停止。两组复用来源五工具，不改变 Runtime 语义。

来源接口归属 [共享评测层](../../README.md)，SWE 实现归属 [SWE-bench](../../swebench/README.md)，由顶层 CLI 注入；具体 benchmark 不横向导入。来源任务的评分数据只留宿主，容器使用不可变镜像 ID、/testbed 和宿主模型 RPC。

capture 停止 Agent 后保存可导入 filesystem.tar 和镜像/字节摘要，包含依赖、未跟踪文件、仓库和 Runtime 状态；挂载/卷拒绝，不保存进程内存。恢复不重置源码，校验当前 Worker 构建身份；原生场景仍按原文件路径恢复。

[审核标注](../src/source-evidence.ts) 引用已提交原始事实。annotations.json 必须经人工补齐并显式批准才能冻结，不按修复成功筛题。候选、归档、脚本、任务、rubric 与标注都受完整内容摘要保护。

来源型结果分别保留官方工程评分与 Context 机制/语义结果。官方评分使用宿主私有数据和干净容器；completed 不等于 resolved，unresolved 不能覆盖 Context 通过。full 组使用自身来源，不要求复制采集分支决定。恢复宿主预算扣除已捕获前缀，waiting 的 Runtime Step 额度由原 Snapshot 保留。

不支持任意 executing 暂停、GEPA、动态 prompt、自动入库、历史协议迁移或后台服务。显式脚本/固定 Judge 验证报告标记 infrastructure_validation，不能作为真实模型质量证据。
