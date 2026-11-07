# Goal board

The React board reads real Goal summaries and saved sessions through the same-origin local browser service. It supports creating a Goal from an initial intent, viewing committed messages and steps, following temporary activity, answering the current structured request, stopping a Worker, and explicitly recovering a confirmed Worker exit. Existing Goals do not accept ordinary follow-up messages. The page does not keep sample Goals or persist browser-side session state.

## Build and run

Build the page into the static directory served by `lazygoal web`, then start the local service:

```sh
npm run build:web
node bin/lazygoal.cjs web
```

Open the one-time local link printed by the command. Its fragment contains the short-lived browser access token; use the link only in the local browser session.

For layout-only work, run `npm run dev:web`. Vite preview has no authenticated API connection, so the board shows a local-service connection instruction instead of sample data.

## Approval revision and re-execution

When a tool call waits for approval, the approval region shows the complete tool input. Use **Edit parameters** to change the same tool's input as JSON, then **Preview changes** to run a read-only review: the region shows the original parameters, the final parameters and the recomputed scope. Editing again or changing the authorization scope invalidates the previous review, and the approval button only confirms the parameters currently under review. Cancelling the editor leaves the original request untouched.

A tool result with an unknown effect is shown as a separate recovery notice: it offers **Retry action** and **Do not run again**, and never offers parameter editing or ongoing authorization. If a Worker exits while a Run is active, recovery also requires an explicit confirmation that the last action may have had unknown external effects before the saved checkpoint can resume.

## Browser acceptance

Run `npm run test:web-e2e`. It builds the page into `dist/`, then uses headless Chrome or Chromium to check both the isolated layout preview and a real local Composition Root backed by temporary workspace and data directories. The real service test uses a deterministic model and a controlled Tool to exercise two concurrent Goal creations, Worker execution and cancellation, structured answers, stream state sync, rejection of ordinary follow-up input, and preservation of an old running snapshot without automatic recovery. Set `CHROME_BIN` if the browser executable is not in a standard location.
