---
name: lg-harness2-optimization
description: "在 LazyGoal 仓库中执行 Harness2 双轨变异优化循环（Profile 提示词轨与 Framework 组件轨协同演化）时使用。涵盖从预检启动、/schedule 定时巡检、Bad Case 深入归因、Editor 框架优化即时落地、高分种子继承到终态交付的全流程工作流。"
---

# LazyGoal Harness2 双轨优化变异工作流 (Harness2 Optimization Loop)

指导 Agent 在隔离的 `git worktree` 环境中自主推进完整的 Harness2 双轨变异优化闭环。与传统只针对 Prompt 单轨微调的优化器不同，Harness2 具备 **Profile / Prompt 提示词轨** 与 **Framework 底层组件轨** 的双轨协同进化能力。本 Skill 规范了从预检拉起、后台自动化巡检、Editor 诊断代码即时落地、种子继承到下一轮变异启动的标准 SOP。

---

## 一、 核心概念与双轨进化机制

1. **双轨演化协同**：
   - **Profile / Prompt 轨**：领域 System Prompt、冻结 Instructions 集合与 `templateOverrides` 动态模板；由 Editor 模型针对未解用例进行策略级、工具选择与前置验证约束的变异；
   - **Framework 组件轨**：由 Editor 模型反思分析多轮沉淀的系统性瓶颈（如字面转义失配、近邻提示单薄、命令家族误熔断、响应外壳冗余），在 `exports/framework-improvements.json` 中交付底层代码优化方案。
2. **闭环演进路径**：
   $$\text{Baseline 评测} \longrightarrow \text{Bad Case 深度归因} \longrightarrow \text{Editor 诊断生成候选} \longrightarrow \text{Probe 探测} \longrightarrow \text{Compose 验证集终评} \longrightarrow \text{晋级导出} \longrightarrow \text{框架优化即时落地} \longrightarrow \text{继承进入下一轮}$$
3. **实证跃升**：
   在 SWE-bench 评测中，双轨协同演化实现了跨量级的得分飞跃（`0.0345` $\to$ `0.1742` $\to$ `0.1948` $\to$ `0.2685` $\to$ **`0.2774`**，均分提升超 700%），证明底层工具自愈与高维提示词约束的组合威力。

---

## 二、 架构硬红线与隔离纪律

1. **Worktree 独立隔离**：
   整个优化演化与代码落地必须在独立的 `git worktree`（如 `feature/harness2-integration` 或专用变异分支）中执行，严禁在主开发分支（`dev` / `main`）就地执行长时间变异。
2. **`packages/runtime` 零修改铁律**：
   **严禁修改 `packages/runtime` 源码**。Runtime 调度循环、状态机转移与持久化契约具有最高稳定性；所有自愈与优化只允许发生在：
   - [`packages/tools`](../../../packages/tools)：工具层输入归一化、自愈容错、多行代码块提示、熔断账本脱敏；
   - [`packages/model-response`](../../../packages/model-response)：别名对齐、外壳解包、stray fields（如 `cursor`）安全修剪；
   - [`packages/model-execution`](../../../packages/model-execution)：阶段反馈转换、未声明工具精准切换指引；
   - [`packages/prompt-bundle`](../../../packages/prompt-bundle)：模板协议硬收敛；
   - [`benchmarks/`](../../../benchmarks)：宿主 RPC 指数退避重试与沙箱环境适配。
3. **严格的全量静态与回归检查**：
   任何框架代码修改落地后，必须按顺序执行以下三级验证：
   - 目标包独立单测：`npx tsx --test packages/<pkg>/test/*.test.ts`
   - 文档检查覆盖：`node scripts/check-docs.mjs`（46 模块说明 100% 通过）
   - 架构依赖边界：`node scripts/check-dependencies.mjs`（275 文件依赖 100% 绿灯）
4. **规范的中文 Conventional Commit**：
   提交信息必须精炼、语义准确，严格遵循格式：`feat(scope): 精确的功能描述` 或 `fix(scope): 精确的修复描述`。

---

## 三、 标准操作工作流 (Step-by-Step SOP)

### 阶段 1：构建 Request 配置与 Preflight 预检

在 worktree 下的 `scratch/` 目录中生成当前轮次的请求配置（例如 `scratch/h2-swebench-10-round17-seq-request.json`）：

