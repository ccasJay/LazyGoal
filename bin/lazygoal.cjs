#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const argv = process.argv.slice(2);
const isAlfworldEval = argv[0] === "eval" && argv[1] === "alfworld";
const isSwebenchEval = argv[0] === "eval" && argv[1] === "swebench";
const isGaiaEval = argv[0] === "eval" && argv[1] === "gaia";
const isPromptEval = argv[0] === "eval" && argv[1] === "prompt";
const isGepaReflect = argv[0] === "gepa" && argv[1] === "reflect";
const isGepaResolveModels = argv[0] === "gepa" && argv[1] === "resolve-models";
const isGepaLifecycle = argv[0] === "gepa" && !isGepaReflect && !isGepaResolveModels;

if (isGepaLifecycle) {
    const procEnv = process["env"];
    const pythonBin = procEnv["LAZYGOAL_GEPA_PYTHON"] || "python3";
    const pyArgs = ["-m", "lazygoal_gepa.cli", ...argv.slice(1)];
    const pyResult = spawnSync(pythonBin, pyArgs, {
        stdio: "inherit",
        env: procEnv,
    });
    if (pyResult.error !== undefined) {
        console.error(pyResult.error.message);
        process.exitCode = 1;
    } else if (pyResult.signal !== null) {
        process.exitCode = pyResult.signal === "SIGINT" ? 130 : 1;
    } else {
        process.exitCode = pyResult.status ?? 1;
    }
    return;
}

const isAlfworldGrade = argv[0] === "grade" && argv[1] === "alfworld";
const isSwebenchGrade = argv[0] === "grade" && argv[1] === "swebench";
const isGaiaGrade = argv[0] === "grade" && argv[1] === "gaia";
const isGaiaLoad = (argv[0] === "load" && argv[1] === "gaia") || (argv[0] === "gaia" && argv[1] === "load");
const source = (isPromptEval || isGepaReflect || isGepaResolveModels)
    ? resolve(__dirname, "../benchmarks/src/prompt-evaluation/cli.ts")
    : isAlfworldEval
    ? resolve(__dirname, "../benchmarks/alfworld/src/cli.ts")
    : isSwebenchEval
        ? resolve(__dirname, "../benchmarks/swebench/src/cli.ts")
        : isGaiaEval || isGaiaGrade || isGaiaLoad
            ? resolve(__dirname, "../benchmarks/gaia/src/cli.ts")
            : isAlfworldGrade
                ? resolve(__dirname, "../benchmarks/alfworld/src/cli.ts")
                : isSwebenchGrade
                    ? resolve(__dirname, "../benchmarks/swebench/src/cli.ts")
        : resolve(__dirname, "../packages/tui/src/cli.tsx");
const tsxLoader = require.resolve("tsx/esm", { paths: [__dirname] });

const nodeArgs = ["--import", tsxLoader];

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
