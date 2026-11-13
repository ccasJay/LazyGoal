---
feature: permission-modes
status: proposed
risk: high
created_at: 2026-11-13
delivered_at: null
supersedes: []
superseded_by: null
---

# 权限档位与执行期资源边界

## 目标与范围

把"能接触哪些资源"从创建 Goal 时冻结的逐 Goal 上限，改为 workspace 级权限档位的 `sandbox`／`approvals`／`reviewer` 三轴，在执行期按 Action 判定：边界内自动执行，越界才进入裁决。
范围限于权限判定、Seatbelt 策略生成与权限入口；不改造 Tool 输出契约、模型协议或基准评测流程。

## 用户故事

- **S1** 作为本机 Web 用户，我希望按档位决定哪些动作直接执行、哪些需要确认，以便不必逐条批准命令。
- **S2** 作为本机 Web 用户，我希望越界请求展示真实范围并可批准或有界拒绝，以便知道批准了什么、拒绝后任务还能继续。
- **S3** 作为使用 Full access 的用户，我希望本机文件与网络不受限，但 LazyGoal 自身状态永不可写，以便完全放权时仍有不可关闭的保护。
- **S4** 作为无界面运行方（Worker／Benchmark），我希望同一策略在无人工时也能裁决且不产生无人可答的等待，以便自动化不会挂起。
- **S5** 作为维护者，我希望权限入口只呈现真实生效的档位与边界豁免，以便不把已退役的 Tool 授权误当成已放行。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | 用户在项目里选择 Ask for approval、Approve for me、Full access 或 read-only 自定义 | 持久化该 profile 的 `sandbox`、`approvals`、`reviewer`、`writableRoots` 与递增 revision，下一次 Action 决策即使用该值；并发提交返回当前 revision 的值，不静默覆盖 | permission 与 storage 单元测试，权限设置接口集成测试 |
| R1.2 | S1 | 普遍 | 档位为 workspace-write，且 Action 只涉及工作区树读写、`.git` 读取、`writableRoots` 或常规本机命令 | 不产生审批等待、不创建授权记录，直接执行；`git_status` 等只读 Git 工具无需人工介入 | runtime 集成测试覆盖 `bash`、`git_status`、`write_file` |
| R1.3 | S1 | 异常 | 档位为 read-only，且 Action 需要工作区写入 | 以 `TOOL_NOT_AUTHORIZED` 拒绝并说明档位原因，作为可修复反馈交回模型，Run 不进入 failed | runtime 测试断言错误码、反馈内容与 Run 状态 |
| R2.1 | S2 | 事件 | 档位为 workspace-write + on-request + user，Action 请求工作区外写入、`.git` 写入或出站网络 | 暂存 `approvalKind: "sandbox"` 等待并展示真实范围；批准后仅执行该次 Action，拒绝后有界原因回灌模型且 Goal 可继续推进 | runtime 集成测试覆盖批准与拒绝两条路径 |
| R2.2 | S2 | 事件 | 档位为 auto_review，Action 越界 | 命中规则表（工作区外写入、出站网络、破坏性命令）时暂停等待人工；其余越界自动放行，并记录裁决事实与实际范围 | runtime 测试分别覆盖命中与未命中 |
| R2.3 | S2 | 异常 | 档位为 never，Action 越界 | 直接拒绝且不产生等待；消息说明档位与越界项 | runtime 测试 |
| R2.4 | S3 | 状态 | 档位为 danger-full-access | 工作区外读写与出站网络无需审批即执行；`.lazygoal` 写入仍以 `TOOL_NOT_AUTHORIZED` 拒绝 | macOS Seatbelt 真实执行测试 |
| R3.1 | S1 | 状态 | Action 已暂存审批后，用户切换档位或修改 `writableRoots` | 已暂存决定保留暂存时的 `sandbox`、`reviewer`、revision 与真实范围，恢复执行不重算；新档位只作用于之后的新 Action | 恢复测试：暂存、切档、重建 Runtime、执行 |
| R3.2 | S1 | 异常 | profile 记录损坏、版本不支持或读取失败 | 拒绝新的受限 Action 并报告权限故障，不退回任何默认档，也不据旧缓存放行 | storage 与集成测试 |
| R4.1 | S4 | 状态 | 无人工 reviewer 的宿主（Worker／Benchmark）执行越界 Action | `user` 审阅档退化为 auto_review 规则裁决，不产生无人可答的等待；宿主可显式选用 never | Worker 权限往返集成测试 |
| R4.2 | S4 | 异常 | 平台或环境无法强制该档位的文件与网络边界 | 显式报告边界未强制及其范围，不声称已隔离；审批与规则裁决照常生效 | 沙箱能力探测单元测试 |
| R5.1 | S5 | 普遍 | 打开权限入口 | 展示当前档位与三轴取值，只列边界越界豁免，不再出现 Tool 级授权；撤销豁免后同一越界重新进入裁决 | goal-board 组件测试与 UI harness |

