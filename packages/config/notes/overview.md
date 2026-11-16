# 配置解析

解析 LazyGoal Home、Profile、TOML 和模型运行配置。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。


## 职责

`@lazygoal/config` 拥有 LazyGoal Home 与 workspace 路径、workspace 身份清单、TOML/Profile 解析、
四层运行配置加载及模型连接配置的读取与校验。共享模型调用契约（`LLMConfig`、`LLMProvider`、
`LLMConfigurationError`）归 [`@lazygoal/llm-core`](../../llm-core/notes/overview.md)，
本包单向依赖它，不反向被其依赖；启动入口按需组合路径与具体服务。

Home 路径解析是纯操作，不创建目录或清单。启动入口显式创建受保护目录并校验 workspace 清单；Home 默认位于 `$HOME/.lazygoal`，`LAZYGOAL_HOME` 仅接受绝对路径，`XDG_CONFIG_HOME` 不参与解析。

显式环境模型配置由调用方选定的环境对象读取，供应商标识保持开放、是否已注册由组合根校验，本包不查询模型目录。TOML/Profile 加载器按 `config.toml` → Profile → CLI 参数解析选型：连接与逐模型元数据声明在 `[providers.<family>.<name>]` 的 `api_key`/`base_url` 与 `models[]`，Profile 的 `[llm]` 只引用 `provider` 与 `model`。加载期校验未知家族与字段、缺失或非法容量、供应商内重复模型标识、输出上限不小于上下文，以及引用不存在的供应商或模型；供应商标识为开放字符串，家族集合由组合根注入。加载结果同时投影不含凭据的供应商声明，供组合根生成目录来源。`@lazygoal/config` 也负责 GEPA 双模型配置加载：Working LM 固定读取 `default` Profile，Reflection LM 使用独立 Profile 并强制 `prompt_only`；`@lazygoal/llm` 消费已校验配置构造 Adapter，模型目录由 [`@lazygoal/model-catalog`](../../model-catalog/notes/overview.md) 独立查询。

## 依赖边界

```text
应用组合根 ──> config ──> llm-core
应用装配   ──> llm ────> llm-core
```

`config` 单向依赖 `llm-core` 的共享模型契约；`llm` 同时依赖 `config` 的加载结果与 `llm-core` 的调用契约。依赖规则由
[`scripts/check-dependencies.mjs`](../../../scripts/check-dependencies.mjs) 校验。

## 受管 Provider 档案

`<home>/provider-profiles.json` 保存用户通过设置页维护的多份 Provider 档案（kind、凭据、端点、容量与默认模型）及其激活标识，版本化为 `version: 1`，以 0600 权限、临时文件重命名原子替换，同一实例写入串行化。文件损坏、版本不受支持、档案校验失败或激活标识悬空时一律 fail-fast，不静默重建或丢弃已保存档案；文件不存在时返回空集合，且不会创建文件或从 `config.toml` 导入凭据。

`provider-rules.ts` 是受管档案的 kind 白名单、strict 输出门禁、`baseURL` 允许集合与容量判定的单一来源，环境变量入口与档案校验共用它；TOML 供应商家族由注入的注册表家族集合校验。`toLlmConfig` 是档案到 `LLMConfig` 的唯一映射。档案存在时它是受管配置的权威；`config.toml` 的 `[llm]` 只引用 `[providers]` 中声明的供应商与模型。凭据只允许存在于受管档案、TOML 连接与进程内配置，不得进入 Goal、Trajectory 或 Diagnostic Trace。

## Context 工作窗口

`config.toml` 的 `[context]` 提供 `epoch_limit_tokens` 与 `compact_threshold_percent`。前者为正的安全整数，用于把工作窗口收窄到小于模型标称容量的值；后者接受 1–99 的整数，默认 80。`loadContextConfig` 只解析该小节，供不经过凭据校验的宿主读取；完整加载路径把相同值映射为 `LazyGoalRuntimeConfig.context`。字段与取值在解析阶段校验，非法配置快速失败。容量基数与阈值的使用规则由 `context-budget` 的 `resolveEpochCapacity` 统一解释。
