import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { runGepaReflectCli } from "./reflection-bridge.js";
import { runGepaResolveModelsCli } from "./model-bridge.js";

export { runGepaReflectCli, runGepaResolveModelsCli };
import {
    auditTuaGepaCandidate,
    inspectTuaGepaDataset,
    type TuaGepaCandidateAuditRequest,
    type TuaGepaDatasetRequest,
} from "../../tua-bench/src/gepa-inspector.js";
import { fingerprintPromptEvaluationCandidate } from "./profile.js";

import { PROMPT_EVALUATION_EXIT_CODES } from "./protocol.js";

/** Prompt Evaluation 生产接线使用的 ALFWorld sidecar 源文件。 */
export const ALFWORLD_PROMPT_EVALUATION_SIDECAR_PATH = fileURLToPath(
    new URL("../../alfworld/python/sidecar.py", import.meta.url),
);

type ProductionAdapter = PromptEvaluationBenchmarkAdapter<unknown, unknown>;
type ProductionAdapterFactory = (
    workspaceRoot: string,
    env: NodeJS.ProcessEnv,
) => Promise<ProductionAdapter>;

/**
 * 以只读方式检查 GEPA 请求中的 TUA 数据集，并输出机器可读快照。
 *
 * @param argv - `gepa inspect-tua --request <path>` 参数。
 * @returns 零表示预检成功；无效请求或数据资源缺失返回非零。
 * @example
 * ```ts
 * const exitCode = await runGepaInspectTuaCli([
 *   "gepa", "inspect-tua", "--request", "/tmp/gepa-request.json",
 * ]);
 * ```
 */
export async function runGepaInspectTuaCli(argv: readonly string[]): Promise<number> {
    try {
        const parsed = parseArgs({
            args: [...argv.slice(2)],
            options: { request: { type: "string" } },
            allowPositionals: false,
            strict: true,
        });
        const requestPath = parsed.values.request;
        if (typeof requestPath !== "string" || requestPath.trim() === "") {
            throw new Error("Usage: lazygoal gepa inspect-tua --request <path>");
        }
        const raw: unknown = JSON.parse(await readFile(resolve(requestPath), "utf8"));
        const dataset = (raw !== null && typeof raw === "object" && "tuaDataset" in raw)
            ? (raw as { readonly tuaDataset: unknown }).tuaDataset
            : raw;
        if (!isTuaGepaDatasetRequest(dataset)) {
            throw new Error("GEPA request tuaDataset is missing or malformed");
        }
        const inspection = await inspectTuaGepaDataset(dataset);
        process.stdout.write(`${JSON.stringify(inspection)}\n`);
        return 0;
    } catch (error: unknown) {
        process.stderr.write(`${errorMessage(error)}\n`);
        return 2;
    }
}

/**
 * 对 GEPA TUA 候选做脱敏字面泄漏审计并输出机器可读结果。
 *
 * @param argv - `gepa audit-tua-candidate --request <path>` 参数。
 * @returns 零表示审计成功；请求无效或数据资源缺失返回非零。
 * @example
 * ```ts
 * const exitCode = await runGepaAuditTuaCandidateCli([
 *   "gepa", "audit-tua-candidate", "--request", "/tmp/audit-request.json",
 * ]);
 * ```
 */
export async function runGepaAuditTuaCandidateCli(argv: readonly string[]): Promise<number> {
    try {
        const parsed = parseArgs({
            args: [...argv.slice(2)],
            options: { request: { type: "string" } },
            allowPositionals: false,
            strict: true,
        });
        const requestPath = parsed.values.request;
        if (typeof requestPath !== "string" || requestPath.trim() === "") {
            throw new Error("Usage: lazygoal gepa audit-tua-candidate --request <path>");
        }
        const raw: unknown = JSON.parse(await readFile(resolve(requestPath), "utf8"));
        if (!isTuaGepaCandidateAuditRequest(raw)) {
            throw new Error("TUA candidate audit request is malformed");
        }
        const fingerprint = fingerprintPromptEvaluationCandidate({
            systemPrompt: raw.systemPrompt,
            instructions: raw.instructions,
        });
        if (fingerprint.promptSha256 !== raw.candidateId.replace(/^sha256:/u, "")) {
            throw new Error("TUA candidate audit identity does not match its Prompt fields");
        }
        const result = await auditTuaGepaCandidate(raw);
        process.stdout.write(`${JSON.stringify(result)}\n`);
        return 0;
    } catch (error: unknown) {
        process.stderr.write(`${errorMessage(error)}\n`);
        return 2;
    }
}

