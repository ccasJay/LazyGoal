"""Command-line interface for the LazyGoal Harness2 control plane."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

from .loop import Harness2Controller


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="lazygoal harness2",
        description="LazyGoal Harness2 Propose-Probe-Compose Framework Optimizer",
    )
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    # preflight
    p_preflight = subparsers.add_parser("preflight", help="Validate Harness2 request and workspace templates")
    p_preflight.add_argument("--request", required=True, help="Path to lazygoal-harness2-run@1 JSON request")
    p_preflight.add_argument("--workspace-root", default=None, help="Root directory of the workspace")
    p_preflight.add_argument("--runs-dir", default=None, help="Directory where Harness2 runs are stored")

    # start
    p_start = subparsers.add_parser("start", help="Start a new Harness2 optimization run")
    p_start.add_argument("--request", required=True, help="Path to lazygoal-harness2-run@1 JSON request")
    p_start.add_argument("--mode", choices=["sequential", "parallel", "both"], default=None, help="Harness2 recursion mode (sequential, parallel, or both)")
    p_start.add_argument("--concurrency", type=int, default=None, help="Maximum concurrent probe evaluations")
    p_start.add_argument("--detach", action="store_true", default=False, help="Run in a detached background worker")
    p_start.add_argument("--workspace-root", default=None, help="Root directory of the workspace")
    p_start.add_argument("--runs-dir", default=None, help="Directory where Harness2 runs are stored")

    # status
    p_status = subparsers.add_parser("status", help="Query authoritative Harness2 run status")
    p_status.add_argument("--run", required=True, help="Run ID to inspect")
    p_status.add_argument("--workspace-root", default=None, help="Root directory of the workspace")
    p_status.add_argument("--runs-dir", default=None, help="Directory where Harness2 runs are stored")

    # stop
    p_stop = subparsers.add_parser("stop", help="Cooperatively stop an active Harness2 run")
    p_stop.add_argument("--run", required=True, help="Run ID to stop")
    p_stop.add_argument("--workspace-root", default=None, help="Root directory of the workspace")
    p_stop.add_argument("--runs-dir", default=None, help="Directory where Harness2 runs are stored")

    # resume
    p_resume = subparsers.add_parser("resume", help="Resume an existing Harness2 run")
    p_resume.add_argument("--run", required=True, help="Run ID to resume")
    p_resume.add_argument("--detach", action="store_true", default=False, help="Resume in a detached background worker")
    p_resume.add_argument("--workspace-root", default=None, help="Root directory of the workspace")
    p_resume.add_argument("--runs-dir", default=None, help="Directory where Harness2 runs are stored")

    # report
    p_report = subparsers.add_parser("report", help="Read final or current Harness2 run report")
    p_report.add_argument("--run", required=True, help="Run ID to report")
    p_report.add_argument("--workspace-root", default=None, help="Root directory of the workspace")
    p_report.add_argument("--runs-dir", default=None, help="Directory where Harness2 runs are stored")

    # wait
    p_wait = subparsers.add_parser("wait", help="Wait until a Harness2 run reaches a terminal status")
    p_wait.add_argument("--run", required=True, help="Run ID to wait for")
    p_wait.add_argument("--timeout-seconds", type=float, default=None, help="Maximum seconds to wait")
    p_wait.add_argument("--interval-seconds", type=float, default=1.0, help="Polling interval in seconds")
    p_wait.add_argument("--workspace-root", default=None, help="Root directory of the workspace")
    p_wait.add_argument("--runs-dir", default=None, help="Directory where Harness2 runs are stored")

    # apply
    p_apply = subparsers.add_parser(
        "apply",
        help="Apply exported Prompt Bundle templates and best profile into the worktree",
    )
    p_apply.add_argument("--run", required=True, help="Run ID whose exports should be applied")
    p_apply.add_argument("--workspace-root", default=None, help="Target worktree root directory")
    p_apply.add_argument("--runs-dir", default=None, help="Directory where Harness2 runs are stored")
    p_apply.add_argument("--profile-output", default=None, help="Optional destination path for best-profile.json")

    # worker
    p_worker = subparsers.add_parser("worker", help="Internal background worker entrypoint")
    p_worker.add_argument("--run-dir", required=True, help="Absolute path to the run directory")
    p_worker.add_argument("--workspace-root", default=None, help="Root directory of the workspace")

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return exc.code if isinstance(exc.code, int) else 2

    try:
        controller = Harness2Controller(
            workspace_root=getattr(args, "workspace_root", None),
            runs_dir=getattr(args, "runs_dir", None),
        )
        if args.subcommand == "worker":
            result = controller.execute_run_dir(Path(args.run_dir))
        elif args.subcommand == "preflight":
            result = controller.preflight(args.request)
        elif args.subcommand == "start":
            result = controller.start(
                args.request,
                mode=args.mode,
                concurrency=args.concurrency,
                foreground=not args.detach,
            )
        elif args.subcommand == "status":
            result = controller.status(args.run)
        elif args.subcommand == "stop":
            result = controller.stop(args.run)
        elif args.subcommand == "resume":
            result = controller.resume(args.run, foreground=not args.detach)
        elif args.subcommand == "report":
            result = controller.report(args.run)
        elif args.subcommand == "wait":
            result = controller.wait(
                args.run,
                timeout_seconds=args.timeout_seconds,
                interval_seconds=args.interval_seconds,
            )
        elif args.subcommand == "apply":
            result = controller.apply(
                args.run,
                profile_output_path=args.profile_output,
            )
        else:
            sys.stderr.write(f"Unknown subcommand: {args.subcommand}\n")
            return 2

        sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
        sys.stdout.flush()
        return 0
    except Exception as exc:
        sys.stderr.write(f"{exc}\n")
        sys.stderr.flush()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
