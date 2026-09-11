# 容器化沙箱 ACP 评测样板代码库

本分册提供了接入典型容器化评测基准（Docker + 容器内 Worker + 宿主 ACP 控制器）的完整代码骨架与标准接口契约。

---

## 1. 标准目录骨架

每个遵循隔离架构的 Benchmark 均应位于 `benchmarks/<benchmark_name>/`，且各文件职责如下：

```text
benchmarks/<benchmark_name>/
├── manifests/            # 静态任务定义或本地烟雾测试用例 (JSON/JSONL)
├── src/
│   ├── index.ts          # 统一导出入口
│   ├── types.ts          # 领域契约、任务定义与评测结果类型
│   ├── dataset.ts        # 数据集加载、解析与烟雾任务过滤
│   ├── environment.ts    # Docker 隔离环境定义与产物收集 (EnvironmentSpec)
│   ├── worker.ts         # 打包注入容器的 Worker 入口（含工具与 ACP 握手）
│   ├── evaluator.ts      # 判定逻辑、答案比较与 AttemptRecorder 适配
│   └── runner.ts         # 单任务与批量任务评测编排器
├── test/
│   ├── dataset.test.ts   # 离线解析与契约单元测试
│   └── runner.test.ts    # Mock 隔离测试与状态流转测试
├── README.md             # Benchmark 介绍、CLI 命令与快速验证示例
└── tsconfig.json         # 独立构建配置（继承根配置）
```

---

## 2. Worker 骨架 (`src/worker.ts`)

Worker 是运行在 Docker 容器内部的核心执行实体，必须处理提示词内嵌渲染、工具状态流转及主入口自启动：

```ts
import { fileURLToPath, pathToFileURL } from "node:url";
import { createEmbeddedPromptRenderer } from "@lazygoal/agent";
import type { AgentDecision, ToolDefinition } from "@lazygoal/agent";

/**
 * 编译期由 worker-builder (esbuild) 注入的提示词模板内存字典。
 */
declare const __lazygoalPromptAssets: Record<string, string> | undefined;

/**
 * Benchmark 专用终结状态机。
 */
export class BenchmarkTerminationState {
  private submittedAnswer: string | null = null;

  public submit(answer: string): void {
    this.submittedAnswer = answer;
  }

  public get isSubmitted(): boolean {
    return this.submittedAnswer !== null;
  }

  public get answer(): string | null {
    return this.submittedAnswer;
  }
}

/**
 * 初始化内嵌提示词渲染器。
 */
export function createBenchmarkPromptRenderer() {
  const assets = typeof __lazygoalPromptAssets !== "undefined"
    ? __lazygoalPromptAssets
    : undefined;

  if (!assets) {
    throw new Error("Worker 内部未检测到 __lazygoalPromptAssets 提示词资产，请检查 buildBenchmarkWorker 配置");
  }

  return createEmbeddedPromptRenderer(assets);
}

/**
 * 构造提交答案专用的终结工具。
 */
export function createSubmitAnswerTool(state: BenchmarkTerminationState): ToolDefinition {
  return {
    name: "submit_answer",
    description: "提交当前任务的最终答案并结束任务。在得出确切结论后调用此工具。",
    parameters: {
      type: "object",
      properties: {
        answer: {
          type: "string",
          description: "最终确切答案，不包含额外闲聊或思考过程"
        }
      },
      required: ["answer"]
    },
    execute: async (args: { answer: string }) => {
      state.submit(args.answer);
      return {
        output: `答案已成功记录: "${args.answer}"。系统将在下一步完结任务。`
      };
    }
  };
}

/**
 * 响应 Agent 决策流转。
 * 
 * @remarks
 * 当 Agent 已经调用过 submit_answer 时，下一轮规划必须强制流转为 complete 终态。
 */
export function resolveNextDecision(
  state: BenchmarkTerminationState,
  plannedDecision: AgentDecision
): AgentDecision {
  if (state.isSubmitted) {
    return {
      type: "complete",
      completionEvidence: []
    };
  }
  return plannedDecision;
}

/**
 * Worker 守护进程主流程。
 */
export async function runBenchmarkWorker(): Promise<void> {
  const terminationState = new BenchmarkTerminationState();
  const promptRenderer = createBenchmarkPromptRenderer();

  // 1. 初始化标准输入输出的 ACP 传输通道 (如 JSON-RPC / StdioTransport)
  // 2. 注册系统内置文件/Shell工具及 submitAnswer 工具
  // 3. 监听 ACP 控制命令并驱动 Goal Loop
}

/**
 * 自启动判定保护（避免容器内由于路径解析不一致导致不执行直接退出）。
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
    process.stderr.write(`[Worker Fatal] ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
}
```

---

## 3. 环境与产物收集契约 (`src/environment.ts`)

定义 Docker 隔离沙箱参数及与持久化适配器严格对齐的产物回收逻辑：

```ts
import { Buffer } from "node:buffer";
import path from "node:path";
import type { EnvironmentSpec } from "../src/isolated-environment.js";

export interface BenchmarkEnvironmentConfig {
  benchmarkId: string;
  taskId: string;
  runId: string;
  baseImage?: string;
  timeoutMs?: number;
}

/**
 * 将标识符转换为符合文件系统与持久化适配器契约的安全 base64url 片段。
 */
