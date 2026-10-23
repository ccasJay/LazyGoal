import { ChevronDown } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { Button } from "./ui/button";
import { type MetricsState, metricCoverage, metricNumber, metricPercent, metricSpeed } from "../types";

/** 在输入框下方独立一行展示 Goal 聚合指标；计量说明和当前 Run 状态按需打开。 */
export function SessionMetricsBar({ state, runStatus }: { state?: MetricsState; runStatus?: string }) {
  const metrics = state?.kind === "ready" ? state.value : undefined;
  const coverage = metrics === undefined ? null : metricCoverage(metrics);
  return <div className="session-metrics" aria-label="Goal metrics">
    <Popover>
    <PopoverTrigger asChild><Button variant="ghost" size="sm" className="session-metrics-details-trigger">Goal metrics<ChevronDown size={12} /></Button></PopoverTrigger>
    <PopoverContent side="top" align="center" className="metrics-popover">
      {runStatus && <p className="text-xs text-muted-foreground">Current run · {runStatus}</p>}
      <h3 className="text-sm font-medium py-2">Goal metrics</h3>
      {metrics === undefined ? <p className="text-xs text-muted-foreground">{state?.kind === "error" ? "Recorded metrics unavailable" : "Loading recorded metrics…"}</p> : <>
        <dl className="metrics-details">
          <dt>Runs / committed steps</dt><dd>{metrics.roundCount} / {metrics.stepCount}</dd>
          <dt>Input / output tokens</dt><dd>{metricNumber(metrics.inputTokens)} / {metricNumber(metrics.outputTokens)}</dd>
          <dt>Output rate</dt><dd>{metricSpeed(metrics.tokensPerSecond)} tok/s<small>{metrics.throughputMeasuredCalls} measured · {metrics.throughputExcludedCalls} excluded calls</small><small>Application-observed end-to-end provider request rate. Includes provider wait and response transfer; not provider-internal decode speed.</small></dd>
          <dt>Cache hit</dt><dd>{metricPercent(metrics.cacheHitRate)}<small>{metrics.cacheMeasuredCalls} measured · {metrics.cacheExcludedCalls} excluded calls</small></dd>
          <dt>Context left</dt><dd>{metricPercent(metrics.contextRemainingPercent ?? null)}<small>Latest confirmed call on the current model</small></dd>
          <dt>Usage coverage</dt><dd>{coverage ?? "Complete coverage"}</dd>
        </dl><p className="metrics-note">— means unavailable. Missing values are not counted as zero.</p>
      </>}
    </PopoverContent>
    </Popover>
    {metrics === undefined ? <span className="session-metric">{state?.kind === "error" ? "Metrics unavailable" : "Loading metrics…"}</span> : <>
      <span className="session-metric">{metrics.roundCount} runs · {metrics.stepCount} steps</span>
      <span className="session-metric" title="Input / output tokens">{metricNumber(metrics.inputTokens)} in / {metricNumber(metrics.outputTokens)} out</span>
      <span className="session-metric" title="Application-observed end-to-end provider request rate">{metricSpeed(metrics.tokensPerSecond)} tok/s</span>
      <span className="session-metric">Cache {metricPercent(metrics.cacheHitRate)}</span>
      <span className="session-metric">Context {metricPercent(metrics.contextRemainingPercent ?? null)}</span>
    </>}
  </div>;
}
