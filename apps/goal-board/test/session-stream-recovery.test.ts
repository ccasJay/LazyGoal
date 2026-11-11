import assert from "node:assert/strict";
import { test } from "node:test";
test("释放观察只回收浏览器本地资源，不中断宿主执行", async () => {
  const { releaseObservation } = await import("../src/session-stream-recovery");

  const release = releaseObservation();
  assert.equal(release.abortLocalReads, true);
  assert.equal(release.cancelPendingFrames, true);
  assert.equal(release.detachSubscription, true);
  assert.equal(release.sendInterrupt, false);
  assert.equal(release.revokeAcceptedInputs, false);
  assert.equal(release.closeHostRuntime, false);
});
