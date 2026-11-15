import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
    createPromptEnvironment,
    InMemoryLoader,
    normalizeNewlines,
} from "../../../prompt-renderer/src/index";

/** `context-compaction@1` 模板的稳定 ID。 */
export const CONTEXT_COMPACTION_TEMPLATE_ID = "context-compaction@1" as const;

/**
 * 一轮阈值提炼的提示词输入。
 *
 * @remarks
 * 只传接续判定所需的事实：Goal 意图、已批准目标、即将移出的历史与保留的近期交互。
 * 不传 Working Memory、Tool 定义或当前任务状态；这些由运行时另行提供。
 *
 * @example
 * ```ts
 * const prompt = await renderContextCompactionPrompt({
 *     intent: "修复登录回归",
 *     evictedTranscript: "user: ...",
 *     recentTranscript: "user: ...",
 * });
 * ```
 */
export interface ContextCompactionPromptInput {
    /** Goal 的原始意图。 */
    readonly intent: string;
    /** 已批准任务的目标；未批准时省略。 */
    readonly objective?: string | undefined;
    /** 即将移出工作窗口的历史正文。 */
    readonly evictedTranscript: string;
    /** 保留在工作窗口中的近期完整交互。 */
    readonly recentTranscript: string;
}

type CompactionRenderer = (input: ContextCompactionPromptInput) => string;

let rendererPromise: Promise<CompactionRenderer> | undefined;

/**
 * 渲染阈值提炼提示词。
 *
 * @remarks
 * 模板在首次调用时读取并编译，随后复用；模板缺失或语法错误以配置错误拒绝，
 * 不静默回退到内置文本。
 *
 * @param input - 意图、目标与两段正文。
 * @returns 已规范化换行、移除结尾换行的提示词文本。
 * @throws `PromptBundleConfigurationError` 当模板缺失或编译失败时。
 * @example
 * ```ts
 * const prompt = await renderContextCompactionPrompt(input);
 * ```
 */
export async function renderContextCompactionPrompt(
    input: ContextCompactionPromptInput,
): Promise<string> {
    const render = await loadRenderer();
    return render(input);
}

function loadRenderer(): Promise<CompactionRenderer> {
    rendererPromise ??= compileRenderer();
    return rendererPromise;
}

async function compileRenderer(): Promise<CompactionRenderer> {
    const source = await readFile(
        fileURLToPath(new URL("./context-compaction@1.njk", import.meta.url)),
        "utf8",
    );
    const environment = createPromptEnvironment(new InMemoryLoader(new Map([
        [CONTEXT_COMPACTION_TEMPLATE_ID, normalizeNewlines(source)],
    ])));
    environment.getTemplate(CONTEXT_COMPACTION_TEMPLATE_ID, true);
    return (input) => environment.render(CONTEXT_COMPACTION_TEMPLATE_ID, {
        intent: input.intent,
        ...(input.objective === undefined ? {} : { objective: input.objective }),
        evictedTranscript: input.evictedTranscript,
        recentTranscript: input.recentTranscript,
    }).replace(/\n+$/u, "");
}
