#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultCatalogPath = "contracts/catalog.json";

const entryStatuses = new Set(["present", "moved", "deleted"]);
const definitionKinds = new Set(["contract-ast", "native-ts", "derived", "zod", "external", "dynamic", "other"]);
const generationStates = new Set(["enabled", "none", "runtime", "external", "dynamic", "unknown"]);
const validationStates = new Set([
    "runtime-guard",
    "runtime-schema",
    "zod",
    "hand-written",
    "sdk",
    "types-only",
    "generated-reader",
    "not-declared",
    "unknown",
]);
const protocolStates = new Set(["declared", "undeclared", "not-applicable", "unknown"]);
const roles = new Set(["boundary-root", "referenced"]);
const supportedStrategies = new Set(["typescript-json-schema"]);

/**
 * Catalog 结构或内部一致性错误。
 *
 * @remarks
 * 错误消息只描述失败类别、内部键和有界路径，不复制源码内容。
 */
export class ContractCatalogError extends Error {
    /**
     * @param message - 可供命令行展示的稳定错误描述。
     */
    constructor(message) {
        super(message);
        this.name = "ContractCatalogError";
    }
}

/**
 * 读取并校验构建期契约 Catalog。
 *
 * @param options - 仓库根目录、Catalog 相对路径及来源校验开关。
 * @returns 已通过结构与来源校验的 Catalog。
 * @throws 文件不可读、JSON 无效或 Catalog 登记无效时抛出 {@link ContractCatalogError}。
 *
 * @example
 * ```ts
 * const catalog = await loadContractCatalog();
 * ```
 */
export async function loadContractCatalog({
    repositoryRoot = defaultRepositoryRoot,
    catalogPath = defaultCatalogPath,
    validateSources = true,
} = {}) {
    const absoluteRoot = path.resolve(repositoryRoot);
    const absoluteCatalogPath = path.resolve(absoluteRoot, catalogPath);
    if (!isInside(absoluteRoot, absoluteCatalogPath)) {
        throw new ContractCatalogError(`Catalog path escapes the repository: ${catalogPath}`);
    }
    let text;
    try {
        text = await readFile(absoluteCatalogPath, "utf8");
    } catch {
        throw new ContractCatalogError(`Catalog file is missing: ${catalogPath}`);
    }
    let catalog;
    try {
        catalog = JSON.parse(text);
    } catch {
        throw new ContractCatalogError(`Catalog file is not valid JSON: ${catalogPath}`);
    }
    await validateContractCatalog(catalog, { repositoryRoot: absoluteRoot, validateSources });
    return catalog;
}

/**
 * 校验 Catalog 的结构、来源和生成登记冲突。
 *
 * @param catalog - 尚未信任的 Catalog 数据。
 * @param options - 仓库根目录及是否读取来源文件。
 * @returns 校验完成后的原对象。
 * @throws Catalog 不符合当前版本或存在重复、缺失、冲突登记时抛出 {@link ContractCatalogError}。
 *
 * @example
 * ```ts
 * await validateContractCatalog(catalog, { repositoryRoot: process.cwd() });
 * ```
 */
