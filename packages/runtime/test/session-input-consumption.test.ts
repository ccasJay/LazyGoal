import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    SessionManager,
    TrajectoryCheckpointCommitter,
    type AgentProfileRegistry,
    type Goal,
    type GoalCoordinator,
    type GoalStore,
    type SessionInput,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const profiles: AgentProfileRegistry = { get: () => undefined };

const coordinator = {
    advance: async () => undefined,
    continue: async () => undefined,
    steer: async () => undefined,
    interrupt: async () => undefined,
    resume: async () => undefined,
    resumeForSession: async () => undefined,
    scheduleAuthorizedAction: async () => undefined,
    reviewActionApproval: async () => undefined,
} as unknown as Pick<
    GoalCoordinator,
    | "advance"
    | "continue"
    | "steer"
    | "interrupt"
    | "resume"
    | "resumeForSession"
    | "scheduleAuthorizedAction"
    | "reviewActionApproval"
>;

interface FailureReport {
    readonly goalId: string;
    readonly message: string;
}

/** 可注入一次保存失败的 Store 包装；其余调用委托原 Store。 */
class FailingSaveStore implements GoalStore {
    failNextSave = false;

    constructor(private readonly inner: InMemoryGoalStore) {}

    save(goal: Goal): Promise<void> {
        if (this.failNextSave) {
            this.failNextSave = false;
            return Promise.reject(new Error("injected admission save failure"));
        }
        return this.inner.save(goal);
    }

    restore(goalId: string): Promise<Goal | undefined> {
        return this.inner.restore(goalId);
    }

    readRevision(goalId: string): Promise<number | undefined> {
        return this.inner.readRevision(goalId);
    }
}

function goalFor(goalId: string): Goal {
    return createGoal({
        ...currentProtocols,
        id: goalId,
        runId: `${goalId}-run`,
        intent: "消费宿主输入",
        promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
    });
}

function createManager(store: GoalStore, failures: FailureReport[]): SessionManager {
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: trajectoryStoreFor(store) });
    return new SessionManager({
        store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: () => "run-consumption-1",
        onBackgroundFailure: (goalId, error) => {
            failures.push({ goalId, message: error instanceof Error ? error.message : String(error) });
        },
    });
}

type IteratorOverrides = {
    readonly next?: () => Promise<IteratorResult<SessionInput>>;
    readonly onReturn?: () => Promise<IteratorResult<SessionInput>>;
};

function inputSource(overrides: IteratorOverrides): AsyncIterable<SessionInput> {
    return {
        [Symbol.asyncIterator]: () => ({
            next: overrides.next ?? (() => new Promise<IteratorResult<SessionInput>>(() => undefined)),
            return: overrides.onReturn ?? (async () => ({ done: true, value: undefined })),
        }),
    };
}

function never(): Promise<IteratorResult<SessionInput>> {
    return new Promise<IteratorResult<SessionInput>>(() => undefined);
}

test("停止消费时至多请求一次来源清理，并观察同步抛错", async () => {
    const store = new FailingSaveStore(new InMemoryGoalStore());
    const goal = goalFor("goal-stop-cleanup");
    await store.save(goal);
    const failures: FailureReport[] = [];
    const sessions = createManager(store, failures);

    let returnCalls = 0;
    const consuming = sessions.consumeSessionInputs(goal.id, "session-stop", inputSource({
        onReturn: () => {
            returnCalls += 1;
            throw new Error("return failed synchronously");
        },
    }));
    await new Promise((resolve) => setImmediate(resolve));
    sessions.detachSession("session-stop");

    const result = await consuming;
    assert.equal(result.reason, "stopped");
    assert.equal(returnCalls, 1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.goalId, goal.id);
    assert.match(failures[0]?.message ?? "", /input_source_cleanup:stopped/u);
    assert.match(failures[0]?.message ?? "", /return failed synchronously/u);
    await sessions.close();
});

test("来源清理的异步拒绝通过后台诊断报告，不拖住消费结算", async () => {
    const store = new FailingSaveStore(new InMemoryGoalStore());
    const goal = goalFor("goal-cleanup-reject");
    await store.save(goal);
    const failures: FailureReport[] = [];
    const sessions = createManager(store, failures);

    let returnCalls = 0;
    const consuming = sessions.consumeSessionInputs(goal.id, "session-reject", inputSource({
        onReturn: async () => {
            returnCalls += 1;
            throw new Error("return rejected asynchronously");
        },
    }));
    await new Promise((resolve) => setImmediate(resolve));
    sessions.detachSession("session-reject");

    assert.equal((await consuming).reason, "stopped");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(returnCalls, 1);
    assert.match(failures.at(-1)?.message ?? "", /input_source_cleanup:stopped/u);
    assert.match(failures.at(-1)?.message ?? "", /return rejected asynchronously/u);
    await sessions.close();
});

test("挂起的来源清理不阻塞消费结算，迟到输入不被受理", async () => {
    const store = new FailingSaveStore(new InMemoryGoalStore());
    const goal = goalFor("goal-cleanup-pending");
    await store.save(goal);
    const failures: FailureReport[] = [];
    const sessions = createManager(store, failures);

    let resolveNext: ((result: IteratorResult<SessionInput>) => void) | undefined;
    let returnCalls = 0;
    const consuming = sessions.consumeSessionInputs(goal.id, "session-pending", inputSource({
        next: () => new Promise<IteratorResult<SessionInput>>((resolve) => { resolveNext = resolve; }),
        onReturn: () => {
            returnCalls += 1;
            return never();
        },
    }));
    await new Promise((resolve) => setImmediate(resolve));
    sessions.detachSession("session-pending");

    const result = await Promise.race([
        consuming,
        new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 1_000)),
    ]);
    assert.notEqual(result, "timeout");
    assert.equal(result !== "timeout" && result.reason, "stopped");
    assert.equal(returnCalls, 1);

    // 停止后迟到的输入不会被受理，也没有持久收据。
    resolveNext?.({ done: false, value: { kind: "message", inputId: "late-input", content: "迟到输入" } });
    await new Promise((resolve) => setImmediate(resolve));
    const queried = await sessions.querySessionInput(goal.id, "late-input");
    assert.equal(queried.ok && queried.found, false);
    assert.equal(failures.length, 0);
    await sessions.close();
});

test("受理失败仍是主错误，来源清理故障单独诊断", async () => {
    const store = new FailingSaveStore(new InMemoryGoalStore());
    const goal = goalFor("goal-admission-failure");
    await store.save(goal);
    const failures: FailureReport[] = [];
    const sessions = createManager(store, failures);

    let returnCalls = 0;
    store.failNextSave = true;
    const result = await sessions.consumeSessionInputs(goal.id, "session-failure", inputSource({
        next: async () => ({
            done: false,
            value: { kind: "message", inputId: "input-failing", content: "触发受理失败" },
        }),
        onReturn: async () => {
            returnCalls += 1;
            throw new Error("cleanup also failed");
        },
    }));

    assert.equal(result.reason, "failed");
    assert.equal(result.reason === "failed" ? (result.error as Error).message : "", "injected admission save failure");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(returnCalls, 1);
    assert.match(failures.at(-1)?.message ?? "", /input_source_cleanup:admission_failed/u);
    assert.match(failures.at(-1)?.message ?? "", /cleanup also failed/u);
    await sessions.close();
});
