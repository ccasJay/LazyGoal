import { readFile } from "node:fs/promises";

export const SWEBENCH_VERSION = "4.1.0";

/**
 * 固定 SWE-bench Verified 题目及单次作答预算；revision 必须是数据集提交 SHA。
 * @example
 * ```ts
 * const manifest = await loadSwebenchManifest("benchmarks/swebench/manifests/smoke.json");
 * ```
 */
export interface SwebenchManifest {
    readonly dataset: "princeton-nlp/SWE-bench_Verified";
    readonly revision: string;
    readonly instanceIds: readonly string[];
    readonly maxSteps: number;
    readonly taskTimeoutSeconds: number;
    readonly testTimeoutSeconds: number;
}

/** 校验文件边界；拒绝重复题目、浮动 revision、未知字段和无界预算。 */
export function parseSwebenchManifest(value: unknown): SwebenchManifest {
    const keys = ["dataset", "revision", "instanceIds", "maxSteps", "taskTimeoutSeconds", "testTimeoutSeconds"];
    if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key))
        || value.dataset !== "princeton-nlp/SWE-bench_Verified"
        || typeof value.revision !== "string" || !/^[a-f0-9]{40}$/.test(value.revision)
        || !Array.isArray(value.instanceIds) || value.instanceIds.length === 0
        || !value.instanceIds.every((id) => typeof id === "string" && /^[a-zA-Z0-9_.-]+__[a-zA-Z0-9_.-]+-\d+$/.test(id))
        || new Set(value.instanceIds).size !== value.instanceIds.length
        || ![value.maxSteps, value.taskTimeoutSeconds, value.testTimeoutSeconds]
            .every((n) => typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= 86400)) {
        throw new Error("Invalid SWE-bench manifest: require pinned Verified revision, unique instanceIds and positive bounded budgets");
    }
    const manifest = value as unknown as SwebenchManifest;
    if ((manifest.testTimeoutSeconds + 300) * 1000 * manifest.instanceIds.length > 2_147_483_647) {
        throw new Error("Invalid SWE-bench manifest: combined grading budget exceeds the process timer limit");
    }
    return manifest;
}

/** 读取固定清单；读取、JSON 解析和契约错误向调用方传播。 */
export async function loadSwebenchManifest(path: string): Promise<SwebenchManifest> {
    return parseSwebenchManifest(JSON.parse(await readFile(path, "utf8")));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
