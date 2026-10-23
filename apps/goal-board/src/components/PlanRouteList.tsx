import type { BrowserPlanRoute } from "../../../../packages/web-contracts/src/index";
import { renderPlanRouteStatusLabel } from "./run-stage-utils";
import { Badge } from "./ui/badge";

/**
 * 完整 Plan Run 路线列表的展示属性。
 *
 * @example
 * ```tsx
 * <PlanRouteList route={run.planRoute} />
 * ```
 */
export interface PlanRouteListProps {
  /** 已批准 Plan Run 的完整 Runtime 权威路线；普通 Run 省略。 */
  readonly route: BrowserPlanRoute | undefined;
}

/**
 * 在 Activity 时间线上独立展示 Plan Run 的阶段路线，不依赖执行事件是否显示。
 *
 * @param props - 当前 Run 的路线 DTO。
 * @returns 有路线时返回完整有序阶段列表；普通 Run 无路线时不渲染内容。
 * @example
 * ```tsx
 * <PlanRouteList route={run.planRoute} />
 * ```
 */
export function PlanRouteList({ route }: PlanRouteListProps) {
  if (route === undefined) return null;
  return (
    <section className="plan-route-list" aria-label="Run plan">
      <header className="plan-route-heading">
        <strong>Run plan</strong>
        <span>Revision {route.revision}</span>
      </header>
      {route.revisionReason && <p className="plan-route-reason">{route.revisionReason}</p>}
      <ol>
        {route.stages.map((stage, index) => (
          <li className={`plan-route-stage ${stage.status}`} key={stage.stageId} aria-current={stage.status === "executing" ? "step" : undefined}>
            <span className="plan-route-index" aria-hidden="true">{index + 1}</span>
            <div className="plan-route-stage-content">
              <div className="plan-route-stage-heading">
                <strong>{stage.target}</strong>
                <Badge variant="outline" className={`plan-route-status ${stage.status}`}>{renderPlanRouteStatusLabel(stage.status)}</Badge>
              </div>
              <ul aria-label={`Stage ${index + 1} acceptance criteria`}>
                {stage.acceptanceCriteria.map((criterion, criterionIndex) => (
                  <li key={`${stage.stageId}:criteria:${criterionIndex}`}>{criterion}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
