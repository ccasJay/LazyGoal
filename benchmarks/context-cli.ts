import { parseArgs } from "node:util";
import { readFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { runContextCli } from "./context/src/cli.js";
import { createSwebenchContextSource } from "./swebench/src/context-source.js";
import { resolveBenchmarkHomePaths } from "./src/default-paths.js";
import { record, textValue } from "./src/scripted-operation.js";
/** 顶层来源组装；共享层和具体 benchmark 不反向或横向导入。 */
export async function runContextComposition(argv: readonly string[]): Promise<number> {
    const args = argv[0] === "eval" && argv[1] === "context" ? argv.slice(2) : argv;
    const { values } = parseArgs({ args: [...args.slice(1)], strict: false, options: { config: { type: "string" }, output: { type: "string" }, python: { type: "string" }, "private-directory": { type: "string" } } });
    if (args[0] === "import") {
        const paths = await resolveBenchmarkHomePaths(process.cwd(), "context");
        const output = resolve(typeof values.output === "string" ? values.output : join(paths.runsDirectory, randomUUID()));
        await mkdir(output, { recursive: true });
        const source = createSwebenchContextSource({ privateDirectory: resolve(typeof values["private-directory"] === "string" ? values["private-directory"] : join(output, "private")), python: typeof values.python === "string" ? values.python : "python3" });
        return runContextCli([...args, "--output", output], source);
    }
    if (args[0] !== "freeze" && typeof values.config === "string") {
        const path = resolve(values.config);
        const config = record(JSON.parse(await readFile(path, "utf8")));
        if (config.source !== undefined) {
            const v = record(config.source);
            if (v.kind !== "swebench") throw new Error("Unsupported context task source");
            return runContextCli(args, createSwebenchContextSource({ privateDirectory: resolve(dirname(path), textValue(v.privateDirectory)), python: textValue(v.python) }));
        }
    }
    return runContextCli(args);
}
if (process.argv[1]?.endsWith("context-cli.ts")) runContextComposition(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => { process.stderr.write(String(error) + "\n"); process.exitCode = 1; });
