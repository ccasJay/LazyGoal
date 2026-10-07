# Config 模块

## 职责

`@lazygoal/config` 拥有 LazyGoal Home 与 workspace 路径、workspace 身份清单及已校验的模型
连接配置。该包不依赖其他 LazyGoal 包；启动入口按需组合路径与具体服务。

Home 路径解析是纯操作，不创建目录或清单。启动入口显式创建受保护目录并校验 workspace 清单；Home 默认位于 `$HOME/.lazygoal`，`LAZYGOAL_HOME` 仅接受绝对路径，`XDG_CONFIG_HOME` 不参与解析。

模型连接配置只从调用方选定的环境对象读取。Config 校验供应商、凭据、输出模式、端点和容量并公开 `LLMConfig`；它不查询其它凭据源或进行模型目录查询。`@lazygoal/llm` 消费此配置构造 Adapter 与模型目录。

## 依赖边界

```text
应用组合根 ──> config <── llm
```

`config` 没有 LazyGoal 出站依赖；`llm` 单向依赖 `config`。依赖规则由
[`scripts/check-dependencies.mjs`](../../scripts/check-dependencies.mjs) 校验。
