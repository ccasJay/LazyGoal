# LazyGoal Home 统一存储设计

## 审批摘要

### 方案

在应用层解析一个统一的 LazyGoal Home，并由规范化 workspace 路径派生隔离目录；LLM 配置、全局 Agent Profile 和可重建缓存跨项目共享，运行状态与 benchmark 结果按 checkout 隔离。现有显式目录注入保持优先，以支持测试、容器和导出。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| Home 根目录 | `LAZYGOAL_HOME`，默认 `~/.lazygoal` | 不再依赖 XDG 配置目录；旧路径不兼容 |
| Workspace 身份 | `SHA-256(realpath(workspaceRoot))` | 移动路径产生新历史；符号链接保持同一身份 |
| Profile 作用域 | `profiles/` 保存 LLM TOML，`agent-profiles/` 保存全局 Agent JSON | 所有 workspace 共用配置和 Agent 行为 |
| Benchmark 边界 | 运行结果在 workspace，数据集/Worker 在全局 cache | 结果可追溯且 cache 可复用 |
| 历史可见性 | TUI 只聚合当前 workspace | 防止跨项目误恢复 |
| 兼容策略 | 直接切换，不读取或迁移旧数据 | 实现简单；旧数据由用户自行处理 |

### 风险与待确认

- 风险等级：high；理由：改变敏感配置和持久化寻址，影响恢复与 GEPA 发布。
- 关键操作：无；实现不删除、不迁移旧目录。
- 风险：旧 Goal 不会自动出现在新历史中；全局 Agent Profile 的 GEPA 发布会影响所有 workspace。
- 待确认：无。

## Overview

当前 `packages/llm/src/xdg.ts` 只描述配置路径，而 `packages/tui/src/cli.tsx` 和 benchmark CLI 各自拼接项目 `.lazygoal`。本设计把路径解析集中到现有 LLM 配置路径模块的扩展接口中，Composition Root 负责把 Home 路径投影成 Runtime/Storage 所需目录；领域 Runtime 不感知操作系统路径。

## Architecture

```text
process.env / process.cwd()
          |
          v
resolveLazyGoalHomePaths + resolveWorkspaceHomePaths
          |
          +--> config.toml / profiles / agent-profiles
          +--> workspaces/<workspace-id>/{goals,trajectories,traces,sidecars}
          +--> workspaces/<workspace-id>/{benchmarks,gepa}
          +--> cache/benchmarks
          |
          v
Composition Root --> Runtime / Storage / TUI / Benchmark adapters
                         |
                         +--> Tools still sandboxed by workspaceRoot
```

Home 解析为纯函数，不创建目录。Composition Root 在配置校验完成后解析真实 workspace，并在第一次需要持久化时通过原子 manifest 建立 workspace 身份。`workspace.json` 至少包含 `schemaVersion: 1` 和规范化 `workspaceRoot`；读取到不匹配路径时抛出协议错误。

## Key Design Decisions

### Home 根目录

扩展 `packages/llm/src/xdg.ts` 为 Home 路径模块，保留文件位置以减少跨包依赖，但将 `XdgPaths` 替换为 `LazyGoalHomePaths`。`LAZYGOAL_HOME` 必须是绝对路径；缺失时使用 `homedir()` 与 `.lazygoal`。`XDG_CONFIG_HOME` 不再参与解析，`resolveXdgPaths` 和 `LoadConfigOptions.xdgPaths` 删除。

`LazyGoalHomePaths` 返回 `homeDirectory`、`configFile`、`profilesDir`、`agentProfilesDir`、`workspacesDir` 和 `cacheDir`。配置 loader 仍保持 Defaults → config.toml → LLM profile → CLI 的合并顺序。

### Workspace 身份与目录

`resolveWorkspaceHomePaths` 先对 workspaceRoot 执行 `realpath`，再以 UTF-8 路径计算 SHA-256。返回 `workspaceId`、`workspaceDirectory`、`goalsDirectory`、`trajectoriesDirectory`、`tracesDirectory`、`contextSidecarsDirectory`、`benchmarksDirectory` 和 `gepaDirectory`。workspace 目录下的 manifest 原子写入并限制为 `0600`。

