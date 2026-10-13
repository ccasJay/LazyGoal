import { mkdir, rm, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { EnvironmentSpec } from "../../src/isolated-environment.js";
import type { WorkerArtifact } from "../../src/worker-builder.js";
import { requireSuccess } from "../../src/process.js";
import { hashTree, identity, materializeFiles } from "./artifacts.js";
import type { ContextScenario } from "./scenario.js";
/**
 * agent 停止后的产物与独立 verifier 事实。
 * @example
 * ```ts
 * const artifacts: ContextArtifacts = { directory, files: {}, verifier: null, violations: [] };
 * ```
 */
export interface ContextArtifacts {
    readonly directory: string;
    readonly files: Readonly<Record<string, string>>;
    readonly verifier: { readonly code: number; readonly stdout: string; readonly stderr: string } | null;
    readonly violations: readonly string[];
}
/**
 * 创建共享 Docker 声明；capture 不评分，run 在 Worker 结束后执行 verifier。
 * @remarks 输入目录必须只含声明初始材料或已校验检查点；复制前拒绝符号链接。
 * @example
 * ```ts
 * const spec = createContextEnvironment(scenario, worker, inputDirectory, false);
 * ```
 */
export function createContextEnvironment(scenario: ContextScenario, worker: WorkerArtifact, inputDirectory: string, grade: boolean): EnvironmentSpec<ContextScenario, ContextArtifacts> {
    return {
        benchmarkId: "context",
        resolveImage: () => ({ mode: "custom", image: scenario.image }),
        getWorkerEntryConfig: () => ({ artifact: worker, cwd: "/workspace/project" }),
        resolveNetworkMode: () => "none",
        async prepareEnvironment(env) {
            await hashTree(inputDirectory);
            const payload: Record<string, string> = {};
            const allFiles = await hashTree(inputDirectory);
            for (const path of Object.keys(allFiles)) {
                if ((path.startsWith("project/") || path.startsWith("state/")) && !path.includes("/context-index/")) {
                    payload[path] = (await readFile(join(inputDirectory, path))).toString("base64");
                }
            }
            const temporary = await mkdtemp(join(tmpdir(), "context-import-"));
            try {
                const importFile = join(temporary, "import.json");
                await writeFile(importFile, JSON.stringify(payload), { mode: 0o644 });
                await env.copyInto(importFile, "/opt/lazygoal/import.json");
                requireSuccess(await env.exec("/opt/lazygoal/node -e 'const fs=require(\"fs\"),p=require(\"path\");fs.mkdirSync(\"/workspace/project\",{recursive:true});fs.mkdirSync(\"/workspace/state\",{recursive:true});for(const [name,data] of Object.entries(JSON.parse(fs.readFileSync(\"/opt/lazygoal/import.json\",\"utf8\")))){const path=p.join(\"/workspace\",name);fs.mkdirSync(p.dirname(path),{recursive:true});fs.writeFileSync(path,Buffer.from(data,\"base64\"));}fs.unlinkSync(\"/opt/lazygoal/import.json\");'"), "Import context materials");
            } finally { await rm(temporary, { recursive: true, force: true }); }
        },
        async preflight(env) {
            if (!env.captureAgentProcessBaseline || !env.assertAgentProcessesExited) throw new Error("Process isolation support required");
            requireSuccess(await env.exec("test -d /workspace/project && test -x /opt/lazygoal/node"), "Context preflight");
            await env.captureAgentProcessBaseline();
            return { ok: true };
        },
        async collectArtifacts(env, outputDirectory) {
            if (!env.assertAgentProcessesExited) throw new Error("Process isolation support required");
            await env.assertAgentProcessesExited();
            await mkdir(outputDirectory, { recursive: true });
            await env.copyOut("/workspace/project", join(outputDirectory, "project"));
            await env.copyOut("/workspace/state", join(outputDirectory, "state"));
            const files = await hashTree(join(outputDirectory, "project"));
            const stateFiles = await hashTree(join(outputDirectory, "state"));
            let verifier: ContextArtifacts["verifier"] = null;
            const violations: string[] = [];
            if (grade) {
                verifier = await env.exec(`cd /workspace/project && /bin/bash -c ${shellQuote(scenario.verifier)}`, { timeoutMs: 30_000, maxBytes: 100_000, truncate: true });
                await env.assertAgentProcessesExited();
                await env.copyOut("/workspace/project", join(outputDirectory, "graded-project"));
                if (identity(files) !== identity(await hashTree(join(outputDirectory, "graded-project")))) violations.push("verifier_modified_artifact");
                await env.copyOut("/workspace/state", join(outputDirectory, "graded-state"));
                if (identity(stateFiles) !== identity(await hashTree(join(outputDirectory, "graded-state")))) violations.push("verifier_modified_runtime_state");
                await rm(join(outputDirectory, "graded-project"), { recursive: true, force: true });
                await rm(join(outputDirectory, "graded-state"), { recursive: true, force: true });
            }
            return { directory: outputDirectory, files, verifier, violations };
        },
    };
}
/** 为全新容器物化声明初始材料，不复制宿主 checkout。 */
export async function prepareInitialEnvironment(directory: string, scenario: ContextScenario): Promise<void> {
    await mkdir(join(directory, "project"), { recursive: true });
    await materializeFiles(join(directory, "project"), scenario.initialFiles);
}

function shellQuote(value: string): string { return `'${value.replace(/'/g, "'\\''")}'`; }
