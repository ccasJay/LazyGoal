# Config 模块

## 职责

`@lazygoal/config` 拥有 LazyGoal Home 与 workspace 路径及 workspace 身份清单。该包不依赖
其他 LazyGoal 包；启动入口按需组合路径与具体服务。

Home 路径解析是纯操作，不创建目录或清单。启动入口显式创建受保护目录并校验 workspace 清单；Home 默认位于 `$HOME/.lazygoal`，`LAZYGOAL_HOME` 仅接受绝对路径，`XDG_CONFIG_HOME` 不参与解析。

## 依赖边界

```text
应用组合根 ──> config
```

`config` 没有 LazyGoal 出站依赖。依赖规则由
[`scripts/check-dependencies.mjs`](../../scripts/check-dependencies.mjs) 校验。