export async function validateContractCatalog(catalog, { repositoryRoot = defaultRepositoryRoot, validateSources = true } = {}) {
    const root = path.resolve(repositoryRoot);
    if (!isRecord(catalog)) throw new ContractCatalogError("Catalog root must be an object");
    if (catalog.schemaVersion !== 1) {
        throw new ContractCatalogError(`Unsupported Catalog schemaVersion: ${String(catalog.schemaVersion)}`);
    }
    if (typeof catalog.inventoryBaseline !== "string" || catalog.inventoryBaseline.length === 0) {
        throw new ContractCatalogError("Catalog inventoryBaseline must be a non-empty string");
    }
    if (!isRecord(catalog.inventorySource)
        || typeof catalog.inventorySource.branch !== "string"
        || typeof catalog.inventorySource.commit !== "string"
        || !Array.isArray(catalog.inventorySource.files)) {
        throw new ContractCatalogError("Catalog inventorySource must declare branch, commit and files");
    }
    if (!isRecord(catalog.reconciliation)) throw new ContractCatalogError("Catalog reconciliation must be an object");
    for (const field of ["deleted", "moved", "changed"]) {
        if (!Array.isArray(catalog.reconciliation[field])) {
            throw new ContractCatalogError(`Catalog reconciliation ${field} must be an array`);
        }
    }
    if (!Array.isArray(catalog.entries)) throw new ContractCatalogError("Catalog entries must be an array");
    if (catalog.reconciliation.inventoryCounts !== undefined) {
        const counts = catalog.reconciliation.inventoryCounts;
        if (!isRecord(counts) || Object.values(counts).some(value => !Number.isInteger(value) || value < 0)) {
            throw new ContractCatalogError("Catalog reconciliation inventoryCounts must contain non-negative integers");
        }
        const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
        if (total !== catalog.entries.length) {
            throw new ContractCatalogError(
                `Catalog inventoryCounts total ${total} does not match entries ${catalog.entries.length}`,
            );
        }
    }
    if (!Array.isArray(catalog.boundaries)) throw new ContractCatalogError("Catalog boundaries must be an array");
    if (!Array.isArray(catalog.dynamicCompositions)) throw new ContractCatalogError("Catalog dynamicCompositions must be an array");

    const keys = new Set();
    const sourceCache = new Map();
    const enabledIdentities = new Map();
    const artifactPaths = new Map();

    for (const entry of catalog.entries) {
        validateEntryShape(entry);
        if (keys.has(entry.key)) throw new ContractCatalogError(`Duplicate Catalog key: ${entry.key}`);
        keys.add(entry.key);
        await validateEntrySource(entry, { root, validateSources, sourceCache });
        if (entry.generation.state !== "enabled") continue;
        validateEnabledGeneration(entry);
        const identity = `${String(entry.protocol.identity.value)}:${String(entry.protocol.version.value)}`;
        if (enabledIdentities.has(identity)) {
            throw new ContractCatalogError(
                `Duplicate enabled contract identity and version: ${identity} (${enabledIdentities.get(identity)}, ${entry.key})`,
            );
        }
        enabledIdentities.set(identity, entry.key);
        for (const artifactPath of contractArtifactPaths(entry)) {
            if (artifactPaths.has(artifactPath)) {
                throw new ContractCatalogError(
                    `Duplicate contract artifact path: ${artifactPath} (${artifactPaths.get(artifactPath)}, ${entry.key})`,
                );
            }
            artifactPaths.set(artifactPath, entry.key);
        }
    }

    for (const boundary of catalog.boundaries) {
        if (!isRecord(boundary)) throw new ContractCatalogError("Catalog boundary must be an object");
        if (typeof boundary.boundary !== "string" || boundary.boundary.length === 0) {
            throw new ContractCatalogError("Catalog boundary must declare a boundary name");
        }
        if (!Array.isArray(boundary.sourcePaths) || boundary.sourcePaths.some(item => typeof item !== "string")) {
            throw new ContractCatalogError(`Catalog boundary has invalid sourcePaths: ${String(boundary.entry ?? boundary.root)}`);
        }
        if (!Array.isArray(boundary.catalogKeys) || boundary.catalogKeys.some(item => typeof item !== "string")) {
            throw new ContractCatalogError(`Catalog boundary has invalid catalogKeys: ${String(boundary.entry ?? boundary.root)}`);
        }
        for (const key of boundary.catalogKeys) {
            if (!keys.has(key)) {
                throw new ContractCatalogError(`Catalog boundary references an unknown key: ${key}`);
            }
        }
    }

    for (const composition of catalog.dynamicCompositions) {
        validateDynamicComposition(composition, keys);
    }

    return catalog;
}

/**
 * 按内部键、声明名、来源、模块、协议身份或消费者查询登记项。
 *
 * @param catalog - 已校验的 Catalog。
 * @param query - 大小写不敏感的子串查询。
 * @returns 命中的登记项，按内部键排序；空查询返回空数组。
 *
 * @example
 * ```ts
 * const entries = queryContractCatalog(catalog, "web.providers.models.success");
 * ```
 */
export function queryContractCatalog(catalog, query) {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return [];
    return catalog.entries
        .filter(entry => {
            const protocol = [
                entry.protocol.identity.state === "declared" ? String(entry.protocol.identity.value) : "",
                entry.protocol.version.state === "declared" ? String(entry.protocol.version.value) : "",
                entry.protocol.identity.inventoryValue ?? "",
                entry.protocol.version.inventoryValue ?? "",
            ].join(" ");
            const haystack = [
                entry.key,
                entry.declaration,
                entry.source.path,
                entry.source.currentPath ?? "",
                entry.owner,
                entry.module,
                entry.boundary,
                entry.definition,
                entry.generation.detail,
                protocol,
                ...entry.consumers,
                ...entry.relations.map(relation => relation.name),
            ].join("\n").toLowerCase();
            return haystack.includes(normalized);
        })
        .sort((left, right) => left.key.localeCompare(right.key));
}

