# Session 流式 Transcript 渲染设计

## 审批摘要

### 方案

在 `packages/tui` 内新增 React 外部的 `StreamingTranscriptController`，由 `SessionController` 把新完整 Assistant 消息转换为合成流，并将稳定 Markdown block、pending queue 和 mutable tail 投影到统一 Session 时间线。`SessionScreen` 只渲染 ViewModel：`Static` 承载 committed timeline，普通 React tree 承载 live tail 与交互区。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 单活动流协议 | 使用严格的 `started → delta* → completed` 生命周期和稳定协议错误；第一版只允许单条 Assistant 流，避免交错提交歧义 | 未来真实 delta 可直接接入，但生产者必须串行流 |
| 原始文本为合并权威 | `rawText` 独立于渲染 block 保存，`getText()` 不从历史或 tail 反推 | Markdown 分块和视觉提交不会改变最终消息内容 |
| 保守 Markdown block | 显式 collector 保留结构未闭合内容，使用 `marked` token 渲染稳定块与尾部 | 表格和代码块不会因过早进入 `Static` 而永久损坏 |
| 自适应 commit tick | 每 40ms 提交 `clamp(1, 8, ceil(queueLength / 8))` 个 block | 短回复自然迁移，长回复通常约八个 tick 追平 |
| Controller 拥有时间线 | `SessionController` 统一编排消息、步骤和 transcript，并对非流项目设置同步 flush barrier | React 不再复制历史状态，跨项目顺序可确定 |
| 完整消息与恢复分流 | 当前会话新增 Assistant 消息走合成流；初始或恢复消息直接 hydrate 为历史 | 上线即可看到效果，同时不回放旧消息动画 |
| 保留原生 scrollback | 继续使用主缓冲区和 Ink `Static`；resize 不重建已提交历史 | 保留终端滚轮和选择复制，但旧行不按新宽度重排 |

### 风险与待确认

- 风险等级：medium；理由：新增 TUI 公共协议、异步 timer 和时间线所有权，并替换 Session 核心渲染数据源，但不改变 Runtime 与持久化。
- 关键操作：无
- 风险：collector 的边界错误不可在 `Static` 中撤回；timer、Goal 切换和同步 flush 必须保持单调且无迟到通知。
- 待确认：无

## Overview

实现保持 Runtime `GoalMessage[]` 为 canonical 会话事实，只在 TUI 内建立 presentation transcript。`StreamingTranscriptController` 是纯状态机与 scheduler 的组合，`SessionController` 负责把领域快照差量映射为时间线，React 组件不再维护 `useRef` 历史副本。（需求 1、4）

```text
Goal Snapshot / future protocol events
                 |
                 v
       SessionController
       | synthetic events
       v
StreamingTranscriptController
  rawText
  committedBlocks
  pendingBlocks ---- commit tick ----+
  mutableTail                         |
       | snapshot                     |
       +------------------------------+
                 |
                 v
       UiSessionViewModel
       | timeline        | streamingTail
       v                 v
 Ink Static history   dynamic React tree
```

## Key Design Decisions

### 单活动流协议

公开事件只包含 `started`、`delta`、`completed`。每条事件带 `streamId`；`started` 还带由 `goalId` 与 message index 派生的稳定 `messageId`。controller 在收到并发开始、无活动流的 delta/complete 或错误 `streamId` 时抛出 `TranscriptProtocolError`，且先校验后修改状态。该错误验证生命周期而非重复验证 TypeScript 字段。（需求 1.1–1.3）

`reset()` 与 `dispose()` 取消 timer 并使旧流失效；`dispose()` 还清除订阅者。迟到调用只能得到协议错误，不能发布快照。

### 原始文本为合并权威

每个 `delta.text` 先追加到活动流的 `rawText`，再交给 collector。快照分别暴露 committed、pending、mutable tail，但 `getText()` 只返回 `rawText`。`completed` 后保留最终文本，直到下一条流开始或 reset；Session 集成用它校验合成流没有改变 canonical 内容。（需求 1.4、5.3）

### 保守 Markdown block

collector 只操作字符串与 block，不渲染 React。它保留未结束行，并按空行、围栏、列表/引用延续、表格延续和一行 look-behind 判断稳定边界。围栏代码必须看到匹配 closing fence；表格必须看到表体终止；Setext 标题与表格 header 在下一行明确前不得提交。`completed` 将剩余内容收束为最后 block。（需求 2）

