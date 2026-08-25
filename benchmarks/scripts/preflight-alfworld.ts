import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
    preflightAlfworldEnvironment,
    resolveAlfworldEnvironment,
    type PythonProbeResult,
} from "../src/alfworld/environment-config.js";

const execFileAsync = promisify(execFile);

const config = resolveAlfworldEnvironment();
const result = await preflightAlfworldEnvironment(config, {
    async probePython(executable, script, env): Promise<PythonProbeResult> {
        try {
            const output = await execFileAsync(executable, ["-c", script], {
                env,
                maxBuffer: 64 * 1024,
            });
            return {
                stdout: output.stdout,
                stderr: output.stderr,
                exitCode: 0,
            };
        } catch (error: unknown) {
            const failure = error as {
                stdout?: string;
                stderr?: string;
                code?: number;
                message?: string;
            };
            return {
                stdout: failure.stdout ?? "",
                stderr: failure.stderr ?? failure.message ?? "Python probe failed",
                exitCode: typeof failure.code === "number" ? failure.code : 1,
            };
        }
    },
});

console.log(JSON.stringify(result));