/**
 * 同时查询声明登记项、边界入口和动态组合入口。
 *
 * @param catalog - 已校验的 Catalog。
 * @param query - 大小写不敏感的子串查询。
 * @returns 三类命中结果；未命中类别返回空数组。
 *
 * @example
 * ```ts
 * const result = queryContractCatalogIndex(catalog, "createModelOutputContractBundle");
 * ```
 */
export function queryContractCatalogIndex(catalog, query) {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) {
        return { entries: [], boundaries: [], dynamicCompositions: [] };
    }
    const matches = text => text.toLowerCase().includes(normalized);
    return {
        entries: queryContractCatalog(catalog, query),
        boundaries: catalog.boundaries.filter(boundary => matches([
            boundary.boundary,
            boundary.entry ?? "",
            boundary.root ?? "",
            boundary.direction ?? "",
            boundary.owner ?? "",
            boundary.contracts ?? "",
            boundary.sources ?? "",
            boundary.protocol ?? "",
            boundary.consumers ?? "",
            ...boundary.sourcePaths,
            ...boundary.catalogKeys,
        ].join("\n"))),
        dynamicCompositions: catalog.dynamicCompositions.filter(composition => matches([
            composition.key,
            composition.entryPoint,
            composition.detail ?? "",
            ...composition.components,
            ...composition.componentKeys,
            ...composition.conditions.flatMap(condition => [
                condition.condition,
                condition.effect,
                ...condition.sources,
            ]),
        ].join("\n"))),
    };
}

/**
 * 返回全部显式启用生成的登记项。
 *
 * @param catalog - 已校验的 Catalog。
 * @returns 启用项；未启用时返回空数组。
 *
 * @example
 * ```ts
 * const enabled = collectEnabledContractEntries(catalog);
 * ```
 */
export function collectEnabledContractEntries(catalog) {
    return catalog.entries.filter(entry => entry.generation.state === "enabled");
}

/**
 * 计算启用项声明的全部制品仓库相对路径。
 *
 * @param entry - 已通过启用的生成登记校验。
 * @returns 去重后的仓库相对路径。
 *
 * @example
 * ```ts
 * const paths = contractArtifactPaths(enabled[0]);
 * ```
 */
export function contractArtifactPaths(entry) {
    const names = Object.values(entry.generation.artifacts);
    return [...new Set(names.map(name => path.posix.join(entry.generation.outputDirectory, name)))];
}

function validateEntryShape(entry) {
    if (!isRecord(entry)) throw new ContractCatalogError("Catalog entry must be an object");
    if (typeof entry.key !== "string" || entry.key.length === 0) throw new ContractCatalogError("Catalog entry key must be a non-empty string");
    if (typeof entry.declaration !== "string" || entry.declaration.length === 0) {
        throw new ContractCatalogError(`Catalog entry declaration must be a non-empty string: ${entry.key}`);
    }
    if (!isRecord(entry.source) || typeof entry.source.path !== "string" || entry.source.path.length === 0) {
        throw new ContractCatalogError(`Catalog entry source path is missing: ${entry.key}`);
    }
    if (entry.source.line !== null && (!Number.isInteger(entry.source.line) || entry.source.line <= 0)) {
        throw new ContractCatalogError(`Catalog entry source line is invalid: ${entry.key}`);
    }
    if (!entryStatuses.has(entry.status)) throw new ContractCatalogError(`Invalid Catalog entry status: ${entry.key}`);
    if (entry.status !== "present" && (typeof entry.disposition !== "string" || entry.disposition.length === 0)) {
        throw new ContractCatalogError(`Catalog entry ${entry.status} requires a disposition: ${entry.key}`);
    }
    for (const field of ["owner", "module", "boundary", "definition", "section", "role"]) {
        if (typeof entry[field] !== "string" || entry[field].length === 0) {
            throw new ContractCatalogError(`Catalog entry ${field} must be a non-empty string: ${entry.key}`);
        }
    }
    if (!definitionKinds.has(entry.definitionKind)) throw new ContractCatalogError(`Invalid Catalog definition kind: ${entry.key}`);
    if (!roles.has(entry.role)) throw new ContractCatalogError(`Invalid Catalog role: ${entry.key}`);
    if (!Array.isArray(entry.consumers) || entry.consumers.some(item => typeof item !== "string")) {
        throw new ContractCatalogError(`Catalog entry consumers must be strings: ${entry.key}`);
    }
    if (!Array.isArray(entry.relations)) throw new ContractCatalogError(`Catalog entry relations must be an array: ${entry.key}`);
    if (!isRecord(entry.protocol)) throw new ContractCatalogError(`Catalog entry protocol is missing: ${entry.key}`);
    for (const field of ["identity", "version"]) {
        const value = entry.protocol[field];
        if (!isRecord(value) || !protocolStates.has(value.state)) {
            throw new ContractCatalogError(`Catalog entry protocol ${field} is invalid: ${entry.key}`);
        }
        if (value.state === "declared" && (value.value === undefined || value.value === null || value.value === "")) {
            throw new ContractCatalogError(`Catalog entry protocol ${field} declared without a value: ${entry.key}`);
        }
    }
    if (!isRecord(entry.generation) || !generationStates.has(entry.generation.state)) {
        throw new ContractCatalogError(`Catalog entry generation state is invalid: ${entry.key}`);
    }
    if (typeof entry.generation.detail !== "string") {
        throw new ContractCatalogError(`Catalog entry generation detail must be a string: ${entry.key}`);
    }
    if (!isRecord(entry.validation) || !validationStates.has(entry.validation.state)) {
        throw new ContractCatalogError(`Catalog entry validation state is invalid: ${entry.key}`);
    }
}