function isTuaGepaDatasetRequest(value: unknown): value is TuaGepaDatasetRequest {
    if (value === null || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return typeof record.repoRoot === "string"
        && record.repoRoot.trim() !== ""
        && Array.isArray(record.trainTaskIds)
        && record.trainTaskIds.every((taskId) => typeof taskId === "string")
        && Array.isArray(record.validationTaskIds)
        && record.validationTaskIds.every((taskId) => typeof taskId === "string")
        && Array.isArray(record.holdoutTaskIds)
        && record.holdoutTaskIds.every((taskId) => typeof taskId === "string");
}

function isTuaGepaCandidateAuditRequest(value: unknown): value is TuaGepaCandidateAuditRequest {
    if (value === null || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return typeof record.repoRoot === "string"
        && record.repoRoot.trim() !== ""
        && Array.isArray(record.taskIds)
        && record.taskIds.every((taskId) => typeof taskId === "string")
        && typeof record.candidateId === "string"
        && /^(?:sha256:)?[a-f0-9]{64}$/u.test(record.candidateId)
        && typeof record.systemPrompt === "string"
        && Array.isArray(record.instructions)
        && record.instructions.every((instruction) => typeof instruction === "string");
}

/** `eval prompt` CLI 的诊断输出配置。 */
export interface PromptEvaluationCliOptions {
    /** 输出当前不支持的执行状态。 */
    readonly writeError?: (line: string) => void;
}

/**
 * 报告 Prompt Evaluation 执行入口当前不可用。
 *
 * @remarks
 * 此入口不读取请求、不启动 benchmark Worker，也不回退到旧的独立评测执行链。
 * 独立评分与只读检查命令由各自入口继续提供。
 *
 * @param options - 可选的错误输出函数。
 * @returns 固定返回基础设施错误退出码 `1`。
 * @example
 * ```ts
 * const code = await runPromptEvaluationCli({ writeError: console.error });
 * ```
 */
export async function runPromptEvaluationCli(options: PromptEvaluationCliOptions = {}): Promise<number> {
    const writeError = options.writeError ?? ((line: string) => process.stderr.write(`${line}\n`));
    writeError("Prompt Evaluation execution is currently unsupported by the Worker/Trigger runtime.");
    return 1;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

const entrypoint = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (entrypoint === fileURLToPath(import.meta.url)) {
    const rawArgv = process.argv.slice(2);
    const isReflect = rawArgv[0] === "gepa" && rawArgv[1] === "reflect";
    const isResolveModels = rawArgv[0] === "gepa" && rawArgv[1] === "resolve-models";
    const isInspectTua = rawArgv[0] === "gepa" && rawArgv[1] === "inspect-tua";
    const isAuditTuaCandidate = rawArgv[0] === "gepa" && rawArgv[1] === "audit-tua-candidate";
    const runner = isReflect
        ? runGepaReflectCli(rawArgv)
        : isResolveModels
        ? runGepaResolveModelsCli(rawArgv)
        : isInspectTua
        ? runGepaInspectTuaCli(rawArgv)
        : isAuditTuaCandidate
        ? runGepaAuditTuaCandidateCli(rawArgv)
        : runPromptEvaluationCli();
    void runner.then((code) => {
        process.exitCode = code;
    }).catch((error: unknown) => {
        process.stderr.write(`${errorMessage(error)}\n`);
        process.exitCode = isReflect || isResolveModels || isInspectTua || isAuditTuaCandidate
            ? 1
            : PROMPT_EVALUATION_EXIT_CODES.infrastructureError;
    });
}
