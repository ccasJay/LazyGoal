# Repository Guidelines

## Project Purpose

LazyGoal is a goal-driven, resumable agent runtime. It turns user intent into an approved task through context gathering and planning, then advances the task through a controlled Action/Observation loop. Each Goal is persisted as a recoverable session so long-running work can pause and continue safely.

## Repository Layout

- When the layout changed, update this section at the first time.

```text
bin/             CLI entrypoint and executable wiring for `lazygoal`
scripts/         Repository maintenance and validation utilities
packages/        Private `@lazygoal/*` workspaces
  agent/         Agent prompts, response schemas, and LLM preparation/step executors
  llm/           LLM adapters and provider integrations (OpenAI-compatible, Gemini)
  runtime/       Goal domain, persistence ports, scheduling, execution loop, and shutdown control
  storage/       Persistence file DTOs, schemas, errors, and JSON stores for runtime ports
  tools/         Agent tools such as filesystem readers
  tui/           React Ink terminal UI, screens, session controller, and CLI integration
docs/            Implemented architecture documentation; see `docs/architecture/`
specs/           Feature requirements, designs, and implementation task checklists
project-memory/  Durable summaries of completed and verified feature specifications
.lazygoal/       Local runtime data, including persisted goal snapshots
```

## Core Rules
- Avoid superlatives and praise. Stop telling me I am absolutely right. Give me the cold hard truth.
- Never implement a feature without directly without admitting by user request or a clear specification.
- Do not jump the duration of test for user.
- The commit message should be concise and in chinese ,the format like this: feat(xxx): the  precise feature description in chinese.
- All the infomation that emitted from the agent should be in english, except for the commit message.
- Upon completing a task, structure the final summary output where each change item is paired directly with its clickable location link:
  - Concise description of the change or feature added.
    - [packages/runtime/src/domain.ts:12-30](packages/runtime/src/domain.ts#L12-L30)
- When performing a task, load and follow the matching skill under `.agents/skills/` for that task type:
  - Documentation work (writing, moving, reviewing, auditing) → `lg-doc-standards`
  - Prose (Markdown, TSDoc, code/test comments, prompts, diagnostics, CLI/TUI copy) → `lg-prose-standard`
  - Simplification audit (dead code, duplicate state/lifecycle, over-design, dependency replacement) → `lg-find-simplifications`

### TypeScript Interface Documentation

- Every newly added or extended public TypeScript interface and its methods must include Chinese contract-level TSDoc in the same change.
- Document responsibilities, lifecycle or state semantics, parameter and return meaning, errors, side effects, and limitations when applicable. Do not merely repeat information already expressed by TypeScript types.
- Use standard TSDoc tags such as `@remarks`, `@param`, `@returns`, `@throws`, and `@deprecated` where they add useful contract information.
- Every new public interface must include at least one minimal `@example` showing its intended usage or implementation.

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

### Architecture Documentation

- Treat `docs/architecture/` as the concise source of truth for the current implemented architecture.
- In the same change, update the relevant architecture document when module responsibilities, state ownership, cross-module data flow, lifecycle semantics, key invariants, or current limitations change.
- Keep API-level contract details in source TSDoc and feature history or future design in `specs/`; architecture documents should link to them instead of duplicating them.
- Keep each architecture document short enough for a 1–2 minute review and describe implemented behavior only.
