import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
    ALFWORLD_ENVIRONMENT_NAME,
    getCondaSubdir,
} from "../src/alfworld/environment-config.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const benchmarkRoot = resolve(scriptDirectory, "..");
const environmentFile = resolve(benchmarkRoot, "alfworld/environment.yml");
const explicitSubdir = process.env.CONDA_SUBDIR;
const condaSubdir = getCondaSubdir(process.platform, process.arch, explicitSubdir);
const condaEnv = {
    ...process.env,
    ...(condaSubdir === undefined ? {} : { CONDA_SUBDIR: condaSubdir }),
};

if (!existsSync(environmentFile)) {
    console.error(`Missing Conda environment file: ${environmentFile}`);
    process.exitCode = 1;
} else {
    console.error(`Creating or updating Conda environment ${ALFWORLD_ENVIRONMENT_NAME}`);
    const result = spawnSync(
        "conda",
        ["env", "update", "--name", ALFWORLD_ENVIRONMENT_NAME, "--file", environmentFile, "--prune"],
        { stdio: "inherit", env: condaEnv },
    );

    if (result.error !== undefined) {
        console.error(`Unable to run conda: ${result.error.message}`);
        process.exitCode = 1;
    } else if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
    }
}
