# 浏览器轨迹接入验证

验证日期：2026-10-01。

## 实现与范围

- [正式工作区只读路由](../../packages/browser/src/browser-trajectory.ts)提供完整 Run 目录、提交边界内的摘要分页、全 Run 搜索、执行单元定位和有界事件详情。
- [轨迹页面](../../prototypes/goal-board/src/trajectory.tsx)沿用三泳道、事件记录表与详情检查器；时间缺失时使用序列视图，概览明确只覆盖当前页。缺少身份的事件保留在 Run 层级，不从位置猜测 Step。
- [会话入口](../../prototypes/goal-board/src/main.tsx)替换 Details 标签，保留 Goal info 与授权管理，并在 Activity 每个展开 Step 底部提供真实轨迹定位按钮。
- [架构文档](../../docs/architecture/browser.md)记录新增数据流、可见内容、刷新行为与读取限制。未修改 Runtime 执行协议或持久化格式。

## 验证结果

- `npm test`：类型检查、依赖边界、GEPA adapter、1,592 个 TypeScript 测试和 14 个 scripts 测试全部通过。
- `npm run test:e2e --prefix prototypes/goal-board`：两个端到端流程通过；真实 Runtime 覆盖保存、恢复、Action 审批、工具执行、Step 跳转、完整已提交输出、后续 Run、Plan Mode 与重载。
- [轨迹接口测试](../../packages/browser/test/browser-trajectory.test.ts)：八个用例通过，覆盖查询输入、访问控制、当前与历史提交边界、超出 Activity 限制的 Run 目录、分页与跨页 Action 关联、未确认 Observation、异常计时、完整载荷搜索及详情大小限制。
- 真实 JSONL 测试读取 10,010 条事件、提交其中 10,000 条；末页返回 100 条且排除 tail。独立运行约 54 ms，全量并发回归约 333 ms；内存读取器的末页响应约 27 KiB。数值是本机测试样本，不是性能保证。
- 浏览器人工核验：现有正式工作区历史 Step 跳转至所属 Run、选中首条已提交事实并转移焦点；工具 Input／Result 可读；390×844 窄屏详情可关闭并恢复记录浏览，较矮桌面窗口使用详情抽屉。
- 正式静态资源已通过前端构建更新；`git diff --check` 通过。

## 限制

Storage 仍整文件解析，HTTP 与 DOM 分页不使磁盘读取成本有界。单个完整详情响应超过 256 KiB 时明确拒绝，列表预览超过 800 字符时标识截断；模型耗时与逐事件用量不做推测。历史事件缺少 Step 身份时无法补造分组。Diagnostic Trace、轨迹修改与重放不在本次范围内。
