# 接入验证结果

本目录记录基础设施验证，不代表真实模型能力。

- [结果与代码摘要](results.json)：真实模型调用零；构建 freshness 通过。
- [固定五题汇总](five-task-summary.json)：两模式各 restore/full，共 20 组；Context 机制与固定 Judge 管线通过，工程补丁全部 unresolved。
- [全量回归](benchmark-regression.log)：297 通过、9 失败；[相应文件 HEAD 基线](head-baseline.log) 42 通过。
- [靶向测试](targeted-tests.log) 42 通过；[Python bridge](python-bridge-tests.log) 5 通过；[依赖规则](dependency-rule-tests.log) 11 通过。
- [文档](docs.log)、[依赖](dependencies.log)、[benchmark 类型](benchmark-typecheck.log)、[项目类型](project-typecheck.log) 检查通过。
- [Worker 当前构建核对](freshness.log) 通过。

完整原始记录、归档及官方日志位于 `/tmp/lazygoal-swe-context-five-final-20261013/`；之前试跑保留失败或未完成状态，不作为最终通过样本。人工审核操作在 smoke 中显式使用 test-only fixture；生产入库仍需人工提供批准哈希。

全量回归未过，TODO 7 和 Feature Verification 未完成，Spec 保持 proposed。当前工作树另有 Runtime 修改，本任务未修改这些文件。
