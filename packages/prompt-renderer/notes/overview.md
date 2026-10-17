# Prompt 渲染

本包把显式传入的内存模板、Manifest、Section 定义与模型 View 渲染为确定性文本，不读取默认资产、工作区、Runtime 状态或历史 frame；默认 Prompt 内容归 [Prompt Bundle](../../prompt-bundle/README.md)。公开入口是 [src/index.ts](../src/index.ts)。

## 编译与渲染

[`createPromptBundleRenderer`](../src/renderer.ts) 构造期完成 Registry 校验、按 ID 建立 [`InMemoryLoader`](../src/loader.ts) 映射、创建封闭 Nunjucks Environment，并对全部注册模板 eager compile；模板语法错误在 Renderer 返回前暴露。`render` 只读取 `PromptContext`：按冻结版本取得 Manifest，按 Manifest 顺序逐个渲染 section，每个 fragment 移除末尾换行后以 `\n\n` 连接，且不追加结尾换行。Profile、Instructions 与 ToolDefinition 只作为变量值插入，值中的 `{{ ... }}` 或 `{% ... %}` 不会二次执行。

Environment 配置 `autoescape: false`、`throwOnUndefined: true`、`trimBlocks` 与 `lstripBlocks`，除 `stableJson`（来自 [上下文预算](../../context-budget/README.md)）外不注册扩展，也不提供文件系统 Loader。模板源码与渲染输出统一 LF 换行。

[`PromptBundleRegistry`](../src/registry.ts) 校验重复模板 ID、重复 Bundle 版本、非 v1 Bundle、缺失模板引用、Think/Decide 阶段映射不完整与 slot 数量/顺序错误；`getManifest` 只在请求的版本与协议三元组和 Manifest 声明一致时返回，否则抛 `UnsupportedPromptBundleVersionError`，不回退到其它版本。Registry 不导入 Runtime 协议校验函数；默认支持哪些协议组合由 [Prompt Bundle](../../prompt-bundle/README.md) 的默认装配与协议适配负责。

## Section 注册机制

[`DynamicSectionRegistry`](../src/dynamic-section-registry.ts) 按显式定义顺序投影动态 section：构造时拒绝重复 ID/顺序、空身份/来源/模板与非 `user` 角色，投影时深复制 `projection` 且不依赖具体 section ID。具体默认 Section 定义与允许的系统工具集合归 [Prompt Bundle](../../prompt-bundle/README.md)。

## 错误契约

`PromptBundleConfigurationError` 表示构造期配置或模板错误；`PromptRenderError` 只包含 Bundle 版本、slot 与模板 ID，不含 Profile、Tool Schema 或 Conversation 原文；`UnsupportedPromptBundleVersionError` 携带版本与受支持版本集合。动态 section 渲染失败复用 `PromptRenderError`，`slot` 为 section ID。

## 限制

本包不解析模型输出、不读取历史、不做预算计算，也不决定哪些 Section 进入请求。调用方负责提供模板真源、Manifest、Section 定义与模型 View，并显式加载所需资产。
