# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

LazyGoal is a goal-driven, resumable agent runtime. A user intent becomes a persisted Goal, passes through context gathering and task approval, and then advances through a controlled Action/Observation loop. The current implementation is TypeScript ESM with several private packages under `packages/`, launched through the `lazygoal` CLI shim in `bin/`.

## Commands

Install dependencies from the repository root:

```bash
npm install
```

Run the complete test suite directly with `tsx` (the root `npm test` placeholder is not configured yet):

```bash
npx tsx --test packages/agent/test/*.test.ts packages/llm/test/*.test.ts packages/runtime/test/*.test.ts packages/tools/test/*.test.ts packages/tui/test/*.test.tsx
```

Run tests for one package or one file:

```bash
npx tsx --test packages/runtime/test/*.test.ts
npx tsx --test packages/runtime/test/runner.test.ts
npx tsx --test packages/tui/test/session-screen.test.tsx
```

Run the TypeScript compiler checks used by the repository configuration:

```bash
npx tsc --noEmit
```

There are currently no repository-defined `build` or `lint` scripts. The source is executed with `tsx`; use `npx tsc --noEmit` as the available static check. The root smoke command makes a real LLM request and may incur provider cost:

```bash
npm run llm:agent-smoke
```

Run the CLI from the repository root after configuring a profile and LLM environment:

```bash
node bin/lazygoal.cjs
node bin/lazygoal.cjs -c
node bin/lazygoal.cjs resume
```

The CLI expects `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_STRUCTURED_OUTPUT_MODE` (`strict` or `prompt_only`), plus a manually-created `.lazygoal/profiles/default.json`. Runtime data is stored under `.lazygoal/goals`; paths are resolved relative to the invoking workspace.

## Architecture

`runtime` is the control plane. It owns the Goal/Run domain model, state transitions, preparation workflow, scheduling, execution loop, persistence, cancellation, and shutdown. `Launcher` validates intent and freezes the selected Profile into a new Goal; `GoalCoordinator` advances preparation and approval; `Runner` restores and executes a Run; `JsonFileGoalStore` persists the latest complete snapshot using atomic replacement. `Transition` is pure state-transition logic. `InlineScheduler` currently dispatches in-process and does not provide queues, leases, or automatic restart scanning.

`agent` is the protocol boundary between runtime and an LLM adapter. `LLMPreparationExecutor` and `LLMStepExecutor` derive the phase-specific working context, build prompt plans with paired ModelOutputContractBundles, make one adapter call, and strictly decode and validate wire responses using immutable Contract ASTs. Agent executors do not persist Goals, execute tools, perform authorization, or run the loop.

`llm` isolates provider SDKs behind the `LLMAdapter.generate` contract. `OpenAICompatible` maps system/user/assistant messages to Chat Completions, while `Gemini` maps system instructions and model history to Gemini's API. Provider/network errors propagate upward; response protocol validation belongs to `agent`.

`tools` contains runtime tool implementations and the tool contracts/registry boundary. The current `ReadFileTool` is deliberately read-only and restricts paths to the workspace root, including protection against absolute paths, `..` segments, and escaping symlinks. Runtime checks Profile authorization, Registry membership, input schema, and policy before execution.

`tui` is the React Ink presentation and composition root. `cli.tsx` validates environment, loads the active Profile, constructs the shared Store/Registry/Adapters/Coordinator/Scheduler/Runner stack, and handles SIGINT shutdown. `SessionController` serializes semantic UI commands and exposes immutable view models; screens render those view models and do not mutate runtime state or write snapshots directly. `bin/lazygoal.cjs` resolves the project-local `tsx/esm` loader so the CLI works when invoked from another workspace.

## State and lifecycle invariants

- `goalId` identifies the persisted session; `runId` identifies its current execution instance.
- Preparation does not consume execution Steps. Only an executing Goal with a determined task enters the Runner.
- Coordinator owns preparation transitions; Runner owns Run transitions; executors do not save Goals.
- A subsequent Step starts only after the preceding complete Goal snapshot has been saved.
- Action authorization is based on the frozen Profile and registered tools. Automatically allowed Actions and approved one-time Actions are persisted around execution; approval waits and rejected observations are recoverable states.
- Tool failures may leave `outcome_unknown`; do not invent a successful or failed Observation when the external outcome is uncertain.
- Abort/shutdown is control flow, not a domain cancellation: propagate `ExecutionAbortedError` without creating a failure Step or `cancelled` snapshot. The checkpoint gate rejects new saves after shutdown begins but lets saves already inside the store finish.
- GoalStore currently keeps only the newest snapshot. There is no cross-process lease, optimistic concurrency check, historical event log, or exactly-once guarantee for external tools.

## Repository guidance

- Treat `docs/architecture/` as the concise source of truth for implemented cross-module behavior; update the relevant document when responsibilities, data flow, lifecycle semantics, or limitations change.
- Keep detailed API contracts in source TSDoc and feature evolution in `specs/`; do not copy future designs into architecture docs.
- New or changed public TypeScript interfaces require Chinese contract-level TSDoc, including useful lifecycle/error/side-effect semantics and a minimal `@example`, following the existing conventions in `AGENTS.md`.
- Follow the repository's existing package boundaries and dependency-injection style: runtime must not depend on a concrete LLM provider, and agent must not take over runtime authorization or persistence.
- Current project-specific instructions, including the required final-summary link format and Chinese commit-message convention, are in `AGENTS.md`.
