import assert from "node:assert/strict";
import { test } from "node:test";

import type { InferContract } from "../../contracts/src/index";
import {
    AgentDecisionContract,
    SystemCompleteRunStageInputContract,
    SystemFindToolsInputContract,
    SystemStartRunStageInputContract,
    SystemUpdateGoalPlanInputContract,
} from "../src/index";
import type * as Native from "../src/model-output/schema-types";
import type {
    AgentDecision,
    AskUserQuestionInput,
    CompletionCriterion,
    ContextLookupFilters,
    GoalPlanPatchOperation,
    MemoryPatchOperation,
    RunPlanRouteCandidate,
} from "../src/index";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;
type Equivalent<Left, Right> = IsAssignable<Left, Right> extends true
    ? IsAssignable<Right, Left>
    : false;

type _AgentDecisionForward = Assert<IsAssignable<AgentDecision, Native.AgentDecision>>;
type _AgentDecisionBackward = Assert<IsAssignable<Native.AgentDecision, AgentDecision>>;
type _CompletionCriterion = Assert<Equivalent<CompletionCriterion, Native.CompletionCriterion>>;
type _RunPlanRoute = Assert<Equivalent<RunPlanRouteCandidate, Native.RunPlanRouteCandidate>>;
type _GoalPlanOperation = Assert<Equivalent<GoalPlanPatchOperation, Native.GoalPlanPatchOperation>>;
type _MemoryPatchOperation = Assert<Equivalent<MemoryPatchOperation, Native.MemoryPatchOperation>>;
type _ContextLookupFilters = Assert<Equivalent<ContextLookupFilters, Native.ContextLookupFilters>>;
type _AskUserQuestion = Assert<Equivalent<AskUserQuestionInput, Native.AskUserQuestionInput>>;

type _FindTools = Assert<Equivalent<
    InferContract<typeof SystemFindToolsInputContract>,
    Native.SystemFindToolsInput
>>;
type _CompleteRunStage = Assert<Equivalent<
    InferContract<typeof SystemCompleteRunStageInputContract>,
    Native.SystemCompleteRunStageInput
>>;
type _StartRunStage = Assert<Equivalent<
    InferContract<typeof SystemStartRunStageInputContract>,
    Native.SystemStartRunStageInput
>>;
type _UpdateGoalPlan = Assert<Equivalent<
    InferContract<typeof SystemUpdateGoalPlanInputContract>,
    Native.SystemUpdateGoalPlanInput
>>;

test("原生 TS 契约类型与现有 AST 推导类型保持结构一致", () => {
    assert.equal(typeof AgentDecisionContract, "object");
});
