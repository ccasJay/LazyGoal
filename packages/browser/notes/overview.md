# 浏览器服务边界

本机浏览器会话的访问检查、Goal 命令、历史读取与投影路由；不拥有前端视图。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。


会话投影从当前 Snapshot 公开用户中断的 `requested`／`finished` 状态及未知工具效果标记，不推断模型收尾进度。执行语义见 [Runtime](../../runtime/notes/overview.md)。

## 职责

正式消息投影保留 Snapshot 中的稳定消息身份、所属 Run 和事实锚点位置；窄状态摘要、Activity 历史、消息读取与 SSE 提交通知复用同一位置，不依据连接到达时间排序。

[`@lazygoal/browser`](../src/index.ts) 负责本机浏览器入口的短期能力令牌、Host/Origin 检查、安全响应头、静态资源路由、正式工作区 Goal 投影、类型化命令和实时事件。它不拥有 Goal 状态或持久化。

## 入口与访问边界

`lazygoal` 与 `lazygoal web` 都由独立 `apps/goal-server` 启动 Web 服务。服务创建随机能力令牌，将其放入页面 URL fragment，并在同源 HTTP Host 上提供 API、SSE 与已构建的 Goal Board 静态资源。服务监听 `127.0.0.1` 上的操作系统分配端口；静态页面根文档、favicon 和 `/assets/` 可不带令牌读取。其他请求须匹配精确 Host、同源约束和 Bearer 令牌。静态响应限制来源、禁止 referrer 并禁用缓存。

授权后，`GET /api/goals` 从正式工作区 Catalog 返回真实 Goal 摘要，并同时给出 `unreadableCount`：无法解码的旧版本快照按条跳过并计数，看板据此说明列表不完整，而不是把不可读数据当作不存在；只有目录级读取失败才返回 `goal_list_unavailable`。`GET /api/goals/:goalId` 从正式 Snapshot 和各 Run 的 Trajectory 返回完整会话投影。`GET /api/goals/:goalId?view=state` 返回 Snapshot-only 窄状态，不内嵌消息、步骤和阶段历史；当前失败 Run 的错误摘要从 Snapshot stopReason 投影到 `currentRunTerminalDetail`，无需读取 Trajectory；它保留当前 Run、等待与 Action、队列、中断、GoalPlan、Plan 路线及当前会话摘要。看板读取使用 Composition Root 暴露的正式工作区 Store 与 Trajectory 读取器，不经过含 Benchmark 的聚合目录。

`GET /api/goals/:goalId/activity` 提供默认 50、最大 100 个原子项的 Activity 窗口，接受可选 Run 过滤和互斥的 `before`／`after` cursor。消息最多返回 4,000 UTF-16 code unit 摘要；截断正文按 messageId 使用既有消息详情读取。事实投影只公开白名单事件类型、稳定身份、必要 Action／阶段关联，以及同一 Action 的最终安全工具状态与生命周期记录，不发送事件 payload、原始 Observation、工具参数或模型内部内容。cursor 固定首次窗口内每个 Run 的 messageCount、throughMessageId 和 Snapshot 已提交 Trajectory 序号；后续正文、Observation、后继 Run 与未提交 tail 不进入该窗口。页面给出实际页范围、两侧未加载缺口的准确项数与首尾位置、Run 水位及跨页阶段／Action 组完整性提示。Activity 和窄状态路由均位于 BrowserSessionAccess 之后，Host、Origin 与 Bearer 校验在 Snapshot/Trajectory 读取之前执行。

Activity 助手消息附带 Runtime 明确写入的 `process`、`answer` 或 `notice` 用途，用户消息不带此字段。只有来源为已保存 `completion_candidate` 的正式助手答复映射 `previewId`；它只关联先前公开的候选身份，不携带候选正文。`run_stage_declared` 事实可额外带最多 1,000 字符的声明目标；其他事件不能携带该字段。前端按 Activity position 交错显示消息、白名单事实与 Run 边界；Run 完成状态仍取自 Snapshot 状态，不由阶段接受或过程正文推断。

