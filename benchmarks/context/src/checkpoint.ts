import { hashRuntimeFiles } from "../../src/runtime-files.js";
import { validateFilesystemArchive, type FilesystemArchive } from "../../src/filesystem-archive.js";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { JsonFileGoalStore } from "../../../packages/storage/src/index.js";
import { getCommittedRunBoundaries } from "../../../packages/runtime/src/index.js";
import { JsonFileBenchmarkPersistenceAdapter } from "../../src/file-persistence-adapter.js";
import type { WorkerIdentity } from "../../src/worker-builder.js";
import type { ContextScenario } from "./scenario.js";
import { hashTree, identity } from "./artifacts.js";
import type { ScriptBoundary } from "./script-driver.js";

/**
 * 静止边界检查点清单；文件目录由共享环境先回收，Snapshot 是恢复权威。
 * @remarks 清单只在 Worker 与新增子进程已停止且全部材料可验证后发布。
 * @example
 * ```ts
 * const checkpoint = await validateCheckpoint(directory, scenario, worker, imageId);
 * ```
 */
export interface ContextCheckpoint {
    readonly archive?: FilesystemArchive;
    readonly contract: "context-checkpoint";
    readonly afterStage: number;
    readonly boundary: ScriptBoundary;
    readonly scenarioHash: string;
    readonly worker: WorkerIdentity;
    readonly imageId: string;
    readonly files: Readonly<Record<string, string>>;
    readonly contentHash: string;
}
export async function validateRuntime(directory: string, boundary: ScriptBoundary, scenario: ContextScenario): Promise<void> {
    const base = join(directory, "state", Buffer.from("context").toString("base64url"), Buffer.from("session").toString("base64url"));
    const goal = await new JsonFileGoalStore(join(base, "goals")).restore(boundary.goalId);
    if (goal === undefined || goal.state.run.id !== boundary.runId || goal.state.run.status !== boundary.status ||
        goal.state.run.committedThroughSequence !== boundary.sequence || !["waiting", "failed", "completed", "cancelled"].includes(goal.state.run.status)) throw new Error("Checkpoint Snapshot boundary mismatch");
    if (identity(goal.definition.profile) !== identity(scenario.profile) || goal.definition.executionPolicy.maxSteps !== scenario.budget.maxSteps ||
        goal.definition.promptBundleVersion !== 1 || goal.definition.memoryProtocol.kind !== "structured" ||
        goal.definition.modelContextProtocol.kind !== "trajectory-layered" || goal.definition.contextRetrievalProtocol.kind !== "bm25-lite") throw new Error("Checkpoint Profile or protocol mismatch");
    if (goal.state.run.pendingAction !== undefined || (goal.state.run.status === "waiting" && !["blocked", "ask_user"].includes(boundary.waitingFor ?? ""))) throw new Error("Checkpoint has an unsafe pending operation or waiting type");
    const adapter = new JsonFileBenchmarkPersistenceAdapter({ rootDirectory: join(directory, "state"), namespaceFor: () => "session" });
    const bindings = await adapter.open({ benchmarkId: "context", namespace: "session", goalId: boundary.goalId, runId: boundary.runId });
    for (const source of getCommittedRunBoundaries(goal)) {
        const events = await bindings.trajectoryStore.readWithBoundary({ goalId: goal.id, runId: source.runId }, source.committedThroughSequence);
        if (source.committedThroughSequence > 0 && !events.committed.some(event => event.sequence === source.committedThroughSequence)) throw new Error("Checkpoint committed history missing");
        const inputs = await bindings.modelInputStore!.read(goal.id, source.runId);
        if (inputs.length === 0) throw new Error("Checkpoint model inputs missing");
    }
}
/** 发布检查点；调用方必须先完成进程静止检查，出错不写清单。 */
export async function publishCheckpoint(directory: string, scenario: ContextScenario, boundary: ScriptBoundary, worker: WorkerIdentity, imageId: string, archive?: FilesystemArchive): Promise<ContextCheckpoint> {
    if (scenario.kind === "source" && archive === undefined) throw new Error("Source checkpoint archive missing");
    if (archive) await validateFilesystemArchive(directory, archive);
    await validateRuntime(directory, boundary, scenario);
    const files = { ...Object.fromEntries(Object.entries(scenario.kind === "source" ? {} : await hashTree(join(directory, "project"))).map(([path, hash]) => ["project/" + path, hash])),
        ...Object.fromEntries(Object.entries(await hashRuntimeFiles(join(directory, "state"))).map(([path, hash]) => ["state/" + path, hash])) };
    const body = { contract: "context-checkpoint" as const, afterStage: scenario.checkpointAfter, boundary, scenarioHash: identity(scenario), worker, imageId, files, ...(archive ? { archive } : {}) };
    const checkpoint: ContextCheckpoint = { ...body, contentHash: identity(body) };
    await writeFile(join(directory, "checkpoint.json"), JSON.stringify(checkpoint, null, 2), { flag: "wx" });
    return checkpoint;
}
/** 在运行前校验冻结材料及当前 Worker/镜像，不重采集、不改写 Snapshot。 */
export async function validateCheckpoint(directory: string, scenario: ContextScenario, worker: WorkerIdentity, imageId: string): Promise<ContextCheckpoint> {
    const checkpoint: ContextCheckpoint = JSON.parse(await readFile(join(directory, "checkpoint.json"), "utf8"));
    const { contentHash, ...body } = checkpoint;
    if (checkpoint.contract !== "context-checkpoint" || identity(body) !== contentHash || checkpoint.scenarioHash !== identity(scenario) ||
        checkpoint.afterStage !== scenario.checkpointAfter || checkpoint.worker.acpProtocolVersion !== worker.acpProtocolVersion || checkpoint.worker.acpSdkVersion !== worker.acpSdkVersion || checkpoint.worker.platform !== worker.platform || checkpoint.worker.nodeVersion !== worker.nodeVersion || checkpoint.worker.nodeImageId !== worker.nodeImageId || checkpoint.imageId !== imageId) throw new Error("Checkpoint content/build/image mismatch");
    if (scenario.kind === "source") {
        if (!checkpoint.archive || identity(checkpoint.worker) !== identity(worker)) throw new Error("Source checkpoint build/archive mismatch");
        await validateFilesystemArchive(directory, checkpoint.archive);
    }
    const actualFiles = { ...Object.fromEntries(Object.entries(scenario.kind === "source" ? {} : await hashTree(join(directory, "project"))).map(([path, hash]) => ["project/" + path, hash])),
        ...Object.fromEntries(Object.entries(await hashRuntimeFiles(join(directory, "state"))).map(([path, hash]) => ["state/" + path, hash])) };
    if (identity(actualFiles) !== identity(checkpoint.files)) throw new Error("Checkpoint files corrupted");
    await validateRuntime(directory, checkpoint.boundary, scenario);
    return checkpoint;
}
