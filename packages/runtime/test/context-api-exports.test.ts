import assert from "node:assert/strict";
import { test } from "node:test";
import * as runtime from "../src/index";
import * as agent from "../../agent/src/index";
import * as storage from "../../storage/src/index";

test("规范公共 API 保留且废弃别名/旧适配器已彻底移除", () => {
    // 规范接口存在
    assert.ok(typeof agent.projectTrajectoryExecutionUnits === "function");
    assert.ok(typeof agent.TrajectoryExecutionUnitAdapter === "function");
    assert.ok(typeof agent.TrajectoryExecutionUnitProjectionAdapter === "function");

    assert.ok(typeof runtime.buildContextLookupResultFromRanking === "function");
    assert.ok(typeof runtime.FieldTokenizer === "function");
    assert.ok(typeof runtime.buildContextInvertedIndex === "function");
    assert.ok(typeof runtime.rankContextDocuments === "function");
    assert.ok(typeof runtime.computeContextRetrievalSourceDigest === "function");

    assert.ok(typeof storage.JsonFileContextRetrievalIndexStore === "function");
    assert.ok(typeof storage.contextRetrievalIndexSidecarCodec === "object");

    // 废弃别名与旧实现彻底从 barrel exports 移除
    assert.equal((agent as Record<string, unknown>).TrajectoryContextUnitAdapter, undefined);
    assert.equal((agent as Record<string, unknown>).ContextCompactAdapter, undefined);

    assert.equal((runtime as Record<string, unknown>).ContextSourceRouter, undefined);
    assert.equal((runtime as Record<string, unknown>).ContextMaintenanceWorker, undefined);
    assert.equal((runtime as Record<string, unknown>).createContextLookupResultFromRanking, undefined);
    assert.equal((runtime as Record<string, unknown>).contextLookupResultFromRanking, undefined);
    assert.equal((runtime as Record<string, unknown>).ContextFieldTokenizer, undefined);
    assert.equal((runtime as Record<string, unknown>).buildContextIndex, undefined);
    assert.equal((runtime as Record<string, unknown>).rankFieldedBm25Lite, undefined);
    assert.equal((runtime as Record<string, unknown>).computeRetrievalIndexSourceDigest, undefined);

    assert.equal((storage as Record<string, unknown>).JsonFileWarmContextSidecarStore, undefined);
    assert.equal((storage as Record<string, unknown>).WarmContextSidecarSchema, undefined);
    assert.equal((storage as Record<string, unknown>).WarmContextSidecarCodec, undefined);
    assert.equal((storage as Record<string, unknown>).warmContextSidecarCodec, undefined);
    assert.equal((storage as Record<string, unknown>).retrievalIndexSidecarCodec, undefined);
});
