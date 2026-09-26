# Goal board

The React board reads real Goal summaries and saved sessions through the same-origin local browser service. It supports opening a session, viewing committed messages and steps, following temporary activity, answering the current structured request, and continuing a completed Goal. The page does not keep sample Goals or persist browser-side session state.

## Build and run

Build the page into the static directory served by `lazygoal web`, then start the local service:

```sh
npm run build --prefix prototypes/goal-board
node bin/lazygoal.cjs web
```

Open the one-time local link printed by the command. Its fragment contains the short-lived browser access token; use the link only in the local browser session.

For layout-only work, run `npm run dev --prefix prototypes/goal-board`. Vite preview has no authenticated API connection, so the board shows a local-service connection instruction instead of sample data.

## Browser acceptance

Run `npm run test:e2e --prefix prototypes/goal-board`. The test starts Vite, a controlled local API, and headless Chrome or Chromium to check saved state, temporary activity, a structured answer, authorization-free preview behavior, and the narrow session layout. Set `CHROME_BIN` if the browser executable is not in a standard location.
