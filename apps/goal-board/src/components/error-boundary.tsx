import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { CircleHelp } from "lucide-react";

/**
 * 会话视图的渲染错误边界。
 *
 * @remarks
 * 捕获子树渲染异常：错误边界内渲染错误卡（错误摘要与"Reload session"入口），
 * 顶层 shell（顶栏、看板、模型选择器）不受影响；不引入第三方错误上报库。
 * 捕获到异常时把 error 与组件栈输出到 `console.error`，保持可诊断性；
 * 边界不承担副作用清理责任，子树既有的 abort/cleanup 行为不因边界存在而改变。
 * 重载入口由调用方注入（会话视图内为快照重载，顶层 shell 内为整页刷新）。
 *
 * @example
 * ```tsx
 * <SessionBoundary label="Session view" onReload={() => void refreshSelectedSession()}>
 *   <ActivityView session={session} />
 * </SessionBoundary>
 * ```
 */
export interface SessionBoundaryProps {
  /** 被包裹的会话视图子树。 */
  readonly children: ReactNode;
  /** 错误卡的 aria 标识，说明该边界守护的视图。 */
  readonly label: string;
  /** 用户点击重载入口时执行；不会自动触发。 */
  readonly onReload: () => void;
}

interface SessionBoundaryState {
  readonly error: unknown;
}

export class SessionBoundary extends Component<SessionBoundaryProps, SessionBoundaryState> {
  override state: SessionBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: unknown): SessionBoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 错误与组件栈必须进入控制台，避免错误边界掩盖真实缺陷。
    console.error("[goal-board] render error in session view:", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error !== undefined) {
      const { label, onReload } = this.props;
      return (
        <div className="session-empty" role="alert" aria-label={label}>
          <CircleHelp size={24} />
          <p>The view hit an unexpected rendering error. The underlying Goal data is still saved.</p>
          <button className="secondary" onClick={onReload}>Reload session</button>
        </div>
      );
    }
    return this.props.children;
  }
}
