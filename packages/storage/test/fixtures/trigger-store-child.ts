import { TriggerStore } from "../../src/trigger-store";
import { workTrigger } from "../../../runtime/test/trigger-fixtures";

const path = process.argv[2];
if (path === undefined) throw new Error("database path is required");
const store = new TriggerStore(path);
try {
    store.receive(workTrigger("shared-trigger"));
    process.stdout.write("received");
} catch (error) {
    if (!(error instanceof Error) || error.message !== "Trigger identity conflict") throw error;
    process.stdout.write("conflict");
} finally { store.close(); }
