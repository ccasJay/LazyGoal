import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const serviceEntry = join(repositoryRoot, "apps/goal-board/e2e/test-service.ts");

test("human interaction questionnaire: navigation, review, overall reply and skip", { timeout: 240_000 }, async () => {
  const fixture = await startHarness("human-interaction-questionnaire");
  const { socket, service } = fixture;
  const { origin, token, launchUrl } = await service.ready;

  try {
    await navigate(socket, launchUrl);
    await waitForExpression(socket, "document.querySelector('button.primary') !== null", 20_000);

    // 逐题回答流程：两道题、导航回看、完整审阅与真实提交。
    const answersGoal = await createGoal(socket, origin, token, "Human interaction flow: questionnaire", fixture.statusPath);
    await waitForExpression(socket, "document.querySelector('.interaction-region.question-region') !== null", 20_000);
    assert.match(await value(socket, "document.querySelector('.question-nav-progress').textContent"), /Answered 0 of 2/);
    assert.match(await value(socket, "document.querySelector('.interaction-review').innerText"), /Not answered/);
    assert.equal(await value(socket, "document.querySelectorAll('.question-nav-item').length"), 2);
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]') !== null"), false,
      "a waiting Goal has no ordinary follow-up composer");
    assert.match(await value(socket, "document.querySelector('.interaction-region .approval-heading').innerText"), /Your answer is needed/);

    await clickLabel(socket, "label.answer-option", "Approved notes");
    await waitForExpression(socket, "document.querySelector('.question-nav-progress').textContent.includes('Answered 1 of 2')");
    await clickButton(socket, "Next question");
    await waitForExpression(socket, "document.querySelector('.question legend')?.textContent === 'Choose sections'");
    await clickLabel(socket, "label.answer-option", "Summary");
    await clickLabel(socket, "label.answer-option", "Details");
    await clickButton(socket, "Previous question");
    await waitForExpression(socket, "document.querySelector('.question legend')?.textContent === 'Choose a source'");
    assert.equal(await checked(socket, "label.answer-option", "Approved notes"), true, "navigation keeps the saved option");
    const afterNavigation = await sessionDetail(origin, token, answersGoal.goalId);
    assert.equal(afterNavigation.interaction.kind, "question", "navigation never submits the questionnaire");
    assert.equal(afterNavigation.messages.filter((message) => message.role === "user").length, 1, "navigation adds no user message");
    assert.equal(afterNavigation.currentRunId, answersGoal.runId);

    // 提交前审阅全部回答，然后提交整份问卷：决定写入原 Run。
    assert.match(await value(socket, "document.querySelector('.interaction-review').innerText"), /Approved notes/);
    assert.match(await value(socket, "document.querySelector('.interaction-review').innerText"), /Summary, Details/);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.ask-user-actions .approval-primary').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.decision-summary')?.innerText.includes('Answers sent')", 20_000);
    const answered = await waitForRunStatus(origin, token, answersGoal, "completed");
    const answerMessages = answered.messages.filter((message) => message.role === "user" && message.content.includes("Answer:"));
    assert.equal(answerMessages.length, 1, "one committed answer message");
    assert.equal(answerMessages[0].runId, answersGoal.runId, "the answer continues the original Run");
    assert.match(answerMessages[0].content, /Approved notes/);
    assert.match(answerMessages[0].content, /Summary, Details/);
    assert.equal(answered.interaction, undefined, "the answered questionnaire is settled");
    assert.equal((await readStatus(fixture.statusPath)).modelCalls > answersGoal.modelCallsAtWait, true, "the answered Run continues with a real model call");

    // 跳过流程：需要显式确认后果，确认后才提交跳过语义。
    const skipGoal = await createGoal(socket, origin, token, "Human interaction flow: skip", fixture.statusPath);
    await waitForExpression(socket, "document.querySelector('.interaction-region.question-region') !== null", 20_000);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.interaction-skip').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.skip-confirm') !== null");
    assert.match(await value(socket, "document.querySelector('.skip-confirm p').textContent"), /without answers/);
    const beforeSkip = await sessionDetail(origin, token, skipGoal.goalId);
    assert.equal(beforeSkip.interaction.kind, "question", "opening the skip confirmation does not submit");
    assert.equal(beforeSkip.messages.filter((message) => message.role === "user").length, 1);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.skip-confirm .approval-cancel').click()", returnByValue: true });
    const skipped = await waitForRunStatus(origin, token, skipGoal, "completed");
    const skipMessage = skipped.messages.find((message) => message.role === "user" && message.content.includes("did not answer"));
    assert.equal(skipMessage?.runId, skipGoal.runId, "skip continues the same Run");
    assert.equal(skipped.messages.some((message) => message.content.includes("Answer:")), false, "skip never fills default answers");
    // 整体回复流程：模式切换保留两种草稿，且只提交当前选中的结构化答复。
    const replyGoal = await createGoal(socket, origin, token, "Human interaction flow: reply", fixture.statusPath);
    await waitForExpression(socket, "document.querySelector('.interaction-region.question-region') !== null", 20_000);
    await clickLabel(socket, "label.answer-option", "All notes");
    await waitForExpression(socket, "document.querySelector('.question-nav-progress').textContent.includes('Answered 1 of 2')");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.interaction-mode-switch label')].find(label => label.innerText.includes('Reply instead')).querySelector('[role=radio], [role=checkbox]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Overall reply\"]') !== null");
    await setText(socket, "textarea[aria-label=\"Overall reply\"]", "Handle this my own way");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.interaction-mode-switch label')].find(label => label.innerText.includes('Answer each question')).querySelector('[role=radio], [role=checkbox]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.question-nav-progress').textContent.includes('Answered 1 of 2')");
    assert.equal(await checked(socket, "label.answer-option", "All notes"), true, "per-question draft survives the mode switch");
    await waitForExpression(socket, "document.querySelector('.question-nav-item.answered') !== null");
    assert.equal(await checked(socket, "label.answer-option", "All notes"), true, "switching modes keeps the questionnaire draft");

    // 切回整体回复：两份草稿都在，只提交当前方式。
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.interaction-mode-switch label')].find(label => label.innerText.includes('Reply instead')).querySelector('[role=radio], [role=checkbox]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Overall reply\"]')?.value === 'Handle this my own way'");
    assert.equal(await value(socket, "document.querySelector('.interaction-review') === null"), true, "reply mode only shows the reply editor");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.ask-user-actions button')].find(button => button.textContent.includes('Send reply')).click()", returnByValue: true });
    const replied = await waitForRunStatus(origin, token, replyGoal, "completed");
    const replyMessage = replied.messages.find((message) => message.role === "user" && message.content === "Handle this my own way");
    assert.equal(replyMessage?.runId, replyGoal.runId, "an overall reply continues the same Run");
    assert.equal(replied.messages.some((message) => message.content.includes("Answer: All notes")), false, "the reply never applies the per-question draft");
    const noFollowup = await sessionDetail(origin, token, replyGoal.goalId);
    assert.equal(noFollowup.currentRunId, replyGoal.runId, "the structured reply settles the original Run");
    assert.equal(noFollowup.messages.some((message) => message.role === "user" && message.content.includes("follow-up")), false);

  } finally {
    await fixture.stop();
  }
});

