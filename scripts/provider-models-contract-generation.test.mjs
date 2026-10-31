import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
    findStaleContractArtifacts,
    generateContractArtifacts,
} from "./generate-contracts.mjs";

const contractPath = "src/provider-settings.ts";
const source = `export interface BrowserProviderModel {
    /** @pattern \\S */
    id: string;
    name: string;
}

export interface BrowserProviderModels {
    ok: true;
    models: BrowserProviderModel[];
}
`;

test("catalog generation is reproducible and check mode leaves artifacts untouched", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const first = await generateContractArtifacts(fixture.options);
    await writeArtifacts(fixture.root, first.artifacts);
    const originalFiles = await readArtifacts(fixture.root, first.artifacts);

    assert.equal(first.artifacts.size, 5);
    assert.deepEqual(await findStaleContractArtifacts(fixture.options), []);
    assert.deepEqual(await findStaleContractArtifacts(fixture.options), []);

    const second = await generateContractArtifacts(fixture.options);
    assert.deepEqual([...second.artifacts], [...first.artifacts]);
    assert.deepEqual(await readArtifacts(fixture.root, first.artifacts), originalFiles);

    const manifest = JSON.parse(first.artifacts.get("generated/provider-models-manifest.json"));
    assert.equal(manifest.contractId, "web.providers.models.success");
    assert.equal(manifest.version, 1);
    assert.equal(manifest.schemaDialect, "http://json-schema.org/draft-07/schema#");
    assert.match(manifest.source.sha256, /^[a-f0-9]{64}$/);
    assert.equal(manifest.generator.name, "ts-json-schema-generator");
    assert.equal(manifest.validator.name, "Ajv standalone");

    const reader = first.artifacts.get("generated/provider-models-reader.ts");
    assert.match(reader, /readContractValue/);
    assert.match(reader, /export function readBrowserProviderModels/);
    assert.match(reader, /browserProviderModelsMetadata\.contractId/);

    const schemaModule = first.artifacts.get("generated/provider-models-schema.ts");
    assert.match(schemaModule, /urn:lazygoal:contracts:web\.providers\.models\.success:v1/);
});

test("catalog generation detects JSDoc constraint drift and missing artifacts", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const baseline = await generateContractArtifacts(fixture.options);
    await writeArtifacts(fixture.root, baseline.artifacts);
    await writeFile(
        fixture.contractFile,
        source.replace("@pattern \\S", "@pattern ^[a-z]+$"),
    );

    const changed = await generateContractArtifacts(fixture.options);
    assert.notEqual(
        changed.artifacts.get("generated/provider-models-schema.ts"),
        baseline.artifacts.get("generated/provider-models-schema.ts"),
    );
    const stale = await findStaleContractArtifacts(fixture.options);
    assert.deepEqual(stale.sort(), [
        "generated/provider-models-manifest.json",
        "generated/provider-models-schema.ts",
        "generated/provider-models-validator.mjs",
    ]);

    await unlink(path.join(fixture.root, "generated/provider-models-manifest.json"));
    assert.ok((await findStaleContractArtifacts(fixture.options)).includes("generated/provider-models-manifest.json"));
});

test("catalog generation rejects misspelled, misplaced and invalid JSDoc constraints", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    await writeFile(fixture.contractFile, source.replace("@pattern \\S", "@patten \\S"));
    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /Unsupported JSDoc tag @patten/,
    );

    await writeFile(fixture.contractFile, source.replace("@pattern \\S", "@minimum 1"));
    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /Unsupported JSDoc tag @minimum/,
    );

    await writeFile(fixture.contractFile, source.replace("@pattern \\S", "@pattern ["));
    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /Invalid JSDoc @pattern/,
    );

    await writeFile(
        fixture.contractFile,
        source.replace("    /** @pattern \\S */\n    id: string;", "    /** @pattern \\S */\n    id: number;"),
    );
    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /JSDoc @pattern is supported only on string fields/,
    );
});

test("catalog generation rejects schema structures outside the shared reader subset", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    await writeFile(
        fixture.contractFile,
        source.replace("    models: BrowserProviderModel[];", "    models: BrowserProviderModel[];\n    nullable?: string | null;"),
    );
    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /Unsupported JSON Schema/,
    );

    await writeFile(
        fixture.contractFile,
        source.replace("    models: BrowserProviderModel[];", "    models: BrowserProviderModel[];\n    [key: string]: unknown;"),
    );
    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /Open object schemas are not supported/,
    );
});

async function createFixture() {
    const root = await mkdtemp(path.join(tmpdir(), "lazygoal-provider-models-generation-"));
    const contractFile = path.join(root, contractPath);
    await mkdir(path.dirname(contractFile), { recursive: true });
    await writeFile(contractFile, source);
    await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({
        compilerOptions: { strict: true },
        include: ["src/**/*.ts"],
    }, null, 2));
    await mkdir(path.join(root, "contracts"), { recursive: true });
    await writeFile(
        path.join(root, "contracts/catalog.json"),
        JSON.stringify(createCatalog(), null, 2),
    );
    return {
        root,
        contractFile,
        options: { repositoryRoot: root, catalogPath: "contracts/catalog.json" },
    };
}

function createCatalog(overrides = {}) {
    return {
        schemaVersion: 1,
        inventoryBaseline: "test",
        reconciliation: { baselineCommit: "test", checkedCommit: "test", checkedAt: "2026-10-31", deleted: [], moved: [], changed: [] },
        boundaries: [],
        dynamicCompositions: [],
        entries: [createEntry(overrides)],
    };
}

function createEntry(overrides = {}) {
    return {
        key: "web-contracts/src/provider-settings#BrowserProviderModels",
        declaration: "BrowserProviderModels",
        source: { path: contractPath, line: 6 },
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
            declaredTypes: ["BrowserProviderModel", "BrowserProviderModels"],
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
        ...overrides,
    };
}

async function writeArtifacts(root, artifacts) {
    for (const [relativePath, content] of artifacts) {
        const absolutePath = path.join(root, relativePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, content);
    }
}

async function readArtifacts(root, artifacts) {
    return Promise.all([...artifacts.keys()].map(async relativePath => [
        relativePath,
        await readFile(path.join(root, relativePath), "utf8"),
    ]));
}
