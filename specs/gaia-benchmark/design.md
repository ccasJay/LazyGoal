# GAIA Benchmark 接入 设计

## 审批摘要

### 方案

在统一隔离环境上实现 `GaiaEnvironmentSpec`，使用 managed 镜像模式安装 Python 文件处理依赖。新增 `web_search`/`web_fetch` 宿主代理工具，通过 ACP 双通道路由到宿主执行网络请求。GAIA Worker 注册文件读取、网页工具和 `submit_answer` 提交工具。评分使用 GAIA 官方归一化精确匹配逻辑，独立 `grade` 入口不消耗模型调用。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 镜像策略 | managed 模式；GAIA 无官方评测镜像，需要 Python 文件处理库 | 复用 LazyGoal 基础镜像 + 安装层，与 ALFWorld 模式一致 |
| 网络工具路由 | 宿主代理；容器 `--network none` 不变，工具请求通过 ACP 转发宿主 | 安全约束不降级；网页操作受 Profile 工具授权控制 |
| 答案提交机制 | 容器内 `submit_answer` 工具写入结果文件 | 单次提交约束在 Worker 工具层实现；无需 ACP 协议扩展 |
| 评分算法 | GAIA 官方归一化精确匹配 | 与 HuggingFace 排行榜评分逻辑保持一致 |
| 数据集加载 | CLI `load` 子命令调用 HuggingFace Hub API | Gated Dataset 需要 access token；加载结果缓存在宿主目录 |

### 风险与待确认

- 风险等级：medium；理由：复用已验证的 `IsolatedEnvironment` 和 ACP 链路，新增宿主代理工具和文件处理安装层为增量扩展
- 关键操作：宿主代理工具需在 Profile 中明确授权 `web_search`/`web_fetch`
- 风险：文件处理安装层（openpyxl/python-docx/PyPDF2/pydub/ffmpeg）体积约 200-400MB，首次构建耗时；宿主搜索服务可靠性影响评测稳定性
- 待确认：无

## Overview

GAIA 是第三个消费统一隔离环境的 benchmark，与 SWE-bench（代码修复）和 ALFWorld（文本游戏）的区别在于：它是 QA 类任务，需要网络搜索和多格式文件处理，但答案是一个短字符串。

核心设计目标是验证统一基础设施对两个新能力的适配：宿主代理网络工具（容器无网络但 Agent 可搜索）和 managed 镜像上的多格式文件处理。（需求 1–3）

## Architecture

```text
eval gaia host
    |
    +-> GaiaDatasetLoader (HuggingFace Hub API + access token)
    |       |
    |       +-> manifest.json + attachments/
    |
    +-> WorkerBuilder (shared) -> cache/{source-lock-digest}/
    |
    +-> IsolatedEnvironment (shared, LazyGoal-owned)
            |
            +-- spec.resolveImage()  →  managed base + Python file libs
            |
            +-- security: no-network, cap-drop ALL, no-new-privileges
            |
            +-- docker cp -> /opt/lazygoal/{node,worker,manifest}
            |
            +-- spec.prepareEnvironment()
            |       +-- copyInto(attachments) -> /workspace/attachments/
            |       +-- write question.txt -> /workspace/
            |
            +-- docker exec -i -> WorkerProcess
            |       |
            |       +-- channel: acp <-> HeadlessCompositionRoot
            |       |       +-- tools: read_file, web_search, web_fetch, submit_answer
            |       |
            |       +-- channel: llm <-> HostLlmRpcServer <-> configured LLMAdapter
            |       |
            |       +-- web_search/web_fetch -> ACP tool call -> host execution
            |       |
            |       +-- submit_answer -> write /workspace/answer.json (once)
            |
            +-- spec.collectArtifacts()
            |       +-- copyOut(/workspace/answer.json)
            |
            +-- AttemptRecorder.commit() (shared)
            |
            +-- container rm (shared, guaranteed)
```

