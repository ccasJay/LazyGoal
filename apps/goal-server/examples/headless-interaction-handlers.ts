import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { LLMAdapter, LLMRequest, LLMResponse } from "../../../packages/llm-core/src/index";
import { toolResponseFixture } from "../../../packages/agent/test/tool-response-fixture";
import { InMemoryToolRegistry } from "../../../packages/tool-core/src/index";
import type { AgentProfile } from "../../../packages/runtime/src/index";
import { createRuntimeComposition } from "../src/runtime/index";

/**
 * 无界面宿主示例：用正式组合根处理问答，并演示程序化决定与真人接手。
 *
 * @remarks
 * 直接运行：`npx tsx apps/goal-server/examples/headless-interaction-handlers.ts`。
 * 示例使用隔离的临时目录与确定性模型适配器，不启动 HTTP、不绑定进程信号、不调用真实
 * Provider、不写入用户 Home。两次问答分别由宿主处理函数和「真人」显式提交回答，
 * 说明两条路径都经过同一 Runtime 受理与提交边界。
 */

const profile: AgentProfile = {
    id: "headless-interaction-example",
    systemPrompt: "Use the deterministic interaction example flow.",
    instructions: [],
    toolIds: [],
};

/** 每次决定都提出一张小问卷；示例只演示宿主与真人的两条决定路径。 */
class DeterministicAdapter implements LLMAdapter {
    calls = 0;

    async generate(_request: LLMRequest): Promise<LLMResponse> {
        this.calls += 1;
        return toolResponseFixture(JSON.stringify({
            result: {
                kind: "ask_user",
                questions: [{
                    header: `Question ${this.calls}`,
                    question: "Which notes should I include?",
                    options: [{ label: "Approved notes", description: null }, { label: "All notes", description: null }],
                    multiSelect: false,
                }],
                memoryPatch: null,
            },
        }));
    }
}

const directory = await mkdtemp(join(tmpdir(), "lazygoal-interaction-example-"));
const workspace = join(directory, "workspace");
await mkdir(workspace, { recursive: true });
const dataDirectory = join(directory, "data");
const home = join(directory, "home");
const adapter = new DeterministicAdapter();

const root = await createRuntimeComposition({
    cwd: workspace,
    dataDirectory,
    env: { LAZYGOAL_HOME: home } as NodeJS.ProcessEnv,
    adapter,
    profile,
    toolRegistry: new InMemoryToolRegistry([]),
});

try {
    const goalId = "example-headless-interaction";
    const created = await root.sessions.create({
        goalId,
        inputId: "example-input-1",
        content: "示例：先程序化回答，再交给我自己回答",
        profileId: profile.id,
    });
    if (!created.ok) throw new Error(`create failed: ${created.error.message}`);
    // 等待第一个问卷提交完成；此时等待属于本实例的历史请求。
    await root.sessions.waitForIdle();

    // 第一个问卷由宿主处理函数程序化回答；结果仍作为统一 send 受理。
    // 第二个问卷显式返回 unhandled，交由真人处理，等待保持有效。
    let handledQuestions = 0;
    const attached = await root.interactions.attach(goalId, {
        onQuestion: async ({ request, readDetail }) => {
            handledQuestions += 1;
            if (handledQuestions > 1 || request.kind !== "question") return { kind: "unhandled" };
            const detail = await readDetail();
            if (!detail.ok || detail.detail.kind !== "question") return { kind: "unhandled" };
            return {
                kind: "respond",
                response: {
                    kind: "answer_ask_user",
                    answers: detail.detail.questions.map((question) => ({
                        questionId: question.id,
                        optionIds: [question.options[0]!.id],
                    })),
                },
            };
        },
    });
    if (!attached.ok) throw new Error(`attach failed: ${attached.code}`);

    // 只注册处理器不会回答历史等待；宿主必须显式恢复才能让已注册处理器处理当前请求。
    const opened = await root.sessions.open(goalId);
    if (!opened.ok) throw new Error(`open failed: ${opened.error.message}`);
    const resumed = await opened.session.send({
        kind: "resume",
        inputId: "example-explicit-resume",
        runId: opened.state.runId,
        commitRevision: opened.state.commitRevision,
    });
    if (resumed.ok || resumed.code !== "INTERACTION_REQUIRED") {
        throw new Error(`unexpected resume result: ${JSON.stringify(resumed)}`);
    }
    await root.sessions.waitForIdle();

    // 下一个等待由真人接手：宿主函数显式返回 unhandled，等待保持有效。
    const waiting = await root.interactions.read(goalId);
    if (waiting === undefined) throw new Error("expected a pending question");
    const humanAnswer = await opened.session.send({
        kind: "respond",
        inputId: "example-human-answer",
        runId: waiting.runId,
        requestId: waiting.requestId,
        response: { kind: "skip_question" },
    });
    await root.sessions.waitForIdle();

    const handledAfter = handledQuestions;
    // 真人决定后模型会继续产生下一个等待；有界轮询使示例输出稳定。
    let currentWait = await root.interactions.read(goalId);
    for (let attempt = 0; attempt < 100 && currentWait === undefined; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        currentWait = await root.interactions.read(goalId);
    }
    const finished = await root.workspaceGoalStore.restore(goalId);
    console.log(JSON.stringify({
        goalId,
        modelCalls: adapter.calls,
        attachedGoalId: attached.handle.goalId,
        handledQuestionsByHost: handledAfter,
        humanDecisionAccepted: humanAnswer.ok,
        runStatus: finished?.state.run.status,
        nextWait: currentWait?.interactionId ?? null,
        messageCount: finished?.state.messages.length,
        pendingInteraction: finished?.state.run.pendingInteraction?.kind ?? null,
    }, null, 2));
    attached.handle.detach();
} finally {
    await root.lifecycle.close().catch(() => undefined);
    await root.resources.closeAll().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
}
