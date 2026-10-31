import assert from "node:assert/strict";
import { test } from "node:test";

import type { InferContract } from "../../contracts/src/index";
import {
    AgentDecisionContract,
} from "../src/index";
import {
    SystemAskUserInputContract,
    SystemCompleteRunInputContract,
    SystemCompleteRunStageInputContract,
    SystemCompleteTaskInputContract,
    SystemContextCheckpointInputContract,
    SystemContextLookupInputContract,
    SystemFailGoalInputContract,
    SystemFindToolsInputContract,
    SystemProposeTaskPlanInputContract,
    SystemRequestThinkInputContract,
    SystemReviseRunStageInputContract,
    SystemStartRunStageInputContract,
    SystemUpdateGoalPlanInputContract,
    SystemUpdatePlanRouteInputContract,
    SystemWaitForInputInputContract,
} from "../src/model-output/system-tools";
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

type _CompleteTask = Assert<Equivalent<
    InferContract<typeof SystemCompleteTaskInputContract>,
    Native.SystemCompleteTaskInput
>>;
type _CompleteRun = Assert<Equivalent<
    InferContract<typeof SystemCompleteRunInputContract>,
    Native.SystemCompleteRunInput
>>;
type _WaitForInput = Assert<Equivalent<
    InferContract<typeof SystemWaitForInputInputContract>,
    Native.SystemWaitForInputInput
>>;
type _FailGoal = Assert<Equivalent<
    InferContract<typeof SystemFailGoalInputContract>,
    Native.SystemFailGoalInput
>>;
type _ContextLookup = Assert<Equivalent<
    InferContract<typeof SystemContextLookupInputContract>,
    Native.SystemContextLookupInput
>>;
type _ProposeTaskPlan = Assert<Equivalent<
    InferContract<typeof SystemProposeTaskPlanInputContract>,
    Native.SystemProposeTaskPlanInput
>>;
type _Checkpoint = Assert<Equivalent<
    InferContract<typeof SystemContextCheckpointInputContract>,
    Native.SystemContextCheckpointInput
>>;
type _RequestThink = Assert<Equivalent<
    InferContract<typeof SystemRequestThinkInputContract>,
    Native.SystemRequestThinkInput
>>;
type _AskUser = Assert<Equivalent<
    InferContract<typeof SystemAskUserInputContract>,
    Native.SystemAskUserInput
>>;
type _FindTools = Assert<Equivalent<
    InferContract<typeof SystemFindToolsInputContract>,
    Native.SystemFindToolsInput
>>;
type _UpdateGoalPlan = Assert<Equivalent<
    InferContract<typeof SystemUpdateGoalPlanInputContract>,
    Native.SystemUpdateGoalPlanInput
>>;
type _StartRunStage = Assert<Equivalent<
    InferContract<typeof SystemStartRunStageInputContract>,
    Native.SystemStartRunStageInput
>>;
type _ReviseRunStage = Assert<Equivalent<
    InferContract<typeof SystemReviseRunStageInputContract>,
    Native.SystemReviseRunStageInput
>>;
type _CompleteRunStage = Assert<Equivalent<
    InferContract<typeof SystemCompleteRunStageInputContract>,
    Native.SystemCompleteRunStageInput
>>;
type _UpdatePlanRoute = Assert<Equivalent<
    InferContract<typeof SystemUpdatePlanRouteInputContract>,
    Native.SystemUpdatePlanRouteInput
>>;

test("原生 TS 契约类型与现有 AST 推导类型保持结构一致", () => {
    assert.equal(typeof AgentDecisionContract, "object");
});