## Key Design Decisions

### 镜像策略

使用 managed 模式。GAIA 没有官方评测镜像，需要安装 Python 文件处理库来支持多格式附件：

```ts
const GAIA_MANAGED_INSTALL_COMMANDS = [
    "apt-get update && apt-get install -y --no-install-recommends " +
      "python-is-python3 python3 python3-pip ffmpeg && " +
      "rm -rf /var/lib/apt/lists/*",
    "python3 -m pip install --break-system-packages --no-cache-dir " +
      "openpyxl==3.1.5 python-docx==1.1.2 PyPDF2==3.0.1 " +
      "pydub==0.25.1 Pillow==11.2.1",
] as const;
```

与 ALFWorld 的 managed 模式一致。安装层可通过 Docker 层缓存加速后续运行。（需求 1.1）

### 宿主代理网页工具

```ts
interface WebSearchResult {
    readonly title: string;
    readonly url: string;
    readonly snippet: string;
}

interface WebSearchToolInput {
    readonly query: string;
    readonly maxResults?: number;  // 默认 10，上限 20
}

interface WebFetchToolInput {
    readonly url: string;
    readonly maxChars?: number;  // 默认 50000
}
```

`web_search` 和 `web_fetch` 注册为 LazyGoal 工具（`packages/tools/src/`），在 GAIA Worker 的 `HeadlessCompositionRoot` 中装配。容器内 Agent 调用这些工具时，工具执行请求通过 ACP 通道传递到宿主，宿主执行实际网络请求后返回结果。

宿主搜索实现使用可配置的搜索后端（初始实现使用 DuckDuckGo HTML 抓取或 Serper API），通过环境变量 `GAIA_SEARCH_BACKEND` 选择。`web_fetch` 使用 Node.js 内置 `fetch` 获取页面并转换为纯文本。

两个工具受 Profile 工具授权控制，未授权时 Agent 收到标准的工具拒绝响应。（需求 2.1–2.4）

### GAIA Worker 入口

GAIA Worker 入口（`benchmarks/gaia/src/worker-entry.ts`）与 SWE-bench 和 ALFWorld 分开构建，共享 `WorkerBuilder`。注册工具集：

| 工具 | 来源 | 用途 |
|---|---|---|
| `read_file` | `packages/tools` | 读取注入容器的附件文件 |
| `web_search` | `packages/tools`（新增） | 通过 ACP 搜索网页 |
| `web_fetch` | `packages/tools`（新增） | 通过 ACP 获取网页内容 |
| `submit_answer` | `benchmarks/gaia/src/` | 提交最终答案 |

`submit_answer` 将答案写入 `/workspace/answer.json`，格式为 `{ answer: string, taskId: string }`。工具内部使用文件锁（`O_EXCL` 创建标志）保证单次提交。提交后 Worker 向 ACP Client 发送 Session 完成信号。（需求 3.1–3.3）

### 答案评分

GAIA 的评分逻辑是归一化精确匹配。归一化步骤：

1. 转为小写
2. 去除冠词（a, an, the）
3. 去除标点符号
4. 压缩连续空格
5. 数字标准化（"1,000" → "1000"，"1.0" → "1"）
6. trim

评分函数为纯函数，不依赖外部服务。独立 `grade` 入口读取 `answer.json` 和 Manifest 中的 `expectedAnswer`，执行归一化比较后更新 `domainResult`。（需求 5.1–5.3）

### HuggingFace 数据集加载

```ts
interface GaiaManifestTask {
    readonly taskId: string;
    readonly question: string;
    readonly expectedAnswer: string | null;  // test split 无答案
    readonly level: 1 | 2 | 3;
    readonly split: "validation" | "test";
    readonly attachments: readonly string[];  // 相对于 dataRoot 的路径
}

interface GaiaManifest {
    readonly tasks: readonly GaiaManifestTask[];
    readonly dataRoot: string;
    readonly source: "huggingface";
    readonly loadedAt: string;  // ISO 8601
}
```

