# LazyGoal Home 统一存储需求

## 审批摘要

### 目标

将 LazyGoal 的配置、用户 Profile、运行状态和内部 benchmark 产物统一放入 `~/.lazygoal`（可由 `LAZYGOAL_HOME` 覆盖），消除项目仓库内 `.lazygoal` 与 `~/.config/lazygoal` 的分裂，同时保留项目文件工具和用户最终交付物的 workspace 边界。

### 范围

- 包含：全局 Home 路径、workspace 隔离、配置与 Agent Profile、Goal/Trajectory/Trace/Sidecar、benchmark 运行与 cache、GEPA 运行、TUI 历史发现、权限和失败行为。
- 不包含：旧数据自动迁移、旧路径兼容读取、删除旧目录、源码和最终用户交付物搬离 workspace、通用 artifacts 新抽象。

### 核心行为

- 默认 Home 为 `~/.lazygoal`，非空 `LAZYGOAL_HOME` 必须是绝对路径；`XDG_CONFIG_HOME` 不影响路径选择。
- 全局配置和 Agent Profile 跨 workspace 共用；运行状态和历史按规范化 checkout 隔离。
- benchmark 源码留在仓库，运行结果进入当前 workspace 的 Home，下载数据和 Worker cache 进入全局 cache。
- 新路径失败时不得创建或修改旧路径数据；所有敏感文件和目录使用安全权限。

### 风险与待确认

- 风险等级：high；理由：改变凭据位置、持久化寻址、恢复发现和 GEPA Profile 发布边界。
- 关键操作：无；本功能不自动删除或迁移任何旧数据。
- 风险：旧运行状态不会自动出现在新历史列表中；跨 workspace 路径移动后会产生新的 workspace 身份。
- 待确认：无。

## 引言

LazyGoal 当前把 LLM 配置放在 XDG 配置目录，把 Goal、Profile 和 benchmark 数据放在项目 `.lazygoal`。本功能统一为以 `LazyGoal Home` 为根的全局控制面，并按 checkout 隔离运行数据，使多个项目能够共享用户配置而不污染仓库。

## 需求

### 需求 1：解析统一的 LazyGoal Home

**用户故事：** 作为 LazyGoal 用户，我希望所有应用级配置和运行数据都有一个稳定的 Home 根目录，以便跨项目使用时不需要重复配置。

#### 验收标准

1. <a id="req-1-1"></a> 当进程未设置 `LAZYGOAL_HOME` 或其值为空白时，系统必须使用当前用户 Home 下的 `.lazygoal` 作为 LazyGoal Home。
2. <a id="req-1-2"></a> 当进程设置非空 `LAZYGOAL_HOME` 时，如果该值不是绝对路径，系统必须在任何持久化写入前快速失败。
3. <a id="req-1-3"></a> 当解析 LazyGoal Home 时，系统不得使用 `XDG_CONFIG_HOME` 改变配置、Profile、workspace 或 cache 的路径。
4. <a id="req-1-4"></a> 当路径解析函数被调用时，系统不得因为解析动作本身创建 Home、配置文件或 workspace 文件。

### 需求 2：隔离 checkout 的运行数据

**用户故事：** 作为多项目用户，我希望不同 checkout 的 Goal 历史互不混淆，同时仍共享全局配置，以便移动项目或使用 worktree 时保持安全隔离。

#### 验收标准

1. <a id="req-2-1"></a> 当系统为规范化 `realpath(workspaceRoot)` 解析 workspace 时，必须产生稳定且由该路径唯一决定的 workspace ID。
2. <a id="req-2-2"></a> 当两个 workspace 的规范化路径不同时，系统必须为它们提供不同的 Goal、Trajectory、Trace、Context Sidecar 和 benchmark 运行目录。
3. <a id="req-2-3"></a> 当同一 workspace 通过符号链接或重复启动访问时，系统必须使用同一 workspace ID 和同一运行目录。
4. <a id="req-2-4"></a> 当 workspace 路径移动后再次启动时，系统必须将其视为新的 workspace，并继续使用原有全局配置和 Agent Profile。
5. <a id="req-2-5"></a> 当 workspace 身份清单存在且记录的规范化路径与当前路径不一致时，系统必须拒绝使用该 workspace 目录。

### 需求 3：全局配置与 Agent Profile

**用户故事：** 作为用户，我希望 LLM 配置和 Agent Profile 在所有项目中共用，以便只维护一份凭据、Prompt 和 Tool 授权。

#### 验收标准

1. <a id="req-3-1"></a> 当系统加载运行时配置时，必须从 LazyGoal Home 的 `config.toml` 和 `profiles/` 读取 LLM 配置，并保持既有配置层级和 CLI 临时覆盖语义。
2. <a id="req-3-2"></a> 当系统加载 Agent Profile 时，必须从 LazyGoal Home 的 `agent-profiles/` 读取全局 Profile，不得默认扫描项目 `.lazygoal/profiles/`。
3. <a id="req-3-3"></a> 当不同 workspace 启动且使用同一 Profile ID 时，系统必须加载相同的全局 Profile 内容。
4. <a id="req-3-4"></a> 当新 Home 配置缺失或非法时，系统必须在模型调用、Goal I/O 和旧路径访问前返回指向新 Home 的可识别错误。

