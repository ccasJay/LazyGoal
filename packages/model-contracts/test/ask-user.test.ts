import assert from "node:assert/strict";
import test from "node:test";
import { safeParse } from "../../contracts/src/index";
import {
    AskUserAgentDecisionContract,
    AskUserQuestionInputContract,
    TaskProposalAgentDecisionContract,
    normalizeAskUserRequest,
    validateAskUserAnswers,
    validateModelOutputSemantics,
    type AskUserAnswer,
    type AskUserQuestionInput,
} from "../src/index";

test("AskUserQuestionInputContract 校验合法问题并拦截选项数量非法或未知字段", () => {
    const validQuestion: AskUserQuestionInput = {
        header: "选择环境",
        question: "请选择目标运行环境：",
        options: [
            { label: "开发环境", description: "本地 Docker" },
            { label: "生产环境" },
        ],
        multiSelect: false,
    };
    const parsed = safeParse(AskUserQuestionInputContract, validQuestion);
    assert.equal(parsed.success, true);

    // 选项少于 2 个
    const tooFewOptions = {
        ...validQuestion,
        options: [{ label: "仅一个选项" }],
    };
    assert.equal(safeParse(AskUserQuestionInputContract, tooFewOptions).success, false);

    // 选项多于 3 个
    const tooManyOptions = {
        ...validQuestion,
        options: [
            { label: "A" },
            { label: "B" },
            { label: "C" },
            { label: "D" },
        ],
    };
    assert.equal(safeParse(AskUserQuestionInputContract, tooManyOptions).success, false);

    // 包含未知额外字段
    const extraField = {
        ...validQuestion,
        unknownKey: "rejected",
    };
    assert.equal(safeParse(AskUserQuestionInputContract, extraField).success, false);
});

test("AskUserAgentDecisionContract 限制 1 至 3 个问题并拒绝非法数量与未知字段", () => {
    const sampleQuestion: AskUserQuestionInput = {
        header: "标题",
        question: "问题？",
        options: [{ label: "A" }, { label: "B" }],
        multiSelect: false,
    };

    // 0 个问题
    assert.equal(safeParse(AskUserAgentDecisionContract, { kind: "ask_user", questions: [] }).success, false);

    // 1 个问题
    assert.equal(safeParse(AskUserAgentDecisionContract, { kind: "ask_user", questions: [sampleQuestion] }).success, true);

    // 3 个问题
    assert.equal(
        safeParse(AskUserAgentDecisionContract, {
            kind: "ask_user",
            questions: [sampleQuestion, sampleQuestion, sampleQuestion],
        }).success,
        true,
    );

    // 4 个问题
    assert.equal(
        safeParse(AskUserAgentDecisionContract, {
            kind: "ask_user",
            questions: [sampleQuestion, sampleQuestion, sampleQuestion, sampleQuestion],
        }).success,
        false,
    );
});

test("TaskProposalAgentDecisionContract 正确解析合法任务提案并要求必须包含 objective 与 completionCriteria", () => {
    const validProposal = {
        kind: "task_proposal",
        task: {
            objective: "重构并统一执行流程",
            completionCriteria: [{ text: "所有测试通过" }],
        },
        approvalRequest: "请审批任务计划",
    };
    const parsed = safeParse(TaskProposalAgentDecisionContract, validProposal);
    assert.equal(parsed.success, true);

    // 缺少 approvalRequest
    const missingApproval = {
        kind: "task_proposal",
        task: validProposal.task,
    };
    assert.equal(safeParse(TaskProposalAgentDecisionContract, missingApproval).success, false);
});

test("normalizeAskUserRequest 为问题与选项生成稳定局部 ID 与全局请求 ID", () => {
    const rawQuestions: readonly AskUserQuestionInput[] = [
        {
            header: "数据库选择",
            question: "使用哪种数据库？",
            options: [
                { label: "PostgreSQL", description: "关系型" },
                { label: "SQLite" },
            ],
            multiSelect: false,
        },
        {
            header: "测试范围",
            question: "需要运行哪些测试？",
            options: [
                { label: "单元测试" },
                { label: "集成测试" },
                { label: "端到端测试" },
            ],
            multiSelect: true,
        },
    ];

    const normalized = normalizeAskUserRequest({ questions: rawQuestions }, "ask-test-fixed-id");
    assert.equal(normalized.requestId, "ask-test-fixed-id");
    assert.equal(normalized.questions.length, 2);

    assert.equal(normalized.questions[0]?.id, "q-1");
    assert.equal(normalized.questions[0]?.options.length, 2);
    assert.equal(normalized.questions[0]?.options[0]?.id, "o-1");
    assert.equal(normalized.questions[0]?.options[0]?.label, "PostgreSQL");
    assert.equal(normalized.questions[0]?.options[0]?.description, "关系型");
    assert.equal(normalized.questions[0]?.options[1]?.id, "o-2");

    assert.equal(normalized.questions[1]?.id, "q-2");
    assert.equal(normalized.questions[1]?.options[0]?.id, "o-1");
    assert.equal(normalized.questions[1]?.options[1]?.id, "o-2");
    assert.equal(normalized.questions[1]?.options[2]?.id, "o-3");
});

