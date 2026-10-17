# 模型上下文组装语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| ModelInferenceProjector | 把 Runtime 状态单向投影为模型视图。 | [模型上下文组装](../README.md) | [投影器](../src/model-inference-projector.ts) |
| TrajectoryExecutionUnitAdapter | 从 committed Trajectory 构建完整执行单元并校验来源身份。 | [模型上下文组装](../README.md) | [执行单元适配器](../src/trajectory-execution-unit-adapter.ts) |
| HotWindowSelector | 从最新执行单元选择连续 Hot 后缀。 | [模型上下文组装](../README.md) | [执行单元适配器](../src/trajectory-execution-unit-adapter.ts) |
| TrajectoryEventProjector | 把事件与大型输出投影为有界模型 DTO。 | [模型上下文组装](../README.md) | [事件投影器](../src/trajectory-event-projector.ts) |
| 原生调用交换 | 按调用 ID 配对响应与结果的不可拆分交换。 | [模型上下文组装](../README.md) | [原生历史](../src/native-model-history.ts) |
| TrajectoryModelContextAssembler | 提交边界筛选、Hot/Warm 组装与预算报告。 | [模型上下文组装](../README.md) | [组装器](../src/trajectory-model-context-assembler.ts) |
| WarmReducer | 按语义分区与配额归约有损 Warm 条目。 | [模型上下文组装](../README.md) | [归约器](../src/warm-reducer.ts) |
| DeterministicWarmEntryExtractor | 不猜测语义的确定性 Warm 候选提取。 | [模型上下文组装](../README.md) | [确定性提取器](../src/deterministic-warm.ts) |
| Lookup 结果投影 | 带来源范围与时效提示的历史命中投影。 | [模型上下文组装](../README.md) | [Lookup 投影](../src/context-lookup-projection.ts) |
| 目标工作导航 | 当前阶段、缺口与重要信息的只读导航投影。 | [模型上下文组装](../README.md) | [导航投影](../src/goal-context-navigation.ts) |