`marked` 只负责把 block 或 live tail 转换为 token。Renderer 将支持的 token 映射到 Ink `Box`/`Text`；未知 token 使用 `token.raw`。稳定 block 保存 raw Markdown，不保存终端宽度相关的预渲染字符串。（需求 5.1、5.2）

### 自适应 commit tick

pending 非空时只保留一个 40ms timer。每次 tick 计算 `Math.min(8, Math.max(1, Math.ceil(queueLength / 8)))`，把对应前缀原子移动到 committed，并发布一次快照。`liveTail` 由剩余 pending raw 与 mutable tail 直接拼接，因此迁移前后字符连续且不会消失。队列仍非空时安排下一 tick，否则停止 timer。（需求 3.1、3.2）

`flush()` 取消 timer，把 collector 收束后的全部 pending 同步移入 committed 并发布一次，用作非流时间线项目的顺序 barrier。

### Controller 拥有时间线

`SessionController` 增加单调 `UiTimelineItem[]` 与 transcript 订阅。公开 ViewModel 增加：

```ts
type TranscriptStreamEvent =
    | { readonly kind: "started"; readonly streamId: string; readonly messageId: string }
    | { readonly kind: "delta"; readonly streamId: string; readonly text: string }
    | { readonly kind: "completed"; readonly streamId: string };

type UiTimelineItem =
    | { readonly kind: "message"; readonly id: string; readonly message: GoalMessage }
    | { readonly kind: "assistant_markdown"; readonly id: string; readonly block: string; readonly showAuthor: boolean }
    | { readonly kind: "step"; readonly id: string; readonly step: UiStepSummary };

interface UiStreamingTail {
    readonly messageId: string;
    readonly content: string;
    readonly showAuthor: boolean;
}
```

所有新增或扩展的公共接口及方法按仓库规则提供中文契约级 TSDoc 与最小示例。`messages` 和 `committedSteps` 保留，供 Preparation 与其他现有消费者使用；Session 的 `Static` 只消费 `timeline`。（需求 4）

### 完整消息与恢复分流

构造时恢复的 Goal、首次切入 executing 的 Goal，以及 Goal ID 变化后的快照通过 hydrate 路径直接生成 committed message 项。已经在活动 Session 中观察到的新 user message直接作为原子 message；新 Assistant message转换为 `started`、单个完整 `delta` 和 `completed`，其 committed blocks 通过 transcript 订阅追加到 timeline。（需求 4.1、4.2）

新 user message 或 step 到达前调用 `flush()`，再追加该项目。这样动画不会阻塞 Runtime，但时间线不会让后续事实越过 Assistant 内容。消息与步骤的去重继续使用 message index 与 step number。（需求 4.3）

### 保留原生 scrollback

`SessionScreen` 删除本地 `useTimelineItems`，直接渲染 ViewModel。`Static` 只接收 committed timeline；live tail 位于 `ActiveDrawer` 之前，使 composer 始终在最下方。终端 resize 由 Ink 重新渲染动态区和未来项目，已提交 scrollback 不清除、不重放。（需求 3.3、4.4）

## Error Handling

- 协议错误在修改状态前抛出 `TranscriptProtocolError`，保留最近有效快照。
- `reset()`、Goal 切换、shutdown 和 `dispose()` 都必须取消 timer；timer 回调在发布前再次核对 controller 未释放且 generation 未变化。
- Markdown renderer 对未知 token 回退到 raw 文本；单个不支持结构不得导致消息内容消失。
- 第一版没有失败流事件。真实 provider 流接入时必须另行定义失败后 partial content 的产品语义，不能借用 `completed`。

## Testing Strategy

- Collector 使用不同 delta 切分重复运行同一 Markdown fixture，断言原始全文与 block 顺序等价，并覆盖未结束行、Setext、列表、引用、围栏代码和 GFM 表格。（需求 1.4、2）
- Controller 使用 fake scheduler 验证 40ms 批量公式、单 timer、原子迁移、`flush()`、reset/dispose、迟到回调和协议错误。（需求 1、3）
- SessionController 测试新 Assistant 合成流、user/step barrier、恢复 hydrate、Goal 隔离与 canonical 文本一致性。（需求 4、5.3）
- Ink 测试历史与 tail 的统一 Markdown 输出、tail 位于交互区之上、历史 rerender 不丢失，以及 resize 不主动重建历史。（需求 3.3、4.4、5）
- 完成功能测试后运行 TypeScript 类型检查与仓库全量回归。