test("human interaction approvals: full task review, single tool approval and explicit recovery prompt", { timeout: 240_000 }, async () => {
  const fixture = await startHarness("human-interaction-approvals");
  const { socket, service } = fixture;
  const { origin, token, launchUrl } = await service.ready;

  try {
    await navigate(socket, launchUrl);
    await waitForExpression(socket, "document.querySelector('button.primary') !== null", 20_000);

    // 通过正式 API 建立 Plan Run，使第一个决定是任务提案审批；界面只负责决定与审阅。
    const catalog = await api(origin, "/api/models", { token });
    const createGoal = await api(origin, "/api/goals", {
      token,
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({
        goalId: "goal-approval-flow",
        inputId: "approval-goal-input",
        intent: "Plan flow: inspect and complete the approval path",
        mode: "plan",
        modelId: catalog.body.currentModelId,
      }),
    });
    assert.equal(createGoal.response.status, 202, JSON.stringify(createGoal.body));
    const goalId = "goal-approval-flow";

    // 刷新 board 读取新 Goal；同一 URL 的 hash 导航不会重新加载页面。
    await cdp(socket, "Page.reload");
    await waitForExpression(socket, "document.readyState === 'complete' && document.querySelector('.goal-card') !== null", 20_000);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.task-approval-region')?.innerText.includes('Review the proposed task')", 30_000);
    const taskRegion = await value(socket, "document.querySelector('.task-approval-region').innerText");
    assert.match(taskRegion, /Approve the deterministic plan-flow task\?/);
    assert.match(taskRegion, /Finish the controlled plan-flow check/);
    assert.match(taskRegion, /Complete the proposed task/);
    assert.match(taskRegion, /The task outcome is verified/);
    assert.match(taskRegion, /Approve task/);
    assert.equal(await value(socket, "document.querySelector('.task-approval-region .interaction-stop') !== null"), true);
    assert.ok(taskRegion.indexOf("Complete the proposed task") < taskRegion.indexOf("Approve task"), "the complete route precedes the approve action");

    const beforeApproval = await sessionDetail(origin, token, goalId);
    assert.equal(beforeApproval.interaction.kind, "task_approval");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.task-approval-region button')].find(button => button.textContent.includes('Approve task')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.action-region')?.innerText.includes('Your approval is needed')", 30_000);
    const actionSession = await waitForSession(origin, token, (candidate) => candidate.goalId === goalId && candidate.interaction?.kind === "action_approval");
    assert.equal(actionSession.pendingAction.toolId, "browser_fixture_write");
    const actionRegion = await value(socket, "document.querySelector('.action-region').innerText");
    assert.match(actionRegion, /Tool permission request/);
    assert.match(actionRegion, /browser_fixture_write/);
    assert.match(actionRegion, /controlled plan write/, "the complete canonical input is reviewable before deciding");
    assert.match(actionRegion, /Approve once/);
    // 拒绝需要非空理由：未填写时拒绝按钮不可用，也从不提供参数编辑。
    assert.equal(await value(socket, "document.querySelector('.approval-scopes [role=radio]').getAttribute('aria-checked') === 'true'"), true, "the default scope is the single action");
    await clickButton(socket, "Reject action");
    assert.equal(await value(socket, "document.querySelector('.action-rejection [data-state=open] button').disabled"), true);
    assert.equal(actionRegion.includes("Edit input"), false);

    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.action-region button')].find(button => button.textContent.includes('Approve once')).click()", returnByValue: true });
    const completed = await waitFor(async () => {
      const candidate = await sessionDetail(origin, token, goalId);
      return candidate.runStatus === "completed" ? candidate : undefined;
    }, "the approved plan action to complete", 60_000);
    assert.equal(completed.interaction, undefined);
    assert.equal(completed.pendingAction, undefined);
    const actionLines = (await readFile(join(fixture.workspace, "controlled-tool-actions.jsonl"), "utf8")).trim().split("\n");
    assert.equal(actionLines.length, 1, "the reviewed approval executed exactly one real tool call");
    assert.equal(JSON.parse(actionLines[0]).value, "controlled plan write");
    assert.equal(await value(socket, "document.body.innerText.includes('PRIVATE_CONTROLLED_TOOL_OUTPUT')"), false);
  } finally {
    await fixture.stop();
  }
});

