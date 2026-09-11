# 本地/Sidecar 进程模式适配与裁剪指南

本指南用于指导无需 Docker 容器沙箱、直接在宿主机或借助本地伴随子进程（Sidecar）运行的评测基准接入（以 ALFWorld TextWorld 为典型代表）。

---

## 1. 架构模式对比与裁剪矩阵

| 关注维度 | 容器化 ACP 沙箱模式 (SWE-bench / GAIA) | 本地 / Sidecar 进程模式 (ALFWorld) |
| :--- | :--- | :--- |
| **隔离边界** | Docker 容器命名空间与网络隔离 | 本地 OS 子进程隔离或共享内存 |
| **Worker 部署** | esbuild 预编译为单文件并注入容器 `/opt/lazygoal/` | **无需 Worker 打包**，直接运行宿主 TypeScript 模块 |
| **提示词渲染** | 必须由宿主静态嵌入并注入 `__lazygoalPromptAssets` | 直接使用包内默认渲染器从磁盘读取模板 |
| **通信通道** | Stdio ACP 协议挂载至容器标准流 | TCP Socket / 本地 IPC / CLI Stdio |
| **产物回收** | `collectArtifacts` 从容器复制并处理 base64url | 直接在宿主输出目录中生成，无需文件转移 |
| **环境依赖** | Docker 镜像、系统依赖包、容器工作目录 | 本地 Python 虚拟环境、动态端口分配 |

---

## 2. Sidecar 进程生命周期管理

在本地模式中，评测任务通常依赖一个由 Python/C++ 驱动的交互式环境（如 TextWorld server、Game Engine 或本地 Mock 服务）。必须确保其生命周期受控，严禁产生僵尸孤儿进程。

### 标准进程管理模式

```ts
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";

export class LocalSidecarManager {
  private process: ChildProcess | null = null;
  private port: number = 0;

  /**
   * 探测并获取本地可用的空闲端口。
   */
  public async allocateFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address === "object") {
          const port = address.port;
          server.close(() => resolve(port));
        } else {
          reject(new Error("未能成功获取空闲端口"));
        }
      });
    });
  }

  /**
   * 启动本地伴随子进程。
   */
  public async start(command: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<number> {
    this.port = await this.allocateFreePort();

    this.process = spawn(command, [...args, "--port", String(this.port)], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env }
    });

    // 监听意外退出
    this.process.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        process.stderr.write(`[Sidecar Exit] 进程异常退出，退出码: ${code}\n`);
      }
    });

    // 健康检查与存活轮询
    await this.waitForReady(this.port, 5000);
    return this.port;
  }

  /**
   * 等待 Sidecar 端口就绪。
   */
  private async waitForReady(port: number, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        await new Promise<void>((resolve, reject) => {
          const socket = net.createConnection({ port, host: "127.0.0.1" });
          socket.on("connect", () => {
            socket.end();
            resolve();
          });
          socket.on("error", reject);
        });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw new Error(`Sidecar 在 ${timeoutMs}ms 内未能在端口 ${port} 成功就绪`);
  }

  /**
   * 优雅退出与资源清理。
   */
  public async stop(): Promise<void> {
    if (!this.process) return;

    const proc = this.process;
    this.process = null;

    if (proc.exitCode !== null) return;

    proc.kill("SIGTERM");

    // 给予 2 秒宽限期，超时后强制 SIGKILL
    const timeout = setTimeout(() => {
      if (proc.exitCode === null) {
        proc.kill("SIGKILL");
      }
    }, 2000);

    await new Promise<void>((resolve) => {
      proc.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}
```

---

## 3. 本地 Runner 编排与裁剪要点

在本地模式中，无需调用 `buildBenchmarkWorker` 打包，也无需 `IsolatedEnvironment`。评测编排器直接装配 Tool 并启动：

```ts
import { HeadlessCompositionRoot } from "../src/headless-composition-root.js";
import { LocalSidecarManager } from "./sidecar.js";
import type { BenchmarkTask } from "./types.js";

export async function runLocalBenchmarkTask(task: BenchmarkTask, outputDir: string) {
  const sidecar = new LocalSidecarManager();
  
  try {
    // 1. 启动本地伴随服务
    const port = await sidecar.start("python", ["-m", "benchmark_server"], {
      TASK_CONFIG: task.configPath
    });

    // 2. 构造本地 Tool（通过 HTTP/Socket 代理到 Sidecar）
    const localTools = [
      createProxyActionTool(port),
      createLocalSubmitTool()
    ];

    // 3. 在宿主内直接使用 HeadlessCompositionRoot 启动目标执行循环
    const runtime = new HeadlessCompositionRoot({
      instruction: task.prompt,
      tools: localTools,
      outputDir // 持久化直接写入宿主目录
    });

    return await runtime.advanceUntilCompletion();
  } finally {
    // 4. 确保必定清理 Sidecar 进程
    await sidecar.stop();
  }
}
```

---

## 4. 何时选用本地/Sidecar 模式？

- **优先选用本地模式**：
  1. 评测环境本身轻量，不涉及任意危险系统命令执行（如纯算法、文本交互环境、只读静态分析）。
  2. 任务无需复杂的 OS 级依赖安装或定制化 Linux 发行版环境。
  3. 需要极致的启动速度（省去 Docker 容器创建与镜像拉取耗时）。
- **禁止选用本地模式**：
  1. 评测任务涉及编译、运行不受信任的用户代码或 Shell 脚本（必须使用容器化沙箱模式）。
  2. 评测任务依赖特定的系统环境、特定 Python/C++ 库或复杂宿主补丁（如 SWE-bench 依赖不同的 Git 仓库检出与系统库）。

