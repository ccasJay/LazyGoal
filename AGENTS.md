# Repository Guidelines

## Project Purpose

This repository will contain two coding-agent implementations:

- `main` — a hand-written TypeScript agent.
- `lazygoal-lc` — an agent implemented with LangChain.

Keep their intended behavior comparable so the implementation differences can be evaluated clearly.

## Worktree Boundaries

- Make handwirte TypeScript-agent changes in the `main` worktree.
- Make LangChain-agent changes in the `lazygoal-lc` worktree.
- Keep implementation-specific files and generated output in the owning worktree.
- Document intentional behavioral differences when they are introduced.

## Core Rules
- Never implement a feature without directly without admitting by user request or a clear specification.
- Never give the user the whole implementation of a feature without admitting by user request or a clear specification in the chat, the template of the feature , syntax, or a code snippet is acceptable.
- Prefer hints, design guidance, debugging assistance, and code review before offering a solution if user task.
- Do not jump the duration of test for user.
- The commit message should be concise and in chinese
- All the infomation that emitted from the agent should be in english, except for the commit message.
- Upon completing a task, structure the final summary output where each change item is paired directly with its clickable location link:
  - Concise description of the change or feature added.
    - [packages/runtime/src/domain.ts:12-30](packages/runtime/src/domain.ts#L12-L30)

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