test("human interaction questionnaire: waiting stop, keyboard and narrow layout", { timeout: 180_000 }, async () => {
  const fixture = await startHarness("human-interaction-stop");
  const { socket, service } = fixture;
  const { origin, token, launchUrl } = await service.ready;

  try {
    await navigate(socket, launchUrl);
    await waitForExpression(socket, "document.querySelector('button.primary') !== null", 20_000);
    const goal = await createGoal(socket, origin, token, "Human interaction flow: stop", fixture.statusPath);
    await waitForExpression(socket, "document.querySelector('.interaction-region.question-region') !== null", 20_000);

    // 窄屏：内容可读、可滚动、决定与停止都在可达范围内。
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
    assert.equal(await value(socket, "document.documentElement.scrollWidth <= window.innerWidth"), true);
    assert.equal(await value(socket, "(() => { const region = document.querySelector('.interaction-region').getBoundingClientRect(); return region.left >= 0 && region.right <= window.innerWidth; })()"), true);
    assert.equal(await value(socket, "(() => { const stop = document.querySelector('.interaction-stop').getBoundingClientRect(); const region = document.querySelector('.interaction-region').getBoundingClientRect(); return stop.top >= region.top && stop.right <= window.innerWidth; })()"), true);
    assert.equal(await value(socket, "getComputedStyle(document.querySelector('.interaction-mode-switch')).gridTemplateColumns.split(' ').length"), 1);

    // 键盘：文本框 Enter／Escape 不提交、不跳过、不停止。
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.interaction-mode-switch label')].find(label => label.innerText.includes('Reply instead')).querySelector('[role=radio], [role=checkbox]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.overall-reply textarea') !== null");
    await setText(socket, "textarea[aria-label='Overall reply']", "Draft that must not submit");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.overall-reply textarea').focus()", returnByValue: true });
    assert.equal(await value(socket, "document.activeElement === document.querySelector('.overall-reply textarea')"), true);
    for (const key of ["Enter", "Escape"]) {
      await cdp(socket, "Input.dispatchKeyEvent", { type: "rawKeyDown", key, code: key, windowsVirtualKeyCode: key === "Enter" ? 13 : 27 });
      await cdp(socket, "Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: key === "Enter" ? 13 : 27 });
    }
    const untouched = await sessionDetail(origin, token, goal.goalId);
    assert.equal(untouched.interaction.kind, "question", "Enter and Escape never submit or skip the questionnaire");
    assert.equal(untouched.runStatus, "waiting");
    assert.equal(await value(socket, "document.querySelector('.overall-reply textarea').value"), "Draft that must not submit");

    // 键盘 Tab 在区域内移动且焦点可见。
    await cdp(socket, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    const focusCheck = await value(socket, "(() => { const element = document.activeElement; return { inRegion: document.querySelector('.interaction-region').contains(element), outline: getComputedStyle(element).outlineStyle, shadow: getComputedStyle(element).boxShadow, name: element.textContent.trim() }; })()");
    assert.equal(focusCheck.inRegion, true, "Tab keeps focus inside the interaction region");
    assert.ok(focusCheck.outline !== "none" || focusCheck.shadow !== "none", "keyboard focus has an outline or focus ring");

    // 字段关联与状态播报存在，且问题控件都有可访问名称。
    assert.equal(await value(socket, "document.querySelector('.interaction-status').getAttribute('role')"), "status");
    assert.equal(await value(socket, "document.querySelector('.overall-reply textarea') !== null"), true);
    assert.equal(await value(socket, "document.querySelector('.interaction-stop').textContent.trim()"), "Stop run");

    // 等待中的独立停止：受理 Interrupt，旧问卷失效，队列保持暂停语义。
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.interaction-stop').click()", returnByValue: true });
    const cancelled = await waitForSession(origin, token, (candidate) => candidate.goalId === goal.goalId && candidate.runStatus === "cancelled");
    assert.equal(cancelled.interaction, undefined, "the interrupted questionnaire no longer stays actionable");
    assert.equal(await value(socket, "document.querySelector('.interaction-region.question-region') === null"), true);
    const callsAfterStop = (await readStatus(fixture.statusPath)).modelCalls;
    await delay(1_000);
    assert.equal((await readStatus(fixture.statusPath)).modelCalls, callsAfterStop, "a stopped questionnaire makes no further model call");
  } finally {
    await fixture.stop();
  }
});

test("human interaction submit state: frozen decision, host settlement and refresh", { timeout: 240_000 }, async () => {
  const fixture = await startHarness("human-interaction-submit-state");
  const { socket, service } = fixture;
  const { origin, token, launchUrl } = await service.ready;

  try {
    await navigate(socket, launchUrl);
    await waitForExpression(socket, "document.querySelector('button.primary') !== null", 20_000);

    // 提交未送达：客户端冻结身份与载荷，不产生第二个身份。
    const frozenGoal = await createGoal(socket, origin, token, "Human interaction flow: questionnaire", fixture.statusPath);
    await waitForExpression(socket, "document.querySelector('.interaction-region.question-region') !== null", 20_000);
    await cdp(socket, "Fetch.enable", { patterns: [{ urlPattern: "*api/control*", requestStage: "Request" }] });
    socket.on("Fetch.requestPaused", (params) => {
      const pathname = new URL(params.request.url).pathname;
      if (params.request.method === "POST" && pathname.endsWith("/api/control")) {
        void cdp(socket, "Fetch.failRequest", { requestId: params.requestId, errorReason: "Failed" });
        return;
      }
      void cdp(socket, "Fetch.continueRequest", { requestId: params.requestId });
    });
    await clickLabel(socket, "label.answer-option", "Approved notes");
    await clickButton(socket, "Next question");
    await waitForExpression(socket, "document.querySelector('.question legend')?.textContent === 'Choose sections'");
    await clickLabel(socket, "label.answer-option", "Summary");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.ask-user-actions .approval-primary').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.interaction-status')?.innerText.includes('could not be confirmed')", 20_000);
    assert.equal(await value(socket, "document.querySelector('.interaction-resolve button')?.textContent.includes('Check saved decision')"), true);
    assert.equal(await value(socket, "document.querySelector('.ask-user-actions .approval-primary')?.disabled"), true, "an unconfirmed decision cannot send a second identity");
    assert.match(await value(socket, "document.querySelector('.interaction-resolve button + button').textContent"), /Retry the same decision/);

    // 原身份核验：确认未提交后保留原身份供重试。
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.interaction-resolve button')].find(button => button.textContent.includes('Check saved decision')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.interaction-error')?.innerText.includes('was not saved')", 20_000);
    // 核验确认未保存后回到编辑状态，保留原身份与载荷供重试。
    assert.equal(await value(socket, "document.querySelector('.interaction-resolve') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.ask-user-actions .approval-primary')?.disabled"), false);

    // 恢复提交后按原身份重试：只应用一次答案。
    await cdp(socket, "Fetch.disable");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.ask-user-actions .approval-primary').click()", returnByValue: true });
    const frozenAfter = await waitFor(async () => {
      const candidate = await sessionDetail(origin, token, frozenGoal.goalId);
      return candidate.runStatus === "completed" && candidate.interaction === undefined ? candidate : undefined;
    }, "the retried decision to settle exactly once", 40_000);
    assert.equal(frozenAfter.messages.filter((message) => message.content.includes("Answer:")).length, 1, "the retried decision applies once");
    assert.match(frozenAfter.messages.find((message) => message.content.includes("Answer:")).content, /Summary/);

    // 第二个客户端（显式宿主）先结算：旧页面收敛到权威状态，只保留一次决定。
    const contestedGoal = await createGoal(socket, origin, token, "Human interaction flow: skip", fixture.statusPath);
    await waitForExpression(socket, "document.querySelector('.interaction-region.question-region') !== null", 20_000);
    const hostDecision = await answerQuestionnaireAsHost(origin, token, contestedGoal.goalId, "host-settled-decision");
    assert.equal(hostDecision.response.status, 202, JSON.stringify(hostDecision.body));
    const contestedAfter = await waitFor(async () => {
      const candidate = await sessionDetail(origin, token, contestedGoal.goalId);
      return candidate.runStatus === "completed" && candidate.interaction === undefined ? candidate : undefined;
    }, "the host decision to settle the questionnaire", 40_000);
    assert.equal(contestedAfter.messages.filter((message) => message.content.includes("Answer:")).length, 1, "the settled request keeps exactly one decision");
    await waitForExpression(socket, "document.querySelector('.interaction-region.question-region') === null", 30_000);
    assert.equal(await value(socket, "document.querySelector('.question-nav-progress') === null"), true, "the settled page no longer offers the old decision");
    const storageAfterContested = await value(socket, "Object.fromEntries(Object.entries(localStorage))");
    assert.equal(JSON.stringify(storageAfterContested).includes("Answer:"), false);

    // 刷新：草稿不跨刷新恢复，也不把答案或参数镜像到 localStorage。
    const refreshGoal = await createGoal(socket, origin, token, "Human interaction flow: reply", fixture.statusPath);
    await waitForExpression(socket, "document.querySelector('.interaction-region.question-region') !== null", 20_000);
    await clickLabel(socket, "label.answer-option", "All notes");
    await waitForExpression(socket, "document.querySelector('.question-nav-progress')?.textContent.includes('Answered 1 of 2')");
    await cdp(socket, "Page.reload");
    await waitForExpression(socket, "document.readyState === 'complete' && document.querySelector('.goal-card') !== null", 20_000);
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.goal-card')].find(card => card.innerText.includes('Human interaction flow: reply')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.interaction-region.question-region') !== null", 20_000);
    assert.match(await value(socket, "document.querySelector('.question-nav-progress').textContent"), /Answered 0 of 2/);
    assert.equal(await value(socket, "document.querySelector('.decision-summaries') === null"), true, "page-level decision history never survives a refresh");
    const afterRefresh = await sessionDetail(origin, token, refreshGoal.goalId);
    assert.equal(afterRefresh.runStatus, "waiting");
    assert.equal(afterRefresh.interaction.kind, "question");
    assert.equal(afterRefresh.messages.filter((message) => message.role === "user").length, 1, "refresh never submits a stored draft");
    const storage = await value(socket, "Object.fromEntries(Object.entries(localStorage))");
    assert.equal(JSON.stringify(storage).includes("All notes"), false);
    assert.equal(JSON.stringify(storage).includes("controlled"), false);
  } finally {
    await fixture.stop();
  }
});

