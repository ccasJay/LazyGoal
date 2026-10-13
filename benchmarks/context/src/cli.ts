import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadRuntimeConfig } from "../../../packages/config/src/index.js";
import { createLlmAdapter } from "../../../packages/llm/src/factory.js";
import { resolveBenchmarkHomePaths } from "../../src/default-paths.js";
import { record, textValue, parseScenario } from "./scenario.js";
import { identity } from "./artifacts.js";
import { buildContextWorker, captureScenario, runPairedCase, type ModelRole } from "./runner.js";
import { freezeCandidate, reviewCandidate, readFrozenCase } from "./corpus.js";

/** 配置文件中的角色分别显式加载；返回脱敏身份与宿主 Adapter。 */
export async function loadContextRoles(raw: unknown, baseDirectory: string): Promise<Record<"capture" | "execution" | "judge", ModelRole>> {
    const roles = record(raw);
    const output = {} as Record<"capture" | "execution" | "judge", ModelRole>;
    for (const name of ["capture", "execution", "judge"] as const) {
        const role = record(roles[name]);
        const profile = textValue(role.profile);
        const config = await loadRuntimeConfig({ cliArgs: { profile }, ...(role.configFile === undefined ? {} : { customConfigFile: resolve(baseDirectory, textValue(role.configFile)) }) });
        if (config.llm.structuredOutputMode === "two_stage") throw new Error("Context benchmark requires strict or prompt_only role configuration");
        const configuration = {
            provider: config.llm.provider, model: config.llm.model, structuredOutputMode: config.llm.structuredOutputMode,
            ...(config.llm.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.llm.maxOutputTokens }),
            ...("contextWindowTokens" in config.llm ? { contextWindowTokens: config.llm.contextWindowTokens } : {}),
            endpointHash: identity("baseURL" in config.llm ? config.llm.baseURL ?? "default" : "default"),
        };
        output[name] = { id: profile + ":" + config.llm.provider + ":" + config.llm.model + ":" + identity(configuration), configuration, adapter: createLlmAdapter(config.llm) };
    }
    return output;
}
/** 显式 capture/run/freeze 入口；配置与所选内容先验证，再构建 Worker。 */
export async function runContextCli(argv: readonly string[]): Promise<number> {
    const args = argv[0] === "eval" && argv[1] === "context" ? argv.slice(2) : argv;
    const mode = args[0];
    if (!["capture", "run", "freeze"].includes(mode ?? "")) throw new Error("Usage: lazygoal eval context <capture|run|freeze> [options]");
    const { values } = parseArgs({ args: [...args.slice(1)], strict: true, options: {
        config: { type: "string" }, output: { type: "string" }, task: { type: "string" },
        candidate: { type: "string" }, corpus: { type: "string" }, set: { type: "string" }, version: { type: "string" },
        "approve-hash": { type: "string" }, "approved-by": { type: "string" },
    } });
    if (mode === "freeze") {
        const candidate = resolve(textValue(values.candidate));
        if (!values["approve-hash"]) { process.stdout.write(JSON.stringify({ candidate, reviewHash: await reviewCandidate(candidate) }, null, 2) + "\n"); return 0; }
        if (values.set !== "core" && values.set !== "challenge") throw new Error("Freeze requires --set core|challenge");
        const target = await freezeCandidate(candidate, resolve(textValue(values.corpus)), values.set, textValue(values.version), values["approve-hash"], textValue(values["approved-by"]));
        process.stdout.write(target + "\n");
        return 0;
    }
    const configPath = resolve(textValue(values.config));
    const config = record(JSON.parse(await readFile(configPath, "utf8")));
    const base = dirname(configPath);
    if (!Array.isArray(config.scenarios) || !Array.isArray(config.frozenCases)) throw new Error("Config needs scenarios and frozenCases arrays");
    const scenarios = await Promise.all(config.scenarios.map(async path => parseScenario(JSON.parse(await readFile(resolve(base, textValue(path)), "utf8")))));
    const frozenDirectories = config.frozenCases.map(path => resolve(base, textValue(path)));
    const frozen = await Promise.all(frozenDirectories.map(path => readFrozenCase(path)));
    const selectedScenarios = scenarios.filter(scenario => values.task === undefined || scenario.id === values.task);
    const selectedFrozen = frozenDirectories.filter((_path, index) => values.task === undefined || frozen[index]!.caseId === values.task);
    if ((mode === "capture" ? selectedScenarios : selectedFrozen).length === 0) throw new Error("No selected context tasks");
    if (mode === "capture" && new Set(selectedScenarios.map(scenario => scenario.id)).size !== selectedScenarios.length) throw new Error("Duplicate capture task IDs");
    if (mode === "run" && new Set(selectedFrozen).size !== selectedFrozen.length) throw new Error("Duplicate frozen case paths");
    const roles = await loadContextRoles(config.roles, base);
    const paths = await resolveBenchmarkHomePaths(process.cwd(), "context");
    const output = resolve(values.output ?? join(paths.runsDirectory, randomUUID()));
    const worker = await buildContextWorker(process.cwd(), join(paths.cacheDirectory, "worker"));
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.once("SIGINT", cancel);
    process.once("SIGTERM", cancel);
    let passed = true;
    try {
        if (mode === "capture") {
            for (const scenario of selectedScenarios) {
                const candidate = await captureScenario(scenario, worker, roles.capture, join(output, Buffer.from(scenario.id).toString("base64url")), controller.signal);
                process.stdout.write(JSON.stringify({ candidate, reviewHash: await reviewCandidate(candidate) }) + "\n");
            }
        } else {
            for (const path of selectedFrozen) {
                const manifest = await readFrozenCase(path);
                const report = await runPairedCase(path, worker, roles.execution, roles.judge, join(output, Buffer.from([manifest.set, manifest.version, manifest.caseId, manifest.candidateHash].join("/")).toString("base64url")), controller.signal);
                passed &&= report.groups.every(group => group.score?.combined === "passed");
                process.stdout.write(JSON.stringify({ case: manifest.caseId, counts: report.counts, output }) + "\n");
            }
        }
    } finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
    return passed ? 0 : 1;
}
if (process.argv[1]?.endsWith("cli.ts")) runContextCli(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => { process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n"); process.exitCode = 1; });
