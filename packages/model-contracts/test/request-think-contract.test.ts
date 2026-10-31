import assert from "node:assert/strict";
import { test } from "node:test";

import { ContractValidationError } from "../../contracts/src/index";
import {
    createBoundModelOutputContractBundle,
    createBoundUnifiedToolDeclarations,
    decodeBoundAgentDecision,
    modelOutputBindings,
} from "../src/index";

test("request_think 是独立 Decide 控制分支，默认 AgentDecision 不接受它", () => {
    const request = {
        kind: "request_think",
        goal: "比较恢复后的模型可见基线",
    };
    assert.throws(() => decodeBoundAgentDecision(request, modelOutputBindings));

    const disabled = createBoundModelOutputContractBundle({ kind: "executing" }, modelOutputBindings);
    assert.throws(() => disabled.decode({ result: request }));

    const enabled = createBoundModelOutputContractBundle({ kind: "executing", allowThink: true }, modelOutputBindings);
    assert.deepEqual(enabled.decode({ result: request }), request);
    assert.throws(() => enabled.decode({
        result: { kind: "request_think", goal: " \n\t " },
    }), (error: unknown) => error instanceof ContractValidationError
        && error.issues.some(issue => /non-whitespace/.test(issue.message)));
});

test("只有启用阶段循环的 Decide 工具包暴露 request_think 控制声明", () => {
    const disabled = createBoundUnifiedToolDeclarations([], modelOutputBindings, true, false, false);
    assert.equal(disabled.some((declaration) => declaration.id === "system_request_think"), false);

    const enabled = createBoundUnifiedToolDeclarations([], modelOutputBindings, true, false, false, true);
    const declaration = enabled.find((item) => item.id === "system_request_think");
    assert.ok(declaration !== undefined);
    assert.deepEqual(declaration.decode({ goal: "确认 Think 目标" }), {
        kind: "request_think",
        goal: "确认 Think 目标",
    });
    assert.throws(() => declaration.decode({ goal: "  " }), /non-whitespace/);
});
