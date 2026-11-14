import { ChevronDown, CircleSlash } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Button } from "./ui/button";
import { type MetricsState, metricCoverage, metricNumber, metricPercent, metricSpeed } from "../types";
import type { SessionMetricsContextUsage } from "../../../../packages/web-contracts/src/index";

/** 已用比例与容量来源的可读说明；容量或占用不可用时说明原因。 */
function contextDetail(usage: SessionMetricsContextUsage | null): string {
  if (usage === null) {
    return "Context usage unavailable: no settled call on the current model, or the work window capacity is unknown";
  }
  const capacity = usage.source === "configured" ? "configured limit" : "model context window";
  const source = usage.estimated ? "estimated from the request" : "reported by the provider";
  return `Context used ${metricPercent(usage.usedPercent)} of ${metricNumber(usage.capacityTokens)} tokens (${capacity}); ${source}`;
}

/** 在输入框下方独立一行展示 Goal 聚合指标；计量说明和当前 Run 状态按需打开。 */
export function SessionMetricsBar({ state, runStatus }: { state?: MetricsState; runStatus?: string }) {
  const metrics = state?.kind === "ready" ? state.value : undefined;
  const coverage = metrics === undefined ? null : metricCoverage(metrics);
  const contextUsage = metrics?.contextUsage ?? null;
  const detail = contextDetail(contextUsage);
  return <div className="session-metrics" aria-label="Goal metrics">
    <Popover>
    <PopoverTrigger asChild><Button variant="ghost" size="sm" className="session-metrics-details-trigger">Goal metrics<ChevronDown size={12} /></Button></PopoverTrigger>
    <PopoverContent side="top" align="center" className="metrics-popover">
      {runStatus && <p className="text-xs text-muted-foreground">Current run: {runStatus}</p>}
      <h3 className="text-sm font-medium py-2">Goal metrics</h3>
      {metrics === undefined ? <p className="text-xs text-muted-foreground">{state?.kind === "error" ? "Recorded metrics unavailable" : "Loading recorded metrics…"}</p> : <>
        <dl className="metrics-details">
          <dt>Runs / committed steps</dt><dd>{metrics.roundCount} / {metrics.stepCount}</dd>
          <dt>Input / output tokens</dt><dd>{metricNumber(metrics.inputTokens)} / {metricNumber(metrics.outputTokens)}</dd>
          <dt>Output rate</dt><dd>{metricSpeed(metrics.tokensPerSecond)} tok/s<small>{metrics.throughputMeasuredCalls} measured, {metrics.throughputExcludedCalls} excluded calls</small></dd>
          <dt>Cache hit</dt><dd>{metricPercent(metrics.cacheHitRate)}<small>{metrics.cacheMeasuredCalls} measured, {metrics.cacheExcludedCalls} excluded calls</small></dd>
          <dt>Context used</dt><dd>{metricPercent(contextUsage?.usedPercent ?? null)}<small>{detail}</small></dd>
          <dt>Usage coverage</dt><dd>{coverage ?? "Complete coverage"}</dd>
        </dl>
      </>}
    </PopoverContent>
    </Popover>
    {metrics === undefined ? <span className="session-metric">{state?.kind === "error" ? "Metrics unavailable" : "Loading metrics…"}</span> : <>
      <span className="session-metric">{metrics.roundCount} {metrics.roundCount === 1 ? "run" : "runs"}, {metrics.stepCount} {metrics.stepCount === 1 ? "step" : "steps"}</span>
      <span className="session-metric" title="Input / output tokens">{metricNumber(metrics.inputTokens)} in / {metricNumber(metrics.outputTokens)} out</span>
      <span className="session-metric" title="Application-observed end-to-end provider request rate">{metricSpeed(metrics.tokensPerSecond)} tok/s</span>
      <span className="session-metric">Cache {metricPercent(metrics.cacheHitRate)}</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="session-metric" tabIndex={0} aria-label={detail} data-context-state={contextUsage === null ? "unavailable" : contextUsage.estimated ? "estimated" : "reported"}>
              {contextUsage === null
                ? <>Context <CircleSlash size={12} aria-hidden="true" /> unavailable</>
                : <>Context {metricPercent(contextUsage.usedPercent)}{contextUsage.estimated ? "*" : ""}</>}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{detail}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>}
  </div>;
}
