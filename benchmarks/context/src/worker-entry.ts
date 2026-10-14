import { contract } from "../../../packages/contracts/src/index.js";
import { createToolRegistration, InMemoryToolRegistry, type Tool } from "../../../packages/tool-core/src/index.js";
import { runProcess } from "../../src/process.js";
import { record, textValue } from "./scenario.js";
import { runScriptedWorker } from "../../src/scripted-worker.js";
export { CONTEXT_PROMPT_ASSETS, createEmbeddedPromptRenderer } from "../../src/scripted-worker.js";
/** 原生 Context 场景的单工具 Worker，生命周期由共享 Worker 实现。 */
export async function runContextWorker(): Promise<void> {
    await runScriptedWorker({ toolIds: ["context_shell"], createRegistry(workspaceRoot) {
    const shell: Tool = {
        definition: { id: "context_shell", description: "Read and modify project files, inspect configuration, and execute shell commands and tests in the isolated project.", discoveryAliases: ["file", "files", "read file", "write file", "shell", "bash", "terminal"], isReadOnly: false, inputContract: contract.object({ command: contract.string() }) },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute(request, control) {
            const command = record(request.input).command;
            const result = await runProcess("/bin/bash", ["-c", textValue(command)], { cwd: workspaceRoot, timeoutMs: 30_000, signal: control?.signal, maxBytes: 100_000, truncate: true });
            return result.code === 0
                ? { kind: "success", output: { ...result }, summary: result.stdout || "Command completed" }
                : { kind: "failure", code: "COMMAND_FAILED", message: result.stderr || `Exit ${result.code}`, retryable: false };
        },
    };
        return new InMemoryToolRegistry([createToolRegistration(shell)]);
    } });
}
if (process.argv[1]?.endsWith("worker.mjs") || process.argv[1]?.endsWith("worker-entry.ts")) {
    runContextWorker().catch(error => { process.stderr.write(String(error) + "\n"); process.exitCode = 1; });
}