组合：以真实 Seatbelt 在隔离临时目录串联三档边界（工作区内命令、`.git` 读取、越界写入、出站网络、`.lazygoal` 拒绝）。运行 `npm test`、`npm run test:ui-harness` 与 `npm run check:docs`。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| 资源边界由 workspace 级 profile 的 `sandbox` 轴决定，`approvals`／`reviewer` 只决定越界裁决；每个 Action 决策期重新读取，创建 Goal 不再冻结 sandbox 上限（`triggerContext.authorization.sandbox` 退役）。 | 边界与审批是正交控制，逐 Goal 冻结会形成无法批准的硬墙。 | 保留每 Goal 上限作为策略或硬墙，即当前 `git_status` 直接失败的成因。 |
| 取消 Tool 级审批与 Tool Grant 账本，只保留边界越界豁免，默认 Tool 策略不再产生 `require_approval`。 | 审批只服务于跨越边界，双层审批重复且与资源无关。 | 保留 `default`／`yolo` 两档与精确输入 Tool 授权。 |
| 边界 baseline 固定为工作区树读写、`.git` 读取、`writableRoots` 与常规本机命令；`.git` 写入、工作区外访问、出站网络属越界；`.lazygoal` 在任何档位都拒绝。 | 修正 `.git` 读取被当作越界的现状，同时保留受保护写入。 | 沿用 `extraFiles` 只表示增量、把工作区内 `.git` 读取视为越界。 |
| auto_review 使用确定性规则表，不调用模型；Worker 的模型代审退役，与 Web 共用同一实现。 | 可解释、无额外延迟与不确定性。 | 模型审阅越界请求；该选择取代 `worker-process-trigger` R3.1 的 LLM 代审。 |
| 暂存决定在暂存时绑定 `sandbox`、`reviewer`、revision 与真实范围，恢复执行不重算。 | 同一 Action 不能因切档得到两种结论。 | 执行前按最新档位重算。 |

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| high | 权限边界整体改造，默认放行面扩大，规则错误会静默放宽或误拦。 | 真实执行工作区外读写与出站网络的验收前需明确授权，且限定在隔离临时目录；不连接真实外部网络，不写项目外的真实用户文件。 |
| medium | 新增 read-only 与 danger-full-access 的 Seatbelt 策略生成与平台能力探测，规则错误会造成虚假隔离声明。 | 真实 Seatbelt 验收只在 `/tmp` 隔离目录运行。 |
| medium | 退役 Goal 上限与 Tool 授权改变既有 Worker 权限往返与开发期权限数据语义。 | 不重放既有 Goal；删除开发期权限数据前需明确授权。 |

- 不得以档位已选就代替实际强制；未强制时必须报告；覆盖 R4.2。
- 审批与 auto_review 只能决定是否放行，不得改写 Action 输入、路径或网络范围；覆盖 R2.1–R2.4。
- 拒绝不得降级为 `TOOL_EXECUTION_ERROR`，也不得终结 Run；覆盖 R1.3、R2.3。

## 任务

- [ ] //TODO 1. 定义三轴 profile 契约与三档预设，替换 `default`／`yolo` 的持久化与读写接口 → R1.1；检查：permission/storage 单元测试与类型检查
- [ ] //TODO 2. 实现边界判定表与 baseline（工作区树、`.git` 读、`writableRoots`、常规命令）→ R1.2, R1.3；检查：判定矩阵单元测试
- [ ] //TODO 3. 退役逐 Action 上限硬拒绝，改为决策期读取当前 profile → R1.2；检查：runtime 回归测试与契约生成
- [ ] //TODO 4. 实现 user 审阅的越界暂存、批准单次执行与拒绝回灌 → R2.1；检查：runtime 集成测试
- [ ] //TODO 5. 实现 auto_review 确定性规则表与裁决事实记录 → R2.2；检查：runtime 测试
- [ ] //TODO 6. 实现 never 直接拒绝与 danger-full-access 放行（保留 `.lazygoal` 拒绝）→ R2.3, R2.4；检查：runtime 与真实 Seatbelt 测试
- [ ] //TODO 7. 暂存决定绑定 revision 与真实范围，恢复执行不重算 → R3.1；检查：恢复测试
- [ ] //TODO 8. profile 损坏与读取失败失败关闭 → R3.2；检查：storage 测试
- [ ] //TODO 9. 无人工宿主退化为 auto_review，退役 Worker 模型代审 → R4.1；检查：Worker 权限往返测试
- [ ] //TODO 10. 生成 read-only 与 danger-full-access 的 Seatbelt 策略并报告平台强制能力 → R4.2；检查：策略快照与能力探测单元测试
- [ ] //TODO 11. 退役 Tool 级审批与 Tool Grant，权限入口收敛为三档加边界豁免 → R5.1；检查：goal-board 组件测试与类型检查
- [ ] //TODO 12. 更新 permission、sandbox、runtime、goal-server、goal-board 的 overview 与语义表 → R1.1, R5.1；检查：`npm run check:docs`

## 执行记录

- 状态：未执行
- 验证：-
- 结果：-
- 未决：无
