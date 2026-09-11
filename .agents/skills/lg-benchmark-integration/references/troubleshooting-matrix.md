# Benchmark 接入踩坑诊断与排错矩阵

本矩阵汇总了在 LazyGoal 仓库中接入新评测基准（如 SWE-bench、GAIA、ALFWorld）时最常出现的七大陷阱、根因机制与标准化排查修复代码。

---

## 快速速查表

| 陷阱特征 | 常见报错信息 | 根因分类 | 核心修复原则 |
| :--- | :--- | :--- | :--- |
| **Worker 瞬间退出** | `ACP connection closed` / `Process terminated unexpectedly` | 自启动判定或 Shebang 缺陷 | 使用 `process.argv[1].endsWith("worker.mjs")` 判定入口 |
| **Prompt 模板缺失** | `ENOENT: no such file or directory, open '.../*.njk'` | 容器无宿主源码挂载 | 编译期打包 `__lazygoalPromptAssets` 并在 Worker 内存渲染 |
| **产物收集丢失** | 评测完成但 report/snapshot 目录为空 | 持久化路径与 ID 编码不一致 | 严格使用 `Buffer.from(id, 'utf8').toString('base64url')` 拼接目录 |
| **本地 Docker 镜像报错** | `pull access denied for ... repository does not exist` | 未预检本地缓存直接 pull | `docker image inspect` 优先，本地命中时不触发远端拉取 |
| **提交后循环不终结** | Step 达到上限或报 Timeout，不断重复提交 | 决策循环未向终态流转 | 提交工具标记命中后，下一轮强制决策流转为 `complete` |
| **严格可选属性类型报错** | `Type 'undefined' is not assignable to type ...` | `exactOptionalPropertyTypes: true` | 对象字面量禁止直接赋 `undefined`，必须使用条件解构展开 |
| **架构依赖检查红线** | `Dependency rule violation: benchmarks/A -> benchmarks/B` | 跨 Benchmark 水平引用 | 剥离私有引用，所有跨 Benchmark 共享必须下沉至 `benchmarks/src/` |

---

## 详细陷阱与标准修复代码

### 陷阱 1：Worker 进程瞬间退出，宿主报告 ACP 提前断开

- **现象**：
  Runner 在创建 Docker 容器并启动 Worker 进程后，立即抛出 `ACP connection closed` 或 `Worker exited with code 0 / 1`，无法建立初始化握手。
- **根因**：
  Worker 源码被 `buildBenchmarkWorker`（esbuild）打包后，输出单文件为 `worker.mjs`。如果 Worker 源码底部判断入口模块使用的是传统的 `import.meta.url === pathToFileURL(process.argv[1]).href`，在容器内由 `node /opt/lazygoal/worker.mjs` 调用时，由于路径规范化、符号链接或绝对路径偏差，可能导致条件为 `false`，脚本不执行任何操作直接平稳退出。
- **正解代码**：
  在 Benchmark 的 `src/worker.ts` 底部，必须使用多重兼容的主入口检查：
  ```ts
  import { fileURLToPath, pathToFileURL } from "node:url";

  /**
   * 判断当前模块是否作为 CLI/进程主入口直接执行。
   */
  export function isDirectExecution(argv1 = process.argv[1]): boolean {
    if (!argv1) return false;
    return (
      argv1.endsWith("worker.mjs") ||
      argv1.endsWith("worker.ts") ||
      argv1.endsWith("worker.js") ||
      import.meta.url === pathToFileURL(argv1).href
    );
  }

  if (isDirectExecution()) {
    runBenchmarkWorker().catch((error) => {
      // 必须将错误输出至 stderr 便于宿主捕获沙箱启动失败堆栈
      process.stderr.write(`Worker fatal error: ${error instanceof Error ? error.stack : String(error)}\n`);
      process.exit(1);
    });
  }
  ```

---

