import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
    collectEnabledContractEntries,
    contractArtifactPaths,
    loadContractCatalog,
    queryContractCatalog,
    queryContractCatalogIndex,
    validateContractCatalog,
} from "./contract-catalog.mjs";

test("catalog covers the inventory baseline and current enabled contracts", async () => {
    const catalog = await loadContractCatalog();
    const counts = catalog.reconciliation.inventoryCounts;
    assert.equal(catalog.inventorySource.branch, "codex/contract-inventory");
    assert.equal(catalog.inventorySource.commit, "676015c6");
    assert.deepEqual(counts, {
        "web.md": 286,
        "model-tools.md": 339,
        "durable-cross-process.md": 288,
    });
    assert.equal(catalog.entries.length, 913);
    assert.equal(catalog.entries.length, Object.values(counts).reduce((sum, value) => sum + value, 0));
    assert.equal(collectEnabledContractEntries(catalog).length, 31);
    assert.equal(catalog.entries.filter(entry => entry.status === "moved").length, 2);
    assert.equal(catalog.reconciliation.moved.length, 2);
    assert.equal(catalog.entries.filter(entry => entry.status === "deleted").length, 0);
    assert.equal(catalog.boundaries.length, 18);
    assert.equal(catalog.dynamicCompositions.length, 2);
});

test("catalog query locates web, model, tools, snapshot and dynamic composition entries", async () => {
    const catalog = await loadContractCatalog();

    const web = queryContractCatalog(catalog, "browserActivityPositionContract");
    assert.ok(web.some(entry => entry.key === "web-contracts/src/contracts/activity#browserActivityPositionContract"));
    assert.ok(web.some(entry => entry.key === "web-contracts/src/activity#BrowserActivityPosition"));

    const provider = queryContractCatalog(catalog, "web.providers.models.success");
    assert.ok(provider.some(entry => entry.key === "web-contracts/src/provider-settings#BrowserProviderModels"));
    assert.equal(provider.find(entry => entry.key === "web-contracts/src/provider-settings#BrowserProviderModels").generation.state, "enabled");

    const tools = queryContractCatalog(catalog, "READ_FILE_INPUT_CONTRACT");
    assert.ok(tools.some(entry => entry.key === "tools/src/read-file#READ_FILE_INPUT_CONTRACT"));

    const snapshot = queryContractCatalog(catalog, "GoalSnapshotV1Schema");
    assert.ok(snapshot.some(entry => entry.key === "storage/src/goal-snapshot#GoalSnapshotV1Schema"));
    assert.ok(snapshot.some(entry => entry.role === "boundary-root"));

    const dynamic = catalog.dynamicCompositions.find(entry => entry.key.startsWith("model-contracts/"));
    assert.deepEqual(dynamic.components, ["ModelOutputRequest", "AuthorizedToolContract", "ModelOutputContractBundle"]);
    assert.equal(dynamic.conditions.length, 5);

    const dynamicMatches = queryContractCatalogIndex(catalog, "createModelOutputContractBundle");
    assert.ok(dynamicMatches.dynamicCompositions.some(entry => entry.key === dynamic.key));

    const boundaryMatches = queryContractCatalogIndex(catalog, "Goal Snapshot");
    assert.ok(boundaryMatches.boundaries.some(entry => entry.root === "Goal Snapshot"));
});

test("catalog rejects duplicate keys, identities and artifact paths", async t => {
    const fixture = await createCatalogFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const duplicateKey = structuredClone(fixture.catalog);
    duplicateKey.entries.push(structuredClone(duplicateKey.entries[0]));
    await assert.rejects(
        validateContractCatalog(duplicateKey, { validateSources: false }),
        /Duplicate Catalog key/,
    );

    const duplicateIdentity = structuredClone(fixture.catalog);
    duplicateIdentity.entries.push({
        ...createEntry(),
        key: "web-contracts/src/provider-settings#OtherModels",
        declaration: "OtherModels",
        generation: {
            ...createEntry().generation,
            outputDirectory: "generated/other",
            artifacts: {
                ...createEntry().generation.artifacts,
                schemaModule: "other-schema.ts",
                validator: "other-validator.mjs",
                validatorTypes: "other-validator.d.mts",
                manifest: "other-manifest.json",
                reader: "other-reader.ts",
            },
        },
    });
    await assert.rejects(
        validateContractCatalog(duplicateIdentity, { validateSources: false }),
        /Duplicate enabled contract identity and version/,
    );

    const duplicateArtifact = structuredClone(fixture.catalog);
    duplicateArtifact.entries.push({
        ...createEntry(),
        key: "web-contracts/src/provider-settings#OtherModels2",
        declaration: "OtherModels2",
        protocol: {
            identity: { state: "declared", value: "web.providers.models.other" },
            version: { state: "declared", value: 1 },
        },
    });
    await assert.rejects(
        validateContractCatalog(duplicateArtifact, { validateSources: false }),
        /Duplicate contract artifact path/,
    );
});

