import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const webUrl = "http://127.0.0.1:4173";
const token = "e2e-token";

test("Goal board uses saved state, structured waits, and full-width session tabs", async () => {
  const mock = createMockApi();
  const apiAddress = await listen(mock.server);
  const apiPort = Number(new URL(apiAddress).port);
  const webServer = spawn(
    process.execPath,
    [join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
    {
      cwd: root,
      env: { ...process.env, LAZYGOAL_E2E_API_PORT: String(apiPort) },
      stdio: "ignore",
    },
  );
  const profile = await mkdtemp(join(tmpdir(), "lazygoal-browser-e2e-"));
  let chrome;
  let socket;

  try {
    await waitForHttp(`${webUrl}/`);
    chrome = spawn(findChrome(), [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ], { stdio: "ignore" });
    const devtools = await waitForDevtools(profile, chrome);
    const targets = await (await fetch(`http://127.0.0.1:${devtools.port}/json/list`)).json();
    const target = targets.find((item) => item.type === "page");
    assert.ok(target?.webSocketDebuggerUrl, "Chrome exposes a page target");
    socket = await connectCdp(target.webSocketDebuggerUrl);
    await cdp(socket, "Page.enable");
    await cdp(socket, "Runtime.enable");

    await navigate(socket, `${webUrl}/`);
    await waitForExpression(socket, "document.body.innerText.includes('lazygoal web')");
    assert.equal(await value(socket, "document.querySelector('button.primary')?.disabled"), true);
    assert.equal(mock.authorizedRequests(), 0, "preview without a fragment token makes no API requests");

    await navigate(socket, `${webUrl}/?session=desktop#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    assert.equal(await value(socket, "document.querySelector('.sidebar, .view-switch, .filter') === null"), true);
    assert.match(await value(socket, "document.body.innerText"), /Collect approved notes from the current workspace/);
    assert.doesNotMatch(await value(socket, "document.body.innerText"), /Sample goal|Project selector|Workspace settings/);
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.goal-card').click()",
      returnByValue: true,
    });

    await waitForExpression(socket, "document.querySelector('.transient-message h1')?.textContent === 'Checking saved notes…'");
    assert.match(await value(socket, "document.querySelector('.session').innerText"), /Live response/);
    assert.match(await value(socket, "document.querySelector('.session').innerText"), /Not saved yet/);
    assert.doesNotMatch(await value(socket, "document.querySelector('.session').innerText"), /Run completed/);
    await waitForExpression(socket, "document.querySelector('.transient-message h1')?.textContent === 'Reviewing result…'");
    assert.doesNotMatch(await value(socket, "document.querySelector('.transient-message').innerText"), /Checking saved notes/);
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Which source should I use?')");
    const conversationBounds = await value(socket, "(() => { const timeline = document.querySelector('.run-timeline').getBoundingClientRect(); const composer = document.querySelector('.composer-area .approval').getBoundingClientRect(); return { timelineWidth: timeline.width, composerWidth: composer.width, centerGap: Math.abs((timeline.left + timeline.right - composer.left - composer.right) / 2) }; })()");
    assert.ok(conversationBounds.timelineWidth <= 800 && conversationBounds.composerWidth <= 800);
    assert.ok(conversationBounds.centerGap < 16);
    assert.deepEqual(await value(socket, "[...document.querySelectorAll('.tool-activity-label')].map(label => label.textContent)"), ["Searched for approved notes", "Read README.md", "Ran npm test"]);
    assert.equal(await value(socket, "document.querySelector('.tool-event .step-status.completed') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.step-status.failed')?.textContent"), "failed");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.run-steps-heading').click()", returnByValue: true });
    assert.equal(await value(socket, "document.querySelector('.tool-event').checkVisibility()"), false);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.run-steps-heading').click(); [...document.querySelectorAll('.tool-event > summary')].find(row => row.textContent.includes('Ran npm test')).click()", returnByValue: true });
    assert.match(await value(socket, "document.querySelector('.tool-event[open]').innerText"), /npm test|Exit code|Test failed/);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.tool-event[open] > summary').click()", returnByValue: true });
    assert.equal(await value(socket, "document.querySelector('.session-header') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.task-state').textContent"), "Awaiting your response");
    await waitForExpression(socket, "document.querySelector('.session-metrics') !== null");
    assert.equal(await value(socket, "document.querySelector('.context-ring').style.background.includes('conic-gradient')"), false);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.session-metrics').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.metrics-dialog[open]') !== null");
    assert.match(await value(socket, "document.querySelector('.metrics-dialog').innerText"), /Missing values are not counted as zero/);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close metrics\"]').click()", returnByValue: true });

    assert.equal(await value(socket, "document.querySelector('.topbar .goal-info-toggle') !== null"), true);
    assert.deepEqual(await value(socket, "[...document.querySelectorAll('.session-tab-buttons button')].map(button => button.textContent)"), ["Board", "Activity", "Trajectory"]);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.session-tab-buttons button').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.session .board-area .goal-card') !== null");
    assert.equal(await value(socket, "document.querySelectorAll('.session .board .column').length"), 5);
    assert.equal(await value(socket, "document.querySelector('.session .board-footer') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.session .composer-area') === null"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.session .goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "[...document.querySelectorAll('.session-tab-buttons button')].find(button => button.textContent === 'Activity')?.getAttribute('aria-pressed') === 'true'");
    assert.equal(await value(socket, "[...document.querySelectorAll('.session-tab-buttons button')].some(button => button.textContent === 'Plan')"), false);
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.composer-area .current-model-control') !== null"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').focus(); document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    assert.equal(await value(socket, "[...document.querySelectorAll('.model-option')].find(button => button.textContent.includes('Unavailable Model')).disabled"), true);
    assert.equal(await value(socket, "document.activeElement === document.querySelector('.model-search')"), true);
    for (let index = 0; index < 8; index += 1) {
      await cdp(socket, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      await cdp(socket, "Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      assert.equal(await value(socket, "document.querySelector('.model-picker').contains(document.activeElement) || document.activeElement === document.body"), true);
    }
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.model-search').focus()", returnByValue: true });
    await setText(socket, ".model-search", "Selected Model");
    assert.equal(await value(socket, "document.querySelectorAll('.model-option').length"), 1);
    await cdp(socket, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitForExpression(socket, "document.querySelector('.model-picker') === null");
    assert.equal(await value(socket, "document.activeElement === document.querySelector('.composer-area .current-model-control')"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').focus(); document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");

    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close model picker\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-picker') === null");
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('label.answer-option')].find(label => label.innerText.includes('Approved notes')).querySelector('input').click()",
      returnByValue: true,
    });
    mock.rejectNextModelSelection();
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').focus(); document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.model-option')].find(button => button.textContent.includes('Selected Model')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-error')?.textContent.includes('could not save')");
    assert.equal(await value(socket, "[...document.querySelectorAll('label.answer-option')].find(label => label.innerText.includes('Approved notes')).querySelector('input').checked"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close model picker\"]').click()", returnByValue: true });
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('button')].find(button => button.textContent.includes('Submit answer')).click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Run completed')");
    await waitForExpression(socket, "document.querySelector('.composer-area .composer') !== null");
    const inputBounds = await value(socket, "(() => { const box = document.querySelector('.composer-area .composer').getBoundingClientRect(); return { width: box.width, centerGap: Math.abs((box.left + box.right) / 2 - window.innerWidth / 2) }; })()");
    assert.ok(inputBounds.width <= 800 && inputBounds.centerGap < 16);
    await waitForExpression(socket, "document.querySelector('.permission-trigger')?.textContent.includes('Default')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.permission-trigger').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.permission-popover') !== null");
    assert.equal(await value(socket, "document.querySelector('.permission-popover > header') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.permission-grants')?.open"), false);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.permission-modes label:last-child input').click()", returnByValue: true });
    await waitForLocal(() => mock.permissionMode === "yolo");
    await waitForExpression(socket, "document.querySelector('.permission-popover') === null && document.querySelector('.permission-trigger')?.textContent.includes('YOLO')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.permission-trigger').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.permission-popover') !== null");
    await cdp(socket, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitForExpression(socket, "document.querySelector('.permission-popover') === null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.permission-trigger').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.permission-popover') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.session-tabs').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.permission-popover') === null");
    assert.deepEqual(mock.lastInteraction, {
      kind: "answer_ask_user",
      runId: "run-1",
      requestId: "request-1",
      answers: [{ questionId: "source", optionIds: ["approved"] }],
    });

    mock.resetToWaiting();
    await cdp(socket, "Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    assert.equal(await value(socket, "document.documentElement.scrollWidth <= window.innerWidth"), true);
    assert.equal(await value(socket, "document.querySelector('.markdown-table-scroll').getBoundingClientRect().right <= window.innerWidth"), true);
    await navigate(socket, `${webUrl}/?session=mobile#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.goal-card').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Which source should I use?')");
    assert.equal(await value(socket, "getComputedStyle(document.querySelector('.session')).position"), "relative");
    assert.equal(await value(socket, "document.documentElement.scrollWidth <= window.innerWidth"), true);
    assert.equal(await value(socket, "document.querySelector('.run-timeline').getBoundingClientRect().width <= window.innerWidth - 32"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.permission-trigger').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.permission-popover') !== null");
    assert.equal(await value(socket, "(() => { const menu = document.querySelector('.permission-popover').getBoundingClientRect(); return menu.left >= 0 && menu.right <= window.innerWidth; })()"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.permission-trigger').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.permission-popover') === null");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('button[aria-label=\"Close session\"]').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session') === null");
    assert.notEqual(await value(socket, "document.querySelector('.goal-card') === null"), true);

    mock.resetToUnknownAction();
    await navigate(socket, `${webUrl}/?session=recovery#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.goal-card').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Action result needs review')");
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]') === null"), true);
    assert.equal(await value(socket, "[...document.querySelectorAll('.approval button')].some(button => button.textContent.includes('Approve action'))"), true);

    mock.resetToAction();
    await navigate(socket, `${webUrl}/?session=approval#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.approval')?.innerText.includes('Your approval is needed')");
    assert.equal(await value(socket, "(() => { const panel = document.querySelector('.action-approval').getBoundingClientRect(); return panel.left >= 0 && panel.right <= window.innerWidth && Math.abs((panel.left + panel.right) / 2 - window.innerWidth / 2) < 2; })()"), true);
    assert.equal(await value(socket, "document.documentElement.scrollWidth <= window.innerWidth"), true);
    assert.equal(await value(socket, "getComputedStyle(document.querySelector('.approval-scopes')).gridTemplateColumns.split(' ').length"), 1);
    assert.equal(await value(socket, "(() => { const panel = document.querySelector('.action-approval').getBoundingClientRect(); const button = document.querySelector('.action-approval .approval-primary').getBoundingClientRect(); return button.top >= panel.top && button.bottom <= panel.bottom; })()"), true);
    assert.equal(await value(socket, "document.querySelector('.action-rejection').open"), false);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.action-rejection summary').click()", returnByValue: true });
    assert.equal(await value(socket, "document.querySelector('#action-reason').getBoundingClientRect().height > 0"), true);
    assert.equal(await value(socket, "document.querySelector('.action-rejection button').disabled"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.action-rejection summary').click()", returnByValue: true });
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    assert.equal(await value(socket, "(() => { const panel = document.querySelector('.action-approval').getBoundingClientRect(); const timeline = document.querySelector('.run-timeline').getBoundingClientRect(); return panel.width === timeline.width && Math.abs((panel.left + panel.right - timeline.left - timeline.right) / 2) < 2; })()"), true);
    assert.equal(await value(socket, "getComputedStyle(document.querySelector('.approval-scopes')).gridTemplateColumns.split(' ').length"), 3);
    assert.equal(await value(socket, "document.querySelector('.action-summary').textContent"), "write_file");
    assert.equal(await value(socket, "[...document.querySelectorAll('.approval-scopes label')].find(label => label.innerText.includes('This Goal')).querySelector('input').disabled"), true);
    assert.equal(await value(socket, "document.querySelector('.path-permission-note')?.innerText.includes('src/file.ts')"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.action-details-toggle').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.action-input-full')?.innerText.includes('Complete private body')");
    assert.equal(await value(socket, "[...document.querySelectorAll('.approval-scopes label')].find(label => label.innerText.includes('This Goal')).querySelector('input').disabled"), false);
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('.approval-scopes label')].find(label => label.innerText.includes('This Goal')).querySelector('input').click()",
      returnByValue: true,
    });
    assert.equal(await value(socket, "document.querySelector('.approval-primary').innerText"), "Approve for this Goal");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.action-details-toggle').click()", returnByValue: true });
    assert.equal(await value(socket, "document.querySelector('.approval-primary').innerText"), "Approve once");
    assert.equal(await value(socket, "document.querySelector('.approval-scopes input').checked"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.action-details-toggle').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.action-input-full') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.approval-scopes label')].find(label => label.innerText.includes('This Goal')).querySelector('input').click(); document.querySelector('.approval-primary').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('I collected the approved notes.')");
    assert.equal(await value(socket, "document.querySelector('.message.assistant:not(.transient-message) h1')?.textContent"), "I collected the approved notes.");
    assert.equal(await value(socket, "document.querySelector('.message.assistant .markdown-table-scroll th')?.textContent"), "Field");
    assert.equal(await value(socket, "document.querySelector('.message.assistant .markdown-table-scroll td')?.textContent"), "Source");
    assert.equal(await value(socket, "document.querySelector('.message.assistant li strong')?.textContent"), "Verified");
    assert.equal(await value(socket, "document.querySelector('.message.assistant pre code')?.textContent.trim()"), "run-1");
    assert.equal(await value(socket, "document.querySelector('.message.assistant script, .message.assistant img') === null"), true);
    assert.equal(mock.lastInteraction.scope, "goal");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.session-tab-buttons button')].find(button => button.textContent === 'Trajectory').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.mi-input-status')?.textContent.includes('Retry inputs')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Zoom in timeline\"]').click(); document.querySelector('#trajectory-event-1').click()", returnByValue: true });
    const retainedZoom = await value(socket, "document.querySelector('.tr-zoom-level').textContent");
    assert.notEqual(retainedZoom, "1×");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.mi-input-status button')].find(button => button.textContent === 'Retry inputs').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.mi-input-status')?.textContent.includes('Historical model inputs not recorded')");
    assert.equal(await value(socket, "document.querySelector('.tr-zoom-level').textContent"), retainedZoom);
    assert.equal(await value(socket, "document.querySelector('#trajectory-event-1').getAttribute('aria-pressed')"), "true");
    assert.equal(mock.trajectoryReads(), 1, "retrying inputs does not reload committed events");
    await setText(socket, "input[aria-label='Search trajectory']", "native");
    await waitForExpression(socket, "document.querySelector('.mi-input-status')?.textContent.includes('1 / 1 saved model inputs')");
    assert.equal(await value(socket, "document.querySelector('.mi-input-status [role=alert]') === null"), true);
    assert.equal(await value(socket, "[...document.querySelectorAll('.ct-record')].some(row => row.textContent.includes('Native tool result'))"), true);
    assert.equal(await value(socket, "[...document.querySelectorAll('.ct-record')].find(row => row.textContent.includes('Native tool result')).querySelector('.ct-badge').textContent"), "Tool");
    assert.equal(await value(socket, "(() => { const row = [...document.querySelectorAll('.ct-record')].find(item => item.textContent.includes('Native tool result')); const body = row.querySelector('.ct-record-body'); const preview = row.querySelector('.ct-preview'); const bounds = row.getBoundingClientRect(); return getComputedStyle(row).display === 'flex' && getComputedStyle(body).display === 'flex' && preview.getBoundingClientRect().right <= bounds.right && preview.getBoundingClientRect().height <= bounds.height; })()"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.ct-record')].find(row => row.textContent.includes('Native tool result')).querySelector('.ct-record-body').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.mi-message summary')?.textContent.includes('Tool result')");
    assert.equal(await value(socket, "document.querySelector('.mi-inspector [role=alert]') === null"), true);
    assert.equal(await value(socket, "document.querySelectorAll('.tr-inspector').length"), 1);
    assert.equal(await value(socket, "document.querySelector('.tr-ledger-layout > .mi-inspector') !== null"), true);
    assert.equal(await value(socket, "document.querySelector('.mi-inspector').getBoundingClientRect().top >= document.querySelector('.tr-overview').getBoundingClientRect().bottom"), true);
    const detailReads = mock.inputDetailReads();
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.ct-record-body')].find(row => row.textContent.includes('Run mode')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.mi-message.is-selected')?.dataset.messageIndex === '1'");
    assert.equal(await value(socket, "document.querySelector('.mi-inspector h3').textContent"), "Run mode");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.ct-record-body')].find(row => row.textContent.includes('Authorized tools')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.mi-message.is-selected')?.dataset.messageIndex === '2'");
    assert.equal(mock.inputDetailReads(), detailReads, "message selection reuses the loaded model request");
    assert.equal(await value(socket, "document.querySelector('.mi-message[data-message-index=\"1\"]').open"), false);
    assert.equal(await value(socket, "(() => { const message = document.querySelector('.mi-message.is-selected').getBoundingClientRect(); const body = document.querySelector('.mi-inspector .tr-detail-body').getBoundingClientRect(); return message.top >= body.top && message.top < body.bottom; })()"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Reset timeline zoom\"]').click()", returnByValue: true });
    const timelinePoint = await value(socket, "(() => { const button = document.querySelector('button[aria-label=\"Locate trajectory event 2\"]'); const r = button.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; return { x, y, reachable: document.elementFromPoint(x, y) === button }; })()");
    assert.equal(timelinePoint.reachable, true, "the model inspector leaves timeline event markers reachable");
    await cdp(socket, "Input.dispatchMouseEvent", { type: "mousePressed", x: timelinePoint.x, y: timelinePoint.y, button: "left", clickCount: 1 });
    await cdp(socket, "Input.dispatchMouseEvent", { type: "mouseReleased", x: timelinePoint.x, y: timelinePoint.y, button: "left", clickCount: 1 });
    await waitForExpression(socket, "document.querySelector('.tr-inspector header')?.textContent.includes('Event #2')");
    assert.equal(await value(socket, "document.querySelector('.mi-inspector') === null && document.querySelectorAll('.tr-inspector').length === 1"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.ct-record-body')].find(row => row.textContent.includes('Authorized tools')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.mi-message.is-selected')?.dataset.messageIndex === '2'");
    assert.equal(await value(socket, "document.querySelectorAll('.tr-inspector').length"), 1);
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await waitForExpression(socket, "(() => { const message = document.querySelector('.mi-message.is-selected').getBoundingClientRect(); const body = document.querySelector('.mi-inspector .tr-detail-body').getBoundingClientRect(); return message.top >= body.top && message.top < body.bottom; })()");
    assert.equal(await value(socket, "(() => { const inspector = document.querySelector('.mi-inspector').getBoundingClientRect(); const ledger = document.querySelector('.tr-ledger').getBoundingClientRect(); const overview = document.querySelector('.tr-overview').getBoundingClientRect(); return inspector.top >= overview.bottom && inspector.bottom <= ledger.top + 1 && ledger.height >= 180 && document.querySelector('.mi-inspector .tr-detail-body').getBoundingClientRect().height >= 100 && document.documentElement.scrollWidth <= window.innerWidth; })()"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close prompt details\"]').click()", returnByValue: true });
    assert.equal(await value(socket, "document.querySelector('.tr-inspector') === null"), true);
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });



    mock.resetToAction();
    await navigate(socket, `${webUrl}/?session=reject#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.action-rejection summary') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.action-rejection summary').click()", returnByValue: true });
    await setText(socket, "#action-reason", "Keep the file unchanged.");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.action-rejection button').click()", returnByValue: true });
    await waitForLocal(() => mock.lastInteraction.kind === "reject_action");
    assert.deepEqual(mock.lastInteraction, { kind: "reject_action", runId: "run-1", actionId: "action-1", reason: "Keep the file unchanged." });
    await waitForExpression(socket, "document.querySelector('.action-approval') === null");

    mock.resetGrants();
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('button[aria-label=\"Goal information and permissions\"]').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.grant-panel')?.innerText.includes('src/file.ts')");
    assert.equal(await value(socket, "[...document.querySelectorAll('.grant-panel button')].some(button => button.textContent.includes('Revoke'))"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.grant-revoke').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.grant-panel')?.innerText.includes('No ongoing permissions.')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close Goal information\"]').click()", returnByValue: true });

    mock.resetToFailed();
    await navigate(socket, `${webUrl}/?session=failed#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.goal-card').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('This Run failed')");
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]') !== null");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/unknown");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Send message\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.command-error')?.innerText.includes('Unknown slash command')");
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]').value"), "/unknown");
    assert.equal(mock.lastMessage, undefined);
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/plan extra");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Send message\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.command-error')?.innerText.includes('does not accept')");
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]').value"), "/plan extra");
    assert.equal(mock.planModeRequests, 0);
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/p");
    await waitForExpression(socket, "document.querySelector('.command-candidate')?.textContent.includes('/plan')");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('textarea[aria-label=\"Message the Goal\"]').focus()",
      returnByValue: true,
    });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    assert.equal(await value(socket, "document.querySelector('.command-candidates') === null"), true);
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]').value"), "/p");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/pl");
    await waitForExpression(socket, "document.querySelector('.command-candidate') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.command-candidate').click()", returnByValue: true });
    await waitForLocal(() => mock.planModeRequests === 1);
    assert.deepEqual(mock.lastPlanMode, { runId: "run-1" });
    assert.equal(mock.lastMessage, undefined, "command selection does not submit a Goal message");
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]')?.disabled === false");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/p");
    await waitForExpression(socket, "document.querySelector('.command-candidate') !== null");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('textarea[aria-label=\"Message the Goal\"]').focus()",
      returnByValue: true,
    });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await waitForLocal(() => mock.planModeRequests === 2);
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]')?.disabled === false");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/mod");
    await waitForExpression(socket, "document.querySelector('.command-candidate')?.textContent.includes('/model')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.command-candidate').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    mock.failNextDefaultSave();
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.model-option')].find(button => button.textContent.includes('Selected Model')).click()", returnByValue: true });
    await waitForLocal(() => mock.lastModelSelection?.modelId === "model-selected");
    await waitForExpression(socket, "document.querySelector('.model-picker') === null");
    await waitForExpression(socket, "document.querySelector('.command-error')?.textContent.includes('default was not saved')");
    assert.equal(mock.preferredModelId, "model-default", "committed Goal switch does not claim a failed preference write");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.command-error button')].find(button => button.textContent.includes('Retry saving default')).click()", returnByValue: true });
    await waitForLocal(() => mock.preferredModelId === "model-selected");
    assert.equal(mock.lastMessage, undefined, "model command does not submit a Goal message");
    mock.delayNextModelCatalog();
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').focus(); document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-picker') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close model picker\"]').click()", returnByValue: true });
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').focus(); document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    await delay(250);
    assert.equal(await value(socket, "document.querySelector('.model-picker')?.innerText.includes('Stale Model')"), false);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close model picker\"]').click()", returnByValue: true });
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "Try again with the saved history");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('button[aria-label=\"Send message\"]').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Try again with the saved history')");
    assert.deepEqual(mock.lastMessage, { runId: "run-1", content: "Try again with the saved history" });
    mock.resetToFailed();
    await navigate(socket, `${webUrl}/?session=escaped#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]') !== null");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "//plan");
    assert.equal(await value(socket, "document.querySelector('.command-candidates') === null"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Send message\"]').click()", returnByValue: true });
    await waitForLocal(() => mock.lastMessage?.content === "/plan");
    assert.equal(mock.planModeRequests, 2, "escaped text does not execute a command");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.header-actions .primary').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.draft-timeline') !== null");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/model");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Send message\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.model-option')].find(button => button.textContent.includes('Selected Model')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-picker') === null");
    assert.equal(mock.preferredModelId, "model-selected", "draft selection is saved before creating a Goal");
    mock.delayNextDraftCatalog();
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close session\"]').click(); document.querySelector('.header-actions .primary').click()", returnByValue: true });
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.model-option')].find(button => button.textContent.includes('Selected Model')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-picker') === null");
    await delay(220);
    await waitForExpression(socket, "document.querySelector('.composer-area .current-model-control')?.textContent.includes('Selected Model')");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "Inspect the current workspace");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Send message\"]').click()", returnByValue: true });
    await waitForLocal(() => mock.lastCreate?.modelId === "model-selected");
    assert.equal(mock.lastCreate.intent, "Inspect the current workspace");
    mock.resetToFailed();
    await navigate(socket, `${webUrl}/?session=management#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card-options') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card-options').click()", returnByValue: true });
    await waitForExpression(socket, "getComputedStyle(document.querySelector('.goal-card-menu.is-expanded .goal-card-options')).visibility === 'hidden'");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.goal-card-menu-items button')].find(button => button.textContent.includes('Archive')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.archive-view-toggle')?.textContent.includes('Archived (1)')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.archive-view-toggle').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card-options').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.goal-card-menu-items') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.goal-card-menu-items button')].find(button => button.textContent.includes('Delete')).click()", returnByValue: true });
    await waitForExpression(socket, "[...document.querySelectorAll('.goal-card-menu-items button')].some(button => button.textContent.includes('Confirm'))");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.goal-card-menu-items button')].find(button => button.textContent.includes('Confirm')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.goal-card') === null");
    assert.ok(mock.authorizationHeaders.every((header) => header === `Bearer ${token}`));
  } finally {
    socket?.close();
    if (chrome !== undefined && chrome.exitCode === null) {
      const closed = once(chrome, "close");
      chrome.kill("SIGTERM");
      await closed;
    }
    webServer.kill("SIGTERM");
    mock.server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

function createMockApi() {
  let session = waitingSession();
  let currentListItem = listItem("waiting");
  let liveTransitionSent = false;
  let lastInteraction;
  let lastMessage;
  let lastPlanMode;
  let lastModelSelection;
  let lastCreate;
  let selectedModelId = "model-default";
  let preferredModelId = "model-default";
  let delayNextDraftCatalog = false;
  let failNextDefaultSave = false;
  let rejectNextSelection = false;
  let delayNextCatalog = false;
  let planModeRequests = 0;
  let permissionMode = "default";
  let permissionRevision = 0;
  const authorizationHeaders = [];
  let authorizedRequestCount = 0;
  let inputReads = 0;
  let trajectoryReads = 0;
  let inputDetailReads = 0;
  const nativeCall = { goalId: "goal-1", runId: "run-1", callId: "call-native", stepIndex: 1, stage: "decide", occurredAt: "2026-08-05T09:00:01.000Z", messages: [
    { role: "tool", source: "native_history", callId: "tool-call", toolId: "read_file", content: "Native tool result" },
    { role: "user", source: "section", content: `[Dynamic section: run_mode; source: Goal.intent]\n${"Follow the current request.\n".repeat(80)}` },
    { role: "user", source: "section", content: "[Dynamic section: authorized_tools; source: Runtime.authorizedTools]\nTools available for this request." },
  ] };
  const server = createServer(async (request, response) => {
    authorizationHeaders.push(request.headers.authorization ?? "");
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    authorizedRequestCount += 1;
    if (request.url === "/api/project/permission-mode" && request.method === "GET") {
      json(response, { ok: true, mode: permissionMode, revision: permissionRevision, workspaceId: "workspace-1" });
      return;
    }
    if (request.url === "/api/project/permission-mode" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const command = JSON.parse(body);
      if (command.expectedRevision !== permissionRevision) {
        json(response, { ok: false, error: "conflict", actualRevision: permissionRevision });
        return;
      }
      permissionMode = command.mode;
      permissionRevision += 1;
      json(response, { ok: true, mode: permissionMode, revision: permissionRevision, workspaceId: "workspace-1" });
      return;
    }
    if (request.url === "/goals/goal-1/metrics" && request.method === "GET") {
      json(response, { goalId: "goal-1", roundCount: 1, stepCount: 3, reportedCalls: 1, missingCalls: 1, inputTokens: 1200, outputTokens: 80, coverage: "partial", cacheMeasuredCalls: 0, cacheExcludedCalls: 2, cacheHitRate: null, throughputMeasuredCalls: 0, throughputExcludedCalls: 2, tokensPerSecond: null, contextRemainingPercent: null, runs: [] });
      return;
    }
    if (request.url?.startsWith("/api/goals/goal-1/model-inputs?")) {
      inputReads += 1;
      if (inputReads === 1) { response.writeHead(500); response.end(); }
      else if (new URL(request.url, "http://localhost").searchParams.get("callId") === "call-native") { inputDetailReads += 1; json(response, { call: nativeCall, previousSystem: null, previousCallId: null, systemVersion: "hash" }); }
      else if (new URL(request.url, "http://localhost").searchParams.get("q") === "native") json(response, { calls: [{ goalId: "goal-1", runId: "run-1", callId: "call-native", stepIndex: 1, stage: "decide", occurredAt: "2026-08-05T09:00:01.000Z", systemVersion: "hash", systemChanged: false, firstSystem: true, previousCallId: null, omittedMessageCount: 0, messages: nativeCall.messages.map((message, index) => ({ role: message.role, source: message.source, index, preview: index === 0 ? `Native tool result ${"long content ".repeat(200)}` : message.content.slice(0, 700), truncated: true })) }], total: 1, nextOffset: null });
      else json(response, { calls: [], total: 0, nextOffset: null });
      return;
    }
    if (request.url?.startsWith("/api/goals/goal-1/trajectory")) {
      const run = { runId: "run-1", status: "completed", current: true, committedThroughSequence: 2 };
      if (request.url.startsWith("/api/goals/goal-1/trajectory/runs")) json(response, { runs: [run], nextOffset: null });
      else if (request.url.startsWith("/api/goals/goal-1/trajectory?")) {
        trajectoryReads += 1;
        json(response, { goalId: "goal-1", run, entries: [1, 2].map(sequence => ({ eventId: `event-${sequence}`, sequence, occurredAt: `2026-08-05T09:00:0${sequence}.000Z`, eventType: sequence === 1 ? "run_started" : "run_completed", category: "lifecycle", title: "Run", preview: "Committed Run event", previewTruncated: false })), total: 2, committedCount: 2, previousCursor: null, nextCursor: null, locatedSequence: null });
      } else if (request.url.startsWith("/api/goals/goal-1/trajectory/events/")) {
        const sequence = Number(request.url.split("/").at(-1).split("?")[0]);
        const eventType = sequence === 1 ? "run_started" : "run_completed";
        json(response, { event: { eventSchemaVersion: 1, eventId: `event-${sequence}`, goalId: "goal-1", runId: "run-1", sequence, occurredAt: `2026-08-05T09:00:0${sequence}.000Z`, phase: "executing", eventType, payload: { type: eventType } }, observationConfirmed: false, toolDurationMs: null });
      } else { response.writeHead(404); response.end(); }
      return;
    }
    if (request.url === "/api/goals" && request.method === "GET") {
      json(response, { goals: currentListItem === null ? [] : [currentListItem] });
      return;
    }
    if (request.url === "/api/goals/goal-1/archive" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      currentListItem = { ...currentListItem, archived: JSON.parse(body).archived };
      json(response, { ok: true });
      return;
    }
    if (request.url === "/api/goals/goal-1" && request.method === "DELETE") {
      currentListItem = null;
      json(response, { ok: true });
      return;
    }
    if (request.url === "/api/models" && request.method === "GET") {
      if (delayNextDraftCatalog) {
        delayNextDraftCatalog = false;
        await delay(180);
        json(response, { provider: "openai", currentModelId: "model-default", models: [
          { id: "model-default", displayName: "Default Model", availabilitySource: "live", metadataSource: "catalog", selectable: true },
          { id: "model-selected", displayName: "Selected Model", availabilitySource: "catalog", metadataSource: "catalog", selectable: true },
        ] });
        return;
      }
      json(response, { provider: "openai", currentModelId: preferredModelId, models: [
        { id: "model-default", displayName: "Default Model", availabilitySource: "live", metadataSource: "catalog", selectable: true },
        { id: "model-selected", displayName: "Selected Model", availabilitySource: "catalog", metadataSource: "catalog", selectable: true },
      ] });
      return;
    }
    if (request.url === "/api/project/model-preference" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      preferredModelId = JSON.parse(body).modelId;
      json(response, { ok: true, modelId: preferredModelId });
      return;
    }
    if (request.url === "/api/goals" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      lastCreate = JSON.parse(body);
      json(response, { goalId: lastCreate.goalId, runId: "new-run", existing: false });
      return;
    }
    if (request.url === "/api/goals/goal-1" && request.method === "GET") {
      json(response, { goal: session });
      return;
    }
    if (request.url === "/api/goals/goal-1/models?runId=run-1" && request.method === "GET") {
      if (delayNextCatalog) {
        delayNextCatalog = false;
        await delay(180);
        json(response, { provider: "openai", currentModelId: "stale", models: [
          { id: "stale", displayName: "Stale Model", availabilitySource: "catalog", metadataSource: "catalog", selectable: true },
        ] });
        return;
      }
      json(response, {
        provider: "openai",
        currentModelId: selectedModelId,
        models: [
          { id: "model-default", displayName: "Default Model", availabilitySource: "live", metadataSource: "catalog", selectable: true },
          { id: "model-selected", displayName: "Selected Model", availabilitySource: "catalog", metadataSource: "catalog", selectable: true },
          { id: "model-disabled", displayName: "Unavailable Model", availabilitySource: "catalog", metadataSource: "catalog", selectable: false, unavailableReason: "Unsupported output mode" },
        ],
      });
      return;
    }
    if (request.url === "/api/goals/goal-1/model-selection" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      lastModelSelection = JSON.parse(body);
      if (rejectNextSelection) {
        rejectNextSelection = false;
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "model_selection_failed" }));
        return;
      }
      selectedModelId = lastModelSelection.modelId;
      const defaultModelSaved = !failNextDefaultSave;
      failNextDefaultSave = false;
      if (defaultModelSaved) preferredModelId = selectedModelId;
      json(response, { ok: true, goalId: "goal-1", runId: "run-1", modelId: selectedModelId, defaultModelSaved });
      return;
    }
    if (request.url === "/api/goals/goal-1/plan-mode" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      lastPlanMode = JSON.parse(body);
      planModeRequests += 1;
      session = { ...session, nextRunMode: "plan" };
      json(response, { goalId: "goal-1", runId: "run-1", existing: planModeRequests > 1 });
      return;
    }
    if (request.url === "/api/goals/goal-1/actions/action-1?runId=run-1" && request.method === "GET") {
      json(response, { ok: true, goalId: "goal-1", runId: "run-1", actionId: "action-1", toolId: "write_file", input: { path: "src/file.ts", content: "Complete private body" } });
      return;
    }
    if (request.url === "/api/goals/goal-1/grants?runId=run-1" && request.method === "GET") {
      json(response, { ok: true, goalId: "goal-1", runId: "run-1", grants: [{ grantId: "grant-1", scope: "workspace", toolId: "write_file", status: "active", targetPath: "src/file.ts" }] });
      return;
    }
    if (request.url === "/api/goals/goal-1/grants/grant-1" && request.method === "DELETE") {
      json(response, { ok: true, goalId: "goal-1", runId: "run-1", grants: [] });
      return;
    }
    if (request.url?.startsWith("/api/goals/goal-1/events?") && request.method === "GET") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      if (!liveTransitionSent) {
        liveTransitionSent = true;
        response.write(`data: ${JSON.stringify({ goalId: "goal-1", runId: "run-1", type: "activity", activity: { kind: "model_started" } })}\n\n`);
        response.write(`data: ${JSON.stringify({
          goalId: "goal-1",
          runId: "run-1",
          type: "activity",
          activity: { kind: "assistant_text_delta", text: "# Checking saved notes…\n", truncated: false },
        })}\n\n`);
        const timer = setTimeout(() => {
          response.write(`data: ${JSON.stringify({ goalId: "goal-1", runId: "run-1", type: "activity", activity: { kind: "model_started" } })}\n\n`);
          response.write(`data: ${JSON.stringify({ goalId: "goal-1", runId: "run-1", type: "activity", activity: { kind: "assistant_text_delta", text: "# Reviewing result…\n", truncated: false } })}\n\n`);
        }, 120);
        const settle = setTimeout(() => {
          session = interactionSession();
          currentListItem = listItem("waiting");
          response.write(`data: ${JSON.stringify({ goalId: "goal-1", runId: "run-1", type: "snapshot_changed" })}\n\n`);
        }, 240);
        request.on("close", () => { clearTimeout(timer); clearTimeout(settle); });
      }
      return;
    }
    if (request.url === "/api/goals/goal-1/interactions" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      lastInteraction = JSON.parse(body);
      session = completedSession(session);
      currentListItem = listItem("completed");
      json(response, { goalId: "goal-1", runId: "run-1", existing: false });
      return;
    }
    if (request.url === "/api/goals/goal-1/messages" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      lastMessage = JSON.parse(body);
      session = {
        ...session,
        currentRunId: "run-2",
        runStatus: "waiting",
        messages: [...session.messages, { role: "user", content: lastMessage.content }],
        runs: [
          ...session.runs.map((run) => ({ ...run, current: false })),
          { runId: "run-2", status: "waiting", stepCount: 0, steps: [], current: true },
        ],
      };
      currentListItem = { ...listItem("waiting"), runId: "run-2" };
      json(response, { goalId: "goal-1", runId: "run-2", existing: false });
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
  return {
    server,
    authorizationHeaders,
    get lastInteraction() { return lastInteraction; },
    get lastMessage() { return lastMessage; },
    get lastPlanMode() { return lastPlanMode; },
    get lastModelSelection() { return lastModelSelection; },
    get lastCreate() { return lastCreate; },
    get preferredModelId() { return preferredModelId; },
    delayNextDraftCatalog() { delayNextDraftCatalog = true; },
    failNextDefaultSave() { failNextDefaultSave = true; },
    get planModeRequests() { return planModeRequests; },
    get permissionMode() { return permissionMode; },
    authorizedRequests: () => authorizedRequestCount,
    trajectoryReads: () => trajectoryReads,
    inputDetailReads: () => inputDetailReads,
    rejectNextModelSelection() { rejectNextSelection = true; },
    delayNextModelCatalog() { delayNextCatalog = true; },
    resetToWaiting() {
      session = interactionSession();
      currentListItem = listItem("waiting");
      liveTransitionSent = true;
    },
    resetToUnknownAction() {
      session = {
        ...interactionSession(),
        pendingInteraction: undefined,
        pendingAction: {
          actionId: "action-unknown",
          toolId: "write_file",
          status: "outcome_unknown",
          inputPreview: "{\"path\":\"src/file.ts\"}",
          inputPreviewTruncated: false,
          targetPath: "src/file.ts",
        },
      };
      currentListItem = listItem("waiting");
      liveTransitionSent = true;
    },
    resetToAction() {
      session = {
        ...interactionSession(),
        pendingInteraction: undefined,
        pendingAction: {
          actionId: "action-1",
          toolId: "write_file",
          status: "awaiting_approval",
          inputPreview: `{"path":"src/file.ts","content":"${"x".repeat(340)}"}`,
          inputPreviewTruncated: true,
          targetPath: "src/file.ts",
        },
      };
      currentListItem = listItem("waiting");
      liveTransitionSent = true;
    },
    resetGrants() {
      session = interactionSession();
      currentListItem = listItem("waiting");
      liveTransitionSent = true;
    },
    resetToFailed() {
      session = {
        ...waitingSession(),
        runStatus: "failed",
        runs: waitingSession().runs.map((run) => ({ ...run, status: "failed" })),
      };
      currentListItem = listItem("failed");
      liveTransitionSent = true;
    },
  };
}

