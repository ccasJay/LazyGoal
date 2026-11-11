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
      "--hide-scrollbars",
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
    // 显式桌面布局视口：headless 默认宽度会触发移动布局并隐藏侧栏初始断言。
    await cdp(socket, "Emulation.setDeviceMetricsOverride", {
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
    });

    await navigate(socket, `${webUrl}/`);
    await waitForExpression(socket, "document.body.innerText.includes('lazygoal web')");
    assert.equal(await value(socket, "document.querySelector('button.primary')?.disabled"), true);
    assert.equal(mock.authorizedRequests(), 0, "preview without a fragment token makes no API requests");

    for (const width of [1280, 761, 760, 390, 320]) {
      await cdp(socket, "Emulation.setDeviceMetricsOverride", {
        width, height: 900, deviceScaleFactor: 1, mobile: width <= 760,
      });
      if (width <= 760) {
        // 移动布局会收起侧栏；显式展开后才能在真实移动视口检查品牌资源与尺寸。
        await waitForExpression(socket, "document.querySelector('.workspace-sidebar-dialog') !== null || document.querySelector('button[aria-label=\"Expand sidebar\"]') !== null");
        await cdp(socket, "Runtime.evaluate", {
          expression: "(() => { const toggle = document.querySelector('button[aria-label=\"Expand sidebar\"]'); if (toggle === null) return false; toggle.click(); return true; })()",
          returnByValue: true,
        });
        await waitForExpression(socket, "document.querySelector('.workspace-sidebar-dialog') !== null");
      }
      const assetName = width <= 760 ? "mark-on-light" : "logo-on-light";
      const logoSelector = width <= 760 ? ".brand-logo img" : ".windowbar-logo";
      await waitForExpression(socket, `(() => { const image = document.querySelector(${JSON.stringify(logoSelector)}); return image?.complete && image.naturalWidth > 0 && image.currentSrc.includes('${assetName}'); })()`);
      await waitForExpression(socket, `(() => { const bounds = document.querySelector(${JSON.stringify(logoSelector)})?.getBoundingClientRect(); return bounds && bounds.left >= 0 && bounds.right <= innerWidth; })()`);
      const brand = await value(socket, `(() => {
        const image = document.querySelector(${JSON.stringify(logoSelector)});
        const bounds = image.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height, aspectRatio: image.naturalWidth / image.naturalHeight,
          alt: image.alt, text: image.closest('button')?.textContent.trim() ?? '', fits: bounds.left >= 0 && bounds.right <= innerWidth };
      })()`);
      assert.equal(brand.width, width <= 760 ? 28 : 96);
      assert.ok(Math.abs(brand.width / brand.height - brand.aspectRatio) < 0.01);
      assert.equal(brand.alt, "LazyGoal");
      assert.equal(brand.text, "");
      assert.equal(brand.fits, true);
    }
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    await navigate(socket, `${webUrl}/?session=desktop#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await waitForExpression(socket, "document.querySelector('.goal-card .metric-coverage')?.innerText.includes('call unreported')");
    assert.match(await value(socket, "document.querySelector('.goal-card .card-metrics').innerText"), /Output rate/);
    assert.doesNotMatch(await value(socket, "document.querySelector('.goal-card .card-metrics').innerText"), /Generation/);
    assert.equal(await value(socket, "document.querySelector('.sidebar, .view-switch, .filter') === null"), true);
    assert.match(await value(socket, "document.body.innerText"), /Collect approved notes from the current workspace/);
    assert.doesNotMatch(await value(socket, "document.body.innerText"), /Sample goal|Project selector|Workspace settings/);
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.goal-card').click()",
      returnByValue: true,
    });

    await waitForExpression(socket, "document.querySelector('.transient-message h1')?.textContent === 'Checking saved notes…'");
    assert.match(await value(socket, "document.querySelector('.session').innerText"), /Earlier response/);
    assert.match(await value(socket, "document.querySelector('.session').innerText"), /Not saved yet/);
    assert.doesNotMatch(await value(socket, "document.querySelector('.session').innerText"), /Run completed/);
    await waitForExpression(socket, "[...document.querySelectorAll('.timeline-activity-status')].some(node => node.textContent === 'Running')");
    const liveGroupId = await value(socket, "[...document.querySelectorAll('.timeline-activity')].find(group => group.querySelector('.timeline-activity-status')?.textContent === 'Running').dataset.groupId");
    assert.equal(await value(socket, "document.querySelector('.timeline-activity.running .timeline-activity-heading').getAttribute('aria-expanded')"), "true", "the active tool group opens to reveal its calls");
    assert.equal(await value(socket, "getComputedStyle(document.querySelector('.timeline-activity.running .activity-snake-loader')).animationName"), "activity-snake-orbit");
    assert.equal(await value(socket, "getComputedStyle(document.querySelector('.timeline-activity.running .activity-snake-loader')).animationName"), "activity-snake-orbit", "the Run status carries motion in the Activity feed");
    assert.match(await value(socket, "document.querySelector('.task-state.running').innerText"), /Running/);
    await cdp(socket, "Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    assert.equal(await value(socket, "getComputedStyle(document.querySelector('.timeline-activity.running .activity-snake-loader')).animationName"), "none");
    assert.equal(await value(socket, "getComputedStyle(document.querySelector('.timeline-activity.running .activity-snake-loader')).animationName"), "none");
    assert.equal(await value(socket, "getComputedStyle(document.querySelector('.task-state.running .status-dot'), '::after').animationName"), "none");
    await cdp(socket, "Emulation.setEmulatedMedia", { features: [] });
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.timeline-activity-heading')].find(button => button.querySelector('.timeline-activity-status')?.textContent === 'Running').click()", returnByValue: true });
    assert.equal(await value(socket, "document.querySelector('.timeline-activity.running .timeline-activity-heading').getAttribute('aria-expanded')"), "false");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.timeline-activity-heading')].find(button => button.querySelector('.timeline-activity-status')?.textContent === 'Running').click()", returnByValue: true });
    assert.equal(await value(socket, "document.querySelector('.timeline-activity.running .timeline-activity-heading').getAttribute('aria-expanded')"), "true");
    assert.match(await value(socket, "[...document.querySelectorAll('.timeline-activity')].find(group => group.querySelector('.timeline-activity-status')?.textContent === 'Running').innerText"), /Not saved yet/);
    mock.advanceReviewActivity();
    await waitForExpression(socket, "[...document.querySelectorAll('.transient-message h1')].some(node => node.textContent === 'Reviewing result…')");
    await waitForExpression(socket, "document.querySelectorAll('.transient-message').length === 2");
    assert.equal(await value(socket, "document.querySelectorAll('.timeline-activity').length"), 4);
    assert.equal(await value(socket, `[...document.querySelectorAll('.timeline-activity')].find(group => group.dataset.groupId === ${JSON.stringify(liveGroupId)}).querySelector('.timeline-activity-heading').getAttribute('aria-expanded')`), "true", "settlement preserves the open live group");
    assert.match(await value(socket, "[...document.querySelectorAll('.timeline-activity')].find(group => group.innerText.includes('Not saved yet'))?.innerText ?? ''"), /Not saved yet/);
    assert.match(await value(socket, "document.querySelectorAll('.transient-message')[0].innerText"), /Earlier response[\s\S]*Checking saved notes/);
    assert.match(await value(socket, "document.querySelectorAll('.transient-message')[1].innerText"), /Live response[\s\S]*Reviewing result/);
    const requestStartedAt = mock.publishModelProgress();
    await waitForExpression(socket, "document.querySelector('.timeline-step-progress')?.innerText.includes('Checking the proposed answer')");
    assert.match(await value(socket, "document.querySelector('.timeline-step-progress').innerText"), /Checking the proposed answer.*No response received yet/);
    assert.equal(await value(socket, "document.querySelector('.timeline-step-progress small[title]')?.title"), "Time since the model request started");
    assert.ok(Date.parse(await value(socket, "[...document.querySelectorAll('.timeline-step-progress time')].at(-1).dateTime")) >= Date.parse(requestStartedAt));
    assert.match(await value(socket, "document.querySelector('.timeline-step-progress ol').innerText"), /Waiting for model response/);
    await value(socket, "document.querySelector('.jump')?.click()");
    await waitForExpression(socket, "document.querySelector('.jump') === null");
    mock.commitWaitingActivity();
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Which source should I use?')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.breadcrumb button').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null && document.querySelector('.session') === null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Which source should I use?')");
    const conversationBounds = await value(socket, "(() => { const timeline = document.querySelector('.session .timeline > *').getBoundingClientRect(); const composer = document.querySelector('.composer-area .approval').getBoundingClientRect(); return { timelineWidth: timeline.width, composerWidth: composer.width, centerGap: Math.abs((timeline.left + timeline.right - composer.left - composer.right) / 2) }; })()");
    assert.ok(conversationBounds.timelineWidth <= 840 && conversationBounds.composerWidth <= 840);
    assert.ok(conversationBounds.centerGap < 16);
    assert.deepEqual(await value(socket, "[...document.querySelectorAll('.timeline-activity-heading')].map(button => button.querySelector('[data-slot=trace-title]').textContent)"), ["Searched files", "Read README.md", "Run tests"]);
    assert.deepEqual(await value(socket, "[...document.querySelectorAll('.timeline-activity-heading')].map(button => button.getAttribute('aria-expanded'))"), ["false", "false", "true"], "active tool groups and failed groups expand by default");
    const visibleActivityHeadingHeight = await value(socket, "(() => { const heading = [...document.querySelectorAll('.timeline-activity-heading')].find(node => node.checkVisibility()); return heading?.getBoundingClientRect().height; })()");
    assert.ok(visibleActivityHeadingHeight >= 24, `visible Activity headings remain large enough to use: ${visibleActivityHeadingHeight}px`);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.timeline-activity.failed .timeline-activity-heading').click()", returnByValue: true });

    mock.commitWaitingActivity();
    await waitForExpression(socket, "document.querySelector('.timeline-activity.failed .timeline-activity-heading')?.getAttribute('aria-expanded') === 'false'");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.timeline-activity-heading[aria-expanded=\"false\"]')].forEach(button => button.click())", returnByValue: true });
    await waitForExpression(socket, "document.querySelectorAll('.timeline-activity-members > li').length === 3");
    assert.deepEqual(await value(socket, "[...document.querySelectorAll('.timeline-activity-members > li .timeline-activity-member-tool')].map(tool => tool.textContent)"), ["bash", "read_file", "bash"]);
    assert.deepEqual(await value(socket, "[...document.querySelectorAll('.timeline-activity-status')].map(status => status.textContent)"), ["Completed", "Completed", "Failed"]);
    assert.match(await value(socket, "[...document.querySelectorAll('.timeline-activity')].find(group => group.innerText.includes('Run tests')).innerText"), /npm test|Test failed/);
    for (const width of [390, 320]) {
      await cdp(socket, "Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: true });
      assert.equal(await value(socket, "(() => { const timeline = document.querySelector('.timeline'); return timeline.scrollWidth <= timeline.clientWidth + 1; })()"), true, `activity details fit a ${width}px viewport`);
    }
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    assert.equal(await value(socket, "document.querySelector('.timeline-run-summary') !== null"), true);
    assert.match(await value(socket, "document.querySelector('.session').innerText"), /Which source should I use\?/);

    assert.equal(await value(socket, "document.querySelector('.session-header') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.task-state').textContent"), "Awaiting your response");
    await waitForExpression(socket, "document.querySelector('.session-metrics-details-trigger') !== null");
    assert.equal(await value(socket, "document.querySelector('.metrics-popover') === null"), true);
    await value(socket, "document.querySelector('.session-metrics-details-trigger').click()");
    await waitForExpression(socket, "document.querySelector('.session-metrics-details-trigger')?.getAttribute('aria-expanded') === 'true'");
    const metricDetails = await value(socket, "document.querySelector('.metrics-popover').innerText");
    assert.match(metricDetails, /Goal metrics/);
    assert.match(metricDetails, /Output rate/);
    assert.doesNotMatch(metricDetails, /end-to-end provider request rate/i);
    assert.doesNotMatch(metricDetails, /not provider-internal decode speed/i);
    assert.doesNotMatch(metricDetails, /Missing values are not counted as zero/);
    mock.publishOutputRate();
    await waitForExpression(socket, "document.querySelector('.metrics-popover')?.innerText.includes('25 tok/s')");
    assert.match(await value(socket, "document.querySelector('.metrics-popover').innerText"), /1 measured, 1 excluded calls/);
    await value(socket, "document.querySelector('.session-metrics-details-trigger').click()");
    await waitForExpression(socket, "document.querySelector('.metrics-popover') === null");

    assert.equal(await value(socket, "document.querySelector('.topbar .goal-info-toggle') !== null"), true);
    assert.deepEqual(await value(socket, "[...document.querySelectorAll('.session-tab-buttons button')].map(button => button.getAttribute('aria-label'))"), ["Board", "Activity", "Trajectory"]);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.session-tab-buttons button[aria-label=\"Board\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.session .board-area .goal-card') !== null");
    assert.equal(await value(socket, "document.querySelectorAll('.session .board .column').length"), 5);
    assert.equal(await value(socket, "document.querySelector('.session .board-footer') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.session .composer-area') === null"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.session .goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "[...document.querySelectorAll('.session-tab-buttons button')].find(button => button.getAttribute('aria-label') === 'Activity')?.getAttribute('aria-pressed') === 'true'");
    assert.equal(await value(socket, "[...document.querySelectorAll('.session-tab-buttons button')].some(button => button.getAttribute('aria-label') === 'Plan')"), false);
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.composer-area .current-model-control') !== null"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').focus(); document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    assert.equal(await value(socket, "[...document.querySelectorAll('.model-option')].find(button => button.textContent.includes('Unavailable Model')).getAttribute('aria-disabled') === 'true'"), true);
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
    await waitForExpression(socket, "document.activeElement === document.querySelector('.composer-area .current-model-control')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').focus(); document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");

    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close model picker\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-picker') === null");
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('label.answer-option')].find(label => label.innerText.includes('Approved notes')).querySelector('[role=radio], [role=checkbox]').click()",
      returnByValue: true,
    });
    mock.rejectNextModelSelection();
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').focus(); document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.model-option')].find(button => button.textContent.includes('Selected Model')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-error')?.textContent.includes('could not save')");
    assert.equal(await value(socket, "[...document.querySelectorAll('label.answer-option')].find(label => label.innerText.includes('Approved notes')).querySelector('[role=radio], [role=checkbox]').getAttribute('aria-checked') === 'true'"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close model picker\"]').click()", returnByValue: true });
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('button')].find(button => button.textContent.includes('Send answers')).click()",
      returnByValue: true,
    });
    await value(socket, "document.querySelector('.jump')?.click()");
    await waitForExpression(socket, "document.querySelector('.timeline-run-summary.completed .timeline-run-status')?.textContent === 'Completed'");
    await waitForExpression(socket, "document.querySelector('.composer-area') !== null && document.querySelector('textarea[aria-label=\"Goal intent\"]') === null");
    const controlBounds = await value(socket, "(() => { const controls = document.querySelector('.composer-area').getBoundingClientRect(); const main = document.querySelector('.workspace-main').getBoundingClientRect(); return { width: controls.width, centered: Math.abs((controls.left + controls.right - main.left - main.right) / 2) < 2, mainWithinViewport: main.left >= 0 && main.right <= window.innerWidth }; })()");
    assert.ok(controlBounds.width <= 1100 && controlBounds.centered && controlBounds.mainWithinViewport, JSON.stringify(controlBounds));
    await waitForExpression(socket, "document.querySelector('.permission-trigger')?.textContent.includes('Ask when needed')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.permission-trigger').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.permission-popover') !== null");
    assert.equal(await value(socket, "document.querySelector('.permission-popover > header') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.permission-grants > button')?.getAttribute('aria-expanded') === 'true'"), false);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.permission-modes label:last-child [role=radio]').click()", returnByValue: true });
    await waitForLocal(() => mock.permissionMode === "yolo");
    await waitForExpression(socket, "document.querySelector('.permission-popover') === null && document.querySelector('.permission-trigger')?.textContent.includes('Auto-approve')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.permission-trigger').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.permission-popover') !== null");
    await cdp(socket, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitForExpression(socket, "document.querySelector('.permission-popover') === null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.permission-trigger').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.permission-popover') !== null");
    const outsidePermission = await value(socket, "(() => { const rect = document.querySelector('.statusbar').getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()");
    await cdp(socket, "Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...outsidePermission });
    await cdp(socket, "Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...outsidePermission });
    await waitForExpression(socket, "document.querySelector('.permission-popover') === null");
    assert.equal(typeof mock.lastInteraction.inputId, "string", "the wire command carries a stable input identity");
    assert.deepEqual(
      {
        kind: mock.lastInteraction.kind,
        runId: mock.lastInteraction.runId,
        requestId: mock.lastInteraction.requestId,
        response: mock.lastInteraction.response,
      },
      {
        kind: "respond",
        runId: "run-1",
        requestId: "request-1",
        response: { kind: "answer_ask_user", answers: [{ questionId: "source", optionIds: ["approved"] }] },
      },
    );

    mock.resetToWaiting();
    await cdp(socket, "Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    assert.equal(await value(socket, "document.documentElement.scrollWidth <= window.innerWidth"), true);
    assert.equal(await value(socket, "document.querySelector('.timeline').getBoundingClientRect().right <= window.innerWidth"), true);
    await navigate(socket, `${webUrl}/?session=mobile#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.goal-card').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Which source should I use?')");
    assert.equal(await value(socket, "getComputedStyle(document.querySelector('.session')).position"), "relative");
    assert.equal(await value(socket, "document.documentElement.scrollWidth <= window.innerWidth"), true);
    assert.equal(await value(socket, "document.querySelector('.session .timeline > *').getBoundingClientRect().width <= document.querySelector('.session .timeline').clientWidth + 1"), true);

    // 详情读取失败只限制当前请求：明确报告可重试，不把会话拖入 Failed。
    mock.failNextInteractionDetails("interaction_details_unavailable");
    await navigate(socket, `${webUrl}/?session=details-unavailable#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.interaction-region')?.innerText.includes('The request could not be loaded')");
    assert.equal(await value(socket, "document.querySelector('.task-state')?.textContent"), "Awaiting your response");
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]') === null"), true,
      "a details read error does not create a follow-up composer");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.interaction-region button')].find(button => button.textContent.includes('Retry loading')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.question-nav-item') !== null");

    // 旧引用（409）同样只报告限制，可重试后恢复问卷。
    mock.failNextInteractionDetails("interaction_not_waiting");
    await navigate(socket, `${webUrl}/?session=details-stale#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.interaction-region')?.innerText.includes('latest saved state')");
    assert.equal(await value(socket, "document.querySelector('.task-state')?.textContent"), "Awaiting your response");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.interaction-region button')].find(button => button.textContent.includes('Retry loading')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.question-nav-item') !== null");

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
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]') === null"), true);
    assert.equal(await value(socket, "[...document.querySelectorAll('.approval button')].some(button => button.textContent.includes('Retry action'))"), true);
    assert.equal(await value(socket, "document.querySelector('.interaction-warning')?.innerText.includes('may already have run')"), true);
    assert.equal(await value(socket, "document.querySelector('.approval-scopes') === null"), true, "an unknown outcome never offers ongoing permission");

    mock.resetToAction();
    await navigate(socket, `${webUrl}/?session=approval#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.approval')?.innerText.includes('Your approval is needed')");
    assert.equal(await value(socket, "(() => { const panel = document.querySelector('.action-approval').getBoundingClientRect(); return panel.left >= 0 && panel.right <= window.innerWidth && Math.abs((panel.left + panel.right) / 2 - window.innerWidth / 2) < 2; })()"), true);
    assert.equal(await value(socket, "document.documentElement.scrollWidth <= window.innerWidth"), true);
    assert.equal(await value(socket, "getComputedStyle(document.querySelector('.approval-scopes')).gridTemplateColumns.split(' ').length"), 1);
    assert.equal(await value(socket, "(() => { const panel = document.querySelector('.action-approval').getBoundingClientRect(); const button = document.querySelector('.action-approval .approval-primary').getBoundingClientRect(); return button.top >= panel.top && button.bottom <= panel.bottom; })()"), true);
    assert.equal(await value(socket, "document.querySelector('.action-rejection > button').getAttribute('aria-expanded') === 'true'"), false);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.action-rejection > button').click()", returnByValue: true });
    assert.equal(await value(socket, "document.querySelector('#action-reason').getBoundingClientRect().height > 0"), true);
    assert.equal(await value(socket, "document.querySelector('.action-rejection [data-state=open] button').disabled"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.action-rejection > button').click()", returnByValue: true });
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    assert.equal(await value(socket, "(() => { const panel = document.querySelector('.action-approval').getBoundingClientRect(); const timeline = document.querySelector('.session .timeline > *').getBoundingClientRect(); return panel.width === timeline.width && Math.abs((panel.left + panel.right - timeline.left - timeline.right) / 2) < 2; })()"), true);
    assert.equal(await value(socket, "getComputedStyle(document.querySelector('.approval-scopes')).gridTemplateColumns.split(' ').length"), 3);
    assert.equal(await value(socket, "document.querySelector('.action-summary').textContent"), "write_file");
    // 完整 canonical 输入在决定前可审阅；持续授权因此可用，但默认仍是单次。
    await waitForExpression(socket, "document.querySelector('.action-input-full')?.innerText.includes('Complete private body')");
    assert.equal(await value(socket, "document.querySelector('.path-permission-note')?.innerText.includes('src/file.ts')"), true);
    assert.equal(await value(socket, "[...document.querySelectorAll('.approval-scopes label')].find(label => label.innerText.includes('This Goal')).querySelector('[role=radio], [role=checkbox]').disabled"), false);
    assert.equal(await value(socket, "document.querySelector('.approval-scopes [role=radio]').getAttribute('aria-checked') === 'true'"), true);
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('.approval-scopes label')].find(label => label.innerText.includes('This Goal')).querySelector('[role=radio], [role=checkbox]').click()",
      returnByValue: true,
    });
    assert.equal(await value(socket, "document.querySelector('.approval-primary').innerText"), "Approve for this Goal");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.approval-scopes label')].find(label => label.innerText.includes('Once')).querySelector('[role=radio], [role=checkbox]').click()", returnByValue: true });
    assert.equal(await value(socket, "document.querySelector('.approval-primary').innerText"), "Approve once");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.approval-scopes label')].find(label => label.innerText.includes('This Goal')).querySelector('[role=radio], [role=checkbox]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.approval-primary')?.textContent.includes('Approve for this Goal')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.approval-primary').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('I collected the approved notes.')");
    assert.equal(await value(socket, "document.querySelector('.message.assistant:not(.transient-message) h1')?.textContent"), "I collected the approved notes.");
    assert.equal(await value(socket, "document.querySelector('.message.assistant .markdown-table-scroll th')?.textContent"), "Field");
    assert.equal(await value(socket, "document.querySelector('.message.assistant .markdown-table-scroll td')?.textContent"), "Source");
    for (const width of [390, 320]) {
      await cdp(socket, "Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.equal(await value(socket, "document.querySelector('.markdown-table-scroll').getBoundingClientRect().right <= window.innerWidth"), true);
    }
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    assert.equal(await value(socket, "document.querySelector('.message.assistant li strong')?.textContent"), "Verified");
    assert.equal(await value(socket, "document.querySelector('.message.assistant pre code')?.textContent.trim()"), "run-1");
    assert.equal(await value(socket, "document.querySelector('.message.assistant script, .message.assistant .message-body img') === null"), true);
    await waitForExpression(socket, "document.querySelector('.message.assistant .message-avatar img')?.naturalWidth > 0");
    assert.match(await value(socket, "document.querySelector('.message.assistant .message-avatar img').currentSrc"), /mark-on-light/);
    assert.equal(mock.lastInteraction.response.scope, "goal");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.session-tab-buttons button')].find(button => button.getAttribute('aria-label') === 'Trajectory').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.mi-input-status')?.textContent.includes('1 / 1 saved model inputs')");
    await cdp(socket, "Runtime.evaluate", { expression: "(() => { document.querySelector('#trajectory-event-1').click(); const plot = document.querySelector('.tr-timeline .tr-plot'); const bounds = plot.getBoundingClientRect(); plot.dispatchEvent(new WheelEvent('wheel', { deltaY: -160, clientX: bounds.left + bounds.width * .6, clientY: bounds.top + 20, bubbles: true, cancelable: true })); return true; })()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-zoom-level')?.textContent !== '1×'");
    const retainedZoom = await value(socket, "document.querySelector('.tr-zoom-level').textContent");
    assert.notEqual(retainedZoom, "1×");
    assert.equal(await value(socket, "document.querySelector('.tr-zoom-level').textContent"), retainedZoom);
    assert.equal(await value(socket, "document.querySelector('#trajectory-event-1').getAttribute('aria-pressed')"), "true");
    assert.equal(mock.trajectoryReads(), 1, "loading model inputs does not reload committed events");
    await waitForExpression(socket, "[...document.querySelectorAll('.ct-record')].some(row => row.textContent.includes('Initial system prompt'))");
    assert.equal(await value(socket, "document.querySelector('.mi-input-status [role=alert]') === null"), true);
    assert.equal(await value(socket, "[...document.querySelectorAll('.ct-record')].some(row => row.classList.contains('prepared') && row.querySelector('.ct-detail')?.textContent === 'Initial system prompt')"), true);
    assert.equal(await value(socket, "(() => { const row = [...document.querySelectorAll('.ct-record')].find(item => item.textContent.includes('Initial system prompt')); const body = row.querySelector('.ct-record-body'); const preview = row.querySelector('.ct-preview'); const bounds = row.getBoundingClientRect(); return getComputedStyle(row).display === 'flex' && getComputedStyle(body).display === 'flex' && preview.getBoundingClientRect().right <= bounds.right && preview.getBoundingClientRect().height <= bounds.height; })()"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.ct-record')].find(row => row.textContent.includes('Initial system prompt')).querySelector('.ct-record-body').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.mi-inspector') !== null");
    await waitForExpression(socket, "document.querySelectorAll('.mi-message').length === 3");
    assert.equal(await value(socket, "document.querySelector('.mi-inspector h3')?.textContent"), "Model request");
    assert.equal(await value(socket, "document.querySelector('.mi-inspector [role=alert]') === null"), true);
    assert.equal(await value(socket, "document.querySelectorAll('.tr-inspector').length"), 1);
    assert.equal(await value(socket, "document.querySelector('.tr-ledger-layout > .mi-inspector') !== null"), true);
    assert.equal(await value(socket, "document.querySelector('.mi-inspector').getBoundingClientRect().top >= document.querySelector('.tr-timeline').getBoundingClientRect().bottom"), true);
    const detailReads = mock.inputDetailReads();
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.mi-message')].find(row => row.textContent.includes('Run mode')).querySelector('button').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.mi-message[data-message-index=\"1\"] > button')?.getAttribute('aria-expanded') === 'false'");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.mi-message')].find(row => row.textContent.includes('Authorized tools')).querySelector('button').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.mi-message[data-message-index=\"2\"] > button')?.getAttribute('aria-expanded') === 'false'");
    assert.equal(mock.inputDetailReads(), detailReads, "message disclosure reuses the loaded model request");
    assert.equal(await value(socket, "document.querySelector('.mi-message[data-message-index=\"0\"] > button')?.getAttribute('aria-expanded')"), "true");
    if (await value(socket, "document.querySelector('.tr-zoom-level')?.textContent !== '1×'")) {
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Reset timeline zoom\"]').click()", returnByValue: true });
    }
    await waitForExpression(socket, "document.querySelector('.tr-zoom-level')?.textContent === '1×'");
    const timelinePoint = await value(socket, "(() => { const button = document.querySelector('button[aria-label=\"Locate trajectory event 2\"]'); const r = button.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; return { x, y, reachable: document.elementFromPoint(x, y) === button }; })()");
    assert.equal(timelinePoint.reachable, true, "the model inspector leaves timeline event markers reachable");
    await cdp(socket, "Input.dispatchMouseEvent", { type: "mousePressed", x: timelinePoint.x, y: timelinePoint.y, button: "left", clickCount: 1 });
    await cdp(socket, "Input.dispatchMouseEvent", { type: "mouseReleased", x: timelinePoint.x, y: timelinePoint.y, button: "left", clickCount: 1 });
    await waitForExpression(socket, "document.querySelector('.tr-inspector header')?.textContent.includes('Event #2')");
    assert.equal(await value(socket, "document.querySelector('.mi-inspector') === null && document.querySelectorAll('.tr-inspector').length === 1"), true);
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    // 视口切换后移动布局（收起侧栏）异步生效；等单列布局稳定再核验轨迹面板几何。
    await waitForExpression(socket, "document.querySelector('.session').getBoundingClientRect().width >= window.innerWidth - 32");
    await waitForExpression(socket, "document.querySelector('.tr-inspector')?.getAttribute('role') === 'dialog'");
    assert.equal(await value(socket, "document.querySelector('.tr-inspector')?.getAttribute('aria-modal')"), "true");
    assert.equal(await value(socket, "document.querySelector('.tr-scrim')?.tagName"), "DIV");
    assert.equal(await value(socket, "document.querySelectorAll('button.tr-scrim').length"), 0);
    await waitForExpression(socket, "document.querySelector('.tr-inspector')?.contains(document.activeElement) === true");
    const mobileGeometry = await value(socket, "(() => { const inspector = document.querySelector('.tr-inspector'); const layout = document.querySelector('.tr-ledger-layout'); const timeline = document.querySelector('.tr-timeline'); const body = document.querySelector('.tr-detail-body'); const i = inspector.getBoundingClientRect(); const l = layout.getBoundingClientRect(); const t = timeline.getBoundingClientRect(); const b = body.getBoundingClientRect(); return { position: getComputedStyle(inspector).position, top: Math.round(i.top), timelineBottom: Math.round(t.bottom), width: Math.round(i.width), layoutWidth: Math.round(l.width), bodyHeight: Math.round(b.height), scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }; })()");
    assert.equal(mobileGeometry.position, "absolute", JSON.stringify(mobileGeometry));
    assert.ok(mobileGeometry.top >= mobileGeometry.timelineBottom - 1, JSON.stringify(mobileGeometry));
    assert.ok(Math.abs(mobileGeometry.width - mobileGeometry.layoutWidth) < 2, JSON.stringify(mobileGeometry));
    assert.ok(mobileGeometry.bodyHeight >= 100, JSON.stringify(mobileGeometry));
    assert.ok(mobileGeometry.scrollWidth <= mobileGeometry.innerWidth, JSON.stringify(mobileGeometry));
    assert.equal(await value(socket, "(() => { document.querySelector('button[aria-label=\"Close trajectory details\"]').click(); return true; })()"), true);
    assert.equal(await value(socket, "document.querySelector('.tr-inspector') === null"), true);
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    // === Trajectory Board 修复验证 ===
    // 1. 记录列表不使用无效的 listbox/option 语义；只有 tab 按钮使用 aria-selected。
    assert.equal(await value(socket, "document.querySelector('.ct-record-list')?.getAttribute('role')"), null);
    assert.equal(await value(socket, "document.querySelectorAll('[role=option]').length"), 0);
    assert.equal(await value(socket, "document.querySelectorAll('button[aria-selected]:not([role=tab])').length"), 0);

    // 2. 时间轴滚轮缩放与 Sequence 紧凑标记：
    // (a) 垂直滚轮在时间轴上生效并拦截默认页面滚动
    const wheelDefaultPrevented = await value(socket, "(() => { const plot = document.querySelector('.tr-timeline .tr-plot'); const ev = new WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true }); plot.dispatchEvent(ev); return ev.defaultPrevented; })()");
    assert.equal(wheelDefaultPrevented, true, "vertical wheel on timeline is intercepted for zooming");

    // (b) 滚轮向上滚动触发放大（> 1x）
    await waitForExpression(socket, "(() => { const zoom = document.querySelector('.tr-zoom-level')?.textContent; return zoom !== '1×' && zoom !== '1.0×'; })()");
    const zoomedInLevel = await value(socket, "document.querySelector('.tr-zoom-level')?.textContent");
    assert.match(zoomedInLevel, /^[1-9]\d*(\.\d+)?×$/, "zoom level increases after scrolling up");

    // (c) Fit 恢复 1×
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Reset timeline zoom\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-zoom-level')?.textContent === '1×'");

    // (d) Compact 只收窄事件标记，不缩小轨道宽度，也不产生右侧空白
    await waitForExpression(socket, "Math.abs(document.querySelector('.tr-timeline-track').getBoundingClientRect().width - document.querySelector('.tr-timeline .tr-plot').clientWidth) < 2");
    const compactBefore = await value(socket, "(() => { const plot = document.querySelector('.tr-timeline .tr-plot'); const span = document.querySelector('.tr-timeline .tr-span'); return { plot: plot.clientWidth, track: document.querySelector('.tr-timeline-track').getBoundingClientRect().width, span: span.getBoundingClientRect().width }; })()");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.tr-compact-toggle').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-compact-toggle').getAttribute('aria-pressed') === 'true' && Math.abs(document.querySelector('.tr-timeline-track').getBoundingClientRect().width - document.querySelector('.tr-timeline .tr-plot').clientWidth) < 2");
    const compactAfter = await value(socket, "(() => { const plot = document.querySelector('.tr-timeline .tr-plot'); const span = document.querySelector('.tr-timeline .tr-span'); return { plot: plot.clientWidth, track: document.querySelector('.tr-timeline-track').getBoundingClientRect().width, span: span.getBoundingClientRect().width }; })()");
    assert.equal(Math.round(compactAfter.track), Math.round(compactBefore.track), "compact keeps the full track width");
    assert.equal(Math.round(compactAfter.span), 8, "compact uses narrow event marks");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.tr-compact-toggle').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-compact-toggle').getAttribute('aria-pressed') === 'false'");

    // (e) 滚轮放大封顶 4×
    for (let i = 0; i < 8; i += 1) {
      await cdp(socket, "Runtime.evaluate", { expression: "(() => { const plot = document.querySelector('.tr-timeline .tr-plot'); const bounds = plot.getBoundingClientRect(); plot.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, clientX: bounds.left + bounds.width * .5, clientY: bounds.top + 20, bubbles: true, cancelable: true })); return true; })()", returnByValue: true });
    }
    await waitForExpression(socket, "document.querySelector('.tr-zoom-level')?.textContent === '4×'");
    assert.equal(await value(socket, "document.querySelector('.tr-zoom-level')?.textContent"), "4×");

    // (f) Fit 回到 1×
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Reset timeline zoom\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-zoom-level')?.textContent === '1×'");

    // 3. 类别筛选弱化与无害定位：未命中刻度透明度弱化 (0.25)，点击刻度不重置过滤，并显示未命中徽章
    await cdp(socket, "Runtime.evaluate", { expression: "(() => { const select = document.querySelector('#trajectory-category-select'); select.value = 'decision'; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('button[aria-label=\"Locate trajectory event 1\"].dimmed') !== null");
    const dimmedOpacity = await value(socket, "getComputedStyle(document.querySelector('button[aria-label=\"Locate trajectory event 1\"].dimmed')).opacity");
    const dimDiagnostics = await value(socket, "(() => { const el = document.querySelector('button[aria-label=\"Locate trajectory event 1\"]'); const matched = []; for (const sheet of document.styleSheets) { try { for (const rule of sheet.cssRules) { if (rule.selectorText && rule.style && rule.style.opacity && el.matches(rule.selectorText)) matched.push(rule.selectorText + ':' + rule.style.opacity); } } catch {} } return { className: el.className, opacity: getComputedStyle(el).opacity, matched }; })()");
    assert.equal(dimmedOpacity, "0.25", JSON.stringify(dimDiagnostics));
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Locate trajectory event 2\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-inspector header')?.textContent.includes('Event #2')");
    assert.equal(await value(socket, "document.querySelector('#trajectory-category-select').value"), "decision");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Locate trajectory event 1\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-outside-badge')?.textContent === 'Event outside active filter'");

    // 4. Tab 偏好记忆与纯净视图：切至 Raw 时不渲染 execution relationship 卡片；导航至相邻事件或点击刻度保持 Raw 偏好；列表直接点击重置为 Summary
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.tr-detail-tabs button')].find(b => b.textContent === 'Raw').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-detail-tabs button.active')?.textContent === 'Raw'");
    assert.equal(await value(socket, "(() => { const list = document.querySelector('.tr-detail-tabs'); return list.scrollHeight <= list.clientHeight + 1; })()"), true, "shadcn tab triggers must not overflow the tab list");
    assert.equal(await value(socket, "(() => { const wrapper = document.querySelector('#trajectory-category-select')?.closest('[data-slot=\"native-select-wrapper\"]'); return wrapper ? getComputedStyle(wrapper).order : null; })()"), "1", "the native select wrapper owns toolbar layout");
    assert.equal(await value(socket, "(() => { const tab = document.querySelector('.tr-detail-tabs [role=tab][data-state=active]'); const panel = tab && document.getElementById(tab.getAttribute('aria-controls')); return !!panel && panel.getAttribute('role') === 'tabpanel' && panel.getAttribute('aria-labelledby') === tab.id; })()"), true, "the active tab must own a matching tabpanel");
    assert.equal(await value(socket, "document.querySelector('.relationship') === null"), true);
    // 导航保持 Raw 偏好
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Next trajectory event\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-inspector header')?.textContent.includes('Event #2')");
    assert.equal(await value(socket, "document.querySelector('.tr-detail-tabs button.active')?.textContent"), "Raw");
    // 刻度点击保持 Raw 偏好
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Locate trajectory event 1\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-inspector header')?.textContent.includes('Event #1')");
    assert.equal(await value(socket, "document.querySelector('.tr-detail-tabs button.active')?.textContent"), "Raw");
    const unfilteredRead = mock.trajectoryReads() + 1;
    await cdp(socket, "Runtime.evaluate", { expression: "(() => { const select = document.querySelector('#trajectory-category-select'); select.value = 'All events'; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()", returnByValue: true });
    await waitForLocal(() => mock.trajectoryReads() >= unfilteredRead);
    await waitForExpression(socket, "document.querySelector('.mi-input-status')?.textContent.includes('1–1 / 1 saved model inputs') && document.querySelectorAll('.ct-step-header').length === 3 && document.querySelector('#trajectory-event-1') !== null && !document.querySelector('.tr-coverage')?.textContent.includes('Loading')");
    // 列表行直接点击重置为 Summary，且焦点稳定停留在当前选中行
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('#trajectory-event-1').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-detail-tabs button.active')?.textContent === 'Summary'");
    assert.equal(await value(socket, "document.querySelector('.tr-detail-tabs button.active')?.textContent"), "Summary");
    assert.equal(await value(socket, "document.activeElement?.id"), "trajectory-event-1");

    // 5. 步骤折叠稳定性与准确引导文案：折叠包含选中项的步骤时不反向弹开；全收起时检查器显示指引；展开后恢复详情
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelectorAll('.ct-step-header')[0].click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelectorAll('.ct-step-header')[0]?.getAttribute('aria-expanded') === 'false'");
    assert.equal(await value(socket, "document.querySelectorAll('.ct-step-header')[0]?.getAttribute('aria-expanded')"), "false");
    await waitForExpression(socket, "document.querySelector('.tr-inspector header')?.textContent.includes('Event #1')");
    assert.equal(await value(socket, "document.querySelector('.tr-inspector header')?.textContent.includes('Event #1')"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelectorAll('.ct-step-header[aria-expanded=\"true\"]').forEach(button => button.click())", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-empty-guidance')?.textContent.includes('All steps are collapsed. Expand a step to see its events.')");
    assert.equal(await value(socket, "document.querySelector('.tr-empty-guidance p')?.textContent"), "All steps are collapsed. Expand a step to see its events.");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelectorAll('.ct-step-header[aria-expanded=\"false\"]').forEach(button => button.click())", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-inspector header')?.textContent.includes('Event #1')");
    assert.equal(await value(socket, "document.querySelector('.tr-inspector header')?.textContent.includes('Event #1')"), true);

    // 6. 复制失败防护：捕获权限拒绝并显示 Copy failed，不抛出未捕获异常
    await cdp(socket, "Runtime.evaluate", { expression: "navigator.clipboard.writeText = () => Promise.reject(new Error('Permission denied')); document.querySelector('.tr-inspector footer button').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-inspector footer button')?.textContent.includes('Copy failed')");
    assert.equal(await value(socket, "document.querySelector('.tr-inspector footer button').textContent.includes('Copy failed')"), true);

    // 7. Escape 关闭检查器并把焦点还给触发行
    await cdp(socket, "Runtime.evaluate", { expression: "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-inspector') === null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.getElementById('trajectory-event-1').focus(); document.getElementById('trajectory-event-1').click();", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-inspector header')?.textContent.includes('Event #1')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-inspector') === null");
    assert.equal(await value(socket, "document.activeElement?.id"), "trajectory-event-1", "closing the inspector restores focus to the triggering row");

    // 8. 原型交互验证：加载独立的 trajectory-explorer.html 验证折叠文案、弱化刻度、Tab 回退与 A11y
    await navigate(socket, "file://" + join(root, "prototypes/trajectory-explorer.html"));
    await waitForExpression(socket, "document.querySelector('.brand')?.textContent.includes('LazyGoal')");
    assert.equal(await value(socket, "document.querySelector('#records')?.getAttribute('role')"), "listbox");
    assert.equal(await value(socket, "document.querySelectorAll('button.row[aria-selected]').length"), 0);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelectorAll('.step').forEach(btn => btn.click())", returnByValue: true });
    assert.equal(await value(socket, "document.querySelector('#event-title')?.textContent"), "所有步骤已收起，请展开步骤以查看事件");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.step:first-child').click()", returnByValue: true });
    await cdp(socket, "Runtime.evaluate", { expression: "navigator.clipboard.writeText = () => Promise.reject(new Error('Permission denied')); document.querySelector('#copy').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('#copy')?.textContent === 'Copy failed'");
    assert.equal(await value(socket, "document.querySelector('#copy').textContent"), "Copy failed");



    mock.resetToAction();
    await navigate(socket, `${webUrl}/?session=reject#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.action-rejection > button') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.action-rejection > button').click()", returnByValue: true });
    await setText(socket, "#action-reason", "Keep the file unchanged.");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.action-rejection [data-state=open] button').click()", returnByValue: true });
    await waitForLocal(() => mock.lastInteraction?.response?.kind === "reject_action");
    assert.equal(mock.lastInteraction.kind, "respond");
    assert.equal(mock.lastInteraction.runId, "run-1");
    assert.deepEqual(mock.lastInteraction.response, { kind: "reject_action", actionId: "action-1", reason: "Keep the file unchanged." });
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
    await waitForExpression(socket, "document.querySelector('.timeline-terminal.failed') !== null");
    assert.match(await value(socket, "document.querySelector('.timeline-terminal.failed').innerText"), /Run failed/);
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]') === null"), true,
      "a failed Goal cannot receive an ordinary follow-up message");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"New goal\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.draft-timeline') !== null");
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]') !== null");
    await setText(socket, "textarea[aria-label=\"Goal intent\"]", "/unknown");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Start Goal\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.command-error')?.innerText.includes('Unknown slash command')");
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]').value"), "/unknown");
    assert.equal(mock.lastMessage, undefined);
    await setText(socket, "textarea[aria-label=\"Goal intent\"]", "/plan extra");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Start Goal\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.command-error')?.innerText.includes('does not accept')");
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]').value"), "/plan extra");
    assert.equal(mock.planModeRequests, 0);
    await setText(socket, "textarea[aria-label=\"Goal intent\"]", "/p");
    await waitForExpression(socket, "document.querySelector('.command-candidate')?.textContent.includes('/plan')");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('textarea[aria-label=\"Goal intent\"]').focus()",
      returnByValue: true,
    });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    assert.equal(await value(socket, "document.querySelector('.command-candidates') === null"), true);
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]').value"), "/p");
    await setText(socket, "textarea[aria-label=\"Goal intent\"]", "/pl");
    await waitForExpression(socket, "document.querySelectorAll('.command-candidate').length === 1 && !document.querySelector('.command-candidate').disabled");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.command-candidate').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.session-intro')?.textContent === 'Plan Mode'");
    assert.equal(mock.planModeRequests, 0, "Plan Mode is part of the new Goal request");
    assert.equal(mock.lastMessage, undefined, "command selection does not submit a follow-up message");
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]')?.disabled === false");
    await setText(socket, "textarea[aria-label=\"Goal intent\"]", "/p");
    await waitForExpression(socket, "document.querySelectorAll('.command-candidate').length === 1 && !document.querySelector('.command-candidate').disabled");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('textarea[aria-label=\"Goal intent\"]').focus()",
      returnByValue: true,
    });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await waitForExpression(socket, "document.querySelector('.session-intro')?.textContent === 'Plan Mode'");
    assert.equal(mock.planModeRequests, 0, "keyboard selection also stays within the new Goal draft");
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]')?.disabled === false");
    await setText(socket, "textarea[aria-label=\"Goal intent\"]", "/mod");
    await waitForExpression(socket, "document.querySelector('.command-candidate')?.textContent.includes('/model')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.command-candidate').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    const priorRunModelSelection = mock.lastModelSelection;
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.model-option')].find(button => button.textContent.includes('Selected Model')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-picker') === null");
    assert.equal(mock.preferredModelId, "model-selected", "draft model selection updates the next Goal preference");
    assert.deepEqual(mock.lastModelSelection, priorRunModelSelection, "draft model selection does not target the completed Run");
    mock.delayNextDraftCatalog();
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').focus(); document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-picker') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close model picker\"]').click()", returnByValue: true });
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').focus(); document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    await delay(250);
    assert.equal(await value(socket, "document.querySelector('.model-picker')?.innerText.includes('Stale Model')"), false);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close model picker\"]').click()", returnByValue: true });
    await setText(socket, "textarea[aria-label=\"Goal intent\"]", "Try again with the saved history");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('button[aria-label=\"Start Goal\"]').click()",
      returnByValue: true,
    });
    await waitForLocal(() => mock.lastCreate?.intent === "Try again with the saved history");
    assert.equal(mock.lastCreate.mode, "plan", "the selected Plan Mode is carried by the new Goal");
    assert.equal(mock.lastMessage, undefined, "starting a Goal does not queue a follow-up message");
    mock.resetToFailed();
    await navigate(socket, `${webUrl}/?session=escaped#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.timeline-terminal.failed') !== null");
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]') === null"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"New goal\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.draft-timeline') !== null");
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]') !== null");
    await setText(socket, "textarea[aria-label=\"Goal intent\"]", "//plan");
    assert.equal(await value(socket, "document.querySelector('.command-candidates') === null"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Start Goal\"]').click()", returnByValue: true });
    await waitForLocal(() => mock.lastCreate?.intent === "/plan");
    assert.equal(mock.planModeRequests, 0, "escaped text starts a normal Goal");
    assert.equal(mock.lastMessage, undefined, "escaped text does not create a follow-up message");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"New goal\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.draft-timeline') !== null");
    await setText(socket, "textarea[aria-label=\"Goal intent\"]", "/model");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Start Goal\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.model-option')].find(button => button.textContent.includes('Selected Model')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-picker') === null");
    assert.equal(mock.preferredModelId, "model-selected", "draft selection is saved before creating a Goal");
    mock.delayNextDraftCatalog();
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close session\"]').click(); document.querySelector('button[aria-label=\"New goal\"]').click()", returnByValue: true });
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.model-option')].find(button => button.textContent.includes('Selected Model')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-picker') === null");
    await delay(220);
    await waitForExpression(socket, "document.querySelector('.composer-area .current-model-control')?.textContent.includes('Selected Model')");
    await setText(socket, "textarea[aria-label=\"Goal intent\"]", "Inspect the current workspace");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Start Goal\"]').click()", returnByValue: true });
    await waitForLocal(() => mock.lastCreate?.intent === "Inspect the current workspace" && mock.lastCreate.modelId === "model-selected");
    assert.equal(mock.lastCreate.intent, "Inspect the current workspace");
    mock.resetToFailed();
    await navigate(socket, `${webUrl}/?session=management#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card-options') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card-options').focus()", returnByValue: true });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await waitForExpression(socket, "document.querySelector('[role=menu]') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('[role=menuitem]')].find(button => button.textContent.includes('Archive')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.view-segmented button:last-child')?.textContent.includes('Archived (1)')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.view-segmented button:last-child').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card-options').focus()", returnByValue: true });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await waitForExpression(socket, "document.querySelector('[role=menu]') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('[role=menuitem]')].find(button => button.textContent.includes('Delete')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('[role=alertdialog]') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('[role=alertdialog] button')].find(button => button.textContent.includes('Confirm')).click()", returnByValue: true });
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

test("a blocked new Goal keeps its draft while the user inspects running Goals", { timeout: 60_000 }, async () => {
  const conflictUrl = "http://127.0.0.1:4176";
  const mock = createMockApi();
  mock.rejectNextCreateWithRunningGoal();
  const apiAddress = await listen(mock.server);
  const apiPort = Number(new URL(apiAddress).port);
  const webServer = spawn(process.execPath,
    [join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "4176", "--strictPort"],
    { cwd: root, env: { ...process.env, LAZYGOAL_E2E_API_PORT: String(apiPort) }, stdio: "ignore" });
  const profile = await mkdtemp(join(tmpdir(), "lazygoal-busy-draft-"));
  let chrome;
  let socket;
  try {
    await waitForHttp(`${conflictUrl}/`);
    chrome = spawn(findChrome(), ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
      "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
    const devtools = await waitForDevtools(profile, chrome);
    const targets = await (await fetch(`http://127.0.0.1:${devtools.port}/json/list`)).json();
    socket = await connectCdp(targets.find(item => item.type === "page").webSocketDebuggerUrl);
    await cdp(socket, "Page.enable");
    await cdp(socket, "Runtime.enable");
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await navigate(socket, `${conflictUrl}/?session=busy#${token}`);
    await waitForExpression(socket, "document.querySelector('button[aria-label=\"New goal\"]') !== null");
    await value(socket, "document.querySelector('button[aria-label=\"New goal\"]').click()");
    await waitForExpression(socket, "document.querySelector('.composer-area .current-model-control')?.textContent.includes('Default Model')");
    await setText(socket, "textarea[aria-label=\"Goal intent\"]", "Inspect the current workspace");
    await value(socket, "document.querySelector('button[aria-label=\"Start Goal\"]').click()");
    await waitForExpression(socket, "document.querySelector('.command-error')?.innerText.includes('Another Goal is active')");
    const blockedInputId = mock.lastCreate.inputId;
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 320, height: 900, deviceScaleFactor: 1, mobile: true });
    assert.ok(await value(socket, "document.documentElement.scrollWidth - innerWidth") <= 1, "creation conflict fits a narrow viewport");
    await value(socket, "[...document.querySelectorAll('.command-error button')].find(button => button.textContent.includes('View running Goals')).click()");
    await waitForExpression(socket, "document.querySelector('.running-goals-popover')?.innerText.includes('Collect approved notes')");
    assert.match(await value(socket, "document.querySelector('.running-goals-popover').innerText"), /Your draft will be kept/);
    assert.equal(await value(socket, "(() => { const box = document.querySelector('.running-goals-popover').getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; })()"), true, "running Goals fit a narrow viewport");
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await value(socket, "[...document.querySelectorAll('.running-goals-popover button')].find(button => button.textContent.includes('Collect approved notes')).click()");
    await waitForExpression(socket, "document.querySelector('.session .timeline-run-summary') !== null");
    await value(socket, "document.querySelector('button[aria-label=\"New goal\"]').click()");
    await waitForExpression(socket, "document.querySelector('.draft-timeline') !== null");
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]').value"), "Inspect the current workspace");
    await waitForExpression(socket, "document.querySelector('.composer-area .send:not(:disabled)') !== null");
    await value(socket, "document.querySelector('button[aria-label=\"Start Goal\"]').click()");
    await waitForLocal(() => mock.lastCreate?.inputId !== blockedInputId);
    assert.equal(mock.lastCreate.intent, "Inspect the current workspace");
    await waitForExpression(socket, "document.querySelector('.draft-timeline') === null");
    await value(socket, "document.querySelector('button[aria-label=\"New goal\"]').click()");
    await waitForExpression(socket, "document.querySelector('.draft-timeline') !== null");
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]').value"), "", "successful creation clears the saved draft");
  } finally {
    socket?.close();
    if (chrome !== undefined && chrome.exitCode === null) {
      const closed = once(chrome, "close");
      chrome.kill("SIGTERM");
      await closed;
    }
    webServer.kill("SIGTERM");
    mock.server.close();
    mock.server.closeAllConnections();
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

test("activity width and structured interaction area remain usable and persist", { timeout: 60_000 }, async () => {
  const pageUrl = "http://127.0.0.1:4177";
  const newPortUrl = "http://127.0.0.1:4178";
  const mock = createMockApi();
  const apiAddress = await listen(mock.server);
  const webServer = spawn(process.execPath,
    [join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "4177", "--strictPort"],
    { cwd: root, env: { ...process.env, LAZYGOAL_E2E_API_PORT: String(new URL(apiAddress).port) }, stdio: "ignore" });
  const newPortServer = spawn(process.execPath,
    [join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "4178", "--strictPort"],
    { cwd: root, env: { ...process.env, LAZYGOAL_E2E_API_PORT: String(new URL(apiAddress).port) }, stdio: "ignore" });
  const profile = await mkdtemp(join(tmpdir(), "lazygoal-activity-width-"));
  let chrome;
  let socket;
  try {
    await waitForHttp(`${pageUrl}/`);
    await waitForHttp(`${newPortUrl}/`);
    chrome = spawn(findChrome(), ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
      "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
    const devtools = await waitForDevtools(profile, chrome);
    const targets = await (await fetch(`http://127.0.0.1:${devtools.port}/json/list`)).json();
    socket = await connectCdp(targets.find(item => item.type === "page").webSocketDebuggerUrl);
    await cdp(socket, "Page.enable");
    await cdp(socket, "Runtime.enable");
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await navigate(socket, `${pageUrl}/?session=width#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await value(socket, "document.querySelector('.goal-card').click()");
    await waitForExpression(socket, "document.querySelector('.session-timeline-feed') !== null && document.querySelector('.composer-area') !== null");
    const bounds = () => value(socket, `(() => {
      const feed = document.querySelector('.session-timeline-feed').getBoundingClientRect();
      const item = document.querySelector('.session-timeline-feed > *').getBoundingClientRect();
      return { feedWidth: feed.width, itemWidth: item.width,
        hasOrdinaryInput: document.querySelector('.composer-area textarea[aria-label="Goal intent"]') !== null,
        permissionVisible: document.querySelector('.composer-area .permission-trigger') !== null };
    })()`);
    const standard = await bounds();
    assert.ok(standard.feedWidth <= 840, JSON.stringify(standard));
    assert.ok(Math.abs(standard.itemWidth - standard.feedWidth) < 1);
    assert.equal(standard.hasOrdinaryInput, false, "the existing Goal does not show an ordinary message input");
    assert.equal(standard.permissionVisible, true, "permission controls remain available while the Goal waits");

    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 916, height: 900, deviceScaleFactor: 1, mobile: false });
    const mediumStandard = await bounds();
    assert.ok(Math.abs(mediumStandard.itemWidth - mediumStandard.feedWidth) < 1);
    await value(socket, "document.querySelector('.workspace-settings').click()");
    await waitForExpression(socket, "[...document.querySelectorAll('[role=tab]')].some(tab => tab.textContent === 'Appearance')");
    await value(socket, "[...document.querySelectorAll('[role=tab]')].find(tab => tab.textContent === 'Appearance').focus()");
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await waitForExpression(socket, "document.querySelectorAll('[role=radiogroup] [role=radio]').length === 2");
    await value(socket, "document.querySelectorAll('[role=radiogroup] [role=radio]')[1].click()");
    await waitForExpression(socket, "document.querySelector('.workspace-shell').dataset.activityWidth === 'wide'");
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitForExpression(socket, "document.querySelector('.session-timeline-feed')?.checkVisibility()");
    await waitForExpression(socket, "document.activeElement === document.querySelector('.workspace-settings')");
    await waitForExpression(socket, `document.querySelector('.session-timeline-feed')?.getBoundingClientRect().width > ${mediumStandard.feedWidth + 60}`);
    const mediumWide = await bounds();
    assert.ok(mediumWide.feedWidth > mediumStandard.feedWidth + 60, "wide remains visibly wider at a 916px viewport");
    assert.ok(Math.abs(mediumWide.itemWidth - mediumWide.feedWidth) < 1);
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const wide = await bounds();
    assert.ok(wide.feedWidth > standard.feedWidth + 100, "wide fills the available activity area");
    assert.ok(Math.abs(wide.itemWidth - wide.feedWidth) < 1);

    await navigate(socket, `${newPortUrl}/?session=width#${token}`);
    await waitForExpression(socket, "document.querySelector('.workspace-shell')?.dataset.activityWidth === 'wide'");
    await waitForExpression(socket, "document.querySelector('.session-timeline-feed') !== null && document.querySelector('.composer-area') !== null");
    await value(socket, "document.querySelector('.workspace-settings').click()");
    await waitForExpression(socket, "[...document.querySelectorAll('[role=tab]')].some(tab => tab.textContent === 'Appearance')");
    await value(socket, "[...document.querySelectorAll('[role=tab]')].find(tab => tab.textContent === 'Appearance').focus()");
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await waitForExpression(socket, "document.querySelectorAll('[role=radiogroup] [role=radio]').length === 2");
    assert.equal(await value(socket, "document.querySelectorAll('[role=radiogroup] [role=radio]')[1].getAttribute('aria-checked')"), "true");
    await value(socket, "document.querySelectorAll('[role=radiogroup] [role=radio]')[0].click()");
    await waitForExpression(socket, "document.querySelector('.workspace-shell').dataset.activityWidth === 'standard'");
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitForExpression(socket, "document.querySelector('.session-timeline-feed')?.checkVisibility()");
    await waitForExpression(socket, "document.activeElement === document.querySelector('.workspace-settings')");
    const restored = await bounds();
    assert.ok(Math.abs(restored.feedWidth - standard.feedWidth) < 1 && Math.abs(restored.itemWidth - standard.itemWidth) < 1);
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 320, height: 900, deviceScaleFactor: 1, mobile: true });
    await waitForExpression(socket, "document.querySelector('.composer-area').getBoundingClientRect().width <= 320");
    const narrow = await bounds();
    assert.ok(Math.abs(narrow.itemWidth - narrow.feedWidth) < 1);
    assert.ok(await value(socket, "document.documentElement.scrollWidth - innerWidth") <= 1);
    assert.equal(await value(socket, `(() => {
      const composer = document.querySelector('.composer-area').getBoundingClientRect();
      return [...document.querySelectorAll('.composer-area button')].every(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= composer.left - 1 && bounds.right <= composer.right + 1 && bounds.width > 0;
      });
    })()`), true, "the available controls fit a narrow viewport");

    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await waitForExpression(socket, "document.querySelector('.workspace-settings')?.checkVisibility()");
    await value(socket, "document.querySelector('button[aria-label=\"New goal\"]').click()");
    await waitForExpression(socket, "document.querySelector('.draft-timeline') !== null && document.querySelector('textarea[aria-label=\"Goal intent\"]') !== null");
    const draftComposer = await value(socket, `(() => {
      const area = document.querySelector('.composer-area').getBoundingClientRect();
      const form = document.querySelector('.composer-area form').getBoundingClientRect();
      const text = document.querySelector('textarea[aria-label=\"Goal intent\"]');
      return { formWidth: form.width,
        centered: Math.abs((area.left + area.right - form.left - form.right) / 2) < 1,
        textHeight: text.getBoundingClientRect().height };
    })()`);
    assert.ok(draftComposer.formWidth <= 840 && Math.abs(draftComposer.formWidth - standard.feedWidth) < 1);
    assert.equal(draftComposer.centered, true, "the New Goal composer is centered in its available area");
    await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]').focus()");
    assert.equal(await value(socket, "getComputedStyle(document.querySelector('textarea[aria-label=\"Goal intent\"]')).outlineStyle"), "none");
    assert.match(await value(socket, "getComputedStyle(document.querySelector('textarea[aria-label=\"Goal intent\"]')).boxShadow"), /^(none|(?:rgba\(0, 0, 0, 0\) 0px 0px 0px 0px)(?:, rgba\(0, 0, 0, 0\) 0px 0px 0px 0px)*)$/);
    await setText(socket, 'textarea[aria-label=\"Goal intent\"]', "First line\nSecond line\nThird line");
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]').getBoundingClientRect().height > 50");

    await value(socket, "document.querySelector('.workspace-settings').click()");
    await waitForExpression(socket, "[...document.querySelectorAll('[role=tab]')].some(tab => tab.textContent === 'Appearance')");
    await value(socket, "[...document.querySelectorAll('[role=tab]')].find(tab => tab.textContent === 'Appearance').focus()");
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await waitForExpression(socket, "document.querySelectorAll('[role=radiogroup] [role=radio]').length === 2");
    await value(socket, "Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: () => {} }); true");
    await value(socket, "document.querySelectorAll('[role=radiogroup] [role=radio]')[1].click()");
    await waitForExpression(socket, "document.querySelector('.settings-activity-width [role=alert]')?.textContent.includes('Could not save')");
    assert.equal(await value(socket, "document.querySelector('.workspace-shell').dataset.activityWidth"), "wide", "a blocked cookie still applies to the current page");
    await navigate(socket, `${newPortUrl}/?session=width#${token}`);
    await waitForExpression(socket, "document.querySelector('.workspace-shell')?.dataset.activityWidth === 'standard'");
  } finally {
    socket?.close();
    if (chrome !== undefined && chrome.exitCode === null) {
      const closed = once(chrome, "close");
      chrome.kill("SIGTERM");
      await closed;
    }
    webServer.kill("SIGTERM");
    newPortServer.kill("SIGTERM");
    mock.server.close();
    mock.server.closeAllConnections();
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

test("Goal events and metrics reconnect after the server ends each stream", { timeout: 180_000 }, async () => {
  const reconnectUrl = "http://127.0.0.1:4175";
  const mock = createMockApi();
  const apiAddress = await listen(mock.server);
  const apiPort = Number(new URL(apiAddress).port);
  const webServer = spawn(
    process.execPath,
    [join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "4175", "--strictPort"],
    {
      cwd: root,
      env: { ...process.env, LAZYGOAL_E2E_API_PORT: String(apiPort) },
      stdio: "ignore",
    },
  );
  const profile = await mkdtemp(join(tmpdir(), "lazygoal-browser-reconnect-"));
  let chrome;
  let socket;

  try {
    await waitForHttp(`${reconnectUrl}/`);
    chrome = spawn(findChrome(), [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
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
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    await navigate(socket, `${reconnectUrl}/?session=reconnect#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.transient-message h1')?.textContent === 'Checking saved notes…'");
    assert.equal(mock.goalEventConnections(), 1, "first Goal event subscription");
    assert.equal(mock.metricsConnections(), 1, "first metrics subscription");
    assert.equal(await value(socket, "document.querySelector('.stream-state')?.textContent"), "Connected");

    // 服务端主动结束两条流：客户端按既有 800ms 退避重连，并以新的 state_sync 与快照恢复。
    mock.prepareReconnectState();
    mock.endGoalEvents();
    mock.endMetricsStream();
    await waitForLocal(() => mock.goalEventConnections() === 2 && mock.metricsConnections() === 2, 15_000);
    await waitForExpression(socket, "document.querySelector('.task-state')?.textContent === 'Waiting'");
    await waitForExpression(socket, "document.querySelector('.transient-message') === null");
    assert.equal(await value(socket, "document.querySelector('.stream-state')?.textContent"), "Connected");
    assert.equal(mock.sawLastEventId(), false, "重连不发送 Last-Event-ID");

    await waitForExpression(socket, "document.querySelector('.session-metrics-details-trigger') !== null");
    await value(socket, "document.querySelector('.session-metrics-details-trigger').click()");
    await waitForExpression(socket, "document.querySelector('.metrics-popover')?.innerText.includes('40 tok/s')");
    await value(socket, "document.querySelector('.session-metrics-details-trigger').click()");
    await waitForExpression(socket, "document.querySelector('.metrics-popover') === null");

    // 关闭视图后取消两条连接，且不再建立新连接。
    const goalConnections = mock.goalEventConnections();
    const metricsConnections = mock.metricsConnections();
    await cdp(socket, "Page.navigate", { url: "about:blank" });
    await waitForLocal(() => !mock.goalEventsOpen() && !mock.metricsStreamOpen(), 15_000);
    await delay(1_200);
    assert.equal(mock.goalEventConnections(), goalConnections, "关闭视图后不再重连 Goal 事件");
    assert.equal(mock.metricsConnections(), metricsConnections, "关闭视图后不再重连 metrics");
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
  let metricsStreamResponse;
  let goalEventConnections = 0;
  let metricsConnections = 0;
  let sawLastEventId = false;
  let currentMetrics = {
    goalId: "goal-1", roundCount: 1, stepCount: 3, reportedCalls: 1, missingCalls: 1,
    inputTokens: 1200, outputTokens: 80, coverage: "partial", cacheMeasuredCalls: 0,
    cacheExcludedCalls: 2, cacheHitRate: null, throughputMeasuredCalls: 0,
    throughputExcludedCalls: 1, tokensPerSecond: null, contextRemainingPercent: null, runs: [],
  };
  let liveTransitionSent = false;
  let activityResponse;
  let lastInteraction;
  let lastMessage;
  let lastPlanMode;
  let lastModelSelection;
  let lastCreate;
  let rejectNextCreate = false;
  let selectedModelId = "model-default";
  let preferredModelId = "model-default";
  let grantRevoked = false;
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
  let inputSequence = 0;
  const inputReceipts = new Map();
  let nextInteractionDetailsFailure;
  const nativeCall = { goalId: "goal-1", runId: "run-1", callId: "call-native", stepIndex: 1, stage: "decide", occurredAt: "2026-08-05T09:00:01.000Z", messages: [
    { role: "tool", source: "native_history", callId: "tool-call", toolId: "read_file", content: "Native tool result" },
    { role: "user", source: "section", content: `[Dynamic section: run_mode; source: Goal.intent]\n${"Follow the current request.\n".repeat(80)}` },
    { role: "user", source: "section", content: "[Dynamic section: authorized_tools; source: Runtime.authorizedTools]\nTools available for this request." },
  ] };
  /** 统一会话输入收据：序号单调递增，测试只核验形状与状态。 */
  const sessionInputReceipt = (inputId, kind, status) => {
    inputSequence += 1;
    return {
      goalId: "goal-1",
      inputId,
      kind,
      sequence: inputSequence,
      status,
      admittedAtRevision: inputSequence,
      ...(status === "applied" ? { appliedRunId: "run-1", messageIndex: 0 } : {}),
    };
  };
  /** 订阅首项一致同步所需的公开会话状态。 */
  const sessionState = () => ({
    goalId: "goal-1",
    runId: session.currentRunId,
    runStatus: session.runStatus,
    mode: session.currentRunMode === "plan" ? "plan" : "normal",
    commitRevision: 1,
    queueRevision: 0,
    queuePaused: false,
    pendingMessageCount: 0,
    pendingSteerCount: 0,
    needsRecovery: false,
    executionOwner: true,
    messages: { count: session.messages.length, recent: [] },
    ...(session.runStatus !== "waiting" ? {} : {
      waitingFor: session.pendingAction !== undefined
        ? (session.pendingAction.status === "outcome_unknown" ? "action_recovery" : "action_approval")
        : "ask_user",
    }),
  });
  /** 窄状态投影：只给出当前状态与等待点，历史正文和步骤显式外置。 */
  const goalState = () => ({
    goalId: "goal-1",
    intent: "Collect approved notes from the current workspace",
    currentRunId: session.currentRunId,
    runStatus: session.runStatus,
    currentRunMode: "normal",
    currentRunStepCount: session.runs[0]?.stepCount ?? 0,
    ...(session.interaction === undefined ? {} : { interaction: session.interaction }),
    ...(session.pendingAction === undefined ? {} : { pendingAction: session.pendingAction }),
    history: {
      messages: { included: false, source: "activity" },
      steps: { included: false, source: "activity" },
      stages: { included: false, source: "activity" },
    },
  });
  /** 已提交的真实工具事实；Activity 页按同一来源顺序呈现。 */
  const committedFacts = [
    { eventId: "event-search", sequence: 1, actionId: "action-1", toolId: "bash", inputSummary: "rg --line-number --no-heading --color never -- approved notes .", summary: "Found three approved notes.", status: "completed" },
    { eventId: "event-read", sequence: 2, actionId: "action-2", toolId: "read_file", inputSummary: "README.md", summary: "Project notes.", status: "completed" },
    { eventId: "event-bash", sequence: 3, actionId: "action-3", toolId: "bash", inputSummary: "npm test", summary: "Test failed", status: "failed" },
  ];
  /** 固定水位的 Activity 页：正文消息与已提交工具事实按真实位置交错。 */
  const activityPage = () => {
    const messages = session.messages.map((message) => ({
      type: "message",
      itemId: `message:${message.messageId}`,
      messageId: message.messageId,
      role: message.role,
      ...(message.role === "assistant" ? { purpose: message.purpose ?? "process" } : {}),
      runId: message.runId,
      position: {
        runId: message.runId,
        runOrder: 0,
        sequence: message.position.afterSequence,
        itemKind: "message",
        order: message.position.order,
      },
      content: message.content,
      contentLength: message.content.length,
      truncated: false,
    }));
    const facts = committedFacts.map((fact) => ({
      type: "fact",
      itemId: `event:${fact.eventId}`,
      eventId: fact.eventId,
      runId: "run-1",
      position: { runId: "run-1", runOrder: 0, sequence: fact.sequence, itemKind: "fact", order: 0 },
      eventType: "tool_started",
      title: "Tool started",
      actionId: fact.actionId,
      executionUnitId: `unit-${fact.actionId}`,
      tool: {
        toolId: fact.toolId,
        status: fact.status,
        actionStatus: "approved",
        inputSummary: fact.inputSummary,
        summary: fact.summary,
      },
    }));
    return {
      goalId: "goal-1",
      limit: 50,
      items: [...messages, ...facts],
      runs: [{ runId: "run-1", status: session.runStatus, current: true, runOrder: 0, committedThroughSequence: 3 }],
      window: [{ runId: "run-1", messageCount: session.messages.length, committedThroughSequence: 3 }],
      gaps: [],
      range: { olderAvailable: false, newerAvailable: false },
      stages: [],
      actionGroups: committedFacts.map((fact) => ({
        runId: "run-1", actionId: fact.actionId, firstSequence: fact.sequence, lastSequence: fact.sequence, completeWithinPage: true,
      })),
    };
  };
  /** 按 SSE 规范写出显式事件名；测试桩不使用默认事件蒙混事件映射。 */
  const writeSseEvent = (response, event, payload) => {
    response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };
  /** Goal 事件统一使用 `update`，metrics 使用 `snapshot`。 */
  const writeGoalEvent = (response, payload) => writeSseEvent(response, "update", payload);
  const writeMetricsSnapshot = (response, payload) => writeSseEvent(response, "snapshot", payload);
  const server = createServer(async (request, response) => {
    authorizationHeaders.push(request.headers.authorization ?? "");
    if (request.headers["last-event-id"] !== undefined) sawLastEventId = true;
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
    if (request.url === "/api/project/workspace" && request.method === "GET") {
      if (request.headers.referer?.includes("session=width")) {
        json(response, { workspaceRoot: "/tmp/lazygoal-board-e2e-workspace", worktreeRoot: null, branch: "test" });
      } else {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "workspace_unavailable" }));
      }
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
      json(response, currentMetrics);
      return;
    }
    if (request.url === "/goals/goal-1/metrics/stream" && request.method === "GET") {
      metricsConnections += 1;
      // 新订阅取代旧订阅：结束旧响应，模拟服务端不会无限保留同一客户端的陈旧流。
      if (metricsStreamResponse !== undefined && !metricsStreamResponse.writableEnded) metricsStreamResponse.end();
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      metricsStreamResponse = response;
      response.on("close", () => { if (metricsStreamResponse === response) metricsStreamResponse = undefined; });
      writeMetricsSnapshot(response, currentMetrics);
      return;
    }
    if (request.url?.startsWith("/api/goals/goal-1/model-inputs?")) {
      inputReads += 1;
      if (new URL(request.url, "http://localhost").searchParams.get("callId") === "call-native") { inputDetailReads += 1; json(response, { call: nativeCall, previousSystem: null, previousCallId: null, systemVersion: "hash", committedThroughSequence: 3 }); }
      else json(response, { calls: [{ goalId: "goal-1", runId: "run-1", callId: "call-native", executionUnitId: "unit-1", stepIndex: 1, stage: "decide", occurredAt: "2026-08-05T09:00:01.000Z", systemVersion: "hash", systemChanged: false, firstSystem: true, previousCallId: null, omittedMessageCount: 0, messages: nativeCall.messages.map((message, index) => ({ role: message.role, source: message.source, index, preview: index === 0 ? `Native tool result ${"long content ".repeat(200)}` : message.content.slice(0, 700), truncated: true })) }], total: 1, nextOffset: null, committedThroughSequence: 3 });
      return;
    }
    if (request.url?.startsWith("/api/goals/goal-1/trajectory")) {
      const run = { runId: "run-1", status: "completed", current: true, committedThroughSequence: 3 };
      if (request.url.startsWith("/api/goals/goal-1/trajectory/runs")) json(response, { runs: [run], nextOffset: null });
      else if (request.url.startsWith("/api/goals/goal-1/trajectory/timeline")) json(response, { goalId: "goal-1", runId: "run-1", committedThroughSequence: 3, eventCount: 3, timeRange: { start: "2026-08-05T09:00:01.000Z", end: "2026-08-05T09:00:03.000Z" }, buckets: [{ startSequence: 1, endSequence: 3, eventCount: 3, eventTypes: [{ eventType: "run_started", count: 1 }, { eventType: "think_completed", count: 1 }, { eventType: "run_completed", count: 1 }] }] });
      else if (request.url.startsWith("/api/goals/goal-1/trajectory?")) {
        trajectoryReads += 1;
        json(response, { goalId: "goal-1", run, entries: [1, 2, 3].map(sequence => ({ eventId: `event-${sequence}`, sequence, ...(sequence <= 2 ? { stepIndex: sequence - 1 } : {}), executionUnitId: `unit-${sequence - 1}`, occurredAt: `2026-08-05T09:00:0${sequence}.000Z`, eventType: sequence === 1 ? "run_started" : sequence === 2 ? "think_completed" : "run_completed", category: sequence === 2 ? "decision" : "lifecycle", title: sequence === 2 ? "Thinking" : "Run", preview: "Committed Run event", previewTruncated: false })), total: 3, committedCount: 3, committedThroughSequence: 3, previousCursor: null, nextCursor: null, locatedSequence: null });
      } else if (request.url.startsWith("/api/goals/goal-1/trajectory/events/")) {
        const sequence = Number(request.url.split("/").at(-1).split("?")[0]);
        const eventType = sequence === 1 ? "run_started" : sequence === 2 ? "think_completed" : "run_completed";
        json(response, { event: { eventSchemaVersion: 1, eventId: `event-${sequence}`, goalId: "goal-1", runId: "run-1", sequence, occurredAt: `2026-08-05T09:00:0${sequence}.000Z`, phase: "executing", eventType, payload: eventType === "think_completed" ? { type: eventType, requestId: "think-1", stepOrdinal: 1, goal: "Inspect the saved workflow", output: "Inspection finished." } : { type: eventType } }, observationConfirmed: false, toolDurationMs: null, committedThroughSequence: 3, correlation: {}, related: {}, payloadBytes: 128 });
      } else { response.writeHead(404); response.end(); }
      return;
    }
    if (request.url === "/api/goals" && request.method === "GET") {
      json(response, { goals: currentListItem === null ? [] : [currentListItem], unreadableCount: 0 });
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
      if (rejectNextCreate) {
        rejectNextCreate = false;
        json(response, { error: "goal_busy" }, 409);
        return;
      }
      json(response, {
        ok: true,
        existing: false,
        goalId: lastCreate.goalId,
        runId: "new-run",
        receipt: sessionInputReceipt(lastCreate.inputId, "message", "applied"),
      }, 202);
      return;
    }
    if (request.url === "/api/goals/goal-1" && request.method === "GET") {
      json(response, { goal: session });
      return;
    }
    if (request.url === "/api/goals/goal-1?view=state" && request.method === "GET") {
      json(response, { goal: goalState() });
      return;
    }
    if (request.url?.startsWith("/api/goals/goal-1/activity") && request.method === "GET") {
      json(response, activityPage());
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
    if (request.url?.startsWith("/api/goals/goal-1/interaction-details?") && request.method === "GET") {
      if (nextInteractionDetailsFailure !== undefined) {
        const failure = nextInteractionDetailsFailure;
        nextInteractionDetailsFailure = undefined;
        json(response, { ok: false, error: failure }, failure === "interaction_not_waiting" ? 409 : 500);
        return;
      }
      const query = new URL(request.url, "http://localhost").searchParams;
      const interactionId = query.get("interactionId");
      if (query.get("runId") !== "run-1" || session.interaction === undefined
        || interactionId !== session.interaction.interactionId) {
        json(response, { ok: false, error: "interaction_not_waiting" }, 409);
        return;
      }
      if (session.interaction.kind === "question") {
        json(response, { ok: true, goalId: "goal-1", runId: "run-1", interactionId, detail: questionInteractionDetail });
        return;
      }
      if (session.pendingAction === undefined) {
        json(response, { ok: false, error: "interaction_not_waiting" }, 409);
        return;
      }
      json(response, {
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        interactionId,
        detail: {
          kind: session.interaction.kind,
          actionId: session.interaction.actionId,
          toolId: session.pendingAction.toolId,
          approvalKind: "tool",
          input: { path: "src/file.ts", content: "Complete private body" },
        },
      });
      return;
    }
    if (request.url === "/api/goals/goal-1/actions/action-1?runId=run-1" && request.method === "GET") {
      json(response, { ok: true, goalId: "goal-1", runId: "run-1", actionId: "action-1", toolId: "write_file", input: { path: "src/file.ts", content: "Complete private body" } });
      return;
    }
    if (request.url === "/api/goals/goal-1/grants?runId=run-1" && request.method === "GET") {
      json(response, { ok: true, goalId: "goal-1", runId: "run-1", grants: grantRevoked ? [] : [{ grantId: "grant-1", scope: "workspace", toolId: "write_file", status: "active", targetPath: "src/file.ts" }] });
      return;
    }
    if (request.url === "/api/goals/goal-1/grants/grant-1" && request.method === "DELETE") {
      grantRevoked = true;
      json(response, { ok: true, goalId: "goal-1", runId: "run-1", grants: [] });
      return;
    }
    if (request.url === "/api/goals/goal-1/events" && request.method === "GET") {
      goalEventConnections += 1;
      // 新订阅取代旧订阅：结束旧响应，避免测试客户端在多次导航后耗尽同源连接配额。
      if (activityResponse !== undefined && !activityResponse.writableEnded) activityResponse.end();
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      activityResponse = response;
      response.on("close", () => { if (activityResponse === response) activityResponse = undefined; });
      writeGoalEvent(response, { type: "state_sync", goalId: "goal-1", state: sessionState() });
      if (!liveTransitionSent) {
        liveTransitionSent = true;
        writeGoalEvent(response, { goalId: "goal-1", runId: "run-1", type: "activity", activity: { kind: "model_started" } });
        writeGoalEvent(response, {
          goalId: "goal-1",
          runId: "run-1",
          type: "activity",
          activity: { kind: "assistant_text_delta", text: "# Checking saved notes…\n", truncated: false, sourceEventId: "live-event-1", sourceCursor: 1 },
        });
        writeGoalEvent(response, {
          goalId: "goal-1", runId: "run-1", type: "activity",
          activity: { kind: "tool_started", sourceEventId: "live-event-2", sourceCursor: 2, actionId: "live-action-1", executionUnitId: "live-unit-1", toolId: "read_file", inputSummary: "README.md" },
        });

      }
      return;
    }
    if (request.url?.startsWith("/api/goals/goal-1/inputs/") && request.method === "GET") {
      const inputId = decodeURIComponent(new URL(request.url, "http://localhost").pathname.split("/").at(-1));
      const receipt = inputReceipts.get(inputId);
      json(response, receipt === undefined ? { ok: true, found: false } : { ok: true, found: true, receipt });
      return;
    }
    if (request.url === "/api/goals/goal-1/inputs" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const command = JSON.parse(body);
      if (command.kind === "respond") {
        const existing = inputReceipts.get(command.inputId);
        if (existing !== undefined) {
          json(response, { ok: true, existing: true, receipt: existing }, 200);
          return;
        }
        lastInteraction = command;
        session = completedSession(session);
        currentListItem = listItem("completed");
        const receipt = sessionInputReceipt(command.inputId, "respond", "applied");
        inputReceipts.set(command.inputId, receipt);
        json(response, { ok: true, existing: false, receipt }, 202);
        return;
      }
      if (command.kind === "message") {
        lastMessage = command;
        session = {
          ...session,
          currentRunId: "run-2",
          runStatus: "waiting",
          messages: [...session.messages, savedMessage("msg-queued", "user", command.content, 3, 3)],
          runs: [
            ...session.runs.map((run) => ({ ...run, current: false })),
            { runId: "run-2", status: "waiting", stepCount: 0, steps: [], current: true },
          ],
        };
        currentListItem = { ...listItem("waiting"), runId: "run-2" };
        json(response, { ok: true, existing: false, receipt: sessionInputReceipt(command.inputId, "message", "pending") }, 202);
        return;
      }
      json(response, { ok: false, error: "INVALID_INPUT" }, 400);
      return;
    }
    if (request.url === "/api/control" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const intent = JSON.parse(body);
      const accept = (result, status = 200) => json(response, { intentId: intent.intentId, status: "accepted", result: { kind: intent.kind, result } }, status);
      const reject = (error, status = 409) => json(response, { intentId: intent.intentId, status: "rejected", error }, status);
      switch (intent.kind) {
        case "create_session":
          lastCreate = { goalId: intent.goalId, inputId: intent.inputId, intent: intent.intent, ...(intent.mode === undefined ? {} : { mode: intent.mode }), ...(intent.modelId === undefined ? {} : { modelId: intent.modelId }) };
          if (rejectNextCreate) {
            rejectNextCreate = false;
            reject("goal_busy", 409);
            return;
          }
          accept({ ok: true, existing: false, goalId: intent.goalId, runId: "new-run", receipt: sessionInputReceipt(intent.inputId, "message", "applied") }, 202);
          return;
        case "session_input": {
          const command = intent.input;
          if (command.kind === "respond") {
            const existing = inputReceipts.get(command.inputId);
            if (existing !== undefined) {
              accept({ ok: true, existing: true, receipt: existing }, 200);
              return;
            }
            lastInteraction = command;
            session = completedSession(session);
            currentListItem = listItem("completed");
            const receipt = sessionInputReceipt(command.inputId, "respond", "applied");
            inputReceipts.set(command.inputId, receipt);
            accept({ ok: true, existing: false, receipt }, 202);
            return;
          }
          if (command.kind === "message") {
            lastMessage = command;
            session = {
              ...session,
              currentRunId: "run-2",
              runStatus: "waiting",
              messages: [...session.messages, savedMessage("msg-queued", "user", command.content, 3, 3)],
              runs: [
                ...session.runs.map((run) => ({ ...run, current: false })),
                { runId: "run-2", status: "waiting", stepCount: 0, steps: [], current: true },
              ],
            };
            currentListItem = { ...listItem("waiting"), runId: "run-2" };
            accept({ ok: true, existing: false, receipt: sessionInputReceipt(command.inputId, "message", "pending") }, 202);
            return;
          }
          reject("INVALID_INPUT", 400);
          return;
        }
        case "plan_mode":
          lastPlanMode = { runId: intent.runId };
          planModeRequests += 1;
          session = { ...session, nextRunMode: "plan" };
          accept({ ok: true, goalId: intent.goalId, runId: intent.runId, existing: planModeRequests > 1 });
          return;
        case "model_selection": {
          lastModelSelection = { runId: intent.runId, modelId: intent.modelId, ...(intent.providerProfileId === undefined ? {} : { providerProfileId: intent.providerProfileId }) };
          if (rejectNextSelection) {
            rejectNextSelection = false;
            reject("model_selection_failed", 503);
            return;
          }
          selectedModelId = intent.modelId;
          const defaultModelSaved = !failNextDefaultSave;
          failNextDefaultSave = false;
          if (defaultModelSaved) preferredModelId = selectedModelId;
          accept({
            ok: true,
            goalId: intent.goalId,
            runId: intent.runId,
            selection: { modelId: selectedModelId },
            ...(intent.persistAsDefault === true
              ? { defaultPreference: defaultModelSaved ? { ok: true } : { ok: false, error: "model_preference_save_failed" } }
              : {}),
          });
          return;
        }
        case "permission_mode": {
          if (intent.expectedRevision !== permissionRevision) {
            reject("conflict", 409);
            return;
          }
          permissionMode = intent.mode;
          permissionRevision += 1;
          accept({ ok: true, mode: permissionMode, revision: permissionRevision, workspaceId: "workspace-1" });
          return;
        }
        case "grant_revoke":
          grantRevoked = true;
          accept({ ok: true, goalId: intent.goalId, runId: intent.runId, grants: [] });
          return;
        case "goal_archive":
          currentListItem = { ...currentListItem, archived: intent.archived };
          accept({ ok: true, archived: intent.archived });
          return;
        case "goal_delete":
          currentListItem = null;
          accept({ ok: true, deleted: true });
          return;
        default:
          reject("invalid_control_command", 400);
          return;
      }
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
  return {
    server,
    publishOutputRate() {
      assert.ok(metricsStreamResponse && !metricsStreamResponse.destroyed);
      currentMetrics = {
        ...currentMetrics,
        throughputMeasuredCalls: 1,
        tokensPerSecond: 25,
      };
      writeMetricsSnapshot(metricsStreamResponse, currentMetrics);
    },
    advanceReviewActivity() {
      assert.ok(activityResponse && !activityResponse.destroyed);
      writeGoalEvent(activityResponse, { goalId: "goal-1", runId: "run-1", type: "activity", activity: { kind: "model_started" } });
      writeGoalEvent(activityResponse, { goalId: "goal-1", runId: "run-1", type: "activity", activity: { kind: "tool_finished", sourceEventId: "live-event-3", sourceCursor: 3, actionId: "live-action-1", toolId: "read_file", outcome: "success", summary: "Read README" } });
      writeGoalEvent(activityResponse, { goalId: "goal-1", runId: "run-1", type: "activity", activity: { kind: "assistant_text_delta", text: "# Reviewing result…\n", truncated: false, sourceEventId: "live-event-4", sourceCursor: 4 } });
    },
    publishModelProgress() {
      assert.ok(activityResponse && !activityResponse.destroyed);
      const occurredAt = new Date(Date.now() - 42000).toISOString();
      writeGoalEvent(activityResponse, { goalId: "goal-1", runId: "run-1", type: "activity", activity: {
        kind: "model_started", stage: "completion_review", modelCallId: "review-call-1", executionUnitId: "live-unit-1", occurredAt,
      } });
      return occurredAt;
    },
    commitWaitingActivity() {
      assert.ok(activityResponse && !activityResponse.destroyed);
      session = interactionSession();
      currentListItem = listItem("waiting");
      writeGoalEvent(activityResponse, { goalId: "goal-1", runId: "run-1", type: "state_committed", commitRevision: 1, changed: ["session", "activity"] });
    },
    /** 显式结束当前 Goal 事件流，触发客户端按既有退避重连。 */
    endGoalEvents() {
      activityResponse?.end();
    },
    /** 显式结束当前 metrics 流，触发客户端按既有退避重新订阅。 */
    endMetricsStream() {
      metricsStreamResponse?.end();
    },
    /** 下一次 Goal 事件连接前的会话与指标状态：用于验证新同步与新快照替换旧值。 */
    prepareReconnectState() {
      session = {
        ...session,
        runStatus: "waiting",
        runs: session.runs.map((run) => ({ ...run, status: "waiting" })),
      };
      currentListItem = listItem("waiting");
      currentMetrics = {
        ...currentMetrics,
        roundCount: 2,
        stepCount: 4,
        throughputMeasuredCalls: 1,
        tokensPerSecond: 40,
      };
    },
    goalEventsOpen: () => activityResponse !== undefined && !activityResponse.destroyed,
    metricsStreamOpen: () => metricsStreamResponse !== undefined && !metricsStreamResponse.destroyed,
    goalEventConnections: () => goalEventConnections,
    metricsConnections: () => metricsConnections,
    sawLastEventId: () => sawLastEventId,
    authorizationHeaders,
    get lastInteraction() { return lastInteraction; },
    get lastMessage() { return lastMessage; },
    get lastPlanMode() { return lastPlanMode; },
    get lastModelSelection() { return lastModelSelection; },
    get lastCreate() { return lastCreate; },
    rejectNextCreateWithRunningGoal() {
      rejectNextCreate = true;
      session = waitingSession();
      currentListItem = listItem("running");
      liveTransitionSent = true;
    },
    get preferredModelId() { return preferredModelId; },
    delayNextDraftCatalog() { delayNextDraftCatalog = true; },
    failNextInteractionDetails(error = "interaction_details_unavailable") { nextInteractionDetailsFailure = error; },
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
        interaction: {
          goalId: "goal-1",
          runId: "run-1",
          kind: "action_recovery",
          interactionId: "action_recovery:action-unknown",
          actionId: "action-unknown",
          decisions: ["retry_unknown_action", "decline_unknown_action_retry"],
          truncated: false,
        },
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
        interaction: {
          goalId: "goal-1",
          runId: "run-1",
          kind: "action_approval",
          interactionId: "action_approval:action-1",
          actionId: "action-1",
          decisions: ["approve_action", "approve_action_revision", "reject_action"],
          truncated: false,
        },
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
      grantRevoked = false;
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
    messages: [savedMessage("msg-intent", "user", "Collect approved notes from the current workspace", 0, 0)],
    runs: [{
      runId: "run-1",
      status: "running",
      stepCount: 3,
      steps: [{
        runId: "run-1",
        executionUnitId: "unit-1",
        sequence: 2,
        stepIndex: 1,
        toolId: "bash",
        inputSummary: "rg --line-number --no-heading --color never -- approved notes .",
        status: "completed",
        summary: "Found three approved notes.",
        bashExecution: { command: "rg --line-number --no-heading --color never -- approved notes ." },
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

/** 当前问题等待的完整详情；与 interaction 视图使用同一 request 身份。 */
const questionInteractionDetail = {
  kind: "question",
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

function interactionSession() {
  const session = waitingSession();
  session.runStatus = "waiting";
  session.runs = session.runs.map((run) => ({ ...run, status: "waiting" }));
  session.messages = [...session.messages, savedMessage("msg-question", "assistant", "Which source should I use?", 3, 0, "process")];
  session.interaction = {
    goalId: "goal-1",
    runId: "run-1",
    kind: "question",
    interactionId: "question:request-1",
    requestId: "request-1",
    decisions: ["answer_questions", "reply_to_question", "skip_question"],
    truncated: false,
  };
  return session;
}

function completedSession(previous) {
  return {
    ...previous,
    runStatus: "completed",
    interaction: undefined,
    messages: [
      ...previous.messages,
      savedMessage("msg-approved", "user", "Approved notes", 3, 1),
      savedMessage("msg-answer", "assistant", "# I collected the approved notes.\n\n| Field | Value |\n| --- | --- |\n| Source | Approved notes |\n\n- **Verified** output\n\n```text\nrun-1\n```\n\n<script>window.markdownInjected = true</script>\n\n![Remote image](https://example.com/image.png)", 3, 2, "answer"),
    ],
    runs: previous.runs.map((run) => ({ ...run, status: "completed" })),
  };
}

/** 正式消息的稳定身份与 Run 内位置；窄状态与 Activity 页共用同一份来源。 */
function savedMessage(messageId, role, content, afterSequence, order, purpose) {
  return {
    role,
    content,
    messageId,
    runId: "run-1",
    position: { afterSequence, order },
    ...(purpose === undefined ? {} : { purpose }),
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

function json(response, value, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
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
  socket.requests = new Map();
  socket.pending = new Map();
  socket.nextId = 0;
  socket.addEventListener("message", async (event) => {
    const raw = typeof event.data === "string" ? event.data : await event.data.text();
    const message = JSON.parse(raw);
    if (message.method === "Network.requestWillBeSent") {
      const { requestId, request } = message.params;
      const pathname = new URL(request.url).pathname;
      if (pathname.startsWith("/api/")) {
        socket.requests.set(requestId, { path: pathname, method: request.method });
        if (socket.requests.size > 20) socket.requests.delete(socket.requests.keys().next().value);
      }
    }
    if (message.method === "Network.responseReceived") {
      const entry = socket.requests.get(message.params.requestId);
      if (entry) entry.status = message.params.response.status;
    }
    if (message.id === undefined) return;
    const pending = socket.pending.get(message.id);
    if (pending === undefined) return;
    socket.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  });
  await cdp(socket, "Network.enable");
  return socket;
}

async function cdp(socket, method, params = {}) {
  const expression = params.expression;
  if (method === "Runtime.evaluate" && typeof expression === "string" && expression.endsWith(".click()") && !expression.includes("?.click()")) {
    const operations = expression.split(";").map(operation => operation.trim()).filter(Boolean);
    if (operations.length > 1) {
      let result;
      for (const operation of operations) result = await cdp(socket, method, { ...params, expression: operation });
      return result;
    }
    const target = expression.slice(0, -".click()".length);
    const selector = /^document\.querySelector\((.+)\)$/.exec(target);
    const unique = selector ? `document.querySelectorAll(${selector[1]}).length === 1 && ` : "";
    await waitForExpression(socket, `(() => { try { const target = ${target}; return ${unique}target != null && target.isConnected && target.checkVisibility() && !target.disabled; } catch (error) { if (error instanceof TypeError) return false; throw error; } })()`);
  }
  const id = ++socket.nextId;
  return new Promise((resolveResult, reject) => {
    socket.pending.set(id, { resolve: resolveResult, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function navigate(socket, url) {
  // 先离开当前文档，确保上一个页面的 SSE 连接被关闭，避免同源连接配额累积。
  await cdp(socket, "Page.navigate", { url: "about:blank" });
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
  throw new Error(`Timed out waiting for browser expression: ${expression}; questionnaire: ${await value(socket, "document.querySelector('.question-region')?.innerHTML")}; diagnostics: ${await browserDiagnostics(socket)}`);
}

async function waitForLocal(predicate, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await delay(50);
  }
  throw new Error("Timed out waiting for local browser request");
}

async function browserDiagnostics(socket) {
  const page = await value(socket, "({url: location.origin + location.pathname, state: document.querySelector('.task-state')?.textContent, connection: document.querySelector('.stream-state')?.textContent, buttons: [...document.querySelectorAll('.structured-form button, .command-candidate')].map(button => ({text: button.textContent.trim(), disabled: button.disabled})), timeline: document.querySelector('.session-timeline-feed')?.innerText, transientMessages: [...document.querySelectorAll('.transient-message')].map(node => node.innerText), activityHeadings: [...document.querySelectorAll('.timeline-activity-heading')].map(node => node.innerText)})");
  return JSON.stringify({ ...page, requests: [...socket.requests.values()] });
}