test("catalog rejects missing sources, invalid counts and unsupported enabled registrations", async t => {
    const fixture = await createCatalogFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const missingSource = structuredClone(fixture.catalog);
    missingSource.entries[0].source.path = "src/missing.ts";
    await assert.rejects(
        validateContractCatalog(missingSource, { repositoryRoot: fixture.root }),
        /Catalog source is missing/,
    );

    const invalidCounts = structuredClone(fixture.catalog);
    invalidCounts.reconciliation.inventoryCounts = { "test.md": 2 };
    await assert.rejects(
        validateContractCatalog(invalidCounts, { validateSources: false }),
        /inventoryCounts total 2 does not match entries 1/,
    );

    const unsupportedDefinition = structuredClone(fixture.catalog);
    unsupportedDefinition.entries[0].definitionKind = "zod";
    await assert.rejects(
        validateContractCatalog(unsupportedDefinition, { validateSources: false }),
        /Enabled generation requires a native TypeScript contract/,
    );

    const missingReaderNames = structuredClone(fixture.catalog);
    delete missingReaderNames.entries[0].generation.reader.names;
    await assert.rejects(
        validateContractCatalog(missingReaderNames, { validateSources: false }),
        /reader names are missing/,
    );

    const missingProtocol = structuredClone(fixture.catalog);
    missingProtocol.entries[0].protocol.identity = { state: "undeclared" };
    await assert.rejects(
        validateContractCatalog(missingProtocol, { validateSources: false }),
        /requires a declared protocol identity and version/,
    );

    const unknownBoundaryKey = structuredClone(fixture.catalog);
    unknownBoundaryKey.boundaries.push({ boundary: "test", sourcePaths: [], catalogKeys: ["missing"] });
    await assert.rejects(
        validateContractCatalog(unknownBoundaryKey, { validateSources: false }),
        /Catalog boundary references an unknown key/,
    );

    const unknownCompositionKey = structuredClone(fixture.catalog);
    unknownCompositionKey.dynamicCompositions.push({
        key: "test#composition",
        entryPoint: "src/test.ts#composition",
        components: ["Test"],
        componentKeys: ["missing"],
        conditions: [{ condition: "test", effect: "test", sources: [] }],
        generation: "runtime",
    });
    await assert.rejects(
        validateContractCatalog(unknownCompositionKey, { validateSources: false }),
        /Catalog dynamic composition references an unknown key/,
    );
});

test("catalog artifact paths are unique and repository-relative", async () => {
    const catalog = await loadContractCatalog();
    const enabled = collectEnabledContractEntries(catalog);
    assert.equal(enabled.length, 31);
    const paths = enabled.flatMap(contractArtifactPaths);
    assert.equal(new Set(paths).size, paths.length);
    assert.ok(paths.every(item => !path.isAbsolute(item) && !item.split("/").includes("..")));
    assert.ok(paths.includes("packages/web-contracts/src/generated/provider-models-reader.ts"));
    assert.ok(paths.includes("packages/tools/src/generated/write-file/binding.ts"));
});

async function createCatalogFixture() {
    const root = await mkdtemp(path.join(tmpdir(), "lazygoal-contract-catalog-"));
    const sourcePath = path.join(root, "src/provider-settings.ts");
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "export interface BrowserProviderModels { ok: true; }\n");
    await mkdir(path.join(root, "generated"), { recursive: true });
    const catalog = {
        schemaVersion: 1,
        inventoryBaseline: "test",
        inventorySource: { branch: "test", commit: "test", sourceBaseline: "test", files: [] },
        reconciliation: {
            baselineCommit: "test",
            checkedCommit: "test",
            checkedAt: "2026-10-31",
            deleted: [],
            moved: [],
            changed: [],
        },
        boundaries: [],
        dynamicCompositions: [],
        entries: [createEntry()],
    };
    return { root, catalog };
}

function createEntry() {
    return {
        key: "web-contracts/src/provider-settings#BrowserProviderModels",
        declaration: "BrowserProviderModels",
        source: { path: "src/provider-settings.ts", line: 1 },
        status: "present",
        disposition: null,
        owner: "@lazygoal/web-contracts",
        module: "web-contracts",
        boundary: "web",
        section: "test",
        definition: "原生 TS",
        definitionKind: "native-ts",
        relations: [],
        consumers: [],
        protocol: {
            identity: { state: "declared", value: "web.providers.models.success" },
            version: { state: "declared", value: 1 },
        },
        generation: {
            state: "enabled",
            detail: "test",
            strategy: "typescript-json-schema",
            rootType: "BrowserProviderModels",
            declaredTypes: ["BrowserProviderModels"],
            outputDirectory: "generated",
            artifacts: {
                schemaModule: "provider-models-schema.ts",
                validator: "provider-models-validator.mjs",
                validatorTypes: "provider-models-validator.d.mts",
                manifest: "provider-models-manifest.json",
                reader: "provider-models-reader.ts",
            },
            reader: {
                module: "../contract-reader",
                dataType: "BrowserProviderModels",
                dataTypeModule: "../types",
                functionName: "readBrowserProviderModels",
                diagnosticType: "BrowserProviderModelsUnknownFieldDiagnostic",
                resultType: "BrowserProviderModelsReadResult",
                names: {
                    schema: "browserProviderModelsSchema",
                    metadata: "browserProviderModelsMetadata",
                    validator: "validateBrowserProviderModels",
                },
            },
        },
        validation: { state: "runtime-schema", detail: "test" },
        role: "boundary-root",
        inventory: { file: "test", line: 1 },
    };
}
