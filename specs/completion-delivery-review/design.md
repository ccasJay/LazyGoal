# Agent 完成判断与最终交付优化设计

## 审批摘要

本文件记录用户已批准并明确要求实施的方案。风险为 medium：额外调用成本与审查误判。使用当前 Decide 模型单独审查，所有普通与获批 Plan Run 的完成候选均参与；拒绝复用现有持久化反馈和三次纠错上限。无待确认决策。

## 完成流程

```text
Decide completion candidate
    -> protocol / semantic / evidence validation
    -> Completion Review
         accept -> commit candidate completion, summary and Memory Patch
         reject -> persisted feedback -> Decide
```

[Runner](../../packages/runtime/src/runner.ts) 的异步 Decide 校验链在现有证据校验之后调用必需的 [StepExecutor.reviewCompletion](../../packages/runtime/src/step-executor.ts)。Runtime 解析当前 Run 的引用事实及同一 Action 的来源记录。审查接受之前不提交候选决策、回复、完成状态或 Patch；接受后继续原有提交路径。

## 审查请求与契约

[LLMStepExecutor](../../packages/agent/src/llm-step-executor.ts) 使用当前绑定的 Decide Adapter 和[专用 Prompt](../../packages/agent/src/completion-review.ts)。输入含原始意图、完整会话、当前 Run 消息起点、冻结 Profile、获批任务、当前 lookup、候选和已提交引用证据。早期会话作为约束背景；以前的模型回复不是证明。必要输入整体参与既有预算，不裁剪后放行。

仅声明 `system_review_completion`。通过现有 strict/native 或 prompt_only 输出模式及 Contract AST 解码返回 [CompletionReviewResult](../../packages/contracts/src/model-output/completion-review.ts)：`accept` 或带非空反馈的 `reject`。没有业务工具、答案改写或默认放行。`summary` 保持现有字段并明确承载完整实际回复；Think 职责不变。

## 纠错、恢复与取消

拒绝转为有界 `RuntimeFeedback`，控制阶段仍为 Decide，来源为 `completion_review`。现有 `pendingModelRepair` 与 Trajectory 反馈保存拒绝原因；协议错误和拒绝共用三次阶段尝试。补充调查或重写候选后再次审查。审查传输失败按既有请求重试，同一候选无需重新生成。取消和提交失败沿用现有边界；未提交审查可能在恢复后重跑并产生额外费用。

## 诊断所有权

审查调用单独生成 callId；[ModelInputRecord](../../packages/runtime/src/model-input.ts) 增加 `completion_review` 标签，[Storage](../../packages/storage/src/json-file-model-input-store.ts) 原位更新当前 manifest 校验。请求与响应诊断和费用使用现有机制；审查不发布模型文本或函数参数，不建立业务 Observation、Section frame 或恢复阶段。公开输出仍来自接受的候选原文。

## 验证与限制

验证覆盖两种 Run 模式的拒绝、补充调查、原文提交与 Patch 隔离；协议/证据失败和拒绝共用上限；取消恢复、重试、保存失败、非法输出、超预算、输入记录、流隔离和指标归约。固定正反候选经旧结构/引用门控和当前生产审查配对比较，每项三次。该评测衡量完成审查判断及新增成本，不估计端到端成功率。模型仍可能误判；全会话和必要引用正文过长时审查会失败。
