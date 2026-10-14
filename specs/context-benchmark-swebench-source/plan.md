# Context Benchmark SWE 来源执行计划

用户明确要求实现完整 Spec；本计划为该指令的执行拆分，不增加范围或真实模型调用。

- [x] //TODO 1. 固定任务导入与私有评分隔离，覆盖 1.1–1.4。
- [x] //TODO 2. 共享来源端口、Worker 生命周期和顶层 CLI 注入，覆盖 2.1–2.4。
- [x] //TODO 3. 静止容器镜像归档与可校验恢复，覆盖 3.1–3.4。
- [x] //TODO 4. 原始来源标注、人工批准与冻结，覆盖 4.1–4.4。
- [x] //TODO 5. 两种模式配对与累计预算，覆盖 5.1–5.4。
- [x] //TODO 6. 官方工程评分和 Context 机制/语义独立报告，覆盖 6.1–6.4。
- [ ] //TODO 7. 离线正反例、真实 Docker 单题及固定五题验收，覆盖 7.1–7.4。

## Feature Verification

### Planned Checks

任务投影秘密拒绝、内容与镜像错配、模板/问题/状态不符、活动子进程与挂载拒绝、归档损坏、来源不可解析、冻结篡改、配置错配、预算不重置；评分独立、Judge 不可用与高分不能覆盖失败、full 合理改策；失败组保留和缺失用量。

运行 Context/SWE/shared 单元测试及 benchmark 全量测试、类型、文档和依赖检查。先 astropy__astropy-12907，再现有五题清单：两模式 capture + freeze + restore/full，全部用脚本 Adapter/Judge。官方 harness 验证正确错误 patch，评分材料留宿主。真实模型调用为零；不可用依赖明确阻塞。

### Latest Result

执行中。相关离线 42 项、Python 5 项、依赖规则 11 项以及根/benchmark 类型、文档、依赖检查通过。单题两模式四组与官方正反 patch 门槛通过，实际模型调用为零。最终五题的 10 模式、20 执行组全部通过接入正确性验收，官方正反 patch 为 resolved/unresolved。Worker 与当前源码摘要匹配，实际模型调用为零；固定 Judge 分数不代表真实语义质量。

benchmark 最终全量回归 297 通过、9 失败；相应五文件在 HEAD 基线 42 项全过。当前工作树的 Runtime 正被其他 Agent 修改，本任务未改动这些文件。完整回归未过，Feature Verification 不标记 passed，Spec 不标记 delivered。原始日志与代码摘要见 verification/results.json。
