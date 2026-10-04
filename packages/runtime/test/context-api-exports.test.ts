import assert from "node:assert/strict";
import { test } from "node:test";
import * as runtime from "../src/index";
import * as agent from "../../agent/src/index";
import * as storage from "../../storage/src/index";
import * as contextRetrieval from "../../context-retrieval/src/index";

test("规范公共 API 保留且废弃别名/旧适配器已彻底移除", () => {
    // 规范接口存在
    assert.ok(typeof agent.projectTrajectoryExecutionUnits === "function");
    assert.ok(typeof agent.TrajectoryExecutionUnitAdapter === "function");
    assert.ok(typeof agent.TrajectoryExecutionUnitProjectionAdapter === "function");

    // 检索核心接口移至独立包
    assert.ok(typeof contextRetrieval.buildContextLookupResultFromRanking === "function");
    assert.ok(typeof contextRetrieval.FieldTokenizer === "function");
    assert.ok(typeof contextRetrieval.buildContextInvertedIndex === "function");
    assert.ok(typeof contextRetrieval.rankContextDocuments === "function");
    assert.ok(typeof contextRetrieval.computeContextRetrievalSourceDigest === "function");
    assert.ok(typeof contextRetrieval.IndexedContextRetriever === "function");

    // Runtime 保留领域适配器与端口类型
    assert.ok(typeof runtime.IndexedContextLookupService === "function");
    assert.ok(typeof runtime.RuntimeContextLookupAdapter === "function");
    assert.ok(typeof runtime.invokeContextLookup === "function");

    assert.ok(typeof storage.JsonFileContextRetrievalIndexStore === "function");
    assert.ok(typeof storage.contextRetrievalIndexSidecarCodec === "object");

    // 检索算法入口彻底从 Runtime barrel exports 移除
    assert.equal((runtime as Record<string, unknown>).buildContextLookupResultFromRanking, undefined);
    assert.equal((runtime as Record<string, unknown>).FieldTokenizer, undefined);
    assert.equal((runtime as Record<string, unknown>).buildContextInvertedIndex, undefined);
    assert.equal((runtime as Record<string, unknown>).rankContextDocuments, undefined);
    assert.equal((runtime as Record<string, unknown>).computeContextRetrievalSourceDigest, undefined);

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