CLI `load` 子命令通过 HuggingFace Hub API 下载 GAIA Gated Dataset（`gaia-benchmark/GAIA`，2023 版 validation 和 test split）。下载流程：

1. 使用 `HF_TOKEN` 环境变量认证
2. 下载 JSONL 元数据和附件文件到指定目录
3. 构建 `GaiaManifest` 写入 `manifest.json`

附件文件保持原始目录结构（`attachments/{task_id}/{filename}`）。`GaiaEnvironmentSpec` 在 `prepareEnvironment` 中通过 `copyInto()` 将当前任务的附件注入容器。（需求 4.1–4.3）

### GaiaEnvironmentSpec

```ts
class GaiaEnvironmentSpec
    implements EnvironmentSpec<GaiaManifestTask, GaiaCollectedArtifacts> {

    readonly benchmarkId = "gaia";

    resolveImage(task: GaiaManifestTask): ImageSource {
        return {
            mode: "managed",
            installCommands: GAIA_MANAGED_INSTALL_COMMANDS,
        };
    }

    getWorkerEntryConfig(task: GaiaManifestTask): WorkerEntryConfig {
        return { artifact: this.workerArtifact, cwd: "/workspace" };
    }

    async prepareEnvironment(env: EnvironmentHandle): Promise<void> {
        // 创建工作目录 → 注入附件 → 写入 question.txt
    }

    async preflight(env: EnvironmentHandle): Promise<PreflightResult> {
        // 验证 Python + openpyxl/python-docx/PyPDF2/pydub 可用
    }

    async collectArtifacts(
        env: EnvironmentHandle, outputDir: string, graceMs: number
    ): Promise<GaiaCollectedArtifacts> {
        // 回收 /workspace/answer.json
    }
}
```

`GaiaCollectedArtifacts` 包含提交的答案、执行持久化定位和错误列表。（需求 1.1–1.4）

### GAIA domainResult

```ts
interface GaiaDomainResult {
    readonly submittedAnswer: string | null;
    readonly correct: boolean | null;  // 评分前为 null
    readonly normalizedAnswer: string | null;
    readonly normalizedExpected: string | null;
    readonly level: 1 | 2 | 3;
}
```

`correct` 在 `grade` 入口执行后更新。test split 无 `expectedAnswer` 时 `correct` 保持 `null`。（需求 6.1）

## Testing Strategy

| 验收范围 | 场景与预期 | 验证方式 |
|---|---|---|
| 需求 1：隔离环境适配 | `GaiaEnvironmentSpec` 使用 managed 模式声明安装命令；伪 `EnvironmentHandle` 验证附件注入和预检内容 | 伪 Handle 单元测试 |
| 需求 2：宿主代理工具 | `web_search`/`web_fetch` 工具请求通过 ACP 传递到宿主并返回结果；容器无网络时工具可用 | 工具协议测试（伪 ACP 通道） |
| 需求 3：Worker 与答案提交 | `submit_answer` 写入答案文件；重复提交被拒绝；提交后 Session 完成 | 工具行为测试 |
| 需求 4：数据集加载 | Manifest 构建覆盖 validation/test split 和三个 Level；附件路径可消费 | Manifest 构建测试（fixture 数据） |
| 需求 5：评分 | 归一化精确匹配覆盖大小写、冠词、标点、数字格式；`grade` 不触发模型调用 | 评分纯函数测试 |
| 需求 6：Attempt 记录 | 中途退出后已完成 Attempt 可读取；domainResult 包含 level 和 submittedAnswer | AttemptRecorder 集成测试 |
| 需求 7：测试隔离 | 确定性回归不依赖 Docker 或外部网络；依赖检查无交叉导入 | `npm test`；`npm run check:dependencies` |

确定性回归不依赖 Docker 或外部搜索服务；容器 smoke 通过显式入口运行。（需求 7.1–7.3）
