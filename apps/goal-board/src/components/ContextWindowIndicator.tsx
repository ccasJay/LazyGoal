import { useId, useState, type CSSProperties } from "react";
import { CircleSlash } from "lucide-react";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { metricNumber, type MetricsState } from "../types";

const contextPercent = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 2 });

/** 在模型控件旁显示工作窗口；用量不可用时仍显示已知容量。 */
export function ContextWindowIndicator({ state }: { state?: MetricsState }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const usage = state?.kind === "ready" ? state.value.contextUsage ?? null : null;
  const capacity = state?.kind === "ready" ? state.value.contextCapacity : null;
  const loading = state === undefined;
  const label = loading ? "Loading usage…" : usage === null ? "Usage unavailable" : `${contextPercent.format(usage.usedPercent)} full`;
  const tokens = usage === null ? null
    : `${usage.usedPercent === 1 ? "≥" : ""}${metricNumber(Math.round(usage.usedPercent * usage.capacityTokens))} / ${metricNumber(usage.capacityTokens)} tokens used`;
  const windowSize = capacity === null ? null : `${metricNumber(capacity.capacityTokens)} token window`;
  const notes = [
    usage?.estimated ? "Estimated from the request" : null,
    capacity?.source === "configured" ? "Configured limit" : null,
  ].filter(Boolean).join(", ");

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="context-window-trigger"
            aria-label="Context window"
            aria-expanded={open}
            aria-controls={open ? detailId : undefined}
            data-context-state={loading ? "loading" : usage === null ? capacity === null ? "unavailable" : "capacity-only" : usage.estimated ? "estimated" : "reported"}
            onClick={(event) => {
              event.preventDefault();
              setOpen(true);
            }}
          >
            {usage === null
              ? <CircleSlash data-icon aria-hidden="true" />
              : (
                <span
                  aria-hidden="true"
                  className="context-ring"
                  data-has-usage={usage.usedPercent > 0}
                  style={{ "--context-used": `${usage.usedPercent * 100}%` } as CSSProperties}
                />
              )}
          </Button>
        </TooltipTrigger>
        <TooltipContent id={detailId} side="top" sideOffset={6} collisionPadding={12} className="context-window-tooltip">
          <span className="context-window-label">Context window</span>
          <span>{label}</span>
          {(tokens ?? windowSize) && <strong>{tokens ?? windowSize}</strong>}
          {usage === null && !loading && state?.kind !== "error" && <span>{capacity === null ? "Window capacity is unknown" : "No settled usage for this model"}</span>}
          {notes && <span className="context-window-label">{notes}</span>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
