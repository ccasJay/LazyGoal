#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

const argv = process.argv.slice(2);
const isAlfworldEval = argv[0] === "eval" && argv[1] === "alfworld";
const isSwebenchEval = argv[0] === "eval" && argv[1] === "swebench";
const source = isAlfworldEval
    ? resolve(__dirname, "../benchmarks/alfworld/src/cli.ts")
    : isSwebenchEval
        ? resolve(__dirname, "../benchmarks/swebench/src/cli.ts")
        : resolve(__dirname, "../packages/tui/src/cli.tsx");
const tsxLoader = require.resolve("tsx/esm", { paths: [__dirname] });

const cwdEnv = resolve(process.cwd(), ".env");
const repoEnv = resolve(__dirname, "../.env");
const envFile = existsSync(cwdEnv) ? cwdEnv : existsSync(repoEnv) ? repoEnv : undefined;
const nodeArgs = envFile !== undefined
    ? [`--env-file=${envFile}`, "--import", tsxLoader]
    : ["--import", tsxLoader];

const result = spawnSync(
    process.execPath,
    [...nodeArgs, source, ...argv],
    { stdio: "inherit" },
);

if (result.error !== undefined) {
    console.error(result.error.message);
    process.exitCode = 1;
} else if (result.signal !== null) {
    process.exitCode = result.signal === "SIGINT" ? 130 : 1;
} else {
    process.exitCode = result.status ?? 1;
}
