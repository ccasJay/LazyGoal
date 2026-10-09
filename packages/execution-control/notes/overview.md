# 执行控制

本包提供跨模块中止和暂时性模型故障的轻量契约，不拥有 Runtime 的状态或重试次数。

## 取消与失败

[ExecutionControl 与 ExecutionAbortedError](../src/execution-control.ts) 使调用方在开始新工作前检查取消。取消作为控制流传播，不写成失败 Step；[TransientModelRequestFailure](../src/model-request-failure.ts) 标示供应商限流、连接或超时等可分类的暂时性请求故障。是否重试、恢复或提交事实由 Runtime 决定。