async function startHarness(label) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), `lazygoal-${label}-`));
  const workspace = join(temporaryRoot, "workspace");
  const data = join(temporaryRoot, "data");
  const home = join(temporaryRoot, "home");
  const profile = join(temporaryRoot, "chrome-profile");
  const statusPath = join(temporaryRoot, "status.json");
  await Promise.all([mkdir(workspace), mkdir(home)]);
  const service = startService({ workspace, data, home, statusPath, runOffset: 0, modelOffset: 0, delayModel: true });
  await service.ready;
  const chrome = spawn(findChrome(), [
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
  const socket = await connectCdp(target.webSocketDebuggerUrl);
  await cdp(socket, "Page.enable");
  await cdp(socket, "Runtime.enable");
  await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  return {
    socket,
    service,
    statusPath,
    workspace,
    async stop() {
      socket.close();
      await stopProcess(chrome, "SIGKILL", 5_000);
      await stopService(service);
      await rm(temporaryRoot, { recursive: true, force: true });
    },
  };
}

async function createGoal(socket, origin, token, intent, statusPath) {
  await cdp(socket, "Runtime.evaluate", {
    expression: "[...document.querySelectorAll('button.primary')].find(button => button.textContent.includes('New goal')).click()",
    returnByValue: true,
  });
  await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]') !== null", 20_000);
  await setText(socket, "textarea[aria-label=\"Goal intent\"]", intent);
  await waitForExpression(socket, "document.querySelector('button[aria-label=\"Start Goal\"]')?.disabled === false", 20_000);
  await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Start Goal\"]').click()", returnByValue: true });
  const waiting = await waitForSession(origin, token, (candidate) => candidate.intent === intent && candidate.runStatus === "waiting");
  const status = await readStatus(statusPath);
  return { goalId: waiting.goalId, runId: waiting.currentRunId, modelCallsAtWait: status.modelCalls };
}

