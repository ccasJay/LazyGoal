import { SupervisorOwnership } from "../../src/supervisor-ownership";
const path = process.argv[2];
if (path === undefined) throw new Error("lock path is required");
const owner = new SupervisorOwnership(path);
process.stdout.write("ready\n");
process.on("SIGTERM", () => { void owner.close().then(() => process.exit(0)); });
process.stdin.resume();