显式 `dataDirectory` 继续直接控制四类 Runtime Store；显式 `benchmarksDirectory` 继续控制 TUI benchmark 聚合。只有缺省值改为 Home workspace 路径，工具的 workspaceRoot 不变。

### Agent Profile 与 GEPA

`JsonFileAgentProfileStore` 的默认目录改为 Home `agent-profiles`。工作区不再提供默认 JSON Profile 目录；若全局 Profile 缺失，沿用现有内置默认 Profile/配置错误语义，但错误路径指向 Home。GEPA 运行目录跟随当前 workspace，发布目标改为全局 Agent Profile，并保留摘要比较、原子替换和现有确认门。

### Benchmark 路径

各 benchmark CLI 通过一个小型应用路径投影获得默认值：当前 workspace 的 `benchmarks/<name>/runs/<runId>` 用于 manifest、attempt、报告、Goal snapshot、trajectory 和导出 patch；`cache/benchmarks/<name>` 用于数据集、Worker 构建和可重建虚拟环境。显式输出目录不经过该投影。TUI 传入当前 workspace 的 benchmark 根目录，复用现有 Aggregated Store。

### 权限与旧数据

创建 Home、workspace、Profile 和 cache 目录时使用 `0700`，写入配置和 Profile 后修正为 `0600`。解析和校验失败不创建目录。实现不调用旧路径，不进行复制、删除或自动迁移；旧 `.lazygoal` 忽略规则移除，使意外写回可见。

## Components and Interfaces

```ts
export interface LazyGoalHomePaths {
    readonly homeDirectory: string;
    readonly configFile: string;
    readonly profilesDir: string;
    readonly agentProfilesDir: string;
    readonly workspacesDir: string;
    readonly cacheDir: string;
}

export function resolveLazyGoalHomePaths(
    env?: NodeJS.ProcessEnv,
): LazyGoalHomePaths;

export interface WorkspaceHomePaths {
    readonly workspaceId: string;
    readonly workspaceDirectory: string;
    readonly manifestFile: string;
    readonly goalsDirectory: string;
    readonly trajectoriesDirectory: string;
    readonly tracesDirectory: string;
    readonly contextSidecarsDirectory: string;
    readonly benchmarksDirectory: string;
    readonly gepaDirectory: string;
    readonly benchmarkCacheDirectory: string;
}

export async function resolveWorkspaceHomePaths(
    home: LazyGoalHomePaths,
    workspaceRoot: string,
): Promise<WorkspaceHomePaths>;
```

公开接口必须包含中文契约级 TSDoc，说明绝对路径校验、realpath、创建副作用和错误语义。`LoadConfigOptions` 改用 `homePaths?: LazyGoalHomePaths`；测试可传入完整路径对象，不依赖真实用户 Home。

## Error Handling

- `LAZYGOAL_HOME` 为相对路径：抛出稳定配置错误，不创建任何目录。
- workspace `realpath` 失败：传播文件系统错误，不生成伪造 ID。
- manifest JSON 损坏、版本不支持或 root 不一致：抛出明确的 workspace 协议错误，不继续读取其 Store。
- Home 配置/Profile 缺失或非法：错误只引用新 Home；不得 fallback 到 XDG 或项目 `.lazygoal`。
- 原子写入失败：保留已有文件，向调用方传播错误；不得报告成功。

## Testing Strategy

- 路径模块：覆盖默认 Home、绝对覆盖、空白覆盖、相对路径、XDG 无效、权限和无创建副作用。
- workspace：覆盖 realpath 稳定 ID、符号链接、不同路径隔离、manifest mismatch 和原子初始化。
- TUI/Storage：覆盖 Home 默认 Store、全局 Profile、无项目 `.lazygoal`、当前 workspace benchmark 聚合和显式目录注入。
- benchmark：覆盖 GAIA、SWE-bench、ALFWorld、TUA-Bench 默认输出/cache 与显式覆盖；使用临时 Home，不访问真实用户目录。
- GEPA：覆盖 workspace run、全局 Profile 发布、失败/停止不发布和摘要不变路径。
- 全量类型检查与测试，并增加源码守卫检查生产默认值不再使用 `.lazygoal` 或 `XDG_CONFIG_HOME`。