function waitingSession() {
  return {
    goalId: "goal-1",
    intent: "Collect approved notes from the current workspace",
    currentRunId: "run-1",
    runStatus: "running",
    currentRunMode: "normal",
    messages: [{ role: "user", content: "Collect approved notes from the current workspace" }],
    runs: [{
      runId: "run-1",
      status: "running",
      stepCount: 3,
      steps: [{
        runId: "run-1",
        executionUnitId: "unit-1",
        sequence: 2,
        stepIndex: 1,
        toolId: "grep",
        inputSummary: "approved notes",
        status: "completed",
        summary: "Found three approved notes.",
      }, {
        runId: "run-1", executionUnitId: "unit-2", sequence: 3, stepIndex: 2,
        toolId: "read_file", inputSummary: "README.md", status: "completed", summary: "Project notes.",
      }, {
        runId: "run-1", executionUnitId: "unit-3", sequence: 4, stepIndex: 3,
        toolId: "bash", status: "failed", summary: "Test failed",
        bashExecution: { command: "npm test", failure: "Test failed" },
      }],
      current: true,
    }],
    historyTruncated: false,
  };
}

function interactionSession() {
  const session = waitingSession();
  session.runStatus = "waiting";
  session.runs = session.runs.map((run) => ({ ...run, status: "waiting" }));
  session.messages = [...session.messages, { role: "assistant", content: "Which source should I use?" }];
  session.pendingInteraction = {
    kind: "ask_user",
    requestId: "request-1",
    mode: "execution",
    questions: [{
      id: "source",
      header: "Choose a source",
      question: "Which notes should be included?",
      multiSelect: false,
      options: [
        { id: "approved", label: "Approved notes" },
        { id: "all", label: "All notes" },
      ],
    }],
  };
  return session;
}

