# Implementation Plan

- [x] //TODO 1. 定义三层拓扑结构与 Goal-stable 任务契约提升

  - 扩展 `PromptContext` 与 `ModelInferenceView`，将经过审批的 `GoalTask`（`objective` 与 `completionCriteria`）作为静态契约绑定到 `Goal-stable` 根前缀中
  - 更新执行阶段 System Prompt 模板以确定性呈现任务契约与规则，确保同一 Goal 连续步骤中根前缀 100% 逐字固定
  - 添加单元测试验证 `Goal-stable` 前缀的确定性渲染
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3)_

- [x] //TODO 2. 重构 Epoch-stable 前缀并隔离微观 Token 水位

  - 调整 `ModelContextEpochView`，剥离每步波动的 `inputTokens` 与 `remainingTokens`，仅保留 `epochNumber` 与当前 Epoch 截断后的会话历史基线
  - 当 Runtime 判定预算达到警戒线时，在尾部控制流中注入离散的 `checkpointRequired: true` 信号，避免微观数字变化污染前缀
  - 添加单元测试验证同一 Epoch 内前缀序列化哈希在多步之间完全不变
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [4.2](./requirements.md#req-4-2)_

- [x] //TODO 3. 精简 Step-dynamic 尾部控制消息为纯动态增量

  - 重构 `packages/agent/src/render.ts` 中的 `createWorkingContextPayload` 为纯增量 `StepDynamicPayload`
  - 彻底剔除尾部 JSON 中重复的 `intent`、`task` 与 `contextEpoch` 只读静态常量，仅序列化 `stepCount`、最新 `previousStep`（观察输出与候选动作空间）、`trajectoryContext.hot` 与即时 `workingMemory`
  - 添加单元测试断言尾部 JSON 的精简结构与体积缩减
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [4.1](./requirements.md#req-4-1), [4.3](./requirements.md#req-4-3)_

- [ ] //TODO 4. 验证纯函数组装、多轮前缀稳定性与快照幂等恢复

  - 编写连续多步 Executing 的组装测试，验证 `Goal-stable` 根前缀与 `Epoch-stable` 中间前缀的 SHA-256 跨步骤完全一致
  - 编写从已持久化 Goal Snapshot 恢复的测试，断言恢复后重新生成的首轮请求与中断前对应步骤完全幂等
  - 验证当用户发起新对话或阶段切换时，前缀能够按需正确更新
  - _Requirements: [1.3](./requirements.md#req-1-3), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3)_

- [ ] //TODO 5. 端到端集成回归与 ALFWorld 基准验证

  - 验证模型基于三层拓扑能够准确解析 `AgentDecision` 并按 `criterionIndex` 提交完成证据序列
  - 运行全量 ALFWorld 回归测试套件（`benchmarks/alfworld/manifests/regression.json`，共 5 题），断言端到端 100% 成功率与决策闭环
  - 运行 `npm run check:dependencies` 与 `npx tsc --noEmit`，确保无类型错误与依赖架构违规
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2)_
