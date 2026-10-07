/**
 * 结构化 Working Memory 契约、协议与纯计算基础。
 *
 * @remarks
 * 该包独立于 Runtime，不依赖 Goal、Runner、Session 或持久化。
 * 它提供结构化记忆数据模型、协议判断、空记忆初始化、以及规范化 Patch 算法。
 *
 * @example
 * ```ts
 * import {
 *     createEmptyWorkingMemory,
 *     isMemoryProtocol,
 *     type WorkingMemory,
 * } from "@lazygoal/working-memory";
 *
 * const memory: WorkingMemory = createEmptyWorkingMemory();
 * const isValid = isMemoryProtocol({ kind: "structured", version: 1 });
 * ```
 */

export {
    createEmptyWorkingMemory,
    isMemoryProtocol,
} from "./protocol";

export type {
    Blocker,
    CanonicalMemoryOperation,
    EvidenceBackedFact,
    FactProposal,
    FactStability,
    Hypothesis,
    MemoryEntry,
    MemoryEntryBase,
    MemoryEntryKind,
    MemoryEntryScope,
    MemoryEntrySource,
    MemoryEntryStatus,
    MemoryOriginPhase,
    MemoryPatch,
    MemoryPatchOperation,
    MemoryProtocol,
    MemoryRevision,
    WorkingMemory,
    WorkingMemoryPatch,
} from "./types";