### 需求 4：持久化状态不进入项目仓库

**用户故事：** 作为项目维护者，我希望 LazyGoal 的内部状态不污染仓库，以便源码工作区保持可提交、可复制且与本机运行记录解耦。

#### 验收标准

1. <a id="req-4-1"></a> 当普通 LazyGoal 在有效 workspace 中启动并保存 Goal 时，系统必须将 Goal、Trajectory、Trace 和 Context Sidecar 写入当前 workspace 对应的 LazyGoal Home 目录。
2. <a id="req-4-2"></a> 当普通 LazyGoal 启动、运行或恢复时，系统不得创建、读取或更新项目根目录下的 `.lazygoal` 作为默认持久化位置。
3. <a id="req-4-3"></a> 当用户要求 Agent 生成源码、Markdown 或其他最终交付物时，文件工具仍必须以 workspaceRoot 为沙箱根，显式输出路径仍必须得到尊重。
4. <a id="req-4-4"></a> 当显式注入 `dataDirectory` 或等价测试目录时，系统必须使用注入目录而不是隐式 Home 路径。

### 需求 5：benchmark 运行与 cache 边界

**用户故事：** 作为 benchmark 使用者，我希望运行结果按项目保存且可重建资源跨项目复用，以便结果可追溯、缓存不重复占用磁盘。

#### 验收标准

1. <a id="req-5-1"></a> 当 benchmark 未提供显式输出目录时，系统必须将运行结果、attempt、报告和内部快照写入当前 workspace Home 下对应 benchmark 的独立 run 目录。
2. <a id="req-5-2"></a> 当 benchmark 下载数据集或构建可重建 Worker runtime 时，系统必须使用 LazyGoal Home 下按 benchmark 隔离的 cache 目录。
3. <a id="req-5-3"></a> 当 benchmark 提供显式输出目录时，系统必须将结果写入该目录，不得覆盖默认 Home 路径。
4. <a id="req-5-4"></a> 当 TUI 查询 benchmark 历史时，系统必须只聚合当前 workspace 的 benchmark 运行，并保持 task 级持久化隔离。
5. <a id="req-5-5"></a> 当加载 benchmark 源码、manifest 或测试资源时，系统必须继续从仓库源码路径读取，而不是从 Home 复制一份源码。

### 需求 6：GEPA 和全局 Profile 发布

**用户故事：** 作为 GEPA 使用者，我希望优化运行记录归属当前 workspace，而成功发布的 Agent Profile 仍对所有 workspace 生效，以便训练上下文和最终 Profile 的作用域清晰。

#### 验收标准

1. <a id="req-6-1"></a> 当 GEPA 创建运行时，系统必须将 run manifest、请求、报告和运行状态写入当前 workspace Home 下的 GEPA 目录。
2. <a id="req-6-2"></a> 当 GEPA 成功发布最佳 Profile 时，系统必须原子更新 LazyGoal Home 的全局 Agent Profile，并保留现有摘要未变化检查和显式写入确认。
3. <a id="req-6-3"></a> 当 GEPA 停止、失败或摘要检查不通过时，系统不得修改全局 Agent Profile。

### 需求 7：权限、安全和兼容边界

**用户故事：** 作为在本机保存 API 凭据的用户，我希望 Home 和敏感文件具备明确权限，并且旧路径不会被隐式改写，以便迁移风险可控。

#### 验收标准

1. <a id="req-7-1"></a> 当系统创建 LazyGoal Home、Profile、workspace 或 cache 目录时，在 POSIX 系统上必须使用或修正为 `0700`。
2. <a id="req-7-2"></a> 当系统写入包含凭据或 Agent Profile 的文件时，在 POSIX 系统上必须使用或修正为 `0600`。
3. <a id="req-7-3"></a> 当新 Home 不存在旧配置时，系统不得自动读取、复制、迁移或删除 `~/.config/lazygoal` 或项目 `.lazygoal`。
4. <a id="req-7-4"></a> 当持久化写入失败、workspace 清单不一致或配置非法时，系统必须保留已有数据并返回可诊断错误，不得声称启动或恢复成功。

### 需求 8：当前 workspace 的历史发现

**用户故事：** 作为 TUI 用户，我希望历史页面只展示当前项目的可恢复内容，以便不会误操作其他项目的 Goal。

#### 验收标准

1. <a id="req-8-1"></a> 当 TUI 打开历史页面时，系统必须只读取当前 workspace 的 Goal Catalog 和 benchmark 聚合目录。
2. <a id="req-8-2"></a> 当当前 workspace 没有历史时，系统必须展示空状态而不是扫描或创建其他 workspace 的替代历史。
3. <a id="req-8-3"></a> 当当前 workspace 的快照或 benchmark 产物损坏时，系统必须暴露对应错误，不得静默混入其他 workspace 的数据。
