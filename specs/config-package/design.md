# Config 拆包设计

## Overview

新增 `@lazygoal/config` 作为 LazyGoal Home、workspace 身份与启动配置的唯一所有者，将现有配置定义和加载实现从 `llm` 迁出。`llm` 单向引用已校验的连接配置；启动入口和 Benchmark 分别引用配置包与模型工厂。迁移只改变源码归属、公开导入路径及本次迁出符号的 `LLM` 缩写命名，覆盖[需求 1–4](./requirements.md)。

## Key Design Decisions

### 1. 配置包零 LazyGoal 出站依赖

`packages/config` 仅使用 Node 内置模块和 `smol-toml`，拥有 Home 路径、TOML/Profile 契约、配置合并以及模型连接配置。将现有 `packages/llm/src/config.ts` 中的 `LlmConfig`、`LlmProvider`、`LlmConfigurationError`、`readLlmConfig` 一并迁出，分别命名为 `LLMConfig`、`LLMProvider`、`LLMConfigurationError`、`readLLMConfig`；`LlmTomlSection` 命名为 `LLMTomlSection`。`StructuredOutputMode` 的唯一类型定义也迁至配置包，避免新包为构造配置而反向导入 `llm/core/types.ts`。`LLMAdapter`、工厂、供应商实现与模型目录继续由 `llm` 拥有；其他未迁出的 `Llm*` 符号不在本 Spec 改名。