async function clickButton(socket, text) {
  await cdp(socket, "Runtime.evaluate", {
    expression: `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(text)}).click()`,
    returnByValue: true,
  });
}

async function answerQuestionnaireAsHost(origin, token, goalId, inputId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await sessionDetail(origin, token, goalId);
    if (current.interaction === undefined) return { response: { status: 409 }, body: { error: "interaction_not_waiting" } };
    const detail = await api(origin, `/api/goals/${goalId}/interaction-details?runId=${encodeURIComponent(current.currentRunId)}&interactionId=${encodeURIComponent(current.interaction.interactionId)}`, { token });
    assert.equal(detail.response.status, 200, JSON.stringify(detail.body));
    const answers = detail.body.detail.questions.map((question) => ({
      questionId: question.id,
      optionIds: [question.options[0].id],
    }));
    const submitted = await api(origin, `/api/goals/${goalId}/inputs`, {
      token,
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({
        kind: "respond",
        inputId: `${inputId}-${attempt}`,
        runId: current.currentRunId,
        requestId: current.interaction.requestId,
        response: { kind: "answer_ask_user", answers },
      }),
    });
    if (submitted.response.status === 202) return submitted;
  }
  throw new Error("the host could not settle the questionnaire with a current identity");
}

async function clickLabel(socket, selector, text) {
  await cdp(socket, "Runtime.evaluate", {
    expression: `[...document.querySelectorAll(${JSON.stringify(selector)})].find(label => label.innerText.includes(${JSON.stringify(text)})).querySelector('[role=radio], [role=checkbox]').click()`,
    returnByValue: true,
  });
}

