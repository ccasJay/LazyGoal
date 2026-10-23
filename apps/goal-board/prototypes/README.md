# Trajectory explorer prototype

This folder contains isolated UI studies for the Goal Board trajectory view. The Execution trace workbench design is now implemented in the production trajectory view; the standalone files remain as design references rather than the runtime source of truth.

- [Generated component concept](./trajectory-components-concept.png): image-model reference for timeline lanes, event ledger, and evidence inspector.
- [Interactive prototype](./trajectory-explorer.html): hand-built responsive HTML/CSS/JavaScript based on the concept and the current LazyGoal run. It uses 20 representative records from a 210-event run, so paging and backend fetching are intentionally not simulated.
- [Execution trace workbench](./trajectory-workbench.html): second-pass UI study for the trajectory panel. The timeline is a 50 px, three-lane overview modeled on the [DeepSeek harness trajectory timeline](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-trajectory/src/client/TrajectoryTimeline.tsx): no axis labels or scrollbar, 8 px event marks, click to focus, drag to focus a range, right-drag to pan, and dimmed non-matches from search, type filters, or the selected range. The track always fills the viewport: no projection or zoom state can leave right-side whitespace. Sequence is the default: every event gets one equal slot across the full width, and Compact keeps that full width while drawing narrow event marks. Wheel over Sequence zooms around the pointer, but never below fit; Fit or double-click resets. Time maps the recorded interval across the full width, so time gaps stay proportional without a trailing empty region. Use the viewport switcher to test 1024, 720 and 390 px containers, `?scale=time` to open Time mode, `?compact=1` to open compact marks, `?zoom=2` to open a zoomed Sequence strip, `?range=0.62,1` to open a selected range, `?select=6` to open an event, `?prompt=r1` to open a recorded prompt, and `?clean=1` to hide the prototype frame.
- [Column Collapse prototype](./board-column-collapse.html): interactive study for the redesigned single-column collapse, hover peek flyout, universal non-empty column collapse, status accent indicators, and toolbar quick view controls.

Open `board-column-collapse.html`, `trajectory-workbench.html`, or `trajectory-explorer.html` in a browser or serve this directory with a local static server. Try search, column collapse/expand, hover peek drawer, view presets, and demo data playground.

## Captured comparisons

- [Current trajectory, desktop](./screenshots/current-desktop.png)
- [Current trajectory, narrow container with an open inspector](./screenshots/current-560-stacked-inspector.png)
- [Current search showing prompt rows under a zero-event summary](./screenshots/current-search-count-mismatch.png)
- [Proposed trace, desktop summary](./screenshots/proposed-desktop-summary.png)
- [Proposed trace, desktop Time mode](./screenshots/proposed-desktop-time.png)
- [Proposed trace, desktop prompt](./screenshots/proposed-desktop-prompt.png)
- [Proposed trace, desktop range focus](./screenshots/proposed-desktop-range.png)
- [Proposed trace, desktop Sequence zoom](./screenshots/proposed-desktop-sequence-zoom.png)
- [Proposed trace, desktop Sequence compact](./screenshots/proposed-desktop-sequence-compact.png)
- [Proposed trace, 720 px inspector](./screenshots/proposed-720-inspector.png)
- [Proposed trace, 390 px tool event](./screenshots/proposed-390-tool.png)
- [Proposed trace, 390 px Time mode](./screenshots/proposed-390-time.png)
- [Proposed trace, 390 px Sequence compact](./screenshots/proposed-390-sequence-compact.png)
