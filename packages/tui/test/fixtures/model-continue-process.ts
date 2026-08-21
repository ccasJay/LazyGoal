import { createCompositionRoot } from "../../src/cli";

const root = await createCompositionRoot();

process.once("SIGINT", () => {
    root.controller.beginShutdown();
    void root.shutdownCoordinator.shutdown();
});

await root.controller.dispatch({ kind: "continueLatest" });