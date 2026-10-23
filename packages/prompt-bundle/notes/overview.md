# Prompt Bundle

本包拥有当前唯一的 Prompt 模板真源、Bundle v1 Manifest、具体 Section 定义、默认 Renderer 装配与 Runtime GoalProtocolValidator 适配。渲染机制归 [Prompt 渲染](../../prompt-renderer/README.md)；本包只提供当前内容与默认组合。公开入口是 [src/index.ts](../src/index.ts)。

## 模板真源与 Manifest

全部 `.njk` 资产位于本包 `src/` 下的固定子目录，并由 [`DEFAULT_PROMPT_TEMPLATE_ASSETS`](../src/default-bundles.ts) 以稳定 ID 与其 `sourceUrl` 声明；[`createDefaultPromptBundleRenderer`](../src/default-bundles.ts) 在启动期按 URL 读取、LF 规范化并 eager compile 这些资产，再从任意工作目录都可加载。模板 ID 含组件版本（如 `global-overview@1`），开发阶段按当前协议原位更新内容；Worker 构建副本与测试基线保留派生/对照身份，不成为第二真源。

[`PROMPT_BUNDLE_V1_MANIFEST`](../src/default-bundles.ts) 是当前唯一 Manifest：三个固定 slot 依序为 Global Overview → Profile → Phase Protocol，Phase Protocol 同时映射 Decide 与 Think 模板；Bundle、Memory、模型上下文与联合检索协议必须同时使用 v1。默认工厂在装配前用 [`createDefaultPromptBundleProtocolValidator`](../src/default-bundles.ts) 校验唯一当前组合，任何额外版本或协议组合在默认路径被拒绝。

## 动态 Section 定义

[`createDefaultDynamicSectionRegistry`](../src/default-dynamic-sections.ts) 定义默认 Bundle v1 的六个动态 section：`run_mode`、`approved_task`、`goal_plan`、`authorized_tools`、`working_memory`、`goal_context_navigation`，分别投影 Run 模式、明确的阶段状态与当前合法的系统工具、已批准任务、GoalPlan、授权工具、Working Memory 与目标工作导航。注册表与渲染入口按定义遍历，不按 section ID 分支；新增 section 只需增加定义与模板资产。

## 协议适配与限制

`createDefaultPromptBundleProtocolValidator` 只接受 `structured@1 + trajectory-layered@1 + bm25-lite@1 + Prompt Bundle v1`，不提供默认值、迁移或回退。本包不读取历史 frame、不组装请求、不调用模型；Section 差异计算与请求组装由 Agent 侧消费者完成。当前支持范围不因拆包扩展。