export function toSafePathSegment(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

/**
 * 构建 Benchmark 沙箱环境规约。
 */
export function createBenchmarkEnvironmentSpec(
  config: BenchmarkEnvironmentConfig
): EnvironmentSpec {
  const { benchmarkId, taskId, runId, baseImage } = config;

  return {
    // 基础容器工作目录
    workdir: "/workspace",
    // 基础镜像（支持外部预置镜像传入，使用条件展开满足 exactOptionalPropertyTypes）
    ...(baseImage !== undefined ? { baseImage } : { baseImage: "node:20-slim" }),
    // 产物收集钩子：严格按照 base64url 格式定位容器内 /opt/lazygoal/state
    collectArtifacts: async ({ copyFromContainer, targetDir }) => {
      const bSeg = toSafePathSegment(benchmarkId);
      const tSeg = toSafePathSegment(taskId);
      const rSeg = toSafePathSegment(runId);

      const containerSnapshotDir = `/opt/lazygoal/state/${bSeg}/${tSeg}/${rSeg}`;
      try {
        await copyFromContainer(containerSnapshotDir, path.join(targetDir, "state"));
      } catch {
        // 容错：若任务未生成持久化状态（例如沙箱极早期失败），记录告警但不阻塞评测总结
      }
    }
  };
}
```

---

## 4. 评测执行流编排 (`src/runner.ts`)

借助 `benchmarks/src/` 的核心组件装配沙箱、编译 Worker、发起 ACP 连接并流转执行：

```ts
import path from "node:path";
import { buildBenchmarkWorker } from "../src/worker-builder.js";
import { IsolatedEnvironment } from "../src/isolated-environment.js";
import { HeadlessCompositionRoot } from "../src/headless-composition-root.js";
import { evaluateAttempt } from "./evaluator.js";
import { createBenchmarkEnvironmentSpec } from "./environment.js";
import type { BenchmarkTask, BenchmarkRunResult } from "./types.js";

export interface RunTaskOptions {
  task: BenchmarkTask;
  outputDir: string;
  baseImage?: string;
  maxSteps?: number;
}

/**
 * 执行单个 Benchmark 评测任务。
 */
export async function runBenchmarkTask(options: RunTaskOptions): Promise<BenchmarkRunResult> {
  const { task, outputDir, baseImage, maxSteps = 30 } = options;
  const benchmarkId = "gaia";
  const runId = `run-${Date.now()}`;

  // 1. 编译并打包 Worker（嵌入 System Prompt 模板）
  const workerBundle = await buildBenchmarkWorker({
    entrypoint: path.resolve(__dirname, "./worker.ts"),
    embedPromptAssets: true
  });

  // 2. 声明沙箱环境规约
  const envSpec = createBenchmarkEnvironmentSpec({
    benchmarkId,
    taskId: task.id,
    runId,
    ...(baseImage !== undefined ? { baseImage } : {})
  });

  // 3. 启动隔离容器沙箱
  const env = await IsolatedEnvironment.create(envSpec);
  try {
    // 将打包后的 worker.mjs 注入容器
    await env.injectFile(workerBundle.outputPath, "/opt/lazygoal/worker.mjs");

    // 4. 启动容器内 Worker 并建立 ACP 通信
    const acpClient = await env.startWorker({
      command: ["node", "/opt/lazygoal/worker.mjs"],
      env: {
        LAZYGOAL_BENCHMARK_ID: benchmarkId,
        LAZYGOAL_TASK_ID: task.id
      }
    });

    // 5. 使用 HeadlessCompositionRoot 驱动评测执行
    const runtime = new HeadlessCompositionRoot({
      acpClient,
      maxSteps,
      instruction: task.question
    });

    const executionSummary = await runtime.advanceUntilCompletion();

    // 6. 判定评测得分并沉淀 Attempt 记录
    const evaluation = evaluateAttempt({
      task,
      submittedAnswer: executionSummary.submittedAnswer,
      executionSummary
    });

    return {
      taskId: task.id,
      runId,
      status: evaluation.isCorrect ? "PASSED" : "FAILED",
      score: evaluation.score,
      details: evaluation
    };
  } finally {
    // 7. 回收产物并销毁容器
    await env.collectArtifacts(path.join(outputDir, task.id));
    await env.dispose();
  }
}
```

---

## 5. 判定器与 Attempt 记录契约 (`src/evaluator.ts`)

负责客观对比模型产出与标准答案，并记录结构化日志：

```ts
import { AttemptRecorder } from "../src/attempt-recorder.js";
import type { BenchmarkTask } from "./types.js";

export interface EvaluationInput {
  task: BenchmarkTask;
  submittedAnswer?: string | null;
  executionSummary: Record<string, unknown>;
}

export interface EvaluationResult {
  isCorrect: boolean;
  score: number;
  expectedAnswer: string;
  actualAnswer: string;
  feedback: string;
}

/**
 * 规范化对比答案（支持去除首尾空格、大小写不敏感及数值误差比较）。
 */
export function normalizeAnswer(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * 评估单次任务尝试并写入持久化记录。
 */
export function evaluateAttempt(input: EvaluationInput): EvaluationResult {
  const { task, submittedAnswer } = input;
  const actual = submittedAnswer ?? "";
  const expected = task.groundTruth;

  const isCorrect = normalizeAnswer(actual) === normalizeAnswer(expected);
  const score = isCorrect ? 1.0 : 0.0;

  const result: EvaluationResult = {
    isCorrect,
    score,
    expectedAnswer: expected,
    actualAnswer: actual,
    feedback: isCorrect ? "答案完全一致" : `答案不匹配，预期: ${expected}，实际: ${actual}`
  };

  return result;
}
```

