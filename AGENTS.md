# Repository Guidelines

## Project Purpose

LazyGoal is a goal-driven, resumable agent runtime. It turns user intent into an approved task through context gathering and planning, then advances that task through a controlled Action/Observation loop. Each Goal is persisted as a recoverable session so long-running work can pause, resume, and recover safely.

## Repository Layout

* Update this section whenever the repository layout changes.

```text
bin/             CLI entrypoint and executable wiring for `lazygoal`
scripts/         Repository maintenance and validation utilities
benchmarks/      Explicit headless benchmark evaluation
  src/            Shared Headless Composition Root and persistence wiring
  alfworld/       ALFWorld TextWorld tasks, sidecar, tools, and reports
  swebench/       SWE-bench Verified containers, patch export, and official grading
packages/        Private `@lazygoal/*` workspaces
  contracts/      Contract AST builders and static type inference core
  agent/         Agent prompts, response schemas, and LLM preparation/step executors
  llm/           LLM configuration, native strict adapters, and pi-ai multi-provider integration
  runtime/       Goal domain, persistence ports, scheduling, execution loop, and shutdown control
  storage/       Persistence DTOs, schemas, codecs, errors, and JSON stores for Runtime ports
  tools/         Agent tools such as filesystem, shell, and workspace utilities
  tui/           React Ink terminal UI, screens, session controller, and CLI integration
docs/            Current implemented architecture documentation under `docs/architecture/`
specs/           Feature requirements, designs, and implementation task checklists
project-memory/  Durable summaries of completed and verified feature specifications
.lazygoal/       Local Runtime data, including persisted Goal Snapshots, trajectories, and traces
```

## Core Rules

* Avoid praise, superlatives, and unnecessary agreement. Evaluate proposals critically and state technical problems directly.
* Trust TypeScript at typed same-process boundaries. Do not add runtime validation, fallback behavior, or hostile-input tests solely for values the static interface requires; validate at parser/config, queued, model/tool JSON, durable/file, worker, process, and wire boundaries
* Never implement a feature unless it is explicitly requested by the user or defined by a clear specification.
* Do not silently expand the requested scope. If adjacent work is required for correctness, keep it minimal and explain why it is necessary.
* Do not skip, shorten, weaken, or bypass tests merely to finish a task faster.
* Prefer the smallest implementation that satisfies the current requirement and preserves existing architectural boundaries.
* Do not introduce abstractions, compatibility layers, fallback paths, or configuration options without a demonstrated current requirement.
* All user-facing output must be in English, except for commit messages and Chinese TSDoc explicitly required by this document.
* Commit messages must be concise and written in Chinese. Use the format:
  `feat(scope): 精确的功能描述`
  Use the appropriate conventional commit type when `feat` is not suitable.

### Development-Phase Compatibility Policy

Before LazyGoal reaches a stable release, backward compatibility for previously persisted Goal Snapshots, protocol versions, and other development-time persisted data is not guaranteed.

Unless migration or compatibility support is explicitly required:

* Support only the current Goal, Snapshot, protocol, and Runtime schema versions.
* Treat old development and test Goals as disposable data that may be deleted or recreated.
* Do not add compatibility branches, legacy adapters, fallback parsing, migration code, or duplicated old implementations solely to preserve development-time test data.
* When a schema or protocol changes, prefer updating the current version in place over creating a new version.
* Do not increment a schema or protocol version merely because its implementation changed during development.
* Introduce a new version only when multiple versions must intentionally coexist or when compatibility requirements make versioning necessary.
* Unsupported historical data should fail fast with a clear unsupported-version error when it cannot be safely read.
* Do not treat local `.lazygoal/` data as a product compatibility requirement.

Prefer deleting obsolete test data and keeping one coherent current implementation over accumulating development-only `v1`, `v2`, `v3`, and legacy compatibility paths.

### Task Completion Summary

Upon completing a task, structure the final summary so that every change item is paired directly with its clickable source location.
And ask the user whether distille the changes into a project memory. (Use the using-lazyspec skill.)

Example:

* Added Goal protocol validation before Runtime execution.

  * [packages/runtime/src/domain.ts:12-30](packages/runtime/src/domain.ts#L12-L30)

Do not provide an unlinked list of changes when concrete source locations are available.

### Repository Skills

When performing a task, load and follow the matching skill under `.agents/skills/` for that task type:

* Documentation work, including writing, moving, reviewing, and auditing → `lg-doc-standards`
* Prose work, including Markdown, TSDoc, code comments, test comments, prompts, diagnostics, and CLI/TUI copy → `lg-prose-standard`
* Simplification audits, including dead code, duplicate state or lifecycle logic, over-design, and dependency replacement → `lg-find-simplifications`

When multiple skills apply, follow all relevant skills unless their instructions conflict with a higher-priority repository rule.

## TypeScript Interface Documentation

* Every newly added or extended public TypeScript interface and its public methods must include Chinese contract-level TSDoc in the same change.
* Document responsibilities and behavioral contracts rather than restating TypeScript types.
* Include lifecycle or state semantics, parameter and return meaning, errors, side effects, persistence behavior, ownership boundaries, and limitations when applicable.
* Use standard TSDoc tags such as `@remarks`, `@param`, `@returns`, `@throws`, and `@deprecated` only when they add useful contract information.
* Every new public interface must include at least one minimal `@example` demonstrating intended usage or implementation.
* Keep implementation details out of public contract documentation unless callers need them to use the API correctly.
* Update TSDoc in the same change whenever an existing public contract changes.

````ts
/**
 * Goal 最新快照的持久化边界。
 *
 * @remarks
 * 每个 goalId 只保留最新完整快照，不提供历史查询。
 *
 * @example
 * ```ts
 * const goal = await store.restore("goal-1");
 * ```
 */
export interface GoalStore {
    /**
     * @param goalId - Goal 的稳定标识。
     * @returns 最新快照；不存在时返回 `undefined`。
     * @throws 快照损坏或底层存储读取失败时抛出异常。
     */
    restore(goalId: string): Promise<Goal | undefined>;
}
````

## Architecture Documentation

* Treat `docs/architecture/` as the concise source of truth for the currently implemented architecture.
* Update the relevant architecture document in the same change whenever any of the following changes:

  * module responsibilities,
  * state ownership,
  * persistence ownership,
  * cross-module data flow,
  * lifecycle semantics,
  * recovery semantics,
  * key architectural invariants,
  * supported protocols,
  * current architectural limitations.
* Architecture documentation must describe implemented behavior only.
* Keep proposed designs, migration plans, historical decisions, and future work in `specs/` rather than presenting them as current architecture.
* Keep API-level contracts in source TSDoc instead of duplicating them in architecture documents.
* Prefer links to source contracts and specifications over copying detailed definitions.
* Keep each architecture document concise enough for a focused 1–2 minute review.
* When documentation and implementation disagree, treat the implementation as the immediate source of truth and update the documentation in the same task.
