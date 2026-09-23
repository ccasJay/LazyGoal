"""Template resolution and Jinja2 rendering for custom GEPA reflection prompts."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import jinja2

from .errors import ReflectionTemplateError

BUILTIN_PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "prompts"


def resolve_reflection_prompt_template_path(
    template_ref: str,
    *,
    workspace_root: Path | None = None,
) -> Path:
    """Resolve a template reference string to an existing filesystem Path.

    Resolution precedence:
    1. Direct absolute path.
    2. Relative path from workspace_root (if provided).
    3. Direct or extension-omitted file inside builtin prompts directory.
    """
    cleaned = template_ref.strip()
    if not cleaned:
        raise ReflectionTemplateError("Template reference cannot be empty")

    path_obj = Path(cleaned)
    if path_obj.is_absolute() and path_obj.is_file():
        return path_obj

    if workspace_root is not None:
        candidate = (Path(workspace_root) / cleaned).resolve()
        if candidate.is_file():
            return candidate

    # Try builtin prompts directory
    candidate_builtin = BUILTIN_PROMPTS_DIR / cleaned
    if candidate_builtin.is_file():
        return candidate_builtin

    if not cleaned.endswith(".njk"):
        candidate_njk = BUILTIN_PROMPTS_DIR / f"{cleaned}.njk"
        if candidate_njk.is_file():
            return candidate_njk

    raise ReflectionTemplateError(
        f"Custom reflection prompt template could not be resolved: {cleaned!r}. "
        f"Searched workspace_root={workspace_root} and builtin_prompts={BUILTIN_PROMPTS_DIR}."
    )


def load_and_render_reflection_prompt_template(
    template_ref: str,
    *,
    benchmark: str,
    workspace_root: Path | None = None,
    extra_context: dict[str, Any] | None = None,
) -> str:
    """Load a reflection template, render it via Jinja2, and validate required placeholders.

    The rendered template must contain both '<curr_param>' and '<side_info>'
    placeholders as required by official GEPA reflection strategies.
    """
    resolved_path = resolve_reflection_prompt_template_path(
        template_ref, workspace_root=workspace_root
    )

    try:
        raw_content = resolved_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ReflectionTemplateError(
            f"Failed to read reflection template from {resolved_path}: {exc}"
        ) from exc

    context: dict[str, Any] = {"benchmark": benchmark}
    if extra_context:
        context.update(extra_context)

    try:
        template = jinja2.Template(
            raw_content,
            undefined=jinja2.StrictUndefined,
            autoescape=False,
        )
        rendered = template.render(**context)
    except jinja2.TemplateError as exc:
        raise ReflectionTemplateError(
            f"Failed to render reflection template {resolved_path.name}: {exc}"
        ) from exc

    if "<curr_param>" not in rendered:
        raise ReflectionTemplateError(
            f"Reflection template {resolved_path.name} is missing the required '<curr_param>' placeholder."
        )
    if "<side_info>" not in rendered:
        raise ReflectionTemplateError(
            f"Reflection template {resolved_path.name} is missing the required '<side_info>' placeholder."
        )

    return rendered
