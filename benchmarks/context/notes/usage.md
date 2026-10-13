# 使用 Context Benchmark

先准备 Docker 和现有 LazyGoal 模型配置。代码与 shell 都在 Docker 中执行；
三个模型角色必须显式配置，凭据仍由 LazyGoal Home 管理，不进入场景或容器。

## 准备材料

按 [ContextScenario](../src/scenario.ts) 编写场景 JSON。它包含受控初始项目文件、
固定 stages、checkpointAfter、Profile、调用和时长预算、verifier 与 Judge rubric。
唯一容器工具是 context_shell。等待边界支持 blocked 和 ask_user；
ask_user 的回答按固定 questionId 声明，真实 requestId 在运行时读取。

配置文件的路径相对于配置文件目录：

```json
{
  "roles": {
    "capture": { "profile": "default" },
    "execution": { "profile": "default" },
    "judge": { "profile": "default" }
  },
  "scenarios": ["scenario.json"],
  "frozenCases": []
}
```

profile 指 LazyGoal 模型配置名称；每个角色也可声明 configFile 指定主 TOML 配置。
当前 Worker 接受 strict 或 prompt_only，不接受 two_stage。

## 采集与批准

```sh
lazygoal eval context capture --config context.json --task case-id
lazygoal eval context freeze --candidate /absolute/candidate
```

capture 打印候选目录和 reviewHash。检查该目录中的 scenario.json、checkpoint.json、
capture.json、project 和 state；采集成功不表示任务正确，也不表示用例已入库。

确认完整材料后，将打印的哈希作为批准对象：

```sh
lazygoal eval context freeze --candidate /absolute/candidate \
  --corpus /absolute/corpus --set challenge --version release-1 \
  --approve-hash <reviewHash> --approved-by <reviewer>
```

命令返回冻结用例目录。把它加入配置的 frozenCases，再执行：

```sh
lazygoal eval context run --config context.json --task case-id
```

默认输出到当前 workspace 的 LazyGoal Home benchmark runs 目录，可用 --output 覆盖。
逐组 group.json、attempt.json、judge.json 与 artifacts 提供完整追溯；
report.json 和 report.md 展示结果与成本。错误返回非零退出码，证据仍保留。
版本损坏会明确拒绝，不重新采集覆盖材料。

## 验证底座

在仓库根运行：

```sh
npm --prefix benchmarks run context:worker-smoke
npm --prefix benchmarks run context:model-smoke -- --config /absolute/context.json
```

第一条使用离线替身验证真实 Docker 恢复设施；第二条使用三个显式真实模型角色，
验证文件修改、跨 Run 续接、等待恢复和独立评分。两者不能互相替代。

smoke 的冻结动作只模拟受控测试审核，写入该次探针的隔离测试集合；不发布生产核心集或挑战集。
真实候选入库仍须通过 freeze 命令明确批准所审核的内容哈希。真实模型行为失败会保留报告并让探针返回非零。
