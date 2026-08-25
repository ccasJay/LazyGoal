import {
    loadAlfworldEnvironmentFile,
    preflightAlfworldEnvironment,
    resolveAlfworldEnvironment,
    runAlfworldPythonProbe,
} from "../src/environment-config.js";

const fileEnv = await loadAlfworldEnvironmentFile();
const environment = { ...fileEnv, ...process.env };
const config = resolveAlfworldEnvironment({ env: environment });
const result = await preflightAlfworldEnvironment(config, {
    probePython: runAlfworldPythonProbe,
});

console.log(JSON.stringify(result));
