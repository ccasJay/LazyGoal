# 配置解析

解析 LazyGoal Home、Profile、TOML 和模型运行配置。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。


## 职责

`@lazygoal/config` 拥有 LazyGoal Home 与 workspace 路径、workspace 身份清单、TOML/Profile 解析、
四层运行配置加载及模型连接配置的读取与校验。共享模型调用契约（`LLMConfig`、`LLMProvider`、
`StructuredOutputMode`、`LLMConfigurationError`）归 [`@lazygoal/llm-core`](../../llm-core/notes/overview.md)，
本包单向依赖它，不反向被其依赖；启动入口按需组合路径与具体服务。

Home 路径解析是纯操作，不创建目录或清单。启动入口显式创建受保护目录并校验 workspace 清单；Home 默认位于 `$HOME/.lazygoal`，`LAZYGOAL_HOME` 仅接受绝对路径，`XDG_CONFIG_HOME` 不参与解析。

显式环境模型配置由调用方选定的环境对象读取。Config 校验供应商、凭据、输出模式、端点和容量，并返回 llm-core 定义的 `LLMConfig`；它不查询其它凭据源或进行模型目录查询。TOML/Profile 加载器按“内置默认值 → config.toml → Profile → CLI 参数”合并配置，CLI 覆盖只在内存生效。`@lazygoal/config` 也负责 GEPA 双模型配置加载：Working LM 固定读取 `default` Profile，Reflection LM 使用独立 Profile 并强制 `prompt_only`；`@lazygoal/llm` 消费已校验配置构造 Adapter，模型目录由 [`@lazygoal/model-catalog`](../../model-catalog/notes/overview.md) 独立查询。

## 依赖边界

```text
应用组合根 ──> config ──> llm-core
应用装配   ──> llm ────> llm-core
```

`config` 单向依赖 `llm-core` 的共享模型契约；`llm` 同时依赖 `config` 的加载结果与 `llm-core` 的调用契约。依赖规则由
[`scripts/check-dependencies.mjs`](../../../scripts/check-dependencies.mjs) 校验。

## 受管 Provider 档案

`<home>/provider-profiles.json` 保存用户通过设置页维护的多份 Provider 档案（kind、凭据、端点、容量与默认模型）及其激活标识，版本化为 `version: 1`，以 0600 权限、临时文件重命名原子替换，同一实例写入串行化。文件损坏、版本不受支持、档案校验失败或激活标识悬空时一律 fail-fast，不静默重建或丢弃已保存档案；文件不存在时返回空集合，且不会创建文件或从 `config.toml` 导入凭据。

`provider-rules.ts` 是供应商白名单、strict 输出门禁、`baseURL` 允许集合与容量判定的单一来源，环境变量入口与档案校验共用它；`toLlmConfig` 是档案到 `LLMConfig` 的唯一映射。档案存在时它是受管配置的权威，`config.toml` 的 `[llm]` 退化为"未选择任何受管档案"时的回退。凭据只允许存在于该文件与进程内配置，不得进入 Goal、Trajectory 或 Diagnostic Trace。