Activity 响应项数有界；当前文件 JSONL 读取器仍可扫描整个 Run 文件，接口不承诺磁盘随机访问或 I/O 成本有界。完整会话投影仍限制历史数量、消息正文长度（每条最多 64,000 字符）及其他预览文本，并省略 Profile、模型配置、供应商隐藏推理、原始事件及完整 Tool 输入/输出。内置文件、搜索和网页工具仅投影有界路径或查询摘要，用于 Activity 操作标题；写入正文和其他参数仍不投影。Bash 步骤按 Action 身份合并模型决定与执行事件；展开后只显示限长命令，以及已提交 Observation 中的成功输出白名单字段或失败说明，整个会话最多投影 100 组 Bash 详情。步骤可显示已提交的模型纠错和模型/Tool 重试摘要；Run 终态显示稳定失败原因或等待原因。终态 `complete` 决策由 Run 状态显示，不另生成一条步骤。Tool 结果只有在 Snapshot 纳入 `observation_recorded` 后才显示为已完成步骤；恢复后被纳入的新提交边界可能包含旧的 `tool_finished`，单独该事件不会确认结果。缺失 Goal 与不可读数据分别返回 404 和稳定的 500 错误码。在包含内部阶段的 Run 中，完整会话投影仍可从已提交轨迹事件聚合阶段上下文（`stages`），按首次声明顺序保留阶段身份及修订、验收条件、生命周期状态和审查反馈，步骤携带其 `stageId`。Activity 页则逐项呈现安全事实和有界阶段声明目标；跨页阶段上下文从已提交声明提取至多 1,000 个 UTF-16 代码单元的目标，并提供阶段和 Action 来源是否完整位于本页的 `completeWithinPage`；当前 Plan 路线来自窄状态 DTO，展示在当前 Run 边界。中间阶段接受不标记 Run 完成，审查拒绝后的阶段维持进行中；刷新或重连后来源身份保持稳定。

看板列表包含持久化的归档标记。卡片菜单仅允许对已完成、失败或取消的 Goal 归档与删除；归档保留 Snapshot 和运行记录，从默认看板移到 Archived 视图，可恢复到默认看板。`POST /api/goals/:goalId/archive` 设置或清除归档标记。`DELETE /api/goals/:goalId` 清理该 Goal 的 Snapshot、Trajectory、模型输入、指标、诊断 Trace、检索 Sidecar 和 Goal 级授权，保留 Workspace 级授权与工作区文件。终态管理拒绝仍有未处理输入或未完成收尾的 Goal；删除先清理附属数据、最后删除快照，清理失败时可重试。两条路由都受会话令牌保护，缺失返回 404，非终态返回 409。

`POST /api/goals` 只接受有界 JSON 中的稳定 Goal ID、稳定首条 `inputId`、非空意图、可选 `mode: "plan"` 与可选 `modelId`，并委派现有无界面装配的会话所有者创建 Session。省略模型时解析当前工作区 Web 模型偏好，也可由装配提供进程默认选择；模型 ID 由服务端目录重新验证，Profile 和执行策略仍由本机决定。受理仅在 Goal、首条用户消息、Run 与受理收据成功保存后返回，执行由 Runtime 会话所有者在后台推进；同身份同载荷的重试返回既有收据与原 Goal，异载荷返回身份冲突。另一个 Goal 持有实例执行名额时拒绝新建。页面断开不会取消已受理的执行。

所有 JSON 请求体先经传输层校验（Content-Type、字节上限与 UTF-8/JSON 解码），再由 `@lazygoal/web-contracts` 的严格命令合同执行 `safeParse`；route 只保留 wire ID、路径身份、kind/跨字段关系与固定 HTTP 错误映射，不维护第二套 body 字段白名单。Provider 档案可选的 `null` 值按 DTO 保留并交由下游解释为清空，`apiKey: null` 被合同拒绝。

