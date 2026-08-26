#!/usr/bin/env python3
"""ALFWorld TextWorld task sidecar.

The process speaks JSONL on stdout. Diagnostics are written to stderr so the
TypeScript bridge can treat every stdout line as protocol data.
"""

import importlib.metadata
import json
import os
import random
import sys
from contextlib import redirect_stdout
from pathlib import Path


MAX_RESPONSE_BYTES = 64 * 1024
SUPPORTED_SPLITS = {
    "train",
    "valid_seen",
    "valid_unseen",
    "test_seen",
    "test_unseen",
}


def write_response(request_id, *, result=None, error=None):
    response = {"requestId": request_id, "ok": error is None}
    if error is None:
        response["result"] = result
    else:
        response["error"] = error
    encoded = json.dumps(response, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_RESPONSE_BYTES:
        response = {
            "requestId": request_id,
            "ok": False,
            "error": {
                "code": "RESPONSE_TOO_LARGE",
                "message": "sidecar response exceeded the configured size limit",
            },
        }
        encoded = json.dumps(response, separators=(",", ":"))
    sys.stdout.write(encoded + "\n")
    sys.stdout.flush()


class SessionError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _state_infos(state):
    """Return the mapping-like info object exposed by TextWorld GameState."""
    return state if hasattr(state, "get") else {}


def _observation_text(state):
    """Extract feedback text from a TextWorld state or a legacy observation."""
    infos = _state_infos(state)
    feedback = infos.get("feedback")
    return str(feedback if feedback is not None else state)


def _unpack_reset_result(result):
    """Normalize TextWorld GameState and legacy ``(observation, infos)`` reset results."""
    if isinstance(result, tuple):
        if len(result) != 2:
            raise ValueError(f"unsupported TextWorld reset result length: {len(result)}")
        return result[0], result[1]
    return result, result


def _unpack_step_result(result):
    """Normalize TextWorld ``(state, score, done)`` and legacy four-tuples."""
    if not isinstance(result, tuple):
        raise ValueError("TextWorld step result must be a tuple")
    if len(result) == 3:
        state, score, done = result
        return state, score, done, state
    if len(result) == 4:
        return result
    raise ValueError(f"unsupported TextWorld step result length: {len(result)}")


def _goal_condition_success_rate(infos):
    """Read an explicit rate or derive a binary rate from TextWorld's ``won`` flag."""
    value = infos.get("goal_condition_success_rate")
    if value is None:
        return 1.0 if bool(infos.get("won", False)) else 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


class TextWorldSession:
    def __init__(self, data_root):
        self.data_root = Path(data_root).expanduser().resolve()
        self.environment = None
        self.task_id = None
        self.game_file = None
        self.done = False
        self.step_count = 0
        self.max_steps = 100

    def health(self):
        try:
            import alfworld  # noqa: F401
            import textworld  # noqa: F401
            alfworld_version = package_version("alfworld", alfworld)
            textworld_version = package_version("textworld", textworld)
        except Exception as exc:
            raise SessionError("ENVIRONMENT_IMPORT_FAILED", str(exc)) from exc
        return {
            "pythonVersion": ".".join(str(part) for part in sys.version_info[:3]),
            "alfworldVersion": alfworld_version,
            "textworldVersion": textworld_version,
            "dataRoot": str(self.data_root),
            "textworldOnly": True,
        }

    def reset(self, task):
        if self.environment is not None:
            raise SessionError("SESSION_ACTIVE", "a task session is already active")
        task_id = task.get("taskId")
        game_file = task.get("gameFile")
        split = task.get("split")
        seed = task.get("seed")
        max_steps = task.get("maxSteps")
        if not isinstance(task_id, str) or not task_id:
            raise SessionError("INVALID_TASK", "taskId must be a non-empty string")
        if not isinstance(game_file, str) or not game_file:
            raise SessionError("INVALID_TASK", "gameFile must be a relative path")
        if split not in SUPPORTED_SPLITS:
            raise SessionError("INVALID_TASK", "unsupported ALFWorld split")
        if not isinstance(seed, int) or seed < 0:
            raise SessionError("INVALID_TASK", "seed must be a non-negative integer")
        if not isinstance(max_steps, int) or max_steps < 1 or max_steps > 100:
            raise SessionError("INVALID_TASK", "maxSteps must be between 1 and 100")

        candidate = (self.data_root / game_file).resolve()
        if self.data_root not in candidate.parents or candidate == self.data_root:
            raise SessionError("INVALID_TASK_PATH", "gameFile escapes ALFWORLD_DATA")
        if not candidate.is_file():
            raise SessionError("TASK_NOT_FOUND", f"gameFile does not exist: {game_file}")

        random.seed(seed)
        try:
            with redirect_stdout(sys.stderr):
                import textworld
                from textworld import EnvInfos

                request_infos = EnvInfos(won=True, admissible_commands=True)
                self.environment = textworld.start(str(candidate), request_infos)
                if hasattr(self.environment, "seed"):
                    self.environment.seed(seed)
                observation, infos = _unpack_reset_result(self.environment.reset())
        except Exception as exc:
            self.environment = None
            raise SessionError("ENVIRONMENT_RESET_FAILED", str(exc)) from exc

        self.task_id = task_id
        self.game_file = game_file
        self.done = False
        self.step_count = 0
        self.max_steps = max_steps
        return {
            "taskId": task_id,
            "gameFile": game_file,
            "observation": _observation_text(observation),
            "admissibleCommands": list(_state_infos(infos).get("admissible_commands", [])),
        }

    def step(self, command):
        if self.environment is None:
            raise SessionError("SESSION_IDLE", "reset must be called before step")
        if self.done:
            raise SessionError("SESSION_DONE", "task session is already done")
        if not isinstance(command, str) or not command.strip():
            raise SessionError("INVALID_COMMAND", "command must be non-empty")

        try:
            with redirect_stdout(sys.stderr):
                observation, _score, done, infos = _unpack_step_result(
                    self.environment.step(command),
                )
        except Exception as exc:
            return {
                "observation": str(exc),
                "done": False,
                "won": False,
                "goalConditionSuccessRate": 0.0,
                "admissibleCommands": [],
                "accepted": False,
                "error": {"code": "DOMAIN_COMMAND_REJECTED", "message": str(exc)},
            }

        self.step_count += 1
        self.done = bool(done) or self.step_count >= self.max_steps
        infos = _state_infos(infos)
        won = bool(infos.get("won", False))
        completion = _goal_condition_success_rate(infos)
        return {
            "observation": _observation_text(observation),
            "done": self.done,
            "won": won,
            "goalConditionSuccessRate": completion,
            "admissibleCommands": list(infos.get("admissible_commands", [])),
            "accepted": True,
            "error": None,
        }

    def close(self):
        if self.environment is not None:
            try:
                with redirect_stdout(sys.stderr):
                    self.environment.close()
            finally:
                self.environment = None
        self.task_id = None
        self.game_file = None
        self.done = True


def package_version(package_name, module):
    version = getattr(module, "__version__", None)
    if version is not None:
        return str(version)
    return importlib.metadata.version(package_name)


def main():
    data_root = os.environ.get("ALFWORLD_DATA")
    if not data_root:
        print("ALFWORLD_DATA is required", file=sys.stderr)
        return 2
    session = TextWorldSession(data_root)
    previous_request_id = 0

    for raw_line in sys.stdin:
        request = {}
        try:
            request = json.loads(raw_line)
            if not isinstance(request, dict):
                raise SessionError("PROTOCOL_ERROR", "request must be a JSON object")
            request_id = request.get("requestId")
            if not isinstance(request_id, int) or request_id <= previous_request_id:
                raise SessionError("PROTOCOL_ERROR", "requestId must be strictly increasing")
            previous_request_id = request_id
            operation = request.get("op")
            if operation == "health":
                with redirect_stdout(sys.stderr):
                    result = session.health()
            elif operation == "reset":
                result = session.reset(request.get("task", {}))
            elif operation == "step":
                result = session.step(request.get("command"))
            elif operation == "close":
                session.close()
                result = {"closed": True}
            else:
                raise SessionError("PROTOCOL_ERROR", f"unsupported operation: {operation}")
            write_response(request_id, result=result)
            if operation == "close":
                return 0
        except SessionError as exc:
            write_response(
                request.get("requestId") if isinstance(request, dict) else 0,
                error={"code": exc.code, "message": str(exc)},
            )
        except Exception as exc:
            write_response(
                request.get("requestId") if isinstance(request, dict) else 0,
                error={"code": "PROTOCOL_ERROR", "message": str(exc)},
            )
    session.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
