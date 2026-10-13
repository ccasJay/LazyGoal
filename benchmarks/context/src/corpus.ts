import { validateAnnotations } from "./source-evidence.js";
import { constants } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hashTree, identity } from "./artifacts.js";
import { validateCheckpoint } from "./checkpoint.js";
import { parseScenario, record, textValue } from "./scenario.js";
/**
 * 不可覆盖的人工批准集合版本。
 * @remarks 每次冻结引用所批准的完整候选树身份；修改内容必须重新审核。
 * @example
 * ```ts
 * await freezeCandidate(candidate, corpus, "core", "release-1", expectedHash, "reviewer");
 * ```
 */
export interface FrozenCase {
    readonly set: "core" | "challenge";
    readonly version: string;
    readonly caseId: string;
    readonly candidateHash: string;
    readonly approvedBy: string;
    readonly approvedAt: string;
}
function segment(value: string): string { return Buffer.from(textValue(value)).toString("base64url"); }
/** 获取候选审核身份；完整材料缺失时拒绝。 */
export async function reviewCandidate(directory: string): Promise<string> {
    const scenario = parseScenario(JSON.parse(await readFile(join(directory, "scenario.json"), "utf8")));
    const checkpoint = record(JSON.parse(await readFile(join(directory, "checkpoint.json"), "utf8")));
    if (checkpoint.scenarioHash !== identity(scenario)) throw new Error("Candidate scenario changed");
    await validateCheckpoint(directory, scenario, checkpoint.worker as never, textValue(checkpoint.imageId));
    const source = record(JSON.parse(await readFile(join(directory, "capture.json"), "utf8")));
    if (!source.model || !source.worker || !source.stages) throw new Error("Candidate provenance missing");
    if (scenario.kind === "source") await validateAnnotations(directory, scenario);
    return identity(await hashTree(directory, scenario.kind === "source"));
}
/** 人工明确批准指定哈希后冻结；wx/mkdir 排他写拒绝相同版本覆盖。 */
export async function freezeCandidate(candidate: string, corpus: string, set: "core" | "challenge", version: string, expectedHash: string, approvedBy: string): Promise<string> {
    if (set !== "core" && set !== "challenge") throw new Error("Invalid corpus set");
    const candidateHash = await reviewCandidate(candidate);
    if (candidateHash !== expectedHash) throw new Error("Approval hash is stale");
    const scenario = parseScenario(JSON.parse(await readFile(join(candidate, "scenario.json"), "utf8")));
    const target = join(corpus, set, segment(version), segment(scenario.id));
    await mkdir(join(corpus, set, segment(version)), { recursive: true });
    await mkdir(target);
    await cp(candidate, join(target, "case"), { recursive: true, errorOnExist: true, force: false, mode: constants.COPYFILE_FICLONE });
    const manifest: FrozenCase = { set, version: textValue(version), caseId: scenario.id, candidateHash, approvedBy: textValue(approvedBy), approvedAt: new Date().toISOString() };
    await writeFile(join(target, "frozen.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
    return target;
}
/** 运行冻结用例前重新校验内容，不把篡改版本作为原版本运行。 */
export async function readFrozenCase(directory: string): Promise<FrozenCase> {
    const value = record(JSON.parse(await readFile(join(directory, "frozen.json"), "utf8")));
    if ((value.set !== "core" && value.set !== "challenge") || !value.approvedBy || !value.approvedAt || value.candidateHash !== await reviewCandidate(join(directory, "case"))) throw new Error("Frozen case corrupted or unapproved");
    return value as unknown as FrozenCase;
}