### 陷阱 2：容器内报错 `ENOENT: no such file or directory, open '.../templates/*.njk'`

- **现象**：
  Worker 正常启动，但在 Agent 初始化或渲染 System Prompt 时崩溃，报错找不到模板文件。
- **根因**：
  隔离容器内部通常只被注入打包后的单个 `worker.mjs` 和任务所需工作区，**宿主机的 `node_modules`、`packages/agent/prompts/` 根本未挂载至容器中**。在 Worker 内部尝试通过 `fs.readFile` 加载模板必然引发 `ENOENT`。
- **正解代码**：
  必须采用“宿主内嵌 -> Worker 内存渲染”两段式架构：
  1. **宿主打包时（`worker-builder.ts`）**：
     通过 `buildBenchmarkWorker({ ..., promptAssets })` 读取宿主机模板并注入宏变量 `__lazygoalPromptAssets`。
  2. **Worker 内部初始化时（`worker.ts`）**：
     使用 `createEmbeddedPromptRenderer()` 接管，直接从内存模板字典渲染：
     ```ts
     import { createEmbeddedPromptRenderer } from "@lazygoal/agent";

     // 声明注入的全局变量类型
     declare const __lazygoalPromptAssets: Record<string, string> | undefined;

     export function setupAgentRenderer() {
       const assets = typeof __lazygoalPromptAssets !== "undefined"
         ? __lazygoalPromptAssets
         : undefined;

       if (!assets) {
         throw new Error("Worker 打包异常：未能检测到嵌入的 __lazygoalPromptAssets 提示词资产");
       }

       return createEmbeddedPromptRenderer(assets);
     }
     ```

---

### 陷阱 3：持久化快照与执行轨迹无法回收（Artifacts 丢失）

- **现象**：
  任务评测完成并报告成功，但在宿主机指定的 `--output-dir` 中未发现该任务的 Snapshot、Trajectory 或 Trace 文件。
- **根因**：
  `JsonFileBenchmarkPersistenceAdapter` 内部为了文件系统路径安全，对 `benchmarkId`、`taskId`、`runId` 等标识符均使用了 `base64url` 编码构造子目录。若 `EnvironmentSpec.collectArtifacts` 回收容器内 `/opt/lazygoal/state` 时，直接使用未编码的原始 ID 拼接容器路径，就会导致复制目标不存在。
- **正解代码**：
  容器内路径拼接必须与持久化适配器的 `base64url` 规则严格对齐：
  ```ts
  export function toSafePathSegment(id: string): string {
    return Buffer.from(id, "utf8").toString("base64url");
  }

  // 在 EnvironmentSpec.collectArtifacts 中使用：
  const benchmarkSeg = toSafePathSegment(benchmarkId);
  const taskSeg = toSafePathSegment(taskId);
  const runSeg = toSafePathSegment(runId);

  const containerStatePath = `/opt/lazygoal/state/${benchmarkSeg}/${taskSeg}/${runSeg}`;
  // 从 containerStatePath 复制产物至宿主 targetDir
  ```

---

### 陷阱 4：Docker 执行预制镜像时报 `pull access denied`

- **现象**：
  在执行本地构建好的环境镜像（如 `lazygoal-gaia:latest`）时，Runner 报错：
  `Error response from daemon: pull access denied for lazygoal-gaia, repository does not exist or may require 'docker login'`
- **根因**：
  若在启动容器前无条件调用 `docker pull <image>`，对于尚未推送到公共仓库的本地镜像，Docker 守护进程会直接返回鉴权或未找到错误而中断执行。