`POST /api/goals/:goalId/inputs` 受理统一会话输入联合：`message`、`steer`、`interrupt`、`respond`、`resume` 与 `queue_control`，每项都携带 Goal 内稳定 `inputId`。Browser 只做严格 wire 校验与安全投影，受理、去重、队列、执行所有权与恢复判定全部委派 Runtime 会话所有者：新受理返回 202，同身份同载荷的既有收据返回 200，业务拒绝返回稳定错误码（字段错误 400、文本超限 413、Goal 缺失 404、身份／状态／容量冲突与 busy 409、关闭或保存结果不明 503）。`respond` 携带当前 `runId`、`requestId` 与回答、提案批准/反馈或 Action 批准/拒绝载荷，由 Runtime 再次校验等待类型与身份；旧身份、错配等待点或载荷冲突不写入收据，普通文本也不能代答结构化等待。`GET /api/goals/:goalId/inputs/:inputId` 按身份返回持久化收据及应用关联，未找到与读取失败分别返回明确结果。

Plan Run 的待审批会话 DTO 会投影候选路线中的全部阶段顺序、目标和验收条件，文本受有界投影处理。普通会话不返回路线字段；候选仍属于待审批 Snapshot，不代表 Runtime 已批准或正在执行的阶段。

当前已批准 Plan Run 另从 Runtime Snapshot 投影完整 `planRoute`：保留路线修订与理由、下一个阶段游标、每个阶段的稳定 ID/修订/状态/目标/验收条件及接受序号。路线文本按界面 DTO 限长；普通 Run 以及待审批 Run 不含权威路线字段。该路线投影独立于从 Trajectory 派生的 `stages` 执行记录，不替代活动事件视图。

`GET /api/goals/:goalId/actions/:actionId?runId=...` 仅在该 Goal/Run 仍处于对应 Action 审批等待时返回完整 canonical Tool 输入。常规会话投影只携带限长输入预览；写入类 Tool 额外投影目标路径。`GET /api/goals/:goalId/grants?runId=...` 只列出当前 Goal 与 Workspace 的授权摘要，不暴露精确输入摘要；`DELETE /api/goals/:goalId/grants/:grantId` 按授权层级撤销并返回更新后的列表。三个端点均受 BrowserSessionAccess 保护，并在服务层重验当前 Run 身份。

普通 `message` 不绑定发送时的旧 Run：运行中或等待交互时按受理顺序进入该 Goal 的持久化队列，Goal 处于可启动终态且无恢复或队列暂停约束时由 Runtime 为队首创建后继 Run。终止态或 Interrupt 暂停保留队列与暂停原因，只有显式 `queue_control` 继续才解除。`steer` 只面向当前 running Run，受理不取消在途调用，应用发生在既有模型安全边界并写入真实用户消息；旧 Run、已进入中断或非 running 目标明确拒绝，不会静默降级为普通队列消息。`interrupt` 按目标 Run 与稳定身份在同一提交内保存中断意图并暂停队列，随后委派执行器中止执行并直接结算取消，不再调用模型，重复请求返回同一收据。用户终止只影响目标 Run，最终以 cancelled 结算；普通服务关闭或断连不生成该意图。会话投影按顺序公开已受理、尚未应用的 Steer，并区分队列、暂停、提交修订、中断阶段与是否需要显式恢复。

`POST /api/goals/:goalId/plan-mode` 只接受当前 `runId`，并由管理命令服务在转交 Coordinator 前校验 Goal/Run 身份与实例活动名额。Runtime 允许未启动 Run 进入 Plan Mode，或为已完成或失败 Run 标记下一 Run 使用 Plan Mode；已开始的普通 Run 和其他不允许切换的状态返回稳定错误。命令文本不写入消息或 Step。