async function checked(socket, selector, text) {
  return value(socket, `[...document.querySelectorAll(${JSON.stringify(selector)})].find(label => label.innerText.includes(${JSON.stringify(text)})).querySelector('[role=radio], [role=checkbox]').getAttribute('aria-checked') === 'true'`);
}

function startService({ workspace, data, home, statusPath, runOffset, modelOffset, delayModel = false }) {
  const child = spawn(process.execPath, ["--import", "tsx/esm", serviceEntry], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      LAZYGOAL_E2E_WORKSPACE: workspace,
      LAZYGOAL_E2E_DATA: data,
      LAZYGOAL_E2E_HOME: home,
      LAZYGOAL_E2E_STATUS: statusPath,
      LAZYGOAL_E2E_RUN_COUNTER: String(runOffset),
      LAZYGOAL_E2E_MODEL_OFFSET: String(modelOffset),
      LAZYGOAL_E2E_DELAY_MODEL: delayModel ? "1" : "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolveReadyPromise, rejectReadyPromise) => {
    resolveReady = resolveReadyPromise;
    rejectReady = rejectReadyPromise;
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    const match = stdout.match(/LG_TEST_READY:(\{[^\n]+\})/);
    if (match) {
      const result = JSON.parse(match[1]);
      resolveReady({ ...result, token: new URL(result.launchUrl).hash.slice(1) });
    }
  });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.once("error", rejectReady);
  child.once("exit", (code, signal) => {
    if (code !== 0) rejectReady(new Error(`Test service exited (${code ?? signal}): ${stderr || stdout}`));
  });
  return { child, ready, get logs() { return `${stdout}${stderr}`; } };
}