test("validateModelOutputSemantics 拦截空白 header/question/label 以及同题重复选项 label", () => {
    const decisionWithBlankHeader = {
        kind: "ask_user",
        questions: [
            {
                header: "   ",
                question: "正常问题",
                options: [{ label: "A" }, { label: "B" }],
                multiSelect: false,
            },
        ],
    };
    const issues1 = validateModelOutputSemantics(decisionWithBlankHeader);
    assert.equal(issues1.some((i) => i.code === "blank_string" && i.path.includes("header")), true);

    const decisionWithDuplicateLabel = {
        kind: "ask_user",
        questions: [
            {
                header: "环境",
                question: "选择环境",
                options: [{ label: "生产" }, { label: " 生产 " }],
                multiSelect: false,
            },
        ],
    };
    const issues2 = validateModelOutputSemantics(decisionWithDuplicateLabel);
    assert.equal(issues2.some((i) => i.code === "duplicate_option"), true);
});

test("validateAskUserAnswers 验证单选、多选与 Other 规则并拦截非法答案", () => {
    const rawQuestions: readonly AskUserQuestionInput[] = [
        {
            header: "单选问题",
            question: "Q1",
            options: [{ label: "A" }, { label: "B" }],
            multiSelect: false,
        },
        {
            header: "多选问题",
            question: "Q2",
            options: [{ label: "X" }, { label: "Y" }, { label: "Z" }],
            multiSelect: true,
        },
    ];
    const { questions } = normalizeAskUserRequest({ questions: rawQuestions });

    // 合法答案：Q1 选 o-1，Q2 选 o-1 和 o-3
    const validAnswers: readonly AskUserAnswer[] = [
        { questionId: "q-1", optionIds: ["o-1"] },
        { questionId: "q-2", optionIds: ["o-1", "o-3"] },
    ];
    assert.doesNotThrow(() => validateAskUserAnswers(questions, validAnswers));

    // 合法答案：Q1 使用 otherText
    const validOtherAnswers: readonly AskUserAnswer[] = [
        { questionId: "q-1", optionIds: [], otherText: "自定义输入" },
        { questionId: "q-2", optionIds: ["o-2"] },
    ];
    assert.doesNotThrow(() => validateAskUserAnswers(questions, validOtherAnswers));

    // 答案数量不匹配
    assert.throws(
        () => validateAskUserAnswers(questions, [{ questionId: "q-1", optionIds: ["o-1"] }]),
        /Answer count mismatch/,
    );

    // 单选题选择了多个选项
    assert.throws(
        () =>
            validateAskUserAnswers(questions, [
                { questionId: "q-1", optionIds: ["o-1", "o-2"] },
                { questionId: "q-2", optionIds: ["o-1"] },
            ]),
        /Single-choice question "q-1" requires exactly one selection/,
    );

    // 单选题同时选择选项与 otherText
    assert.throws(
        () =>
            validateAskUserAnswers(questions, [
                { questionId: "q-1", optionIds: ["o-1"], otherText: "额外" },
                { questionId: "q-2", optionIds: ["o-1"] },
            ]),
        /Single-choice question "q-1" requires exactly one selection/,
    );

    // 单选题既没选选项也没填 otherText
    assert.throws(
        () =>
            validateAskUserAnswers(questions, [
                { questionId: "q-1", optionIds: [] },
                { questionId: "q-2", optionIds: ["o-1"] },
            ]),
        /Single-choice question "q-1" requires exactly one selection/,
    );

    // 多选题没有选择任何选项且没有 otherText
    assert.throws(
        () =>
            validateAskUserAnswers(questions, [
                { questionId: "q-1", optionIds: ["o-1"] },
                { questionId: "q-2", optionIds: [] },
            ]),
        /Multi-choice question "q-2" requires at least one selection/,
    );

    // 纯空白 otherText 拒绝
    assert.throws(
        () =>
            validateAskUserAnswers(questions, [
                { questionId: "q-1", optionIds: [], otherText: "   " },
                { questionId: "q-2", optionIds: ["o-1"] },
            ]),
        /must not be blank/,
    );

    // 非法选项 ID
    assert.throws(
        () =>
            validateAskUserAnswers(questions, [
                { questionId: "q-1", optionIds: ["o-99"] },
                { questionId: "q-2", optionIds: ["o-1"] },
            ]),
        /Option "o-99" is not valid/,
    );
});