function completedSession(previous) {
  return {
    ...previous,
    runStatus: "completed",
    pendingInteraction: undefined,
    messages: [
      ...previous.messages,
      { role: "user", content: "Approved notes" },
      { role: "assistant", content: "# I collected the approved notes.\n\n| Field | Value |\n| --- | --- |\n| Source | Approved notes |\n\n- **Verified** output\n\n```text\nrun-1\n```\n\n<script>window.markdownInjected = true</script>\n\n![Remote image](https://example.com/image.png)" },
    ],
    runs: previous.runs.map((run) => ({ ...run, status: "completed" })),
  };
}

function listItem(runStatus) {
  return {
    goalId: "goal-1",
    runId: "run-1",
    intent: "Collect approved notes from the current workspace",
    workflowPhase: "executing",
    runStatus,
    archived: false,
    updatedAt: "2026-09-26T08:00:00.000Z",
  };
}

function json(response, value) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

async function waitForHttp(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out starting Vite at ${url}`);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  const binary = candidates.find((candidate) => existsSync(candidate));
  assert.ok(binary, "Set CHROME_BIN or install Google Chrome/Chromium to run browser acceptance tests");
  return binary;
}

async function waitForDevtools(profile, chrome) {
  const marker = join(profile, "DevToolsActivePort");
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with status ${chrome.exitCode}`);
    try {
      const [port] = (await readFile(marker, "utf8")).trim().split("\n");
      if (port) return { port };
    } catch {}
    await delay(100);
  }
  throw new Error("Timed out waiting for Chrome DevTools endpoint");
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.pending = new Map();
  socket.nextId = 0;
  socket.addEventListener("message", async (event) => {
    const raw = typeof event.data === "string" ? event.data : await event.data.text();
    const message = JSON.parse(raw);
    if (message.id === undefined) return;
    const pending = socket.pending.get(message.id);
    if (pending === undefined) return;
    socket.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  });
  return socket;
}

function cdp(socket, method, params = {}) {
  const id = ++socket.nextId;
  return new Promise((resolveResult, reject) => {
    socket.pending.set(id, { resolve: resolveResult, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function navigate(socket, url) {
  await cdp(socket, "Page.navigate", { url });
  await waitForExpression(socket, "document.readyState === 'complete'");
}

async function value(socket, expression) {
  const result = await cdp(socket, "Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function setText(socket, selector, text) {
  const expression = `(() => { const field = document.querySelector(${JSON.stringify(selector)}); if (!field) return false; const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set; setter.call(field, ${JSON.stringify(text)}); field.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
  assert.equal(await value(socket, expression), true, `field exists: ${selector}`);
}

async function waitForExpression(socket, expression) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    if (await value(socket, expression)) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for browser expression: ${expression}; page text: ${await value(socket, "document.body.innerText")}`);
}

async function waitForLocal(predicate) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    if (predicate()) return;
    await delay(50);
  }
  throw new Error("Timed out waiting for local browser request");
}
