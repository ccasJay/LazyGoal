import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    createGoal,
    Runner,
    transition,
    type AgentDecision,
    type AgentProfile,
    type StepExecutionInput,
} from "../src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
} from "../../tool-core/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { JsonFileProcessSessionStore } from "../../storage/src/index";
import {
    BashTool,
    GitAddTool,
    GIT_ADD_TOOL_ID,
    GitWorktreeAddTool,
    GIT_WORKTREE_ADD_TOOL_ID,
    GitWorktreeRemoveTool,
    GIT_WORKTREE_REMOVE_TOOL_ID,
    ProcessManager,
    ProcessReadTool,
    ProcessStartTool,
    type ProcessReadOutput,
    type ProcessStartOutput,
} from "../../tools/src/index";
import {
    discoverGitRepository,
    isSeatbeltSupported,
    type SandboxExecutionPlan,
} from "../../sandbox/src/index";
import { BaseTestStepExecutor, currentProtocols, trajectoryStoreFor } from "./current-fixtures";

function runGit(cwd: string, args: readonly string[]): string {
    return execFileSync("git", [...args], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

class GitAuthorizationExecutor extends BaseTestStepExecutor {
    private index = 0;

    async execute(_input: StepExecutionInput): Promise<AgentDecision> {
        this.index += 1;
        if (this.index === 1) {
            return { kind: "tool_discovery", query: "git add" };
        }
        if (this.index === 2) {
            return {
                kind: "tool_call",
                action: {
                    actionId: "act-git-add-1",
                    toolId: GIT_ADD_TOOL_ID,
                    input: { paths: ["staged.txt"] },
                },
            };
        }
        return { kind: "complete", summary: "Git authorization verified", evidenceSequences: [] };
    }

}

class WorktreeAuthorizationExecutor extends BaseTestStepExecutor {
    private index = 0;

    constructor(private readonly action: AgentDecision) {
        super();
    }

    async execute(_input: StepExecutionInput): Promise<AgentDecision> {
        this.index += 1;
        if (this.index === 1) return { kind: "tool_discovery", query: "git worktree" };
        return this.index === 2
            ? structuredClone(this.action)
            : { kind: "complete", summary: "Worktree authorization verified", evidenceSequences: [] };
    }
}

const profile: AgentProfile = {
    id: "git-sandbox-authorization",
    systemPrompt: "Test Git sandbox authorization.",
    instructions: [],
    toolIds: [GIT_ADD_TOOL_ID],
};

test("真实 Runtime 与 Seatbelt：YOLO 下 Git 元数据需审批，批准范围只授予 Git Tool", {
    skip: process.platform !== "darwin" || !isSeatbeltSupported(),
}, async () => {
    assert.equal(process.platform, "darwin", "This acceptance check requires the macOS Seatbelt kernel.");
    assert.ok(isSeatbeltSupported(), "This acceptance check requires /usr/bin/sandbox-exec.");

    const tempRoot = await mkdtemp(join(tmpdir(), "lg-git-seatbelt-"));
    const workspaceRoot = join(tempRoot, "workspace");
    const commonDir = join(tempRoot, "git-metadata");
    const processDataRoot = join(tempRoot, "process-data");
    let processManager: ProcessManager | undefined;

    try {
        runGit(tempRoot, ["init", "--separate-git-dir", commonDir, "-b", "main", workspaceRoot]);
        runGit(workspaceRoot, ["config", "user.name", "Sandbox Tester"]);
        runGit(workspaceRoot, ["config", "user.email", "sandbox@example.invalid"]);
        await writeFile(join(workspaceRoot, "README.md"), "base commit\n", "utf8");
        runGit(workspaceRoot, ["add", "README.md"]);
        runGit(workspaceRoot, ["commit", "-m", "initial"]);
        await writeFile(join(workspaceRoot, "staged.txt"), "authorized by Git only\n", "utf8");

        const canonicalWorkspace = await realpath(workspaceRoot);
        await mkdir(join(tempRoot, "worktrees"));
        const canonicalWorktreeParent = await realpath(join(tempRoot, "worktrees"));
        const repoInfo = await discoverGitRepository(canonicalWorkspace);
        assert.equal(repoInfo.isWorktree, true);
        assert.equal(repoInfo.commonDir, await realpath(commonDir));
        assert.equal(repoInfo.gitDir, repoInfo.commonDir);
        const indexPath = runGit(canonicalWorkspace, ["rev-parse", "--git-path", "index"]).trim();
        const canonicalIndexPath = indexPath.startsWith("/") ? indexPath : join(canonicalWorkspace, indexPath);
        const indexBefore = await readFile(canonicalIndexPath).catch(() => undefined);
        const refsBefore = runGit(canonicalWorkspace, ["for-each-ref", "--format=%(refname) %(objectname)"]);
        const worktreesBefore = runGit(canonicalWorkspace, ["worktree", "list", "--porcelain"]);

        const store = new InMemoryGoalStore();
        const tool = new GitAddTool(canonicalWorkspace);
        const registry = new InMemoryToolRegistry([createToolRegistration(tool)]);
        const runner = new Runner({
            store,
            trajectoryStore: trajectoryStoreFor(store),
            executor: new GitAuthorizationExecutor(),
            toolRegistry: registry,
            toolPolicy: { evaluate: () => "allow" },
            workspaceRoot: canonicalWorkspace,
            workspaceId: "ws-git-sandbox",
            permissionModeStore: {
                async get(workspaceId: string) {
                    return { workspaceId, mode: "yolo" as const, revision: 1 };
                },
                async set(workspaceId: string, mode: "default" | "yolo", expectedRevision: number) {
                    return { workspaceId, mode, revision: expectedRevision + 1 };
                },
            },
            sandboxPlanResolver: async ({ workspaceRoot, action, effectiveScope }) => effectiveScope === undefined
                ? undefined
                : {
                    actionId: action.actionId,
                    workspaceRoot,
                    scope: effectiveScope,
                },
        });

        const goal = createGoal({
            ...currentProtocols,
            id: "goal-git-sandbox",
            intent: "Stage one file under an explicitly approved Git metadata scope",
            promptBundleVersion: 1,
            profile,
            runId: "run-git-sandbox",
        });
        await store.save(goal);
        await runner.run({ goalId: goal.id, runId: goal.state.run.id });

        const waitingGoal = await store.restore(goal.id);
        assert.ok(waitingGoal);
        const pending = waitingGoal.state.run.pendingAction;
        assert.equal(waitingGoal.state.run.status, "waiting");
        assert.equal(pending?.status, "awaiting_approval");
        assert.equal(pending?.approvalKind, "sandbox");
        const scope = pending?.effectiveSandboxScope;
        assert.ok(scope);
        assert.ok(scope.extraFiles.some((entry) => entry.canonicalPath === repoInfo.gitDir && entry.access === "write"));
        assert.ok(scope.extraFiles.some((entry) => entry.canonicalPath === repoInfo.commonDir && entry.access === "write"));
        assert.ok(scope.extraFiles.some((entry) => entry.canonicalPath === repoInfo.dotGitPath && entry.access === "read"));
        assert.deepEqual(await readFile(canonicalIndexPath).catch(() => undefined), indexBefore);
        assert.equal(runGit(canonicalWorkspace, ["for-each-ref", "--format=%(refname) %(objectname)"]), refsBefore);
        assert.equal(runGit(canonicalWorkspace, ["worktree", "list", "--porcelain"]), worktreesBefore);

        const broadenedPlan: SandboxExecutionPlan = {
            actionId: "act-git-add-1",
            workspaceRoot: canonicalWorkspace,
            scope: {
                ...scope,
                extraFiles: [
                    ...scope.extraFiles,
                    {
                        canonicalPath: join(tempRoot, "unapproved-extra"),
                        access: "write",
                        kind: "directory_tree",
                    },
                ],
            },
        };
        const mismatchedPlanResult = await tool.execute({
            actionId: "act-git-add-1",
            plan: broadenedPlan,
            input: { paths: ["staged.txt"] },
        });
        assert.equal(mismatchedPlanResult.kind, "failure");
        assert.equal(mismatchedPlanResult.code, "SANDBOX_APPROVAL_REQUIRED");
        assert.deepEqual(await readFile(canonicalIndexPath).catch(() => undefined), indexBefore);

        const wrongKindPlan: SandboxExecutionPlan = {
            actionId: "act-git-add-1",
            workspaceRoot: canonicalWorkspace,
            scope: {
                ...scope,
                extraFiles: scope.extraFiles.map((entry) => entry.canonicalPath === repoInfo.gitDir && entry.access === "write"
                    ? { ...entry, kind: "file" as const }
                    : entry),
            },
        };
        const wrongKindResult = await tool.execute({
            actionId: "act-git-add-1",
            plan: wrongKindPlan,
            input: { paths: ["staged.txt"] },
        });
        assert.equal(wrongKindResult.kind, "failure");
        assert.equal(wrongKindResult.code, "SANDBOX_APPROVAL_REQUIRED");
        assert.deepEqual(await readFile(canonicalIndexPath).catch(() => undefined), indexBefore);

        const approvedRun = transition(waitingGoal.state.run, {
            kind: "approve_action",
            actionId: "act-git-add-1",
            approvalScope: "action",
        });
        assert.equal(approvedRun.ok, true);
        if (!approvedRun.ok) return;
        await store.save({
            ...waitingGoal,
            state: { ...waitingGoal.state, run: approvedRun.state },
        });
        await runner.run(
            { goalId: goal.id, runId: goal.state.run.id },
            { authorizedActionId: "act-git-add-1" },
        );

        const gitObservations = trajectoryStoreFor(store).events.flatMap((event) =>
            event.payload.type === "tool_finished" ? [event.payload.observation] : []);
        assert.equal(gitObservations.at(-1)?.kind, "success", JSON.stringify(gitObservations));
        assert.deepEqual(runGit(canonicalWorkspace, ["ls-files"]), "README.md\nstaged.txt\n");
        assert.notDeepEqual(await readFile(canonicalIndexPath), indexBefore);

        const approvedPlan: SandboxExecutionPlan = {
            actionId: "act-git-add-1",
            workspaceRoot: canonicalWorkspace,
            scope,
        };
        const indexAfterGit = await readFile(canonicalIndexPath);
        const bashResult = await new BashTool(canonicalWorkspace).execute({
            actionId: "act-git-add-1",
            plan: approvedPlan,
            input: { command: `printf bypass >> '${canonicalIndexPath}'` },
        });
        assert.equal(bashResult.kind, "failure");
        assert.deepEqual(await readFile(canonicalIndexPath), indexAfterGit);

        runGit(canonicalWorkspace, ["branch", "feature/sandbox-test"]);
        const targetWorktree = join(canonicalWorktreeParent, "approved-worktree");
        const worktreeStore = new InMemoryGoalStore();
        const worktreeTool = new GitWorktreeAddTool(canonicalWorkspace);
        const worktreeRunner = new Runner({
            store: worktreeStore,
            trajectoryStore: trajectoryStoreFor(worktreeStore),
            executor: new WorktreeAuthorizationExecutor({
                kind: "tool_call",
                action: {
                    actionId: "act-worktree-add-1",
                    toolId: GIT_WORKTREE_ADD_TOOL_ID,
                    input: { path: targetWorktree, branch: "feature/sandbox-test" },
                },
            }),
            toolRegistry: new InMemoryToolRegistry([createToolRegistration(worktreeTool)]),
            toolPolicy: { evaluate: () => "allow" },
            workspaceRoot: canonicalWorkspace,
            workspaceId: "ws-git-worktree",
            permissionModeStore: {
                async get(workspaceId: string) {
                    return { workspaceId, mode: "yolo" as const, revision: 1 };
                },
                async set(workspaceId: string, mode: "default" | "yolo", expectedRevision: number) {
                    return { workspaceId, mode, revision: expectedRevision + 1 };
                },
            },
            sandboxPlanResolver: async ({ workspaceRoot, action, effectiveScope }) => effectiveScope === undefined
                ? undefined
                : { actionId: action.actionId, workspaceRoot, scope: effectiveScope },
        });
        const addWorktreeGoal = createGoal({
            ...currentProtocols,
            id: "goal-git-worktree-add",
            intent: "Create an approved external Git worktree",
            promptBundleVersion: 1,
            profile: { ...profile, id: "git-worktree-add", toolIds: [GIT_WORKTREE_ADD_TOOL_ID] },
            runId: "run-git-worktree-add",
        });
        await worktreeStore.save(addWorktreeGoal);
        const worktreesBeforeAdd = runGit(canonicalWorkspace, ["worktree", "list", "--porcelain"]);
        await worktreeRunner.run({ goalId: addWorktreeGoal.id, runId: addWorktreeGoal.state.run.id });
        const waitingAddGoal = await worktreeStore.restore(addWorktreeGoal.id);
        assert.ok(waitingAddGoal);
        const addPending = waitingAddGoal.state.run.pendingAction;
        assert.equal(addPending?.approvalKind, "sandbox");
        assert.ok(!existsSync(targetWorktree));
        assert.equal(runGit(canonicalWorkspace, ["worktree", "list", "--porcelain"]), worktreesBeforeAdd);
        const addScope = addPending?.effectiveSandboxScope;
        assert.ok(addScope);
        assert.ok(addScope.extraFiles.some((entry) => entry.canonicalPath === repoInfo.commonDir && entry.access === "write"));
        assert.ok(addScope.extraFiles.some((entry) => entry.canonicalPath === canonicalWorktreeParent && entry.access === "write" && entry.kind === "directory_tree"));
        assert.ok(addScope.extraFiles.some((entry) => entry.canonicalPath === targetWorktree && entry.access === "write" && entry.kind === "directory_tree"));

        const approvedAddRun = transition(waitingAddGoal.state.run, {
            kind: "approve_action",
            actionId: "act-worktree-add-1",
            approvalScope: "action",
        });
        assert.equal(approvedAddRun.ok, true);
        if (!approvedAddRun.ok) return;
        await worktreeStore.save({
            ...waitingAddGoal,
            state: { ...waitingAddGoal.state, run: approvedAddRun.state },
        });
        await worktreeRunner.run(
            { goalId: addWorktreeGoal.id, runId: addWorktreeGoal.state.run.id },
            { authorizedActionId: "act-worktree-add-1" },
        );
        assert.equal(await realpath(targetWorktree), targetWorktree);

        const removeTool = new GitWorktreeRemoveTool(canonicalWorkspace);
        const removeAccess = await removeTool.resolveSandboxAccess({ path: targetWorktree });
        assert.ok(removeAccess?.files?.some((entry) => entry.path === repoInfo.commonDir && entry.access === "write"));
        assert.ok(removeAccess?.files?.some((entry) => entry.path === canonicalWorktreeParent && entry.access === "write"));
        assert.ok(removeAccess?.files?.some((entry) => entry.path === targetWorktree && entry.access === "write"));

        const removeStore = new InMemoryGoalStore();
        const removeRunner = new Runner({
            store: removeStore,
            trajectoryStore: trajectoryStoreFor(removeStore),
            executor: new WorktreeAuthorizationExecutor({
                kind: "tool_call",
                action: {
                    actionId: "act-worktree-remove-1",
                    toolId: GIT_WORKTREE_REMOVE_TOOL_ID,
                    input: { path: targetWorktree },
                },
            }),
            toolRegistry: new InMemoryToolRegistry([createToolRegistration(removeTool)]),
            toolPolicy: { evaluate: () => "allow" },
            workspaceRoot: canonicalWorkspace,
            workspaceId: "ws-git-worktree-remove",
            permissionModeStore: {
                async get(workspaceId: string) {
                    return { workspaceId, mode: "yolo" as const, revision: 1 };
                },
                async set(workspaceId: string, mode: "default" | "yolo", expectedRevision: number) {
                    return { workspaceId, mode, revision: expectedRevision + 1 };
                },
            },
            sandboxPlanResolver: async ({ workspaceRoot, action, effectiveScope }) => effectiveScope === undefined
                ? undefined
                : { actionId: action.actionId, workspaceRoot, scope: effectiveScope },
        });
        const removeWorktreeGoal = createGoal({
            ...currentProtocols,
            id: "goal-git-worktree-remove",
            intent: "Remove an approved clean Git worktree",
            promptBundleVersion: 1,
            profile: { ...profile, id: "git-worktree-remove", toolIds: [GIT_WORKTREE_REMOVE_TOOL_ID] },
            runId: "run-git-worktree-remove",
        });
        await removeStore.save(removeWorktreeGoal);
        const worktreesBeforeRemove = runGit(canonicalWorkspace, ["worktree", "list", "--porcelain"]);
        await removeRunner.run({ goalId: removeWorktreeGoal.id, runId: removeWorktreeGoal.state.run.id });
        const waitingRemoveGoal = await removeStore.restore(removeWorktreeGoal.id);
        assert.ok(waitingRemoveGoal);
        const removePending = waitingRemoveGoal.state.run.pendingAction;
        assert.equal(removePending?.approvalKind, "sandbox");
        assert.ok(existsSync(targetWorktree));
        assert.equal(runGit(canonicalWorkspace, ["worktree", "list", "--porcelain"]), worktreesBeforeRemove);
        const removeScope = removePending?.effectiveSandboxScope;
        assert.ok(removeScope);
        assert.ok(removeScope.extraFiles.some((entry) => entry.canonicalPath === repoInfo.commonDir && entry.access === "write"));
        assert.ok(removeScope.extraFiles.some((entry) => entry.canonicalPath === canonicalWorktreeParent && entry.access === "write" && entry.kind === "directory_tree"));
        assert.ok(removeScope.extraFiles.some((entry) => entry.canonicalPath === targetWorktree && entry.access === "write" && entry.kind === "directory_tree"));

        const approvedRemoveRun = transition(waitingRemoveGoal.state.run, {
            kind: "approve_action",
            actionId: "act-worktree-remove-1",
            approvalScope: "action",
        });
        assert.equal(approvedRemoveRun.ok, true);
        if (!approvedRemoveRun.ok) return;
        await removeStore.save({
            ...waitingRemoveGoal,
            state: { ...waitingRemoveGoal.state, run: approvedRemoveRun.state },
        });
        await removeRunner.run(
            { goalId: removeWorktreeGoal.id, runId: removeWorktreeGoal.state.run.id },
            { authorizedActionId: "act-worktree-remove-1" },
        );
        assert.ok(!existsSync(targetWorktree));

        const processStore = new JsonFileProcessSessionStore(processDataRoot, "host-git-sandbox");
        processManager = new ProcessManager({ store: processStore, hostInstanceId: "host-git-sandbox" });
        const processContext = { goalId: goal.id, runId: goal.state.run.id };
        const processStarted = await new ProcessStartTool(canonicalWorkspace, processManager).execute({
            actionId: "act-git-add-1",
            context: processContext,
            plan: approvedPlan,
            input: { command: `printf bypass >> '${canonicalIndexPath}'` },
        });
        assert.equal(processStarted.kind, "success");
        if (processStarted.kind !== "success") return;
        const processId = (processStarted.output as unknown as ProcessStartOutput).processId;
        const processRead = await new ProcessReadTool(processManager, processStore).execute({
            actionId: "act-process-read",
            context: processContext,
            input: { processId, waitMs: 1000, maxChars: 2000 },
        });
        assert.equal(processRead.kind, "success");
        if (processRead.kind === "success") {
            const output = processRead.output as unknown as ProcessReadOutput;
            assert.match(output.stderr.text, /Operation not permitted|Permission denied/i);
        }
        assert.deepEqual(await readFile(canonicalIndexPath), indexAfterGit);
    } finally {
        await processManager?.close();
        await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});

test("真实 Seatbelt：linked worktree 的 Git 授权不能被 Bash 或受管进程复用", {
    skip: process.platform !== "darwin" || !isSeatbeltSupported(),
}, async () => {
    assert.equal(process.platform, "darwin", "This acceptance check requires the macOS Seatbelt kernel.");
    assert.ok(isSeatbeltSupported(), "This acceptance check requires /usr/bin/sandbox-exec.");

    const tempRoot = await mkdtemp(join(tmpdir(), "lg-linked-git-seatbelt-"));
    const mainWorkspace = join(tempRoot, "main");
    const linkedWorkspace = join(tempRoot, "linked");
    const processDataRoot = join(tempRoot, "process-data");
    let processManager: ProcessManager | undefined;

    try {
        await mkdir(mainWorkspace);
        runGit(mainWorkspace, ["init", "-b", "main"]);
        runGit(mainWorkspace, ["config", "user.name", "Sandbox Tester"]);
        runGit(mainWorkspace, ["config", "user.email", "sandbox@example.invalid"]);
        await writeFile(join(mainWorkspace, "README.md"), "base commit\n", "utf8");
        runGit(mainWorkspace, ["add", "README.md"]);
        runGit(mainWorkspace, ["commit", "-m", "initial"]);
        runGit(mainWorkspace, ["branch", "feature/linked-security"]);
        runGit(mainWorkspace, ["worktree", "add", linkedWorkspace, "feature/linked-security"]);
        await writeFile(join(linkedWorkspace, "linked-staged.txt"), "Git may write the shared object store\n", "utf8");

        const canonicalWorkspace = await realpath(linkedWorkspace);
        const repoInfo = await discoverGitRepository(canonicalWorkspace);
        assert.equal(repoInfo.isWorktree, true);
        assert.notEqual(repoInfo.gitDir, repoInfo.commonDir);
        const rawIndexPath = runGit(canonicalWorkspace, ["rev-parse", "--git-path", "index"]).trim();
        const indexPath = rawIndexPath.startsWith("/") ? rawIndexPath : join(canonicalWorkspace, rawIndexPath);
        const indexBefore = await readFile(indexPath);

        const action = {
            kind: "tool_call" as const,
            action: {
                actionId: "act-linked-git-add",
                toolId: GIT_ADD_TOOL_ID,
                input: { paths: ["linked-staged.txt"] },
            },
        };
        const store = new InMemoryGoalStore();
        const tool = new GitAddTool(canonicalWorkspace);
        const runner = new Runner({
            store,
            trajectoryStore: trajectoryStoreFor(store),
            executor: new WorktreeAuthorizationExecutor(action),
            toolRegistry: new InMemoryToolRegistry([createToolRegistration(tool)]),
            toolPolicy: { evaluate: () => "allow" },
            workspaceRoot: canonicalWorkspace,
            workspaceId: "ws-linked-git-sandbox",
            permissionModeStore: {
                async get(workspaceId: string) {
                    return { workspaceId, mode: "yolo" as const, revision: 1 };
                },
                async set(workspaceId: string, mode: "default" | "yolo", expectedRevision: number) {
                    return { workspaceId, mode, revision: expectedRevision + 1 };
                },
            },
            sandboxPlanResolver: async ({ workspaceRoot, action: approvedAction, effectiveScope }) => effectiveScope === undefined
                ? undefined
                : { actionId: approvedAction.actionId, workspaceRoot, scope: effectiveScope },
        });
        const goal = createGoal({
            ...currentProtocols,
            id: "goal-linked-git-sandbox",
            intent: "Stage a file from an approved linked worktree",
            promptBundleVersion: 1,
            profile,
            runId: "run-linked-git-sandbox",
        });
        await store.save(goal);
        await runner.run({ goalId: goal.id, runId: goal.state.run.id });

        const waitingGoal = await store.restore(goal.id);
        assert.ok(waitingGoal);
        const pending = waitingGoal.state.run.pendingAction;
        assert.equal(waitingGoal.state.run.status, "waiting");
        assert.equal(pending?.approvalKind, "sandbox");
        const scope = pending?.effectiveSandboxScope;
        assert.ok(scope);
        assert.ok(scope.extraFiles.some((entry) => entry.canonicalPath === repoInfo.gitDir && entry.access === "write"));
        assert.ok(scope.extraFiles.some((entry) => entry.canonicalPath === repoInfo.commonDir && entry.access === "write"));
        assert.deepEqual(await readFile(indexPath), indexBefore);

        const approvedRun = transition(waitingGoal.state.run, {
            kind: "approve_action",
            actionId: "act-linked-git-add",
            approvalScope: "action",
        });
        assert.equal(approvedRun.ok, true);
        if (!approvedRun.ok) return;
        await store.save({ ...waitingGoal, state: { ...waitingGoal.state, run: approvedRun.state } });
        await runner.run(
            { goalId: goal.id, runId: goal.state.run.id },
            { authorizedActionId: "act-linked-git-add" },
        );
        const gitObservations = trajectoryStoreFor(store).events.flatMap((event) =>
            event.payload.type === "tool_finished" ? [event.payload.observation] : []);
        assert.equal(gitObservations.at(-1)?.kind, "success", JSON.stringify(gitObservations));
        assert.match(runGit(canonicalWorkspace, ["ls-files"]), /linked-staged\.txt/);
        const indexAfterGit = await readFile(indexPath);
        assert.notDeepEqual(indexAfterGit, indexBefore);

        const approvedPlan: SandboxExecutionPlan = {
            actionId: "act-linked-git-add",
            workspaceRoot: canonicalWorkspace,
            scope,
        };
        const sharedProbe = join(repoInfo.commonDir, "lazygoal-unauthorized-write-probe");
        const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
        const bashResult = await new BashTool(canonicalWorkspace).execute({
            actionId: "act-linked-git-add",
            plan: approvedPlan,
            input: { command: `printf bypass > ${shellQuote(sharedProbe)}` },
        });
        assert.equal(bashResult.kind, "failure");
        assert.ok(!existsSync(sharedProbe));

        const processStore = new JsonFileProcessSessionStore(processDataRoot, "host-linked-git-sandbox");
        processManager = new ProcessManager({ store: processStore, hostInstanceId: "host-linked-git-sandbox" });
        const processStarted = await new ProcessStartTool(canonicalWorkspace, processManager).execute({
            actionId: "act-linked-git-add",
            context: { goalId: goal.id, runId: goal.state.run.id },
            plan: approvedPlan,
            input: { command: `printf bypass > ${shellQuote(sharedProbe)}` },
        });
        assert.equal(processStarted.kind, "success");
        if (processStarted.kind !== "success") return;
        const processId = (processStarted.output as unknown as ProcessStartOutput).processId;
        const processRead = await new ProcessReadTool(processManager, processStore).execute({
            actionId: "act-linked-process-read",
            context: { goalId: goal.id, runId: goal.state.run.id },
            input: { processId, waitMs: 1000, maxChars: 2000 },
        });
        assert.equal(processRead.kind, "success");
        if (processRead.kind === "success") {
            const output = processRead.output as unknown as ProcessReadOutput;
            assert.match(output.stderr.text, /Operation not permitted|Permission denied/i);
        }
        assert.ok(!existsSync(sharedProbe));
        assert.deepEqual(await readFile(indexPath), indexAfterGit);
    } finally {
        await processManager?.close();
        await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
});