`GET /api/goals/:goalId/events` 订阅整个 Goal，不再要求客户端绑定单一当前 Run，也不接受 `runId` 查询参数。该路由用 Hono `streamSSE` 写出 `event: update` 与 JSON `data:`，并在返回前恢复 `cache-control: no-cache, no-transform` 与 `x-accel-buffering: no`；客户端断开、feed 正常结束或迭代失败都会结束响应，并只释放本连接的一次 Browser feed 订阅。Goal 事件不设置 metrics 的 5 秒写超时：慢客户端由 128 项有界 `LiveEventQueue` 关闭本连接订阅，HTTP 连接可能保持到客户端断开。首项是一致 `state_sync` 安全会话状态，其后按来源顺序输出 `input_result`（按 `inputId` 关联受理与拒绝）和公开执行活动；后继 Run 开始不关闭订阅、不遗漏开始事件。事件仅投影白名单活动和长度受限的助手文本：内部块协议中只有公开普通正文增量与整块完成映射为 `assistant_text_delta`，结构化 JSON、Tool 参数、reasoning、调用失败摘要及未识别载荷不转发。Trajectory/Checkpoint 事件与 Goal 保存只发送刷新通知；订阅缺口、同步读取失败、背压关闭或连接故障要求页面重新读取，不代表 Run 完成。

模型开始事件投影真实来源时间，以及来源提供的调用阶段、调用身份和执行单元；不复制模型输入或输出。Bash 的实时及已提交活动输入摘要只公开至多 240 字符的命令，不带环境或其它参数。实时工具活动的安全 DTO 附带 ExecutionStream 自己的 `sourceEventId` 与 `sourceCursor`，并保留跨流调用对齐所需的 `actionId`。这些来源标识不等同于 Trajectory 中同名字段；只有 `actionId` 用于将同一调用的暂时活动与已提交步骤对齐。输入与结果仅允许投影白名单摘要，不发送任意 Tool 参数、原始 Tool 输出或隐藏推理。助手可见回复、等待、阶段变化、终态、失败和未知公开事件投影为活动边界，供 Goal Board 重建活动组；流缺口通知促使前端清空不完整临时数据并刷新。

SIGINT 通过 Runtime 已有关闭协调器冻结检查点、取消执行并关闭 HTTP Host。关闭信号生效后，HTTP Host 拒绝新的写请求；已排队的命令在预约锁释放后返回 `service_shutting_down`，不再进入 Runtime 或持久化操作。

`resume` 输入要求页面提交当前 Run 与页面读取到的 `commitRevision`，由 Runtime 会话所有者重新读取 Snapshot 并核验修订；重建实例、只读连接与新普通消息都不会自动恢复旧工作，匹配修订才推进当前 Run 或已受理队首，等待交互时报告所需交互并保持等待。无问答与审批的 blocked 等待必须显式携带文本指令，恢复不代答。列表和会话的 `execution.state` 结合 Snapshot 与会话所有者的活动名额投影；进程活动状态不写入 Goal。

## 轨迹查看

PTC 子操作沿用普通 Action 的审批入口；待审视图额外展示父程序 Action 和调用序号。会话步骤只计父 `execute_program`，内部调用保留在原始轨迹，轨迹摘要可通过 `programId` 与 `program_started` 反查父 Action。资源预留事件不产生会话步骤。

[`browser-trajectory`](../src/browser-trajectory.ts) 使用正式工作区 Snapshot 与提交边界读取器，提供同一访问控制下的只读 Run 目录、轨迹摘要分页和按需事件详情。Run 目录不受 Activity 的历史数量限制；轨迹分页以 Run 内 sequence 为游标，每页最多 100 条。搜索及分类、序列范围筛选覆盖整个 Run 的已提交载荷。读取时额外限定到本次 Snapshot 边界，不返回未提交 tail；未知 Run、事件或执行单元明确返回不存在，底层读取失败返回稳定错误码。

详情保留原始事件信封与载荷，并按同一 Run/Action 关联输入、工具结束记录及已提交 Observation。工具结束与观察确认分别表示；工具耗时只取真实起止时间，缺失、无效或负值不可用，模型耗时不估算。列表明确标记预览截断，完整详情超过 256 KiB 时拒绝，不把截断载荷当作完整 Raw。接口不附带 Diagnostic Trace 或领域事件以外的配置。

