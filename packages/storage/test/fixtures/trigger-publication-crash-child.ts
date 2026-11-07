import { link } from "node:fs/promises";
import { SupervisorOwnership } from "../../src/supervisor-ownership";
import { JsonFileGoalStore } from "../../src/goal-store";
import { TriggerDeliveryStore } from "../../src/trigger-delivery-store";
import { publishTriggerGoal } from "../../src/trigger-goal-publication";

const directory = process.argv[2];
if (directory === undefined) throw new Error("directory is required");
const owner = new SupervisorOwnership(`${directory}/owner.db`);
const receipts = new TriggerDeliveryStore(`${directory}/receipts.db`);
let links = 0;
const goals = new JsonFileGoalStore(directory, { link: async (source, target) => {
    await link(source, target);
    if (++links === 2) process.exit(71);
} });
await publishTriggerGoal(owner, receipts, goals, "d");
