import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./ui/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { useState } from "react";
import { Archive, MoreHorizontal, Trash2 } from "lucide-react";
import type { BrowserGoalListItem } from "../../../../packages/web-contracts/src/index";
import {
  type MetricsState,
  cardStatusPresentation,
  formatUpdatedAt,
  metricCoverage,
  metricNumber,
  metricPercent,
  metricSpeed,
  statusClass,
  statusFromRun,
} from "../types";

export function CardMetrics({ state }: { state?: MetricsState }) {
  if (state?.kind === "error") return <div className="card-metrics muted">Metrics unavailable</div>;
  if (state === undefined) return <div className="card-metrics muted">Loading metrics…</div>;
  const metrics = state.value;
  return (
    <div
      className="card-metrics"
      aria-label={`Goal total: ${metrics.stepCount} committed steps, ${metrics.inputTokens ?? "unavailable"} input tokens, ${metrics.outputTokens ?? "unavailable"} output tokens; end-to-end output rate ${metricSpeed(metrics.tokensPerSecond)} tokens per second`}
    >
      <span>
        <strong>{metrics.stepCount}</strong> step{metrics.stepCount === 1 ? "" : "s"}<i />{" "}
        <strong>{metricNumber(metrics.inputTokens)}</strong> in{" "}
        <span className="metric-separator">/</span>{" "}
        <strong>{metricNumber(metrics.outputTokens)}</strong> out
      </span>
      <span>
        <strong>{metricPercent(metrics.cacheHitRate)}</strong> cache<i />
        <strong>Output rate</strong>{" "}
        <span title={`${metrics.throughputMeasuredCalls} measured calls; ${metrics.throughputExcludedCalls} excluded calls`}>
          <strong>{metricSpeed(metrics.tokensPerSecond)}</strong> tok/s
        </span>
      </span>
    </div>
  );
}

export function GoalCard({
  goal,
  metrics,
  selected,
  onSelect,
  busy,
  onArchive,
  onDelete,
}: {
  goal: BrowserGoalListItem;
  metrics?: MetricsState;
  selected: boolean;
  onSelect: () => void;
  busy: boolean;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const status = statusFromRun(goal.runStatus);
  const { label: statusLabel, className: statusPillClass } = cardStatusPresentation(goal.runStatus);
  const terminal = goal.runStatus === "completed" || goal.runStatus === "failed" || goal.runStatus === "cancelled";
  const coverage = metrics?.kind === "ready" ? metricCoverage(metrics.value) : null;

  return (
    <Card role="article" className="goal-card-shell gap-0 border-0 p-0 shadow-none">
      <Button variant="ghost" size="sm"
        className={`goal-card ${selected ? "is-selected" : ""}`}
        onClick={onSelect}
        aria-pressed={selected}
      >
        <h3>{goal.intent}</h3>
        <CardMetrics state={metrics} />
        <div className="card-footer">
          <Badge variant="outline" className={`status-pill ${statusPillClass}`}>
            <span className="status-dot" />
            {statusLabel}
          </Badge>
          {coverage !== null && (
            <span className="metric-coverage" title={coverage}>
              {coverage}
            </span>
          )}
          <time dateTime={goal.updatedAt} title={goal.updatedAt}>
            {formatUpdatedAt(goal.updatedAt)}
          </time>
        </div>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="goal-card-options" aria-label={`More options for ${goal.intent}`}><MoreHorizontal size={18} /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!terminal || busy} onSelect={onArchive}><Archive size={14} />{goal.archived ? "Restore" : "Archive"}</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" disabled={!terminal || busy} onSelect={() => setConfirmDelete(true)}><Trash2 size={14} />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete goal?</AlertDialogTitle><AlertDialogDescription>This removes the saved Goal and its execution records.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={onDelete}>Confirm delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