页面以 Trajectory 替换 Details 标签，概览明确仅覆盖当前事件页。轨道支持按指针位置缩放、横向平移和恢复全范围；视觉缩放不改变事件查询，普通拖动框选仍按序列筛选。切换 Run、事件页或时间/序列轴时重置视窗。紧凑列表每条记录占一行，轮次与请求入口位于左侧；工具输入和结果并排预览，完整内容按需读取。缺少执行单元或 Step 身份的记录保留在 Run 层级；列表保持真实序列顺序。Activity 展开 Step 底部的按钮按 Run 与执行单元定位首条已提交记录，跨页读取、选中并打开详情。Goal info 面板保留信息和授权操作。页面复用已提交会话刷新通知更新轨迹，保留历史 Run 选择、筛选、已选事件及阅读位置；末页跟随与 Latest 入口用于查看新增事实。切换 Run 或关闭视图取消在途读取，迟到响应不能覆盖当前视图。

[`browser-model-input`](../src/browser-model-input.ts) 在同一授权边界读取正式工作区的独立模型消息日志。输入在 Adapter 调用前保存，不证明供应商已接收，也不受 Snapshot 提交边界限制；失败调用仍可查看。列表按调用分页，新增消息预览与首次/变更的 System 行附在相关记录前，领域事件保持序列顺序。输入与领域轨迹分别分页；搜索完整保存的消息正文。成功 frame 的 modelCallId 精确关联请求，历史未记录时明确显示缺失。输入列表和详情读取失败可局部重试，不重置轨迹筛选、视窗或已选事件。

[`Trajectory`](../../../apps/goal-board/src/trajectory.tsx) 持有唯一的详情选择，事件详情与模型输入互斥，使用记录区内的同一侧栏；窄屏时详情与列表上下排列，时间轴始终可操作。消息行按保存索引定位、展开并标记对应消息，同一次调用内切换消息复用已加载详情。检查器展示完整消息顺序、System Prompt、与同一 Run 前次请求的系统文本比较、来源及 Raw。System 正文按内容引用复用，不在每次请求中重复落盘。详情超过 2 MiB 时拒绝，Diff 超过 2,000 行时改用完整 System/Raw 阅读；不提供当前配置重建历史的路径。原生工具声明与供应商转换后的 Wire 参数不属于该消息日志。

新增消息按角色、来源和正文比较，不依赖对象字段顺序。请求的 Output accepted 只取精确 callId 的已提交上下文帧；Output rejected 按同执行单元、同阶段的严格准备时间窗口关联唯一已提交校验反馈，并以下一次尝试限制窗口。分页、过滤或异常时间使证据不足时保留 Input prepared。失败重试默认折叠，搜索或定位到其中的事件时展开；Prompt 与反馈详情可以互相跳转。工具预览直接展示文本正文或 stdout，完整原始载荷仍保留在详情中。

响应与调用分页有界，但当前 Trajectory JSONL 及模型输入 Run 清单仍整文件读取，分页和搜索不保证磁盘读取成本有界。

## 模型目录

`GET /api/models` 从工作区私有偏好和当前 Provider 目录解析草稿实际默认模型，必要时返回 Provider 改变或模型不可用的回退原因；读取故障返回错误，不清除偏好。`GET /api/goals/:goalId/models?runId=...` 先核对最新 Goal/Run，再返回该 Goal 自身保存的选择。Composition Root 使用现有模型目录服务获取在线结果或离线目录兜底。浏览器边界仅投影模型标识、展示名、容量、能力和可用性来源。鉴权、权限、协议及目录不可用故障返回稳定错误码，不传递凭据或 Provider 原始响应。
`POST /api/project/model-preference` 验证当前 Provider 下的模型可选后保存工作区默认偏好。`POST /api/goals/:goalId/model-selection` 接收当前 Run 身份与模型 ID；浏览器命令服务在受理锁内核对安全等待状态或已完成、失败终态，服务端重新读取当前 Provider 目录并检查可选性，再由 Runtime 模型选择协调器保存完整非敏感选择。终态选择与下一 Run 消息共享浏览器受理锁；先保存的选择由下一 Run 继承，新 Run 已提交时旧 Run 请求被拒绝。Goal 选择提交后再写偏好，写入失败仅以 `defaultModelSaved: false` 报告，不回滚 Goal。旧 Run、Action 审批、忙碌与不可选模型不会改写快照或偏好。
模型选择在安全等待点由 Runtime 模型选择协调器提交。执行前由装配按最新 Goal 快照重新对齐模型 Binding：无法由本进程服务的 Provider 明确失败并中止本次推进，不回退其他 Goal 或进程默认配置。进程重启或多个 Goal 交替使用时，每次推进均以对应 Snapshot 为准，不继承上一个 Goal 的进程全局 Binding。