async function stopService(service) {
  await stopProcess(service.child, "SIGTERM", 30_000, service.logs);
}

async function stopProcess(child, signal, timeoutMs, logs = "") {
  if (child.exitCode !== null) return;
  const { once } = await import("node:events");
  const closed = once(child, "close");
  child.kill(signal);
  try {
    await Promise.race([
      closed,
      delay(timeoutMs).then(() => { throw new Error(`Timed out stopping child process: ${logs}`); }),
    ]);
  } catch (error) {
    child.kill("SIGKILL");
    await closed;
    throw error;
  }
}

async function api(origin, path, { token, method = "GET", headers = {}, body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
    ...(body === undefined ? {} : { body }),
  });
  const text = await response.text();
  return { response, body: text.startsWith("{") ? JSON.parse(text) : text };
}

async function sessionDetail(origin, token, goalId) {
  const detail = await api(origin, `/api/goals/${goalId}`, { token });
  assert.equal(detail.response.status, 200, JSON.stringify(detail.body));
  return detail.body.goal;
}

async function waitForSession(origin, token, predicate) {
  return waitFor(async () => {
    const listing = await api(origin, "/api/goals", { token });
    assert.equal(listing.response.status, 200, JSON.stringify(listing.body));
    for (const item of listing.body.goals) {
      const detail = await api(origin, `/api/goals/${item.goalId}`, { token });
      assert.equal(detail.response.status, 200, JSON.stringify(detail.body));
      if (predicate(detail.body.goal)) return detail.body.goal;
    }
    return undefined;
  }, "saved Goal state", 30_000);
}

