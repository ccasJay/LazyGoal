# SWE-bench Evaluation

## 边界

[`eval swebench`](../../benchmarks/swebench/src/cli.ts) 是显式评测入口，使用固定
Verified Manifest、单题单次作答和官方 `swebench==4.1.0` 评分。普通 TUI 不加载
Python 或 Docker。配置与依赖预检通过后才构造模型 Adapter。
运行方式和产物说明见 [SWE-bench baseline](../../benchmarks/swebench/README.md)。

## 数据与执行

[`Python bridge`](../../benchmarks/swebench/python/bridge.py) 按数据集 revision 读取
固定实例，保存原始记录供官方 harness 使用；作答适配器只接收 issue、repo、
base commit、instance ID 和镜像引用，参考补丁及评分测试不进入 Agent 上下文。

[`Evaluator`](../../benchmarks/swebench/src/evaluation.ts) 顺序委托通用
[`HeadlessCompositionRoot`](../../benchmarks/src/headless-composition-root.ts)，
复用既有 Goal 生命周期、Trajectory 上下文、Storage 编解码与 Trace。Profile 固定
授权唯一的 `swebench_shell`，Runtime 的 Tool 校验和 Evidence Gate 仍然生效。

[`SwebenchContainer`](../../benchmarks/swebench/src/container.ts) 在官方 amd64
实例镜像中创建 `/testbed` 工作区并重置至 base commit。每题独立容器无网络、无
宿主挂载，有固定资源上限；所有模型 shell 操作只进入容器，文件修改跨调用保留，
shell 状态不保留。进程执行、中止与输出边界由专用
[`ProcessRunner`](../../benchmarks/swebench/src/process.ts) 管理。

## 结束与评分

Episode 关闭前导出相对原始 base commit 的最终 Git diff，再删除容器。模型停止、
步数耗尽和执行异常均尝试保留补丁；未能创建环境或导出补丁的题目单独记录，不重试。
`readOutcome` 不做评分。Evaluator 逐题保存补丁、预测和阶段报告后，才将预测交给
官方 harness 在新的干净环境评分；正式测试结果不反馈给本次作答。

成功事实仅来自官方 `resolved`，模型终态独立保存。报告的分母始终是完整 Manifest，
区分未运行、未提交、空补丁、未解决和评分错误；错误不得缩小分母。输出目录与
评分 run ID 每次独立，避免覆盖已有产物或命中旧预测的评分缓存。

Snapshot、Trajectory、Trace 位于本次输出目录的 `runtime/`；报告保存定位、模型
配置、Manifest/Profile 哈希、镜像 ID、补丁哈希、任务耗时和 token 用量。Root 抛出
时，评测级用量记录仍保留已发生的模型调用；缺失用量显式计数，不推算 token。

## 当前限制

第一版仅支持 Verified、固定 shell Profile、顺序单次作答和官方 amd64 镜像。
镜像 tag 为上游 `latest`，报告记录实际镜像 ID；跨运行比较需核对镜像一致性。
SIGINT/SIGTERM 清理本次容器并保存已有产物，但不支持从 Goal Snapshot 恢复容器。
预置五题 Astropy 清单只用于接入冒烟测试，不代表整体能力。
