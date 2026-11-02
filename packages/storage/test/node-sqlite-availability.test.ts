import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync, StatementSync } from "node:sqlite";

test("node:sqlite exposes the synchronous database API used by the trajectory index", () => {
    assert.equal(typeof DatabaseSync, "function");
    assert.equal(typeof StatementSync, "function");

    const database = new DatabaseSync(":memory:");
    try {
        database.exec("CREATE TABLE events (sequence INTEGER PRIMARY KEY, event_type TEXT NOT NULL)");
        const insert = database.prepare("INSERT INTO events (sequence, event_type) VALUES (?, ?)");
        insert.run(1, "run_started");
        const row = database.prepare("SELECT event_type FROM events WHERE sequence = ?").get(1) as { event_type: string };
        assert.equal(row.event_type, "run_started");
    } finally {
        database.close();
    }
});
