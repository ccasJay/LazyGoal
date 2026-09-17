# Implementation Plan

- [x] //TODO 1. 实现 Transcript 协议、Markdown collector 与调度器

  - 实现目标：新增 `StreamingTranscriptController`、协议事件、快照、稳定 block collector、40ms 自适应 commit tick、同步 flush 与生命周期清理；补充公共中文 TSDoc。
  - 成功判据：任意 delta 切分产生相同全文与等价 block 顺序；非法生命周期不修改状态；pending 内容在提交前持续出现在 live tail；reset/dispose 后无迟到发布。
  - 验证方式：待实现的 transcript controller 单元测试，使用 fake scheduler 覆盖协议、Markdown 边界、批量公式和清理路径。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2)_

- [x] //TODO 2. 实现统一 Ink Markdown renderer

  - 实现目标：接入 `marked`，把支持的 block/inline token 映射为 Ink 组件，并为未知 token 保留 raw 文本；历史与 tail 复用同一入口。
  - 成功判据：标题、段落、强调、行内代码、链接、列表、引用、围栏代码、分隔线和 GFM 表格可读渲染，未知结构不丢内容。
  - 验证方式：待实现的 renderer 组件测试，覆盖支持 token、未知 token 回退和 committed/live 两种调用方式。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 3. 将 Transcript 接入 SessionController 时间线

  - 实现目标：扩展 ViewModel 公共类型和 `SessionController`，统一拥有 timeline、transcript 订阅、完整 Assistant 合成流、恢复 hydrate、user/step flush barrier 与 Goal 隔离。
  - 成功判据：新 Assistant 消息渐进追加 block；恢复消息立即可见；后续 user/step 不越序；Goal 切换、shutdown 和 dispose 不接收旧流更新；最终文本与 canonical 内容一致。
  - 验证方式：扩展 `session-controller` 测试，使用可控 scheduler 覆盖合成流、恢复、排序、切换、关闭和全文一致性。
  - _Requirements: [1.3](./requirements.md#req-1-3), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [5.3](./requirements.md#req-5-3)_

- [ ] //TODO 4. 重构 SessionScreen 为 Static 历史与动态尾部

  - 实现目标：删除 Screen 内本地历史累积，直接渲染 `timeline`；在 `Static` 与 `ActiveDrawer` 之间渲染统一 Markdown live tail，保持 Preparation 不变。
  - 成功判据：block 从 tail 转入历史时无重复或消失；composer 始终位于 tail 下方；rerender 保留已有消息与步骤；终端 resize 不触发历史重建。
  - 验证方式：扩展 `session-screen` 测试，覆盖 Markdown tail、提交迁移、步骤历史、交互布局和恢复帧。
  - _Requirements: [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [4.4](./requirements.md#req-4-4), [5.1](./requirements.md#req-5-1)_

- [ ] //TODO 5. 同步架构文档并完成全量验证

  - 实现目标：更新当前 TUI 架构中的 transcript 所有权、数据流、恢复和 resize 限制，并核对公共导出与依赖声明。
  - 成功判据：架构文档只描述已实现行为；所有需求有自动化证据；现有 Preparation、Session waterfall、shutdown 与恢复行为不回归。
  - 验证方式：运行相关 TUI 测试、`npx tsc --noEmit`、`node scripts/run-regression.mjs`、`git diff --check`。
  - _Requirements: [1.3](./requirements.md#req-1-3), [3.3](./requirements.md#req-3-3), [4.2](./requirements.md#req-4-2), [4.4](./requirements.md#req-4-4)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2) | 合法事件确定性累积；乱序、错误 ID 和并发开始稳定失败且不污染状态 | transcript controller 协议测试（待实现） |
| [1.3](./requirements.md#req-1-3) | reset、Goal 切换、shutdown 与 dispose 后 timer 和迟到事件不再发布 | controller 生命周期测试（待实现） |
| [1.4](./requirements.md#req-1-4), [5.3](./requirements.md#req-5-3) | `getText()` 和最终导出逐字符等于输入及 canonical 消息 | 分块不变量与 Session 集成测试（待实现） |
| [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2) | 未结束行、段落、列表、引用、Setext、围栏和表格在结构稳定前留在 tail | collector fixture 测试（待实现） |
| [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4) | pending 与 mutable 内容连续可见，complete 后无丢失且不受 delta 切分影响 | collector 与快照测试（待实现） |
| [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2) | fake clock 下按 40ms 和批量公式迁移，历史与 tail 原子交接 | scheduler 测试（待实现） |
| [3.3](./requirements.md#req-3-3) | resize 不清屏、不重建已提交历史 | Session 渲染与终端行为测试（待实现） |
| [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2) | 新 Assistant 完整消息渐进提交，恢复消息直接 hydrate | SessionController 集成测试（待实现） |
| [4.3](./requirements.md#req-4-3) | user message 和 step 在未完成流之后追加 | 时间线排序测试（待实现） |
| [4.4](./requirements.md#req-4-4) | `Static` 历史、live tail、状态和 composer 顺序稳定，Preparation 不变 | Ink Screen 回归测试（待实现） |
| [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2) | 常用 Markdown 在历史与 tail 一致渲染，未知 token 保留 raw | Markdown renderer 测试（待实现） |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。
