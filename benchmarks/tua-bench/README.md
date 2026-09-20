# TUA-Bench 终端评测适配

TUA-Bench 是基于真实终端环境的通用 Agent 评测基准，涵盖文档处理、邮件管理、网页信息检索以及工程科学工作流等终端任务。LazyGoal 通过统一容器隔离环境与 ACP 协议接入 TUA-Bench 官方预构建镜像与确定性评分验证脚本。

## 架构概览

- **沙箱镜像模式**：采用 `custom` 镜像模式，直接加载 TUA-Bench 官方预构建 Docker 镜像。
- **网络访问策略**：依据 `task.toml` 静态声明的 `network_mode` 决策容器网络隔离；缺省为 `--network none`，`public`（如 live-web 任务族）放行外部网络连接。
- **Agent 工具集**：Worker 内置单一 `bash_exec` 工具，提供命令超时保护与 100KB 有界输出截断。
- **评分协议**：在任务执行结束后于沙箱容器内运行官方 `tests/test.sh` 脚本，解析 `/logs/verifier/reward.txt`，`reward >= 1.0` 判定为 passed。

## 运行前置条件

1. Docker 守护进程处于运行状态。
2. 本地准备好 TUA-Bench 仓库并在其根目录完成环境与镜像预构建（`uv run setup-env`）。
3. 宿主配置支持的 LLM 凭据（当运行实际模型端到端评测时）。

## 核心接口与模块

- `manifest-loader.ts`：解析 `tasks/*/task.toml` 与 `instruction.md`，构建 `TuaBenchManifest`。
- `environment-spec.ts`：实现 `EnvironmentSpec`，处理自定义镜像、容器网络模式与评分产物回收。
- `bash-exec-tool.ts`：容器内终端 shell 执行工具。
- `worker-entry.ts`：TUA-Bench ACP Worker 容器执行大脑，内嵌 Prompt 模板与 RpcLlmAdapter。
- `scoring.ts`：官方 reward 解析与不消耗模型调用的独立 `grade` 入口。
- `adapter.ts`：适配 HeadlessCompositionRoot 的目标任务转换层。
- `eval.ts`：无头批量自动化评测入口，支持 `--task` 和 `--family` 过滤与中途持久化容错。

## 常用测试命令

```bash
# 运行 TUA-Bench 单元测试套件
npx tsx --test benchmarks/tua-bench/test/*.test.ts

# 运行依赖边界防护检查
npm run check:dependencies

# 运行统一全量回归
npm test
```
