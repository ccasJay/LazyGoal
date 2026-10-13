import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { contract } from "../../../packages/contracts/src/index.ts";
import { createUnifiedToolDeclarations, decodePhaseToolCall } from "../../../packages/model-contracts/src/index.ts";
import { loadContextRoles } from "../../../benchmarks/context/src/cli.ts";
import { identity } from "../../../benchmarks/context/src/artifacts.ts";
import type { LLMMessage, LLMRequest } from "../../../packages/llm/src/core/types.ts";

const root = dirname(new URL(import.meta.url).pathname);
const evidence = JSON.parse(await readFile(join(root, "invalid-responses.json"), "utf8"));
const traceFile: string = evidence[0].trace;
const stateRoot = resolve(dirname(traceFile), "../..");
const trace = (await readFile(traceFile, "utf8")).trim().split("\n").map(line => JSON.parse(line));
const inputRoot = join(stateRoot, "model-inputs", Buffer.from(trace[0].goalId).toString("base64url"));
const requests = (await readFile(join(inputRoot, Buffer.from(trace[0].runId).toString("base64url"), "requests.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
const original = requests.find(r => r.callId === evidence[1].callId);
const messages: LLMMessage[] = await Promise.all(original.messages.map(async (message: any) => {
    const { ref, source, ...rest } = message;
    return { ...rest, content: await readFile(join(inputRoot, "messages", ref + ".txt"), "utf8") };
}));
const declarations = createUnifiedToolDeclarations([{ id: "context_shell", isReadOnly: false, inputContract: contract.object({ command: contract.string() }) }], false, false, false, true);
const tools = trace.filter(r => r.kind === "model_tool_schema" && r.payload.callId === original.callId).map(r => {
    const declaration = declarations.find(d => d.id === r.payload.toolId)!;
    if (!declaration || identity(declaration.parametersSchema) !== identity(r.payload.parametersSchema)) throw new Error("Frozen schema differs from current decoder");
    return { id: declaration.id, description: declaration.description, parametersSchema: r.payload.parametersSchema };
});
const previous = JSON.parse(messages.find(m => m.content.startsWith('{"source":"runtime_feedback",'))!.content);
const tool = tools.find(t => t.id === "system_complete_task")!;
const args = JSON.parse(evidence[0].toolCalls[0].argumentsJson);
const replacement = { ...previous, constraints: [
    previous.constraints[0],
    `Failed declared tool: ${tool.id}. Regenerate complete arguments using its current schema.`,
    `Provided fields: ${Object.keys(args).join(", ")}.`,
    `Allowed fields: ${Object.keys(tool.parametersSchema.properties).join(", ")}.`,
    `Required fields: ${tool.parametersSchema.required.join(", ")}.`,
    previous.constraints[1],
] };
const improved: LLMMessage[] = [...messages.filter(m => !m.content.startsWith('{"source":"runtime_feedback",')), { role: "user", content: JSON.stringify(replacement) }];
const config = JSON.parse(await readFile(join(root, "model-config.json"), "utf8"));
const roles = await loadContextRoles(config.roles, root);
const directory = join(root, "repair-probe-results");
await mkdir(directory, { recursive: true });
const frozen = { old: { messages, tools, toolChoice: "required" as const }, improved: { messages: improved, tools, toolChoice: "required" as const } };
await writeFile(join(directory, "frozen-requests.json"), JSON.stringify(frozen, null, 2));
const results: any[] = [];
for (const variant of ["old", "improved"] as const) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const started = Date.now();
        const result: any = { variant, attempt, requestIdentity: identity(frozen[variant]), parameterLegal: false, completionRepaired: false };
        try {
            const response = await roles.execution.adapter.generate(frozen[variant] as LLMRequest, { signal: AbortSignal.timeout(120000) });
            result.response = response;
            if (response.toolCalls?.length === 1) {
                const call = response.toolCalls[0];
                const decoded: any = decodePhaseToolCall(declarations, call.toolId, JSON.parse(call.argumentsJson));
                result.parameterLegal = true;
                result.completionRepaired = call.toolId === "system_complete_task" && decoded.kind === "complete" && decoded.evidenceSequences.includes(38);
            }
        } catch (error) { result.error = String(error); }
        result.durationMs = Date.now() - started;
        results.push(result);
        await writeFile(join(directory, "attempts.json"), JSON.stringify(results, null, 2));
        process.stdout.write(`${variant} ${attempt}: legal=${result.parameterLegal} completionRepaired=${result.completionRepaired}\n`);
    }
}
const summary = { model: roles.execution.configuration, sourceTrace: traceFile,
    limitations: "Frozen messages and schemas; tool descriptions reconstructed from unchanged current declarations. No tools execute. Completion repair checks valid complete parameters and reference 38, not independent task grading. Three samples per arm are diagnostic, not a statistical quality claim.",
    variants: Object.fromEntries(["old", "improved"].map(variant => {
        const group = results.filter(r => r.variant === variant);
        return [variant, { attempts: 3, parameterLegal: group.filter(r => r.parameterLegal).length, completionRepaired: group.filter(r => r.completionRepaired).length }];
    })) };
await writeFile(join(directory, "summary.json"), JSON.stringify(summary, null, 2));
