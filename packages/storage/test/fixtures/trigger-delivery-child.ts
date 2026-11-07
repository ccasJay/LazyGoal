import { TriggerDeliveryStore } from "../../src/trigger-delivery-store";

const path = process.argv[2];
if (path === undefined) throw new Error("database path is required");
const store = new TriggerDeliveryStore(path);
try {
    const result = store.receive({
        deliveryId: "shared-delivery",
        trigger: { id: "shared-trigger", purpose: "work", source: "user", payload: "{}" },
    });
    process.stdout.write(result.status);
} finally { store.close(); }