async function validateEntrySource(entry, { root, validateSources, sourceCache }) {
    if (!validateSources) return;
    if (entry.status === "deleted") return;
    if (entry.status === "moved") {
        if (typeof entry.source.currentPath !== "string" || entry.source.currentPath.length === 0) {
            throw new ContractCatalogError(`Moved Catalog entry must declare source.currentPath: ${entry.key}`);
        }
        if (entry.source.generated === true) return;
        await assertDeclarationAt(entry, entry.source.currentPath, { root, sourceCache });
        return;
    }
    await assertDeclarationAt(entry, entry.source.path, { root, sourceCache });
}

async function assertDeclarationAt(entry, relativePath, { root, sourceCache }) {
    const absolutePath = path.resolve(root, relativePath);
    if (!isInside(root, absolutePath)) {
        throw new ContractCatalogError(`Catalog source escapes the repository: ${entry.key} -> ${relativePath}`);
    }
    let text = sourceCache.get(absolutePath);
    if (text === undefined) {
        try {
            text = await readFile(absolutePath, "utf8");
        } catch {
            throw new ContractCatalogError(`Catalog source is missing: ${entry.key} -> ${relativePath}`);
        }
        sourceCache.set(absolutePath, text);
    }
    const escaped = entry.declaration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`\\b${escaped}\\b`).test(text)) {
        throw new ContractCatalogError(`Catalog declaration is missing at its source: ${entry.key} -> ${relativePath}`);
    }
}

function validateEnabledGeneration(entry) {
    if (entry.definitionKind !== "native-ts") {
        throw new ContractCatalogError(
            `Enabled generation requires a native TypeScript contract, got ${entry.definitionKind}: ${entry.key}`,
        );
    }
    if (entry.protocol.identity.state !== "declared" || entry.protocol.version.state !== "declared") {
        throw new ContractCatalogError(`Enabled generation requires a declared protocol identity and version: ${entry.key}`);
    }
    if (!supportedStrategies.has(entry.generation.strategy)) {
        throw new ContractCatalogError(`Unsupported generation strategy: ${String(entry.generation.strategy)} (${entry.key})`);
    }
    if (typeof entry.generation.rootType !== "string" || entry.generation.rootType.length === 0) {
        throw new ContractCatalogError(`Enabled generation requires a rootType: ${entry.key}`);
    }
    if (!Array.isArray(entry.generation.declaredTypes) || entry.generation.declaredTypes.length === 0) {
        throw new ContractCatalogError(`Enabled generation requires declaredTypes: ${entry.key}`);
    }
    if (!entry.generation.declaredTypes.includes(entry.generation.rootType)) {
        throw new ContractCatalogError(`Enabled generation rootType must be included in declaredTypes: ${entry.key}`);
    }
    if (typeof entry.generation.outputDirectory !== "string" || entry.generation.outputDirectory.length === 0) {
        throw new ContractCatalogError(`Enabled generation requires an outputDirectory: ${entry.key}`);
    }
    if (path.isAbsolute(entry.generation.outputDirectory) || entry.generation.outputDirectory.split("/").includes("..")) {
        throw new ContractCatalogError(`Enabled generation outputDirectory must be repository-relative: ${entry.key}`);
    }
    if (!isRecord(entry.generation.artifacts) || Object.keys(entry.generation.artifacts).length === 0) {
        throw new ContractCatalogError(`Enabled generation requires artifact names: ${entry.key}`);
    }
    for (const [name, artifact] of Object.entries(entry.generation.artifacts)) {
        if (typeof artifact !== "string" || artifact.length === 0 || path.isAbsolute(artifact) || artifact.split("/").includes("..")) {
            throw new ContractCatalogError(`Invalid artifact name ${name}: ${entry.key}`);
        }
    }
    if (!isRecord(entry.generation.reader)) {
        throw new ContractCatalogError(`Enabled generation requires reader binding metadata: ${entry.key}`);
    }
    for (const field of ["module", "dataType", "dataTypeModule", "functionName", "diagnosticType", "resultType"]) {
        if (typeof entry.generation.reader[field] !== "string" || entry.generation.reader[field].length === 0) {
            throw new ContractCatalogError(`Enabled generation reader ${field} is missing: ${entry.key}`);
        }
    }
    if (!isRecord(entry.generation.reader.names)) {
        throw new ContractCatalogError(`Enabled generation reader names are missing: ${entry.key}`);
    }
    for (const field of ["schema", "metadata", "validator"]) {
        const value = entry.generation.reader.names[field];
        if (typeof value !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)) {
            throw new ContractCatalogError(`Enabled generation reader name ${field} is invalid: ${entry.key}`);
        }
    }
    if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(String(entry.protocol.identity.value))) {
        throw new ContractCatalogError(`Enabled generation identity is not a stable protocol identity: ${entry.key}`);
    }
    if (!Number.isInteger(entry.protocol.version.value) || entry.protocol.version.value <= 0) {
        throw new ContractCatalogError(`Enabled generation version must be a positive integer: ${entry.key}`);
    }
}

