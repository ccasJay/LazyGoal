import { readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { hashRuntimeFiles } from "../../src/runtime-files.js";
import { mkdir, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { parseSourceTask, type BenchmarkTaskSource, type SourceTaskPackage, type TaskGrade } from "../../src/task-source.js";
import { identity, digest } from "../../src/content-identity.js";
import { loadFilesystemArchive } from "../../src/filesystem-archive.js";
import { requireSuccess, runProcess, type ProcessRunner } from "../../src/process.js";
import { parseSwebenchManifest, SWEBENCH_VERSION } from "./manifest.js";
import { parseSwebenchTasks } from "./container.js";
import { BRIDGE_PATH, preflightSwebench } from "./evaluation.js";
import { exportSwebenchPatch } from "./environment-spec.js";
import { SWE_ACP_PROFILE } from "./worker-runtime.js";
import { SWE_ACP_TESTBED_ENV } from "./worker-config.js";

const SOURCE_BUILD = Object.freeze({
    sourceDigest: identity(readdirSync(new URL("./", import.meta.url)).filter(name => name.endsWith(".ts")).sort().map(name => [name, digest(readFileSync(new URL(name, import.meta.url)))])),
    bridgeDigest: digest(readFileSync(BRIDGE_PATH)),
});

/**
 * SWE 来源适配器的宿主依赖；私有目录永不进入容器。
 * @example
 * ```ts
 * const source = createSwebenchContextSource({ privateDirectory, python: "python3" });
 * ```
 */
export interface SwebenchContextSourceOptions {
    readonly privateDirectory: string;
    readonly python: string;
    /** 测试用进程替身必须显式注入；生产始终执行官方 bridge。 */
    readonly run?: ProcessRunner;
}
export { parseSourceTask } from "../../src/task-source.js";
/**
 * 任务、环境与官方评分的 SWE 实现；Context 只通过共享端口使用它。
 * @remarks 导入产生公开任务和独立私有评分包；复用时校验双方内容，不自动刷新数据。
 * @example
 * ```ts
 * const source = createSwebenchContextSource({ privateDirectory, python: "python3" });
 * const tasks = await source.importTasks(manifestPath, output);
 * ```
 */
export function createSwebenchContextSource(options: SwebenchContextSourceOptions): BenchmarkTaskSource {
    const run = options.run ?? runProcess;
    async function privateData(task: SourceTaskPackage) {
        const index = JSON.parse(await readFile(join(options.privateDirectory, "index.json"), "utf8"));
        const manifest = parseSwebenchManifest(index.manifest);
        const bytes = await readFile(join(options.privateDirectory, "dataset.json"));
        if (digest(bytes) !== index.datasetHash || manifest.dataset !== task.dataset || manifest.revision !== task.revision ||
            index.tasks?.[task.instanceId] !== task.contentHash) throw new Error("Private grading package identity mismatch");
        const rows: unknown = JSON.parse(bytes.toString());
        if (!Array.isArray(rows)) throw new Error("Invalid private dataset");
        const row = rows.find(r => r.instance_id === task.instanceId);
        if (!row || row.repo !== task.repo || row.base_commit !== task.baseCommit || row.problem_statement !== task.problemStatement) throw new Error("Private task projection mismatch");
        return { manifest, row };
    }
    return {
        id: "swebench", buildIdentity: SOURCE_BUILD, profile: SWE_ACP_PROFILE, workerEntryPoint: "benchmarks/swebench/src/context-worker-entry.ts",
        async importTasks(manifestPath, directory, signal) {
            const manifest = parseSwebenchManifest(JSON.parse(await readFile(manifestPath, "utf8")));
            await mkdir(options.privateDirectory, { recursive: false, mode: 0o700 });
            await mkdir(directory, { recursive: false });
            await writeFile(join(options.privateDirectory, "manifest.json"), JSON.stringify(manifest), { flag: "wx", mode: 0o600 });
            await preflightSwebench(options.python, run, signal);
            const response = JSON.parse(requireSuccess(await run(options.python, [BRIDGE_PATH, "prepare", join(options.privateDirectory, "manifest.json"), options.privateDirectory],
                { timeoutMs: 300_000, maxBytes: 16 * 1024 * 1024, ...(signal ? { signal } : {}) }), "Import pinned source tasks"));
            if (response.harnessVersion !== SWEBENCH_VERSION) throw new Error("Source harness mismatch");
            const tasks = parseSwebenchTasks(response);
            if (JSON.stringify(tasks.map(t => t.instance_id)) !== JSON.stringify(manifest.instanceIds)) throw new Error("Source task order mismatch");
            const hashes: Record<string, string> = {};
            const paths: string[] = [];
            for (const task of tasks) {
                let inspection = await run("docker", ["image", "inspect", task.image, "--format", "{{.Id}} {{.Os}}/{{.Architecture}}"], { timeoutMs: 30_000 });
                if (inspection.code !== 0) {
                    requireSuccess(await run("docker", ["pull", "--platform", "linux/amd64", task.image], { timeoutMs: 1_200_000, ...(signal ? { signal } : {}) }), "Pull source image");
                    inspection = await run("docker", ["image", "inspect", task.image, "--format", "{{.Id}} {{.Os}}/{{.Architecture}}"], { timeoutMs: 30_000 });
                }
                const [imageId, platform] = requireSuccess(inspection, "Inspect source image").trim().split(/\s+/);
                if (platform !== "linux/amd64") throw new Error("Source image platform mismatch");
                const body = { source: "swebench" as const, dataset: manifest.dataset, revision: manifest.revision, instanceId: task.instance_id,
                    repo: task.repo, baseCommit: task.base_commit, problemStatement: task.problem_statement, image: task.image, imageId: imageId! };
                const pkg = parseSourceTask({ ...body, contentHash: identity(body) });
                hashes[pkg.instanceId] = pkg.contentHash;
                const path = join(directory, `${pkg.instanceId}.json`);
                await writeFile(path, JSON.stringify(pkg, null, 2), { flag: "wx" }); paths.push(path);
            }
            await writeFile(join(options.privateDirectory, "index.json"), JSON.stringify({ manifest, datasetHash: digest(await readFile(join(options.privateDirectory, "dataset.json"))), tasks: hashes }), { flag: "wx", mode: 0o600 });
            return paths;
        },
        async readTask(path) {
            const task = parseSourceTask(JSON.parse(await readFile(path, "utf8")));
            await privateData(task); return task;
        },
        async environment(task, worker, capture, archive, signal) {
            await privateData(task);
            if (archive) await loadFilesystemArchive(archive.directory, archive.manifest, run, signal);
            return {
                benchmarkId: "context", resolveImage: () => ({ mode: "custom", image: archive?.manifest.imageId ?? task.imageId }),
                getWorkerEntryConfig: () => ({ artifact: worker, cwd: "/testbed", command: ["/bin/bash", "-c", `${SWE_ACP_TESTBED_ENV} && exec /opt/lazygoal/node /opt/lazygoal/worker.mjs`] }),
                resolveNetworkMode: () => "none",
                async prepareEnvironment(env) {
                    if (!archive) requireSuccess(await env.exec(`git reset --hard ${task.baseCommit} && git clean -fd`), "Prepare source base commit");
                    requireSuccess(await env.execAsRoot!("mkdir -p /workspace/state && chmod 777 /workspace/state"), "Prepare source Runtime directory");
                },
                async preflight(env) {
                    requireSuccess(await env.exec(`test "$(git rev-parse HEAD)" = ${task.baseCommit} && ${SWE_ACP_TESTBED_ENV} && python -c 'import pytest'`), "Source task preflight");
                    if (!env.captureAgentProcessBaseline || !env.assertAgentProcessesExited || (capture && !env.saveFilesystemArchive)) throw new Error("Source checkpoint isolation unavailable");
                    if (archive) {
                        const temporary = await mkdtemp(join(tmpdir(), "swe-restore-state-"));
                        try {
                            await env.copyOut("/workspace/state", join(temporary, "state"));
                            if (identity(await hashRuntimeFiles(join(temporary, "state"))) !== identity(await hashRuntimeFiles(join(archive.directory, "state")))) throw new Error("Checkpoint image Runtime state mismatch");
                        } finally { await rm(temporary, { recursive: true, force: true }); }
                    }
                    await env.captureAgentProcessBaseline(); return { ok: true };
                },
                async collectArtifacts(env, directory) {
                    await env.assertAgentProcessesExited!();
                    await mkdir(directory, { recursive: true });
                    await env.copyOut("/workspace/state", join(directory, "state"));
                    const exported = await exportSwebenchPatch(env, task.baseCommit);
                    if (exported.patch === null) throw new Error(exported.error ?? "Source patch export failed");
                    await writeFile(join(directory, "patch.diff"), exported.patch);
                    const snapshot = capture ? await env.saveFilesystemArchive!(directory) : undefined;
                    return { directory, files: { "patch.diff": digest(exported.patch) }, patch: exported.patch, verifier: null, violations: [], ...(snapshot ? { archive: snapshot } : {}) };
                },
            };
        },
        async grade(task, patch, directory, signal): Promise<TaskGrade> {
            const { manifest, row } = await privateData(task);
            await mkdir(directory, { recursive: false, mode: 0o700 });
            await writeFile(join(directory, "dataset.json"), JSON.stringify([row]), { flag: "wx", mode: 0o600 });
            await writeFile(join(directory, "predictions.jsonl"), JSON.stringify({ instance_id: task.instanceId, model_name_or_path: "lazygoal-context", model_patch: patch }) + "\n", { flag: "wx" });
            const image = requireSuccess(await run("docker", ["image", "inspect", task.image, "--format", "{{.Id}}"], { timeoutMs: 15_000, ...(signal ? { signal } : {}) }), "Inspect official grading image").trim();
            await writeFile(join(directory, "grading-preflight.json"), JSON.stringify({ expectedImageId: task.imageId, actualImageId: image, sourceBuild: SOURCE_BUILD }));
            if (image !== task.imageId) throw new Error("Official grading image identity mismatch");
            const response = await run(options.python, [BRIDGE_PATH, "grade", directory, `context-${randomUUID()}`, String(manifest.testTimeoutSeconds)],
                { timeoutMs: (manifest.testTimeoutSeconds + 300) * 1000, maxBytes: 16 * 1024 * 1024, ...(signal ? { signal } : {}) });
            await writeFile(join(directory, "bridge-response.json"), JSON.stringify(response, null, 2));
            const raw: unknown = JSON.parse(requireSuccess(response, "Official source grading"));
            if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid official source grading envelope");
            const value = raw as { exitCode?: unknown; results?: { instanceId?: unknown; status?: unknown }[] };
            const result = value.results?.[0];
            if (value.exitCode !== 0 || value.results?.length !== 1 || result?.instanceId !== task.instanceId || !["resolved", "unresolved", "empty_patch", "grading_error"].includes(String(result.status))) throw new Error("Invalid official source grading result");
            const status = result!.status as TaskGrade["status"];
            const grade = { status, resolved: status === "resolved" ? true : status === "unresolved" || status === "empty_patch" ? false : null,
                patchSha256: digest(patch), harnessVersion: SWEBENCH_VERSION, sourceBuild: SOURCE_BUILD, imageId: image, raw };
            await writeFile(join(directory, "grade.json"), JSON.stringify(grade, null, 2)); return grade;
        },
    };
}