- **正解代码**：
  遵循“本地 Inspect 优先”准则。在拉取前先探针本地镜像缓存：
  ```ts
  async function ensureImageAvailable(imageName: string): Promise<void> {
    const inspectResult = await runSubprocess(["docker", "image", "inspect", imageName]);
    if (inspectResult.exitCode === 0) {
      // 本地已存在该镜像，直接复用，切勿触发 remote pull
      return;
    }
    // 本地不存在时，才执行拉取
    const pullResult = await runSubprocess(["docker", "pull", imageName]);
    if (pullResult.exitCode !== 0) {
      throw new Error(`无法获取镜像 ${imageName}: ${pullResult.stderr}`);
    }
  }
  ```
  > [!TIP]
  > 当用户在 CLI 传入自定义 `--base-image` 时，通常代表该镜像内部已经预置好该基准的所有 Python/C++ 依赖，此时必须将 `installCommands` 默认置空，防止每次启动时重复执行耗时的 `pip install`。

---

### 陷阱 5：Agent 提交答案后无限等待或重复提交

- **现象**：
  Agent 在 Step 1 调用了基准专用的终结工具（如 `submit_answer`），工具返回成功，但 Agent 依然继续思考并发起无效操作，直到步数上限超时退出。
- **根因**：
  评测工具执行完成仅代表“答案已入库”，LazyGoal 的 ACP 控制循环依赖 Step 决策（Decision）的终态状态。如果 Worker 内部没有在提交后把 Agent 状态流转为终态，Runner 无法感知任务已完成。
- **正解代码**：
  在 Worker 的 Tool 状态机与 Step 决策中建立显式终态流转：
  ```ts
  let answerSubmitted = false;

  export const submitAnswerTool = {
    name: "submit_answer",
    description: "提交最终评测答案并结束任务",
    execute: async (args: { answer: string }) => {
      answerSubmitted = true;
      recordSubmittedAnswer(args.answer);
      return { output: "答案已提交，任务已就绪终结。" };
    }
  };

  // 在单步决策生成钩子中（或 Worker Decision Handler）：
  export function nextDecision(): AgentDecision {
    if (answerSubmitted) {
      return {
        type: "complete",
        // 显式传入空证据数组，触发正常 ACP 关闭
        completionEvidence: []
      };
    }
    // ... 正常规划决策
  }
  ```

---

### 陷阱 6：TypeScript 严格模式 `exactOptionalPropertyTypes: true` 报错

- **现象**：
  编写 Runner 或环境选项时，TypeScript 报错：
  `Type 'undefined' is not assignable to type 'string' with 'exactOptionalPropertyTypes: true'`
- **根因**：
  LazyGoal 根工程开启了 TypeScript 的最高严格模式。对于声明为 `foo?: string` 的接口，它只接受键不存在或者值为 `string`，**显式赋值 `{ foo: undefined }` 会被编译器拒绝**。
- **正解代码**：
  传递外部可选参数时，严禁使用扁平赋值，统一采用条件展开：
  ```ts
  // 错误写法：在 exactOptionalPropertyTypes 下报错
  const spec: EnvironmentSpecOptions = {
    workdir: "/workspace",
    baseImage: options.baseImage // 当 baseImage 为 undefined 时报错
  };

  // 正确写法：使用属性存在条件展开
  const spec: EnvironmentSpecOptions = {
    workdir: "/workspace",
    ...(options.baseImage !== undefined ? { baseImage: options.baseImage } : {}),
    ...(options.network !== undefined ? { network: options.network } : {})
  };
  ```

---

### 陷阱 7：架构依赖检查 `check:dependencies` 报错

- **现象**：
  执行 `pnpm run check:dependencies` 失败，报告跨目录依赖违规。
- **根因**：
  在 `benchmarks/gaia/` 内为了复用代码，直接写了 `import ... from "../swebench/..."`。
  根据仓库架构约束，各个 Benchmark 之间禁止产生任何水平依赖。
- **正解代码**：
  所有跨 Benchmark 共享的工具或逻辑必须抽象并提升至 `benchmarks/src/`（如 `worker-builder.ts`, `isolated-environment.ts`, `attempt-recorder.ts`, `headless-composition-root.ts`），并经过严格的单元测试后再由各 Benchmark 统一引用。

