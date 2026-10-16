# Trajectory explorer prototype

This folder contains an isolated UI study for the Goal Board trajectory view. It does not replace the production trajectory component.

- [Generated component concept](./trajectory-components-concept.png): image-model reference for timeline lanes, event ledger, and evidence inspector.
- [Interactive prototype](./trajectory-explorer.html): hand-built responsive HTML/CSS/JavaScript based on the concept and the current LazyGoal run. It uses 20 representative records from a 210-event run, so paging and backend fetching are intentionally not simulated.
- [Column Collapse prototype](./board-column-collapse.html): interactive study for the redesigned single-column collapse, hover peek flyout, universal non-empty column collapse, status accent indicators, and toolbar quick view controls.

Open `board-column-collapse.html` or `trajectory-explorer.html` in a browser or serve this directory with a local static server. Try search, column collapse/expand, hover peek drawer, view presets, and demo data playground.
