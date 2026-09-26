# Goal board prototype

A standalone React + TypeScript + Vite preview. Each card represents a Goal; selecting it opens its streaming Session on the right.

```sh
cd prototypes/goal-board
npm ci
npm run dev
```

Open the local URL printed by Vite. `npm run build` checks types and builds the preview.

Try selecting goals, searching, filtering for input, expanding or resizing the session, opening tool output, approving the sample plan, sending a message, and creating a goal. On a narrow screen, close the session to return to the board. The resize separator also supports left/right arrow keys.

All data and streaming output are simulated in browser memory and reset on refresh. Approval and messages never execute tools or write Goal snapshots. Running cards remain running after sample output finishes; streaming completion is not Goal completion. This prototype is independent of the Runtime and React Ink TUI. The Google Fonts stylesheet is optional; system fonts are the fallback.

Additional preview components include Board/List views, category filters, a project selector with an empty Sandbox, Plan and Details session panels, and workspace settings. Compact mode keeps all cards at 176px; standard mode uses 196px. Tool visibility and the agent profile label update immediately. Plan milestones are illustrative; settings and project assignments exist only in browser memory.
