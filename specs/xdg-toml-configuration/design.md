# xdg-toml-configuration 设计

## 审批摘要

### 方案

在 `packages/llm` 或通用配置层构建遵循 XDG 规范的声明式配置系统：通过 `resolveXdgConfigHome()` 定位 `~/.config/lazygoal/` 基础目录，选用轻量纯 TypeScript TOML 解析器解析 `config.toml` 与 `profiles/<profile>.toml`，经由四层合并引擎（内置默认 → 全局 → Profile → CLI 参数）产出强类型配置，并在 `bin/lazygoal.cjs` 中完全移除 `.env` 探测与 `--env-file` 注入。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| XDG 目录标准解析 | 优先读取 `$XDG_CONFIG_HOME/lazygoal`，缺省回退至 `$HOME/.config/lazygoal` | 符合 Unix/macOS 标准工具惯例，用户无需在每个项目初始化配置 |
| 纯 TS 轻量 TOML 解析库 | 选用零原生依赖、纯 TypeScript 的轻量解析器（如 `smol-toml`） | 跨平台无编译负担，语法错误可准确输出行号与列号定位 |
| 级联单向合并管道 | 严格按顺序合并配置，CLI 参数仅挂载于内存临时对象 | 配置逻辑清晰单向，绝不污染或覆盖磁盘用户配置文件 |
| 敏感文件 0600 安全约束 | POSIX 环境下配置目录设为 0700，新写配置文件设为 0600；权限过宽时终端告警 | 防止系统其他普通用户偷窥 API Key 等敏感凭据 |
| 清除 bin 入口 .env 注入 | 从 `bin/lazygoal.cjs` 彻底删除 `--env-file`，不再嗅探 `process.cwd()/.env` | 彻底消除多重配置来源，启动入口更加精简纯粹 |

### 风险与待确认

- 风险等级：medium；理由：重构了 CLI 入口参数装配与配置加载源头，影响所有通过命令行启动的场景，但属于外围配置层，不影响核心领域循环。
- 关键操作：无
- 风险：已有开发者可能习惯了本地 `.env`，需在初次未找到 XDG 配置时输出清晰友好的迁移指引。
- 待确认：无

## Overview

本设计彻底淘汰“项目根目录写 `.env` + 手动建 `.lazygoal/profiles/default.json`”的旧机制，建立标准现代的 CLI 配置体验：
1. **基础目录**：统一将配置文件收归至 `$XDG_CONFIG_HOME/lazygoal/`（通常为 `~/.config/lazygoal/`）。
2. **格式标准**：采用可读性高、强类型的 TOML 格式（`config.toml` 与 `profiles/*.toml`）。
3. **加载链条**：按照“内置默认值 → `config.toml` → `profiles/<profile>.toml` → CLI 参数”严格单向叠加合并。

## Architecture

```text
+-------------------------------------------------------------------------------+
|                             Configuration Pipeline                            |
|                                                                               |
|  [Built-in Defaults]                                                          |
|           |                                                                   |
|           v                                                                   |
|  [~/.config/lazygoal/config.toml]       (Parsed via smol-toml with validation)|
|           |                                                                   |
|           v                                                                   |
|  [~/.config/lazygoal/profiles/*.toml]   (Resolved from profile.active or CLI) |
|           |                                                                   |
|           v                                                                   |
|  [CLI Flags (--model, --provider)]      (Temporary in-memory override)        |
|           |                                                                   |
|           v                                                                   |
|  +-----------------------------------+                                        |
|  |     LazyGoalRuntimeConfig         |                                        |
|  |  (Validated, immutable in-memory) |                                        |
|  +-----------------------------------+                                        |
+-------------------------------------------------------------------------------+
```

## Components and Interfaces

### 1. XDG 目录解析器 (`packages/llm/src/xdg.ts`)

```ts
export interface XdgPaths {
    readonly configHome: string;
    readonly lazygoalConfigDir: string;
    readonly configFile: string;
    readonly profilesDir: string;
}

/**
 * 依据 XDG 基础目录规范解析 LazyGoal 的配置资源路径。
 */
export function resolveXdgPaths(env: NodeJS.ProcessEnv = process.env): XdgPaths;
```