```json
{
  "protocol": "lazygoal-harness2-run@1",
  "runId": "h2-swebench-10-round17-seq",
  "mode": "sequential",
  "baseProfileId": "swebench-acp-profile",
  "benchmark": {
    "id": "swebench",
    "manifestPath": "<absolute-path-to-manifest.json>",
    "trainTaskIds": ["astropy__astropy-13398", "astropy__astropy-13453", "astropy__astropy-13033", "astropy__astropy-13236", "astropy__astropy-13977"],
    "validationTaskIds": ["astropy__astropy-13579", "astropy__astropy-14182", "astropy__astropy-12907", "astropy__astropy-14096", "astropy__astropy-14309"]
  },
  "agentModel": { "configId": "default", "modelId": "gemini-3.5-flash-lite" },
  "editorModel": { "configId": "gepa-reflection", "modelId": "deepseek-v4.1-flash" },
  "budget": {
    "maxIterations": 2,
    "proposalsPerIteration": 2,
    "maxConcurrency": 1,
    "mode": "sequential"
  },
  "initialCandidate": {
    "candidateId": "cand-round17-seed",
    "baseProfileId": "swebench-acp-profile",
    "systemPrompt": "<继承上一轮导出的最优 systemPrompt>",
    "instructions": ["<继承上一轮导出的最优 instructions>"],
    "templateOverrides": {},
    "parentCandidateId": "cand-round16-seed",
    "scope": "framework",
    "hypothesis": "<本轮实装的框架优化点与预期收敛目标>",
    "targetFaultCodes": ["STRING_NOT_FOUND", "MAX_STEPS_EXCEEDED", "COMMAND_FAILED"],
    "frameworkEdits": []
  }
}
```

执行预检验证：
```bash
./bin/lazygoal.cjs harness2 preflight --request scratch/<request-file>.json
```
> [!IMPORTANT]
> 预检必须输出 `{"ok": true, "protocol": "lazygoal-harness2-preflight@1"}` 方可继续。若报错，优先修复 JSON Schema、数据集路径或模板可修改性声明。

---

### 阶段 2：后台启动与 `/schedule` 自动化巡检监控

1. **后台拉起运行**：
   使用 `run_command`（设置较小超时或自动转为后台任务）启动任务：
   ```bash
   ./bin/lazygoal.cjs harness2 start --request scratch/<request-file>.json
   ```
2. **挂载 10 分钟定时监控**：
   立即使用 `schedule` 工具注册单次巡检闹钟，设置 `DurationSeconds: 600`：
   - Prompt: `"检查第N轮变异优化任务 <runId> 的执行状态与最新进度并汇报"`
3. **巡检 SOP 与进度看板**：
   当定时器唤醒或重要消息到达时，按如下路径获取实况：
   - 检查任务进程状态：调用 `manage_task(action: 'status', taskId: '<id>')` 确认状态为 `RUNNING`；
   - 读取运行状态：读取 `~/.lazygoal/workspaces/<hash>/harness2/runs/<runId>/state.json`；
   - 提取正在运行题目的实时轨迹：查找 `runtime/.../trajectories/*.jsonl`，分析最新步骤的工具调用、是否存在 `STRING_NOT_FOUND` 或 `COMMAND_FAILED`；
   - 查看补丁输出：检查任务目录下的 `*.patch` 大小与有效性；
   - 输出结构化进度汇报（包含当前题号、完成题数、有效 Patch 状态、已获分数）；
   - 若任务未完成，**立即重新注册下一个 600 秒定时器**，维持无缝监控。

---

### 阶段 3：Editor 框架优化即时落地闭环

当一轮运行状态达到 `completed`，或产生新的晋级候选（`promoted: true`）时，立即启动框架组件自愈落地：

1. **提取 Editor 产物**：
   读取 `~/.lazygoal/workspaces/<hash>/harness2/runs/<runId>/exports/`：
   - `framework-improvements.json`：包含针对具体包、文件和函数的优化伪代码与设计意图；
   - `improvement-library.json`：包含历史所有被证实有效或无效的变异经验条目；
   - `best-profile.json`：最新晋级的最优 Profile 种子。
2. **实装框架代码**：
   根据 `framework-improvements.json` 的建议，在 worktree 内对底层源码进行修改。典型修改位置：
   - **`edit_file` 转义引号解包与代码块提示**：[`packages/tools/src/edit-file.ts`](../../../packages/tools/src/edit-file.ts)
   - **`bash` 退出码与缺失测试用例分类**：[`packages/tools/src/bash.ts`](../../../packages/tools/src/bash.ts)
   - **系统工具别名自动容错映射**：[`packages/model-response/src/stage-response.ts`](../../../packages/model-response/src/stage-response.ts)
   - **`cursor` 翻页元字段自动修剪**：[`packages/model-response/src/stage-response.ts`](../../../packages/model-response/src/stage-response.ts)
3. **配套编写回归测试**：
   在相应的测试文件（如 `packages/tools/test/edit-file.test.ts`）中增加单元测试，验证自愈与容错行为。
