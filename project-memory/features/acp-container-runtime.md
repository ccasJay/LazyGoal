---
feature: acp-container-runtime
status: active
summary: "SWE-bench 容器化评测运行时，基于 ACP 双通道 Mux 协议实现宿主与容器隔离、环境预检及产物回收"
source_spec: specs/acp-container-runtime/
distilled_at: 2026-09-10
reviewed_at: 2026-09-10
tags: [swebench, acp, container, isolation, multiplex, supervisor, preflight, recovery]
authorities: [docs/architecture/swebench.md, benchmarks/swebench/src/container.ts, benchmarks/swebench/src/supervisor.ts, benchmarks/swebench/src/worker-preflight.ts, benchmarks/swebench/src/result-recovery.ts]
---

# ACP Container Runtime

## Purpose

- 在 SWE-bench 评测体系中实现完全隔离的安全容器运行时，通过 ACP 协议双通道 Mux 解耦控制通道与宿主 LLM RPC 代理，在严格隔离的 Linux amd64 容器环境下运行 Headless Agent，并保障超时或异常下的有界产物回收与官方 Harness 评分。 [S1, S2, S8]

## Durable Decisions

- D1 — 宿主/容器边界与安全隔离：评测容器内运行 Linux amd64 Node 22 环境，只挂载或注入 `/testbed` 题目目录与 `/opt/lazygoal` 运行工件；容器严禁配置网络或挂载宿主凭据，所有模型通信通过宿主 RPC 代理转发。 [S1, S3]
- D2 — 有序有界的 ACP/LLM 双通道 Mux：在进程边界采用版本化外层 NDJSON 帧与单调递增 sequence 编码，实现 ACP 协议流与 LLM RPC 流在单一 stdio 上的严格分流，解耦背压并阻断粘包与字节交错。 [S1, S4]
- D3 — 确定性环境预检与 Worker 缓存：以 Linux/amd64 为目标提取固定 Node 22 运行时并校验 SHA-256；在任务启动前执行 Preflight 预检，检验 Conda testbed 环境与依赖库，失败零副作用退出。 [S1, S5]
- D4 — 统一 Headless Runtime 接入与 Trajectory 更新：Worker 内部装配 `HeadlessCompositionRoot`，以 metadata 隔离题目命名空间；通过 `TrajectoryStore` 装饰器将工具执行起止原子转化为稳定递增的 ACP Tool Update。 [S1, S6]
- D5 — 幂等清理与异常产物恢复：无论评测正常结题、步数耗尽还是异常中断，Supervisor 在有限宽限期内通过 `recoverSwebenchResult` 安全恢复 Snapshot、Trajectory 与 Trace 用量，并使用临时 Git 索引导出标准补丁后销毁容器。 [S1, S7]

## Guardrails

- 评测容器内严禁读取任何模型凭据或发起外部网络请求。 [S1, S3]
- SWE-bench 评测成功的唯一判据是官方 Harness Grading 判定的 `resolved`，严禁根据模型决策状态虚标成功。 [S1, S2]
- 宽限期结束后必须强制删除本次容器，严禁跨任务复用容器实例或泄露临时挂载。 [S1, S7]

## Revisit When

- 引入支持非 Docker 容器驱动（如 Apple Virtualization 虚拟机或 Podman）时。
- SWE-bench 官方升级多仓库依赖或支持非 Python 题目时。
- ACP 协议主版本升级（如推出 2.0 规范）时。

## Sources

- S1: `specs/acp-container-runtime/requirements.md`
- S2: `specs/acp-container-runtime/design.md`
- S3: `benchmarks/swebench/src/container.ts`
- S4: `benchmarks/swebench/src/supervisor.ts`
- S5: `benchmarks/swebench/src/worker-preflight.ts`
- S6: `benchmarks/swebench/src/acp-result-projection.ts`
- S7: `benchmarks/swebench/src/result-recovery.ts`
- S8: `docs/architecture/swebench.md`
