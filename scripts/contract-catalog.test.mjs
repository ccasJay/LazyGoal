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

test("catalog registers only generated boundary roots and carries no migration ledger", async () => {
    const catalog = await loadContractCatalog();
    assert.deepEqual(Object.keys(catalog), ["schemaVersion", "boundaries", "dynamicCompositions", "entries"]);
    assert.equal(catalog.entries.length, 140);
    assert.equal(collectEnabledContractEntries(catalog).length, catalog.entries.length);
    assert.equal(catalog.boundaries.length, 18);
    assert.equal(catalog.dynamicCompositions.length, 3);
    for (const entry of catalog.entries) {
        assert.ok(!("status" in entry) && !("disposition" in entry) && !("inventory" in entry), entry.key);
        assert.ok(!("currentPath" in entry.source), entry.key);
        assert.ok(!("inventoryValue" in entry.protocol.identity) && !("inventoryValue" in entry.protocol.version), entry.key);
        assert.equal(entry.generation.state, "enabled", entry.key);
        assert.equal(entry.definitionKind, "native-ts", entry.key);
    }
    for (const boundary of catalog.boundaries) assert.ok(!("inventory" in boundary), boundary.entry ?? boundary.root);
});

test("catalog query locates web, model, tools, snapshot and dynamic composition entries", async () => {
    const catalog = await loadContractCatalog();

    const web = queryContractCatalog(catalog, "BrowserActivityPage");
    assert.ok(web.some(entry => entry.key === "web-contracts/src/wire#BrowserActivityPage"));
    assert.ok(!queryContractCatalog(catalog, "BrowserActivityPosition").length);

    const provider = queryContractCatalog(catalog, "web.providers.models.success");
    assert.ok(provider.some(entry => entry.key === "web-contracts/src/wire#BrowserProviderModels"));
    assert.equal(provider.find(entry => entry.key === "web-contracts/src/wire#BrowserProviderModels").generation.state, "enabled");

    const tools = queryContractCatalog(catalog, "ReadFileInput");
    assert.ok(tools.some(entry => entry.key === "tools/src/read-file.ts#ReadFileInput" && entry.generation.state === "enabled"));
    assert.ok(!queryContractCatalog(catalog, "READ_FILE_INPUT_CONTRACT").length);

    const snapshot = queryContractCatalog(catalog, "GoalSnapshotV1");
    assert.ok(snapshot.some(entry => entry.key === "storage/src/goal-snapshot#GoalSnapshotV1"));
    assert.ok(snapshot.some(entry => entry.role === "boundary-root"));
    assert.ok(!snapshot.some(entry => entry.key === "storage/src/goal-snapshot#GoalSnapshotV1Schema"));

    const dynamic = catalog.dynamicCompositions.find(entry =>
        entry.key === "model-contracts/model-output/bound-factory#createBoundModelOutputContractBundle");
    assert.deepEqual(dynamic.components, [
        "BoundModelOutputRequest",
        "AuthorizedToolBinding",
        "ModelOutputBindingSet",
        "ModelOutputBundle",
    ]);
    assert.equal(dynamic.conditions.length, 4);

    const dynamicMatches = queryContractCatalogIndex(catalog, "createBoundModelOutputContractBundle");
    assert.ok(dynamicMatches.dynamicCompositions.some(entry => entry.key === dynamic.key));

    const boundaryMatches = queryContractCatalogIndex(catalog, "Goal Snapshot");
    const snapshotBoundary = boundaryMatches.boundaries.find(entry => entry.root === "Goal Snapshot");
    assert.deepEqual(snapshotBoundary.catalogKeys, ["storage/src/goal-snapshot#GoalSnapshotV1"]);
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

test("catalog rejects missing sources and unsupported enabled registrations", async t => {
    const fixture = await createCatalogFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const missingSource = structuredClone(fixture.catalog);
    missingSource.entries[0].source.path = "src/missing.ts";
    await assert.rejects(
        validateContractCatalog(missingSource, { repositoryRoot: fixture.root }),
        /Catalog source is missing/,
    );

    const nonGenerated = structuredClone(fixture.catalog);
    nonGenerated.entries[0].generation = { state: "none", detail: "test" };
    await assert.rejects(
        validateContractCatalog(nonGenerated, { validateSources: false }),
        /Catalog only registers generated boundary roots/,
    );

    const retiredDefinition = structuredClone(fixture.catalog);
    retiredDefinition.entries[0].definitionKind = "zod";
    await assert.rejects(
        validateContractCatalog(retiredDefinition, { validateSources: false }),
        /Invalid Catalog definition kind/,
    );

    const unsupportedDefinition = structuredClone(fixture.catalog);
    unsupportedDefinition.entries[0].definitionKind = "derived";
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
    assert.equal(enabled.length, 140);
    const paths = enabled.flatMap(contractArtifactPaths);
    assert.equal(new Set(paths).size, paths.length);
    assert.ok(paths.every(item => !path.isAbsolute(item) && !item.split("/").includes("..")));
    assert.ok(paths.includes("packages/web-contracts/src/generated/provider-models-binding.ts"));
    assert.ok(paths.includes("packages/web-contracts/src/generated/goal-list-binding.ts"));
    assert.ok(paths.includes("packages/storage/src/generated/goal-snapshot-binding.ts"));
    assert.ok(paths.includes("packages/storage/src/generated/agent-profile-file-binding.ts"));
    assert.ok(paths.includes("packages/storage/src/generated/context-retrieval-index-sidecar-binding.ts"));
    assert.ok(paths.includes("packages/tools/src/generated/write-file/binding.ts"));
    assert.ok(paths.includes("packages/model-contracts/src/generated/system-ask-user-input/binding.ts"));
});

async function createCatalogFixture() {
    const root = await mkdtemp(path.join(tmpdir(), "lazygoal-contract-catalog-"));
    const sourcePath = path.join(root, "src/provider-settings.ts");
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "export interface BrowserProviderModels { ok: true; }\n");
    await mkdir(path.join(root, "generated"), { recursive: true });
    const catalog = {
        schemaVersion: 1,
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
    };
}