## 受管 Provider 设置

`GET /api/providers` 返回掩码后的档案列表、激活标识与只读的 `config.toml` 回退来源；`POST /api/providers`、`PATCH`/`DELETE /api/providers/:providerProfileId` 与 `POST .../activate`、`POST .../test` 分别受理创建、更新、删除、激活与连接测试。响应类型中没有明文凭据字段，只投影 `hasApiKey` 与 `apiKeyMask`；更新省略 `apiKey` 表示保留原凭据；删除激活档案被拒绝，删除其它档案返回"可能被 Goal 引用"的显式提示。连接测试只触发在线模型列表拉取，不发起生成请求，并按鉴权、权限、协议、不可用分类。所有写请求与其它路由一样受同源检查、Bearer 令牌与 `Origin` 要求保护。

模型目录投影新增来源维度：`BrowserModelCatalog` 可携带当前 `profileId` 与 `sources`（受管档案加回退来源，含 `active` 标记）；`GET /api/models` 与 `GET /api/goals/:goalId/models` 接受可选 `providerProfileId` 以读取非激活来源的目录。偏好写入与 Goal 模型选择命令同样接受可选 `providerProfileId`，使草稿默认与 Goal 内切换能够落到指定来源；Goal 内切换仍复用既有安全等待点与协调器提交边界。

`POST /api/providers/models` 接受未保存的 Provider 连接参数，经共享命令合同、wire 文本上限及可选档案 ID 校验后调用只读模型查询端口；沿用同源 Origin 与 Bearer 授权，不保存输入。响应仅含模型 ID/名称或稳定错误分类，不包含凭据与供应商原始响应。

会话步骤按已提交的 `think_requested` 请求身份独立投影显式 Think，配对同执行单元的 `think_completed` 输出；请求和完成保持同一来源身份。目标最多 4,000 字符，输出最多 64,000 字符，超限标记 `think.truncated`，完整事件通过轨迹详情读取。未提交输出不进入会话；只有请求时保留未完成状态，后续 Run 失败或取消事实使未完成 Think 显示失败。Think 与同执行单元的最终 Action 分开显示，保持实际先后顺序与原 Step 序号，不修改 Runtime 的 Step 计数。

Activity 白名单同时投影已提交的模型纠错、请求失败、历史检索与审批状态。诊断说明只由来源枚举、步骤/尝试次数和安全 HTTP 状态生成，不复制原始反馈、约束或检索内容；终态 `INVALID_AGENT_DECISION` 摘要根据最近一次已提交纠错来源区分完成审查拒绝与输出格式失败。同一 Action 的决策、审批、执行、重试与结果事实都携带该动作的最终工具状态和按来源顺序排列的生命周期记录；前端按 Action 身份将这些事实折叠为一个活动，授权过程只在活动详情中展开，正在等待授权的活动仍以 `Awaiting approval` 明确显示。已计算的 Action 阶段关联进入外层事实 `stageId`，供前端将工具放回真实 Stage。实时私有事件仍不公开，前端经提交通知刷新同一持久化 Activity 页。

四种历史检索事实额外携带原有 `lookupId`；请求类别仅由 `operation`、`need` 枚举生成，失败只公开已知错误码。原始查询、结果命中与错误消息仍留在 Trajectory，不进入 Activity 响应。

Activity 页的 Run 上下文可带安全终态摘要，仅从该 Run 固定提交水位内的失败事实生成。公开受限错误代码与固定说明，不复制异常正文；未记录原因时省略，不能借用当前 Run 的错误。工具状态也按同一提交水位构建。该摘要仅服务历史折叠行，不产生第二份 Runtime 状态。
