#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const source = resolve(__dirname, "../packages/tui/src/cli.tsx");
const tsxLoader = require.resolve("tsx/esm", { paths: [__dirname] });
const result = spawnSync(
    process.execPath,
    ["--import", tsxLoader, source, ...process.argv.slice(2)],
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
