---
feature: tua-bench-integration
status: active
summary: "TUA-Bench 通用终端代理评测套件，基于官方 Docker custom 镜像、声明式容器网络放行、bash_exec 工具与确定性 reward 评分"
source_spec: specs/tua-bench-integration/
distilled_at: 2026-09-20
reviewed_at: 2026-09-20
tags: [benchmark, tua-bench, terminal, bash, evaluation, container, acp]
authorities: [docs/architecture/README.md, benchmarks/tua-bench/src/environment-spec.ts, benchmarks/tua-bench/src/bash-exec-tool.ts, benchmarks/tua-bench/src/scoring.ts, benchmarks/tua-bench/src/worker-entry.ts]
---

# TUA-Bench Integration

## Purpose

- 将 TUA-Bench（通用终端代理评测基准）接入 LazyGoal 统一隔离执行环境，使 Agent 能在 ACP 容器沙箱内通过受控 `bash_exec` 命令完成全部 120 个终端任务，并使用官方确定性验证脚本评分。 [S1, S2, S8]

## Durable Decisions

- D1 — 官方 custom 镜像与声明式网络策略：TUA-Bench 统一采用官方预构建 custom Docker 镜像，每个任务独立执行容器内 setup 初始化；`IsolatedEnvironment` 引入可选 `resolveNetworkMode` 查询，按 `task.toml` 的 `network_mode` 声明值放行网络（`public` 为 `bridge`，其余均为 `none`），未声明 benchmark 保持默认安全隔离无网络。 [S1, S2, S3]
- D2 — 纯 JS 轻量任务清单加载与容错：通过 `smol-toml` 解析本地 TUA-Bench 仓库的 `task.toml` 与 `instruction.md` 构建 `TuaBenchManifest`，避免外部 Python 依赖；缺省字段提供安全默认值（timeout 600s、network none、verifier root），非法或缺失关键字段任务跳过并记警告。 [S1, S2, S4]
- D3 — 终端交互单一 `bash_exec` 工具规范：Worker 容器内注册唯一的 `bash_exec` 工具供 Agent 完成文档处理、系统配置与科学工作流等全部终端操作；工具遵循 `ToolObservation` 协议（成功返回 `output.stdout/stderr/exitCode`，失败返回 `COMMAND_FAILED` 或 `COMMAND_TIMEOUT`），并实施 100KB 有界截断与优雅进程组终止。 [S1, S2, S5]
- D4 — 确定性官方评分与无 LLM 独立 grade：评分在同一容器内以 `verifierUser` 运行官方 `tests/test.sh`，从 `/logs/verifier/reward.txt` 解析浮点 reward（`reward >= 1.0` 映射为 `passed: true`）；提供独立 `grade` 入口，支持在无 LLM 消耗下对已有 Attempt 产物重新打分与族级统计。 [S1, S2, S6]
- D5 — 统一 Headless 执行生命周期与严格 Wire 契约：任务执行遵循 LazyGoal 统一执行生命周期（未审批阶段产出 `task_proposal` 并由 `HeadlessCompositionRoot` 自动批准，再进入工具调用与 `complete` 终态宣告）；模型交互遵守严格模式 Wire 契约（必填的 required-nullable 字段如 `timeoutMs: null`、`workdir: null`）。 [S1, S2, S7, S8]

## Guardrails

- 严禁在生产运行时中硬编码对 TUA-Bench 镜像、路径或任务格式的依赖。 [S1, S2]
- 容器网络仅允许通过 `task.toml` 中显式声明为 `public` 的任务放行 `bridge` 模式，严禁 Agent 自主提权或任意任务逃逸无网络限制。 [S1, S2, S3]
- 评分必须以官方验证脚本输出的 `/logs/verifier/reward.txt` 为唯一事实源，严禁仅凭模型自述 `complete` 虚标成功。 [S1, S2, S6]
- 必须维持零跨评测基准依赖（Zero Cross-Benchmark Dependencies），`benchmarks/tua-bench` 严禁导入 `swebench`、`alfworld` 或 `gaia` 代码。 [S1, S2]

## Revisit When

- TUA-Bench 官方新增除 `bash_exec` 外的专用交互协议（如 GUI 或浏览器）时。
- 引入支持非 Docker 容器驱动（如 Podman 或虚拟机）时。
- TUA-Bench 评分机制升级支持分步细粒度打分或多轮对话评分时。

## Sources

- S1: `specs/tua-bench-integration/requirements.md`
- S2: `specs/tua-bench-integration/design.md`
- S3: `benchmarks/tua-bench/src/environment-spec.ts`
- S4: `benchmarks/tua-bench/src/manifest-loader.ts`
- S5: `benchmarks/tua-bench/src/bash-exec-tool.ts`
- S6: `benchmarks/tua-bench/src/scoring.ts`
- S7: `benchmarks/tua-bench/src/worker-entry.ts`
- S8: `benchmarks/tua-bench/src/worker-smoke.ts`