### 2. TOML 配置模式与解析器 (`packages/llm/src/toml-config.ts`)

定义清晰的 TOML 配置 Schema：
```ts
export interface LazyGoalTomlConfig {
    readonly llm?: {
        readonly provider?: string;
        readonly model?: string;
        readonly api_key?: string;
        readonly base_url?: string;
        readonly structured_output_mode?: string;
    };
    readonly workspace?: {
        readonly root?: string;
    };
    readonly profile?: {
        readonly active?: string;
    };
    readonly tui?: {
        readonly execution_mode?: "autonomous" | "confirm";
    };
}
```
当解析异常时抛出带行号、列号与清晰上下文的 `TomlConfigurationError`。

### 3. 配置合并引擎 (`packages/llm/src/config-loader.ts`)

```ts
export interface LoadConfigOptions {
    readonly cliArgs?: Record<string, unknown>;
    readonly customConfigPath?: string;
    readonly xdgPaths?: XdgPaths;
}

/**
 * 执行四层合并（Defaults -> config.toml -> profile.toml -> CLI flags）
 * 产生经过严格类型校验的完整 LlmConfig 与 Runtime 配置。
 */
export function loadRuntimeConfig(options?: LoadConfigOptions): LazyGoalRuntimeConfig;
```

### 4. CLI 启动脚本精简 (`bin/lazygoal.cjs`)

彻底删除以下代码：
```js
// 删除：
const cwdEnv = resolve(process.cwd(), ".env");
const envFile = existsSync(cwdEnv) ? cwdEnv : undefined;
const nodeArgs = envFile !== undefined
    ? [`--env-file=${envFile}`, "--import", tsxLoader]
    : ["--import", tsxLoader];
```
调整为干净直接的 tsx 启动：
```js
const nodeArgs = ["--import", tsxLoader];
```

## Key Design Decisions

### D1：采用 XDG Base Directory 规范
- **方案**：优先 `$XDG_CONFIG_HOME`，默认 `~/.config/lazygoal`。
- **理由**：现代 CLI（如 Git, Neovim, Docker）的通用做法，解决每个项目需要单独配 API Key 和配置的痛点。

### D2：轻量纯 TypeScript TOML 解析库
- **方案**：引入轻量纯 TS 的 TOML 解析器（`smol-toml`，体积仅数 KB，零 native binding）。
- **理由**：保证在各平台（macOS、Linux、Windows、容器环境）上无编译依赖，极速且报错精准。

### D3：四层单向合并顺序与内存隔离
- **方案**：严格自底向上合并，CLI 参数仅影响内存中运行的实例，不调用任何持久化写入。
- **理由**：确保只读安全，避免用户一次临时运行测试改变了持久配置。

### D4：敏感文件权限保护
- **方案**：在新建或检测配置时，在 POSIX 环境下检查或设置 `0600`（文件）与 `0700`（目录）。
- **理由**：TOML 中可能包含 API Key，防止宿主机多用户环境下权限过宽导致泄漏。

### D5：彻底移除工作区 .env 注入
- **方案**：`bin/lazygoal.cjs` 不再加载当前工作区 `.env`。
- **理由**：坚持单一真相来源，避免本地 `.env` 与全局 TOML 配置产生难以排查的冲突。

## Testing Strategy

- **目录解析测试 (`packages/llm/test/xdg.test.ts`)**：
  - 测试 `$XDG_CONFIG_HOME` 自定义与缺省回退 `$HOME/.config`。
- **TOML 解析与校验测试 (`packages/llm/test/toml-config.test.ts`)**：
  - 测试标准 TOML 各字段解析。
  - 测试语法错误抛出具体行号。
  - 测试字段类型非法时快速失败。
- **合并引擎测试 (`packages/llm/test/config-loader.test.ts`)**：
  - 测试四层覆盖优先级：默认值 < config.toml < profile.toml < CLI 参数。
  - 测试 CLI 参数不影响磁盘文件。
- **CLI 启动端到端测试 (`packages/tui/test/cli-xdg.integration.test.ts`)**：
  - 在纯净临时目录（无 `.env`、无本地 `.lazygoal`）下，仅依靠 Mock 的 XDG 目录成功启动。
