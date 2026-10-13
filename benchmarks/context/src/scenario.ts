import { parseSourceTask, type SourceTaskPackage } from "../../src/task-source.js";
import type { AgentProfile } from "../../../packages/runtime/src/index.js";

/**
 * 宿主冻结的脚本阶段；expect 描述当前操作完成后的 Runtime 边界。
 * @remarks 消息只在该阶段触发后发送。waitingFor 必须与 resume 入口匹配。
 * @example
 * ```ts
 * const stage: ScriptStage = { operation: "continue", prompt: "Retry", expect: "completed" };
 * ```
 */
export interface ScriptStage {
    readonly operation: "launch" | "continue" | "resume";
    readonly prompt: string;
    readonly expect: "completed" | "failed" | "cancelled" | "waiting";
    readonly waitingFor?: "blocked" | "ask_user";
    /** 来源型等待脚本只接受此固定确认问题。 */
    readonly waitingQuestion?: string;
    /** ask_user 回答按冻结 questionId 关联；requestId 从当前真实等待边界读取。 */
    readonly answers?: readonly { readonly questionId: string; readonly answer: string }[];
}
/**
 * Docker 中本地项目的可复核用例定义，评分材料只由宿主持有。
 * @remarks checkpointAfter 是零起始阶段位置；不支持 executing 中途捕获。
 * @example
 * ```ts
 * const scenario = parseScenario(JSON.parse(await readFile("scenario.json", "utf8")));
 * ```
 */
