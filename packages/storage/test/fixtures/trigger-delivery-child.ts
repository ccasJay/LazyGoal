import { TriggerDeliveryStore } from "../../src/trigger-delivery-store";
import { workTrigger } from "../../../runtime/test/trigger-fixtures";

const path = process.argv[2];
if (path === undefined) throw new Error("database path is required");
const store = new TriggerDeliveryStore(path);
try {
    const result = store.receive({
        deliveryId: "shared-delivery",
        trigger: workTrigger("shared-trigger"),
    });
    process.stdout.write(result.status);
} finally { store.close(); }