async function waitForRunStatus(origin, token, goalRef, status) {
  return waitFor(async () => {
    const detail = await sessionDetail(origin, token, goalRef.goalId);
    const run = detail.runs.find((candidate) => candidate.runId === goalRef.runId);
    if (run?.status === status) return detail;
    if (run !== undefined && (run.status === "failed" || run.status === "cancelled")) {
      throw new Error(`Run ${goalRef.runId} ended as ${run.status}: ${JSON.stringify(run.terminalDetail ?? null)}`);
    }
    return undefined;
  }, `Run ${goalRef.runId} to reach ${status}`, 60_000);
}

async function readStatus(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function waitFor(callback, description, timeoutMs = 15_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await callback();
      if (result !== undefined && result !== false) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${description}${lastError === undefined ? "" : `: ${lastError}`}`);
}

async function waitForDevtools(profile, chrome) {
  const marker = join(profile, "DevToolsActivePort");
  return waitFor(async () => {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with status ${chrome.exitCode}`);
    try {
      const [port] = (await readFile(marker, "utf8")).trim().split("\n");
      return port ? { port } : undefined;
    } catch {
      return undefined;
    }
  }, "Chrome DevTools endpoint", 20_000);
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

async function connectCdp(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 0;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id === undefined) {
      for (const listener of listeners.get(message.method) ?? []) listener(message.params);
      return;
    }
    const entry = pending.get(message.id);
    if (entry === undefined) return;
    pending.delete(message.id);
    if (message.error !== undefined) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return {
    raw: socket,
    close() { socket.close(); },
    on(method, listener) {
      const registered = listeners.get(method) ?? [];
      registered.push(listener);
      listeners.set(method, registered);
    },
    send(method, params) {
      const id = ++nextId;
      const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method, params }));
      return promise;
    },
  };
}

function cdp(socket, method, params = {}) {
  return socket.send(method, params);
}

async function value(socket, expression) {
  const result = await cdp(socket, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return result.result?.value;
}

async function waitForExpression(socket, expression, timeout = 15_000) {
  await waitFor(async () => (await value(socket, `Boolean(${expression})`)) === true, `expression ${expression}`, timeout);
}

async function setText(socket, selector, text) {
  await cdp(socket, "Runtime.evaluate", {
    expression: `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (element === null) return false;
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(text)});
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`,
    returnByValue: true,
  });
}

async function navigate(socket, url) {
  await cdp(socket, "Page.navigate", { url });
}
