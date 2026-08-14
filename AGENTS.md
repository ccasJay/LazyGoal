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