function validateDynamicComposition(composition, keys) {
    if (!isRecord(composition)) throw new ContractCatalogError("Catalog dynamic composition must be an object");
    if (typeof composition.key !== "string" || composition.key.length === 0) {
        throw new ContractCatalogError("Catalog dynamic composition key must be a non-empty string");
    }
    if (typeof composition.entryPoint !== "string" || composition.entryPoint.length === 0) {
        throw new ContractCatalogError(`Catalog dynamic composition entryPoint is missing: ${composition.key}`);
    }
    if (!Array.isArray(composition.components) || composition.components.some(item => typeof item !== "string")) {
        throw new ContractCatalogError(`Catalog dynamic composition components are invalid: ${composition.key}`);
    }
    if (!Array.isArray(composition.conditions) || composition.conditions.length === 0) {
        throw new ContractCatalogError(`Catalog dynamic composition conditions are missing: ${composition.key}`);
    }
    for (const condition of composition.conditions) {
        if (!isRecord(condition) || typeof condition.condition !== "string" || typeof condition.effect !== "string") {
            throw new ContractCatalogError(`Catalog dynamic composition condition is invalid: ${composition.key}`);
        }
        if (!Array.isArray(condition.sources) || condition.sources.some(item => typeof item !== "string")) {
            throw new ContractCatalogError(`Catalog dynamic composition condition sources are invalid: ${composition.key}`);
        }
    }
    for (const key of composition.componentKeys ?? []) {
        if (!keys.has(key)) {
            throw new ContractCatalogError(`Catalog dynamic composition references an unknown key: ${key}`);
        }
    }
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function summarize(entry) {
    return {
        key: entry.key,
        declaration: entry.declaration,
        source: entry.source.currentPath ?? entry.source.path,
        line: entry.source.line,
        owner: entry.owner,
        module: entry.module,
        boundary: entry.boundary,
        definition: entry.definition,
        definitionKind: entry.definitionKind,
        protocol: entry.protocol,
        generation: {
            state: entry.generation.state,
            detail: entry.generation.detail,
            ...(entry.generation.state === "enabled" ? {
                strategy: entry.generation.strategy,
                outputDirectory: entry.generation.outputDirectory,
                artifacts: entry.generation.artifacts,
            } : {}),
        },
        validation: entry.validation,
        role: entry.role,
        consumers: entry.consumers,
        ...(entry.consumerNote === undefined ? {} : { consumerNote: entry.consumerNote }),
    };
}

async function run() {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "query") {
        console.error("Usage: node scripts/contract-catalog.mjs query <key|declaration|source|protocol|module|composition>");
        process.exitCode = 2;
        return;
    }
    try {
        const catalog = await loadContractCatalog();
        const matches = queryContractCatalogIndex(catalog, args[1]);
        if (matches.entries.length === 0 && matches.boundaries.length === 0 && matches.dynamicCompositions.length === 0) {
            console.error(`No Catalog entry matches: ${args[1]}`);
            process.exitCode = 1;
            return;
        }
        console.log(JSON.stringify({
            entries: matches.entries.map(summarize),
            boundaries: matches.boundaries,
            dynamicCompositions: matches.dynamicCompositions,
        }, null, 2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await run();
}
