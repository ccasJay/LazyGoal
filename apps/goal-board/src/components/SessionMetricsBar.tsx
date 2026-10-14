import { useState } from "react";
import { Database, Gauge, X } from "lucide-react";
import { Modal } from "../modal";
import {
  type MetricsState,
  metricCoverage,
  metricNumber,
  metricPercent,
  metricSpeed,
} from "../types";

export function SessionMetricsBar({ state }: { state?: MetricsState }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (state?.kind === "error") return <div className="session-metrics-state">Recorded metrics unavailable</div>;
  if (state === undefined) return <div className="session-metrics-state">Loading recorded metrics…</div>;
  const metrics = state.value;
  const coverage = metricCoverage(metrics);
  return (
    <>
      <button
        type="button"
        className="session-metrics"
        aria-label="View recorded Goal metrics"
        onClick={() => setDetailsOpen(true)}
      >
        <span className="session-metric">
          <Gauge size={15} aria-hidden="true" />
          <span>
            {metrics.roundCount} run{metrics.roundCount === 1 ? "" : "s"} · {metrics.stepCount} step
            {metrics.stepCount === 1 ? "" : "s"}
          </span>
          <span className="session-metric-divider">·</span>
          <span
            title={`${metrics.throughputMeasuredCalls} measured calls; ${metrics.throughputExcludedCalls} excluded calls`}
          >
            {metricSpeed(metrics.tokensPerSecond)} tok/s
          </span>
        </span>
        <span className="session-metric">
          <Database size={15} aria-hidden="true" />
          <span>
            {metricNumber(metrics.inputTokens)} in / {metricNumber(metrics.outputTokens)} out
          </span>
          <span className="session-metric-divider">·</span>
          <span
            title={`${metrics.cacheMeasuredCalls} measured calls; ${metrics.cacheExcludedCalls} excluded calls`}
          >
            Cache hit {metricPercent(metrics.cacheHitRate)}
          </span>
        </span>
        <span
          className="session-metric"
          title="Remaining context after the latest confirmed call on the current model"
        >
          <span
            className="context-ring"
            style={{
              background:
                metrics.contextRemainingPercent == null
                  ? "#59606d"
                  : `conic-gradient(var(--blue) ${metrics.contextRemainingPercent * 100}%, #59606d 0)`,
            }}
            aria-hidden="true"
          />
          <span>Context left {metricPercent(metrics.contextRemainingPercent ?? null)}</span>
        </span>
        {coverage !== null && (
          <span className="session-metrics-coverage" title="Provider usage coverage">
            {coverage}
          </span>
        )}
      </button>
      {detailsOpen && (
        <Modal className="metrics-dialog" label="Recorded Goal metrics" onClose={() => setDetailsOpen(false)}>
          <div className="model-picker-head">
            <h2>Recorded Goal metrics</h2>
            <button
              className="icon"
              aria-label="Close metrics"
              onClick={() => setDetailsOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          <dl className="metrics-details">
            <dt>Runs / committed steps</dt>
            <dd>
              {metrics.roundCount} / {metrics.stepCount}
            </dd>
            <dt>Input / output tokens</dt>
            <dd>
              {metricNumber(metrics.inputTokens)} / {metricNumber(metrics.outputTokens)}
            </dd>
            <dt>Generation</dt>
            <dd>
              {metricSpeed(metrics.tokensPerSecond)} tok/s{" "}
              <small>
                {metrics.throughputMeasuredCalls} measured · {metrics.throughputExcludedCalls} excluded calls
              </small>
            </dd>
            <dt>Cache hit</dt>
            <dd>
              {metricPercent(metrics.cacheHitRate)}{" "}
              <small>
                {metrics.cacheMeasuredCalls} measured · {metrics.cacheExcludedCalls} excluded calls
              </small>
            </dd>
            <dt>Context left</dt>
            <dd>
              {metricPercent(metrics.contextRemainingPercent ?? null)}{" "}
              <small>Latest confirmed call on the current model</small>
            </dd>
            <dt>Usage coverage</dt>
            <dd>{coverage ?? "Complete coverage"}</dd>
          </dl>
          <p className="metrics-note">— means unavailable. Missing values are not counted as zero.</p>
        </Modal>
      )}
    </>
  );
}