新包以 `src/index.ts` 为公开入口。迁出后删除 `llm` 中的旧实现与公开转发，所有生产调用方直接导入新包；不保留开发期兼容入口。依赖守卫登记 `config: []`、`llm → config`，并只为实际直接使用配置的包和应用开放 `config` 入站边。此决策落实 [req-1-1](./requirements.md#req-1-1) 至 [req-1-3](./requirements.md#req-1-3)。

### 2. Home 路径与配置加载按现有边界迁移

将 `xdg.ts` 迁为 `config/src/home.ts`；文件名反映当前 LazyGoal Home 规则，因为实现不使用 XDG 路径。路径计算、workspace `realpath`/SHA-256 身份、`workspace.json` 协议、原子创建及权限修正逻辑原样迁移。Home 目录和清单写入仍由启动入口在原有时机显式调用，不并入纯路径解析函数。

将 `toml-config.ts`、`config-loader.ts` 和配置类型迁至新包，维持现有四层覆盖、环境读取、Profile 查找、GEPA Working/Reflection 分离及各入口的失败顺序。解析器只保持当前实际校验，不借迁移新增字段、宽松回退或额外拒绝规则。`smol-toml` 的依赖归属随解析器迁入配置包；LLM smoke 使用的 `dotenv` 保持现有归属。此决策覆盖 [req-2-1](./requirements.md#req-2-1) 至 [req-3-4](./requirements.md#req-3-4) 与 [req-4-2](./requirements.md#req-4-2)、[req-4-3](./requirements.md#req-4-3)。

### 3. 错误身份与模型行为保持可识别

`TomlConfigurationError`、`LazyGoalHomeConfigurationError`、`WorkspaceManifestProtocolError` 保持原有类、`code`、消息与抛出条件。迁出的 `LlmConfigurationError` 按已确认命名改为 `LLMConfigurationError`，其 `name` 同步改为新类名；稳定错误码 `INVALID_LLM_CONFIG`、`missing` 字段及既有诊断内容不变，所有 `instanceof` 调用迁到新类。Adapter 的请求模式错误、供应商故障、取消协议与模型目录错误仍由原所有者处理。本次不改配置文件、workspace manifest、Goal Snapshot 或其它持久化格式，也不迁移用户数据。此决策覆盖 [req-3-4](./requirements.md#req-3-4)、[req-4-1](./requirements.md#req-4-1) 和 [req-4-4](./requirements.md#req-4-4)。

## 风险与待确认

- 风险等级：high；与 Requirements 一致。路径身份、目录权限和模型凭据跨多个启动入口，迁出公开类型后还需核对错误识别与 GEPA 凭据隔离。
- 关键操作：无；实施不删除、改写或迁移现有用户 Home 数据。
- 已知风险：遗漏一个旧导入或转发会使配置所有权分裂；错误类重复定义会破坏 `instanceof`；配置覆盖或目录创建时序变化可能影响启动和恢复；错误 `name` 随已确认的公开改名变化，依赖旧名称字符串的外部代码需同步迁移。
- 待确认：无；本次迁出符号的 `LLM` 命名及唯一归属已在 Design 交流中确认。

## Architecture

```text
apps/goal-server ------> config <------ benchmarks / prompt-evaluation
       |                   ^                       |
       +------> llm -------+                       +------> llm

config: Home / workspace / TOML / Profile / LLMConfig / loaders
llm: Adapter / provider factory / model catalog
```

箭头表示源码导入。`config` 不导入任何 LazyGoal 包，特别是不导入 `llm`；Home 路径专用调用方无需加载模型适配实现。应用组合根仍同时装配配置与 Adapter，不改变其启动职责。

## Components and Interfaces

| 位置 | 归属和迁移方式 |
| --- | --- |
| `packages/config/src/home.ts` | 迁入 Home/workspace 路径、manifest、权限函数与错误；保留现有调用时机和数据格式。 |
| `packages/config/src/toml-config.ts` | 迁入 TOML/Profile/GEPA 解析与错误；仅将 `LlmTomlSection` 改为 `LLMTomlSection`。 |
| `packages/config/src/llm-config.ts` | 迁入 `LLMConfig`、`LLMProvider`、`LLMConfigurationError`、`readLLMConfig` 与 `StructuredOutputMode` 的唯一定义。 |
| `packages/config/src/config-loader.ts` | 迁入四层加载和 GEPA 双模型加载；继续输出同结构的 `LazyGoalRuntimeConfig` 与 `GepaModelConfigs`。 |
| `packages/config/src/index.ts` | 公开上述配置能力；内部模块直接相互引用，不通过旧 `llm` 入口。 |
| `packages/llm/src/` | Adapter、工厂、目录和 smoke 直接导入配置包；删除 `config.ts`、`config-loader.ts`、`toml-config.ts`、`xdg.ts` 中迁出的定义与旧转发。 |
| Goal Server、Benchmark、Prompt Evaluation、Agent | 迁移配置与输出模式的直接导入；业务装配、模型调用及恢复流程不变。 |

实施时同步调整 `scripts/check-dependencies.mjs`、包清单、仓库布局和 `docs/architecture/README.md`、`docs/architecture/llm.md`，并为新配置包补充简短的当前架构说明。迁入及改名后的公开接口按仓库规则补齐中文契约 TSDoc 与最小示例；旧路径不保留重复定义。

## Testing Strategy

- 对 [需求 1](./requirements.md#req-1-1) 检查配置包公开入口、全部生产导入和依赖守卫：`config` 零 LazyGoal 出站边，`llm` 单向依赖配置包，没有旧定义或转发；类型检查覆盖公开命名迁移。
- 对 [需求 2](./requirements.md#req-2-1) 迁移并沿用 Home 路径与 manifest 测试，核对默认路径、绝对覆盖、`realpath` 身份、损坏/不匹配拒绝、原子写入及 POSIX 权限；以既有路径和清单 fixture 比较，避免只比较迁移后同一实现的两次输出。
- 对 [需求 3](./requirements.md#req-3-1) 迁移 TOML、Profile、环境读取和四层覆盖测试，核对现有有效配置、错误码/类别/关键消息、CLI 不回写及非法输入失败时机。对已确认改名的 `LLMConfigurationError.name` 使用新名称断言，其余错误与诊断保持原值。
- 对 [需求 4](./requirements.md#req-4-1) 使用 fake Adapter 或现有本地夹具覆盖 Goal Server 装配、Benchmark 默认路径、Prompt Evaluation 双模型与缺失 Reflection Profile；核对输出模式、凭据分离和模型调用前失败，不发真实供应商请求。
- 实施验证使用当前 TypeScript 检查、依赖边界检查、受影响包与组合根的确定性测试及仓库回归。具体命令、增补用例和运行证据由 Tasks 确定。
