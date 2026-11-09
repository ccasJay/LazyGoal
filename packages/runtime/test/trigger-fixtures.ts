import type { Trigger, TriggerActor, GoalUserAction } from "../src/trigger";

const sentAt = "2026-11-09T00:00:00.000Z";
export const externalTestActor: TriggerActor = { role: "external", externalId: "test-actor" };
export const supervisorTestActor: TriggerActor = { role: "supervisor" };

export function workTrigger(id: string, text = "Test work", source: TriggerActor = externalTestActor): Trigger {
    return { id, name: "Submit work", type: "work", source, target: "supervisor",
        payload: { action: "submitted", material: { kind: "text", text } }, sentAt };
}

export function cancelTrigger(id: string, goalId: string, runId: string, source: TriggerActor = externalTestActor): Trigger {
    return { id, name: "Cancel run", type: "instruction", source, target: "worker", goalId,
        payload: { action: "cancel", runId }, sentAt };
}

export function resumeTrigger(id: string, goalId: string, runId: string, replyTo: string, acknowledgeUnknownEffects: boolean,
    source: TriggerActor = externalTestActor): Trigger {
    return { id, name: "Resume checkpoint", type: "instruction", source, target: "supervisor", goalId, replyTo,
        payload: { action: "resume", runId, acknowledgeUnknownEffects }, sentAt };
}

export function waitingTrigger(id: string, goalId: string, replyTo: string, runId: string, workerId: string, generation: string): Trigger {
    return { id, name: "Goal waiting", type: "response", source: { role: "worker", workerId, generation },
        target: "supervisor", goalId, replyTo,
        payload: { action: "progress", runId, status: "waiting", waitingFor: "blocked" }, sentAt };
}

export function permissionRequestTrigger(id: string, goalId: string, workerId: string, generation: string,
    fields: { readonly runId: string; readonly actionId: string; readonly interactionId: string; readonly commitRevision: number }): Trigger {
    return { id, name: "Action approval requested", type: "permission", source: { role: "worker", workerId, generation },
        target: "supervisor", goalId, payload: { action: "requested", ...fields }, sentAt };
}

export function permissionDecisionTrigger(id: string, goalId: string, replyTo: string,
    decision: "approve" | "reject", reason?: string, source: TriggerActor = supervisorTestActor): Trigger {
    return decision === "approve"
        ? { id, name: "Approve Action", type: "permission", source, target: "worker", goalId, replyTo,
            payload: { action: "decided", decision, scope: "action" }, sentAt }
        : { id, name: "Reject Action", type: "permission", source, target: "worker", goalId, replyTo,
            payload: { action: "decided", decision, scope: "action", reason: reason ?? "Not approved" }, sentAt };
}

export function interactionAnswerTrigger(id: string, goalId: string, replyTo: string, answer: GoalUserAction,
    source: TriggerActor = externalTestActor): Trigger {
    return { id, name: "Answer interaction", type: "interaction", source, target: "worker", goalId, replyTo,
        payload: { action: "answered", answer }, sentAt };
}

export function lifecycleStartedTrigger(id: string): Trigger {
    return { id, name: "Worker started", type: "lifecycle", source: supervisorTestActor,
        target: "supervisor", payload: { action: "started" }, sentAt };
}

export function lifecycleExitedTrigger(id: string, outcome: "normal" | "unexpected"): Trigger {
    return { id, name: "Worker exited", type: "lifecycle", source: supervisorTestActor,
        target: "supervisor", payload: { action: "exited", outcome }, sentAt };
}