export interface ContextScenario {
    /** source 场景使用完整容器检查点，原生场景仍使用普通文件包。 */
    readonly kind?: "source";
    /** Agent 可见来源任务；完整评分数据不得出现在此投影。 */
    readonly source?: SourceTaskPackage;
    readonly mode?: "cross-run" | "waiting";
    readonly id: string;
    readonly image: string;
    readonly initialFiles: Readonly<Record<string, string>>;
    readonly stages: readonly ScriptStage[];
    readonly checkpointAfter: number;
    readonly profile: AgentProfile;
    readonly budget: { readonly maxSteps: number; readonly maxCalls: number; readonly stageTimeoutMs: number; readonly totalTimeoutMs: number };
    /** verifier 的独立 shell 命令；仅 agent 完全停止后执行。 */
    readonly verifier: string;
    readonly rubric: { readonly text: string; readonly threshold: number };
    readonly limitations: string;
}
/** 文件/进程边界解析；未知字段拒绝，以免把未来消息混入 Worker 操作。 */
export function record(raw: unknown): Record<string, unknown> {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Expected object");
    return raw as Record<string, unknown>;
}
/** 非空文本边界校验。 */
export function textValue(raw: unknown): string {
    if (typeof raw !== "string" || raw.trim() === "") throw new Error("Expected non-empty text");
    return raw;
}
/** 严格限制归档文件为普通相对路径，不允许秘密目录、父目录或符号链接。 */
export function safePath(value: string): string {
    if (value.startsWith("/") || value.includes("\\") || value.split("/").some(part => part === ".." || part === "." || part === "" || part.startsWith(".") || part === "node_modules")) throw new Error("Unsafe artifact path");
    return value;
}
/** 从冻结 JSON 解析场景；不启动模型或容器。 */
export function parseScenario(raw: unknown): ContextScenario {
    const value = record(raw);
    const source = value.kind === "source" ? parseSourceTask(value.source) : undefined;
    if ((value.kind !== undefined && value.kind !== "source") || (source === undefined && (value.source !== undefined || value.mode !== undefined)) ||
        (source !== undefined && value.mode !== "cross-run" && value.mode !== "waiting")) throw new Error("Invalid scenario source/mode");
    const toolIds = source ? ["read_file", "write_file", "edit_file", "grep", "bash"] : ["context_shell"];
    const profile = record(value.profile);
    if (!Array.isArray(profile.instructions) || !profile.instructions.every(x => typeof x === "string") ||
        !Array.isArray(profile.toolIds) || JSON.stringify(profile.toolIds) !== JSON.stringify(toolIds)) throw new Error("Profile must declare context_shell only");
    const frozenProfile: AgentProfile = { id: textValue(profile.id), systemPrompt: textValue(profile.systemPrompt), instructions: profile.instructions as string[], toolIds };
    const budget = record(value.budget);
    for (const field of ["maxSteps", "maxCalls", "stageTimeoutMs", "totalTimeoutMs"]) {
        if (!Number.isSafeInteger(budget[field]) || (budget[field] as number) <= 0) throw new Error(`Invalid budget ${field}`);
    }
    if (!Array.isArray(value.stages) || value.stages.length < 2) throw new Error("Scenario needs at least two stages");
    const stages: ScriptStage[] = value.stages.map((rawStage, index) => {
        const stage = record(rawStage);
        const operation = stage.operation;
        const expect = stage.expect;
        if (operation !== "launch" && operation !== "continue" && operation !== "resume") throw new Error("Invalid operation");
        if ((index === 0) !== (operation === "launch")) throw new Error("Only first stage may launch");
        if (!["completed", "failed", "cancelled", "waiting"].includes(String(expect))) throw new Error("Invalid expected state");
        if ((expect === "waiting") !== (stage.waitingFor === "blocked" || stage.waitingFor === "ask_user")) throw new Error("Waiting boundary needs supported waiting type");
        let answers: ScriptStage["answers"];
        if (stage.answers !== undefined) {
            if (!Array.isArray(stage.answers)) throw new Error("Invalid answers");
            answers = stage.answers.map(item => { const answer = record(item); return { questionId: textValue(answer.questionId), answer: textValue(answer.answer) }; });
        }
        return { operation, prompt: textValue(stage.prompt), expect: expect as ScriptStage["expect"],
            ...(stage.waitingQuestion === undefined ? {} : { waitingQuestion: textValue(stage.waitingQuestion) }),
            ...(stage.waitingFor === undefined ? {} : { waitingFor: stage.waitingFor as "blocked" | "ask_user" }),
            ...(answers === undefined ? {} : { answers }) };
    });
    for (let index = 1; index < stages.length; index++) {
        const previous = stages[index - 1]!;
        if ((previous.expect === "waiting") !== (stages[index]!.operation === "resume")) throw new Error("Operation does not match previous boundary");
        if (previous.waitingFor === "ask_user" && !stages[index]!.answers?.length) throw new Error("ask_user requires fixed answers");
    }
    if (!Number.isSafeInteger(value.checkpointAfter) || (value.checkpointAfter as number) < 0 || (value.checkpointAfter as number) >= stages.length - 1) throw new Error("Invalid checkpoint position");
    const files = record(source ? {} : value.initialFiles);
    if (source && value.initialFiles !== undefined && Object.keys(record(value.initialFiles)).length) throw new Error("Source scenario cannot contain initialFiles");
    for (const [path, content] of Object.entries(files)) { safePath(path); if (typeof content !== "string") throw new Error("Invalid file content"); }
    if (source) {
        const expectedFirst = value.mode === "waiting" ? "waiting" : "completed";
        if (stages.length !== 2 || value.checkpointAfter !== 0 || stages[0]!.expect !== expectedFirst ||
            stages[1]!.operation !== (value.mode === "waiting" ? "resume" : "continue") || stages[1]!.expect !== "completed" ||
            !stages[0]!.prompt.includes(source.problemStatement) || value.image !== source.imageId) throw new Error("Source lifecycle/template mismatch");
    }
    const rubric = record(value.rubric);
    if (typeof rubric.threshold !== "number" || rubric.threshold < 0 || rubric.threshold > 1) throw new Error("Invalid Judge threshold");
    return { ...(source ? { kind: "source" as const, source, mode: value.mode as "cross-run" | "waiting" } : {}), id: textValue(value.id), image: textValue(value.image), initialFiles: files as Record<string, string>, stages,
        checkpointAfter: value.checkpointAfter as number, profile: frozenProfile, budget: budget as unknown as ContextScenario["budget"],
        verifier: textValue(value.verifier), rubric: { text: textValue(rubric.text), threshold: rubric.threshold }, limitations: textValue(value.limitations) };
}
