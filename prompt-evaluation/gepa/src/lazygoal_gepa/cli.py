"""Command-line interface for the LazyGoal GEPA lifecycle control plane."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

from .controller import (
    ConfirmationRequiredError,
    LifecycleController,
    ProfileDriftError,
    ReportNotReadyError,
)
from .errors import LazyGoalGEPAError
from .worker import run_gepa_worker


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="lazygoal gepa",
        description="LazyGoal GEPA Run Lifecycle Control Plane",
    )
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    # preflight
    p_preflight = subparsers.add_parser("preflight", help="Execute read-only preflight consistency checks")
    p_preflight.add_argument("--request", required=True, help="Path to gepa-run@1 JSON request file")
    p_preflight.add_argument("--workspace-root", default=None, help="Root directory of the workspace")
    p_preflight.add_argument("--runs-dir", default=None, help="Directory where GEPA runs are stored")
    p_preflight.add_argument("--profile-path", default=None, help="Path to the target Agent Profile JSON file")

    # start
    p_start = subparsers.add_parser("start", help="Start a new GEPA run with a detached background worker")
    p_start.add_argument("--request", required=True, help="Path to gepa-run@1 JSON request file")
    p_start.add_argument("--yes", action="store_true", default=False, help="Confirm LLM costs and profile mutation")
    p_start.add_argument("--workspace-root", default=None, help="Root directory of the workspace")
    p_start.add_argument("--runs-dir", default=None, help="Directory where GEPA runs are stored")
    p_start.add_argument("--profile-path", default=None, help="Path to the target Agent Profile JSON file")

    # status
    p_status = subparsers.add_parser("status", help="Query read-only authoritative run status")
    p_status.add_argument("--run", required=True, help="Run ID to inspect")
    p_status.add_argument("--runs-dir", default=None, help="Directory where GEPA runs are stored")

    # stop
    p_stop = subparsers.add_parser("stop", help="Cooperatively stop an active GEPA run")
    p_stop.add_argument("--run", required=True, help="Run ID to stop")
    p_stop.add_argument("--runs-dir", default=None, help="Directory where GEPA runs are stored")

    # resume
    p_resume = subparsers.add_parser("resume", help="Resume an existing uncompleted GEPA run")
    p_resume.add_argument("--run", required=True, help="Run ID to resume")
    p_resume.add_argument("--yes", action="store_true", default=False, help="Confirm LLM costs and execution")
    p_resume.add_argument("--workspace-root", default=None, help="Root directory of the workspace")
    p_resume.add_argument("--runs-dir", default=None, help="Directory where GEPA runs are stored")
    p_resume.add_argument("--profile-path", default=None, help="Path to the frozen target Agent Profile JSON file")

    # report
    p_report = subparsers.add_parser("report", help="Read authoritative final run report")
    p_report.add_argument("--run", required=True, help="Run ID to report")
    p_report.add_argument("--runs-dir", default=None, help="Directory where GEPA runs are stored")

    # internal worker
    p_worker = subparsers.add_parser("worker", help="Internal background worker process entrypoint")
    p_worker.add_argument("--run-dir", required=True, help="Absolute path to the run directory")
    p_worker.add_argument("--workspace-root", default=None, help="Root directory of the workspace")

    return parser


def _run_worker(run_dir_str: str, workspace_root_str: str | None = None) -> int:
    """Internal entrypoint for background worker execution."""
    run_dir = Path(run_dir_str).resolve()
    workspace_root = Path(workspace_root_str).resolve() if workspace_root_str else None
    return run_gepa_worker(run_dir, workspace_root=workspace_root)


def main(argv: Sequence[str] | None = None) -> int:
    """Main CLI entrypoint. Emits exactly one single-line JSON on stdout on success."""
    parser = _build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return exc.code if isinstance(exc.code, int) else 2

    try:
        if args.subcommand == "worker":
            return _run_worker(args.run_dir, getattr(args, "workspace_root", None))

        controller = LifecycleController(
            workspace_root=getattr(args, "workspace_root", None),
            runs_dir=getattr(args, "runs_dir", None),
            profile_path=getattr(args, "profile_path", None),
        )

        if args.subcommand == "preflight":
            result = controller.preflight(args.request)
        elif args.subcommand == "start":
            result = controller.start(args.request, yes=args.yes)
        elif args.subcommand == "status":
            result = controller.status(args.run)
        elif args.subcommand == "stop":
            result = controller.stop(args.run)
        elif args.subcommand == "resume":
            result = controller.resume(args.run, yes=args.yes)
        elif args.subcommand == "report":
            result = controller.report(args.run)
        else:
            sys.stderr.write(f"Error: Unknown subcommand {args.subcommand!r}\n")
            return 2

        sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
        sys.stdout.flush()
        return 0

    except ConfirmationRequiredError as error:
        sys.stderr.write(f"ConfirmationRequiredError: {error}\n")
        sys.stderr.flush()
        return 1
    except ReportNotReadyError as error:
        sys.stderr.write(f"ReportNotReadyError: {error}\n")
        sys.stderr.flush()
        return 1
    except ProfileDriftError as error:
        sys.stderr.write(f"ProfileDriftError: {error}\n")
        sys.stderr.flush()
        return 1
    except LazyGoalGEPAError as error:
        sys.stderr.write(f"{error.__class__.__name__}: {error}\n")
        sys.stderr.flush()
        return 1
    except Exception as error:
        sys.stderr.write(f"UnexpectedError: {error}\n")
        sys.stderr.flush()
        return 1


if __name__ == "__main__":
    sys.exit(main())