4. **通过全量验证并提交 Git**：
   ```bash
   npx tsx --test packages/<pkg>/test/*.test.ts
   node scripts/check-docs.mjs
   node scripts/check-dependencies.mjs
   git add <modified-files>
   git commit -m "feat(<pkg>): 精确描述本轮落实在框架上的优化能力"
   ```

---

### 阶段 4：继承最优种子启动下一轮变异

1. 读取 `exports/best-profile.json`，将其中的 `systemPrompt` 与 `instructions` 提取出来；
2. 构造下一轮请求配置 `scratch/h2-swebench-10-round<N+1>-seq-request.json`：
   - `runId`: 更新轮次编号；
   - `initialCandidate`: 以本轮胜出的 Profile 作为初始种子，`parentCandidateId` 指向本轮最优候选；
   - `hypothesis`: 明确记录新实装的框架能力与本轮攻坚目标；
3. 执行 preflight 预检并通过后拉起 start，重新挂载 `/schedule` 监控，形成持续自我进化的上升螺旋。

---

### 阶段 5：任务终止与终态交付

当达到预定目标分数、或用户发出终止指令（如“这次任务完成后终止，汇报结果”）时：
1. 立即调用 `manage_task(action: 'kill')` 取消处于排队中的定时器，避免后续空转唤醒；
2. 读取最终生成的 `report.json`；
3. 汇总全景数据向用户做终态交付汇报：
   - 历史跨轮次均分演进曲线；
   - 训练集（Baseline）与盲测验证集（Compose）的单题得分与补丁详情；
   - 本轮实装代码的 Git 提交哈希与源文件链接；
   - 导出的最优种子路径与下一阶段建议。

---

## 四、 实战排错与防御模式矩阵

| 现象 / 故障码 | 根因诊断 | 标准防御 / 自愈落地方案 |
| :--- | :--- | :--- |
| **`STRING_NOT_FOUND` / `REPEATED_STRING_NOT_FOUND`** | 模型在 JSON 序列化中将代码双引号错误转义为 `\"`，或前序编辑改动了区域导致旧锚点失效 | 1. 在 `edit-file.ts` 中引入转义引号解包重试；<br>2. `findNearestLineHint` 提取 6 行真实代码块返回；<br>3. Profile 增加二次未命中强制改用 `write_file` 约束。 |
| **`REPEATED_COMMAND_BLOCKED` 误熔断** | 模型因缺少模块或打错测试文件名（退出码 4 / `no tests ran`），被粗暴记入重复执行失败账本 | 1. 在 `bash.ts` 中细分 `TEST_TARGET_MISSING`，排除出熔断账本；<br>2. 工作区文件发生有效编辑后自动重置失败账本。 |
| **`INVALID_LLM_RESPONSE` / `extra_field`** | 模型误以为工具支持分页传入了 `cursor` / `useDefaultCursor`，或遗漏了 `system_` 前缀 | 1. 在 `stage-response.ts` 中将 `cursor` 纳入 `KNOWN_STRAY_FIELDS` 自动 prune；<br>2. 支持 `find_tools` 自动对齐 `system_find_tools`。 |
| **`MODEL_PROVIDER_ERROR` (HTTP 400/429)** | 长上下文多轮交互后提供商偶发限流或网络抖动 | 在 `benchmarks/src/llm-rpc.ts` 中实装最多 8 次指数退避重试与抖动重试，透传真实错误细节。 |
| **Stage 重复启动崩溃** | 模型在已有活跃 Stage 时再次发送 `system_start_run_stage` | 1. 在 Profile Instructions 中写入 Stage 单次启动铁律；<br>2. 在 `stage-feedback.ts` 中对未授权系统工具调用生成精确切换指引。 |

---

## 五、 常用命令与速查路径

- **Harness2 CLI 入口**：`./bin/lazygoal.cjs harness2 [preflight|start|status|stop|report]`
- **运行目录根路径**：`~/.lazygoal/workspaces/<workspace-hash>/harness2/runs/<runId>/`
- **产物导出路径**：`~/.lazygoal/workspaces/<workspace-hash>/harness2/runs/<runId>/exports/`
- **查看正在运行的题目轨迹**：
  ```bash
  cat ~/.lazygoal/workspaces/<hash>/harness2/runs/<runId>/iter-<N>/probe-<M>/eval/evaluations/*/tasks/<taskId>/runtime/.../trajectories/*.jsonl
  ```
- **查看导出的最佳 Profile**：
  ```bash
  cat ~/.lazygoal/workspaces/<hash>/harness2/runs/<runId>/exports/best-profile.json
  ```
