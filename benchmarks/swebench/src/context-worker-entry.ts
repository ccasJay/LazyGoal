import { runScriptedWorker } from "../../src/scripted-worker.js";
import { createSwebenchAcpToolSet, SWE_ACP_TOOL_IDS } from "./worker-runtime.js";
/** SWE 工程能力与共享脚本生命周期组装，不读取 Context 私有实现。 */
export async function runSwebenchContextWorker(): Promise<void> {
    await runScriptedWorker({ toolIds: SWE_ACP_TOOL_IDS, allowTools: true,
        createRegistry: workspace => createSwebenchAcpToolSet(workspace).registry });
}
if (process.argv[1]?.endsWith("worker.mjs")) {
    runSwebenchContextWorker().catch(error => { process.stderr.write(String(error) + "\n"); process.exitCode = 1; });
}
