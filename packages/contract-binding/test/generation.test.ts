import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import {
    findStaleContractArtifacts,
    generateContractArtifacts,
} from "../../../scripts/generate-contracts.mjs";

interface RuntimeIssue {
    readonly path: string;
    readonly code: string;
}

type RuntimeReadResult =
    | { readonly ok: true; readonly data: unknown; readonly diagnostic?: { readonly paths: readonly string[] } }
    | { readonly ok: false; readonly issues: readonly RuntimeIssue[] };

interface RuntimeProjection {
    readonly schema: Record<string, unknown>;
    readonly localConstraints: readonly {
        readonly path: string;
        readonly keywords: readonly string[];
    }[];
    decode(value: unknown): RuntimeReadResult;
}

interface RuntimeBinding {
    readonly contractId: string;
    read(value: unknown, policy: "strip" | "reject"): RuntimeReadResult;
    modelProjection(): RuntimeProjection;
}

interface EntryOptions {
    readonly rootType: string;
    readonly declaredTypes: readonly string[];
    readonly identity: string;
    readonly outputDirectory: string;
    readonly artifactPrefix: string;
    readonly exportName: string;
    readonly schemaName: string;
    readonly metadataName: string;
    readonly validatorName: string;
    readonly bindingModule: string;
    readonly dataTypeModule: string;
}

const sampleSource = `export interface SampleNested {
    label: string;
    optionalLabel?: string;
}

export interface ToolSample {
    action: string;
    /**
     * @minimum 1
     * @maximum 10
     */
    count: number;
    kind: "alpha" | "beta";
    nested: SampleNested;
    note?: string;
}

export interface ModelSample {
    message: string;
    nested: SampleNested;
    metadata?: string;
}

export interface WebSample {
    query: string;
    limit?: number;
    nested: SampleNested;
}

export interface ConfigNested {
    /**
     * @minLength 1
     * @maxLength 8
     */
    token: string;
}

export interface ConfigSample {
    schemaVersion: 1;
    nested: ConfigNested;
}
`;

test("Catalog generates isolated tool, model, web and strict-config bindings", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const { artifacts } = await generateContractArtifacts(fixture.options);
    assert.equal(artifacts.size, 20);
    await writeArtifacts(fixture.root, artifacts);

    const toolBinding = await importBinding(fixture.root, "generated/tool/tool-sample-binding.ts") as { toolSampleBinding: RuntimeBinding };
    const modelBinding = await importBinding(fixture.root, "generated/model/model-sample-binding.ts") as { modelSampleBinding: RuntimeBinding };
    const webBinding = await importBinding(fixture.root, "generated/web/web-sample-binding.ts") as { webSampleBinding: RuntimeBinding };
    const configBinding = await importBinding(fixture.root, "generated/config/config-sample-binding.ts") as { configSampleBinding: RuntimeBinding };

    assert.equal(toolBinding.toolSampleBinding.contractId, "sample.tool");
    assert.equal(modelBinding.modelSampleBinding.contractId, "sample.model");
    assert.equal(webBinding.webSampleBinding.contractId, "sample.web");
    assert.equal(configBinding.configSampleBinding.contractId, "sample.config");

    const toolInput = {
        action: "read",
        count: 3,
        kind: "alpha",
        nested: { label: "ok", debug: "nested-secret" },
        note: "n",
        debug: "root-secret",
    };
    const original = structuredClone(toolInput);
    const toolResult = toolBinding.toolSampleBinding.read(toolInput, "strip");
    assert.equal(toolResult.ok, true);
    if (!toolResult.ok) return;
    assert.deepEqual(toolResult.data, {
        action: "read",
        count: 3,
        kind: "alpha",
        nested: { label: "ok" },
        note: "n",
    });
    assert.ok(toolResult.diagnostic);
    assert.deepEqual([...toolResult.diagnostic.paths].sort(), ["/*", "/nested/*"]);
    assert.deepEqual(toolInput, original);
    assert.equal(JSON.stringify(toolResult).includes("secret"), false);

    const modelResult = modelBinding.modelSampleBinding.read({
        message: "hello",
        nested: { label: "nested", optionalLabel: "optional", debug: "model-secret" },
        metadata: "meta",
        debug: "model-root-secret",
    }, "strip");
    assert.equal(modelResult.ok, true);
    if (!modelResult.ok) return;
    assert.deepEqual(modelResult.data, {
        message: "hello",
        nested: { label: "nested", optionalLabel: "optional" },
        metadata: "meta",
    });

    const projection = modelBinding.modelSampleBinding.modelProjection();
    const projectionProperties = projection.schema.properties as Record<string, Record<string, unknown>>;
    assert.deepEqual(projectionProperties.metadata?.type, ["string", "null"]);
    const decoded = projection.decode({
        message: "hello",
        nested: { label: "nested", optionalLabel: null, debug: "nested-wire-secret" },
        metadata: null,
        debug: "wire-secret",
    });
    assert.equal(decoded.ok, true);
    if (!decoded.ok) return;
    assert.deepEqual(decoded.data, {
        message: "hello",
        nested: { label: "nested" },
    });
    assert.ok(decoded.diagnostic);
    assert.deepEqual([...decoded.diagnostic.paths].sort(), ["/*", "/nested/*"]);
    assert.equal(JSON.stringify(decoded).includes("wire-secret"), false);

    const configProjection = configBinding.configSampleBinding.modelProjection();
    assert.deepEqual(configProjection.localConstraints, [{
        path: "#/properties/nested/properties/token",
        keywords: ["minLength", "maxLength"],
    }]);
    const configProjected = configProjection.schema.properties as Record<string, Record<string, unknown>>;
    const projectedNested = configProjected.nested?.properties as Record<string, Record<string, unknown>>;
    assert.deepEqual(projectedNested.token, { type: "string" });
    const invalidConfigProjection = configProjection.decode({
        schemaVersion: 1,
        nested: { token: "" },
    });
    assert.equal(invalidConfigProjection.ok, false);
    if (!invalidConfigProjection.ok) {
        assert.ok(invalidConfigProjection.issues.some(issue =>
            issue.path === "/nested/token" && issue.code === "string_min_length"));
    }

    const webResult = webBinding.webSampleBinding.read({
        query: "q",
        limit: 5,
        nested: { label: "web" },
        debug: "web-secret",
    }, "strip");
    assert.equal(webResult.ok, true);
    if (!webResult.ok) return;
    assert.deepEqual(webResult.data, { query: "q", limit: 5, nested: { label: "web" } });

    const configInput = {
        schemaVersion: 1,
        nested: { token: "abc", debug: "config-secret" },
        debug: "config-root-secret",
    };
    const configResult = configBinding.configSampleBinding.read(configInput, "reject");
    assert.equal(configResult.ok, false);
    if (configResult.ok) return;
    assert.ok(configResult.issues.some(issue => issue.code === "extra_field" && issue.path === "/*"));
    assert.ok(configResult.issues.some(issue => issue.code === "extra_field" && issue.path === "/nested/*"));
    assert.equal(JSON.stringify(configResult).includes("config-secret"), false);

    const invalidTool = toolBinding.toolSampleBinding.read({
        action: "read",
        count: 20,
        kind: "gamma",
        nested: { label: "ok" },
    }, "strip");
    assert.equal(invalidTool.ok, false);
    if (invalidTool.ok) return;
    assert.ok(invalidTool.issues.some(issue => issue.path === "/count" && issue.code === "number_maximum"));
    assert.ok(invalidTool.issues.some(issue => issue.path === "/kind" && issue.code === "invalid_enum_value"));
});

test("Catalog binding artifacts retain identity, constraints and deterministic drift checks", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const first = await generateContractArtifacts(fixture.options);
    await writeArtifacts(fixture.root, first.artifacts);
    assert.deepEqual(await findStaleContractArtifacts(fixture.options), []);

    const second = await generateContractArtifacts(fixture.options);
    assert.deepEqual([...second.artifacts], [...first.artifacts]);

    const toolManifest = JSON.parse(artifact(first.artifacts, "generated/tool/tool-sample-manifest.json"));
    assert.equal(toolManifest.contractId, "sample.tool");
    assert.equal(toolManifest.version, 1);
    assert.equal(toolManifest.schemaDialect, "http://json-schema.org/draft-07/schema#");
    assert.match(toolManifest.source.sha256, /^[a-f0-9]{64}$/);
    assert.equal(toolManifest.generator.name, "ts-json-schema-generator");
    assert.equal(toolManifest.validator.name, "Ajv standalone");

    const toolSchema = artifact(first.artifacts, "generated/tool/tool-sample-schema.ts");
    assert.match(toolSchema, /\\"minimum\\":1/);
    assert.match(toolSchema, /\\"maximum\\":10/);
    assert.ok(toolSchema.includes("alpha"));
    assert.ok(toolSchema.includes("beta"));

    const toolBinding = artifact(first.artifacts, "generated/tool/tool-sample-binding.ts");
    assert.match(toolBinding, /createContractBinding/);
    assert.match(toolBinding, /toolSampleMetadata\.contractId/);
    assert.match(toolBinding, /validateToolSample/);
    assert.equal(toolBinding.includes("count:"), false);

    const configSchema = artifact(first.artifacts, "generated/config/config-sample-schema.ts");
    assert.match(configSchema, /\\"minLength\\":1/);
    assert.match(configSchema, /\\"maxLength\\":8/);

    await writeFile(
        fixture.sampleFile,
        sampleSource.replace("@minimum 1", "@minimum 2"),
    );
    const changed = await generateContractArtifacts(fixture.options);
    assert.notEqual(
        artifact(changed.artifacts, "generated/tool/tool-sample-schema.ts"),
        artifact(first.artifacts, "generated/tool/tool-sample-schema.ts"),
    );
    const stale = await findStaleContractArtifacts(fixture.options);
    assert.deepEqual(stale.sort(), [
        "generated/tool/tool-sample-manifest.json",
        "generated/tool/tool-sample-schema.ts",
        "generated/tool/tool-sample-validator.mjs",
    ]);

    await writeFile(fixture.sampleFile, sampleSource);
    await unlink(path.join(fixture.root, "generated/tool/tool-sample-manifest.json"));
    assert.ok((await findStaleContractArtifacts(fixture.options)).includes("generated/tool/tool-sample-manifest.json"));
});

test("Catalog binding generation rejects unsupported annotations and structures", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    await writeFile(fixture.sampleFile, sampleSource.replace("@minimum 1", "@patten 1"));
    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /Unsupported JSDoc tag @patten/,
    );

    await writeFile(fixture.sampleFile, sampleSource.replace("action: string;", "action: Date;"));
    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /Unsupported JSON Schema keyword "format"/,
    );

    await writeFile(fixture.sampleFile, sampleSource.replace("@minLength 1", "@minLength -1"));
    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /non-negative integer/,
    );

    await writeFile(fixture.sampleFile, sampleSource.replace("@maximum 10", "@maximum 0"));
    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /must not exceed/,
    );
});

async function createFixture() {
    const root = await mkdtemp(path.join(tmpdir(), "lazygoal-contract-binding-generation-"));
    const sampleFile = path.join(root, "src/samples.ts");
    await mkdir(path.dirname(sampleFile), { recursive: true });
    await writeFile(sampleFile, sampleSource);
    await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({
        compilerOptions: { strict: true },
        include: ["src/**/*.ts"],
    }, null, 2));
    await mkdir(path.join(root, "contracts"), { recursive: true });
    await writeFile(
        path.join(root, "contracts/catalog.json"),
        JSON.stringify(createCatalog(root), null, 2),
    );
    return {
        root,
        sampleFile,
        options: { repositoryRoot: root, catalogPath: "contracts/catalog.json" },
    };
}

function createCatalog(root: string) {
    const bindingModule = path.resolve(import.meta.dirname, "../src/index.ts").replaceAll("\\", "/");
    const dataTypeModule = path.join(root, "src/samples.ts").replaceAll("\\", "/");
    return {
        schemaVersion: 1,

        boundaries: [],
        dynamicCompositions: [],
        entries: [
            createEntry({
                rootType: "ToolSample",
                declaredTypes: ["ToolSample", "SampleNested"],
                identity: "sample.tool",
                outputDirectory: "generated/tool",
                artifactPrefix: "tool-sample",
                exportName: "toolSampleBinding",
                schemaName: "toolSampleSchema",
                metadataName: "toolSampleMetadata",
                validatorName: "validateToolSample",
                bindingModule,
                dataTypeModule,
            }),
            createEntry({
                rootType: "ModelSample",
                declaredTypes: ["ModelSample", "SampleNested"],
                identity: "sample.model",
                outputDirectory: "generated/model",
                artifactPrefix: "model-sample",
                exportName: "modelSampleBinding",
                schemaName: "modelSampleSchema",
                metadataName: "modelSampleMetadata",
                validatorName: "validateModelSample",
                bindingModule,
                dataTypeModule,
            }),
            createEntry({
                rootType: "WebSample",
                declaredTypes: ["WebSample", "SampleNested"],
                identity: "sample.web",
                outputDirectory: "generated/web",
                artifactPrefix: "web-sample",
                exportName: "webSampleBinding",
                schemaName: "webSampleSchema",
                metadataName: "webSampleMetadata",
                validatorName: "validateWebSample",
                bindingModule,
                dataTypeModule,
            }),
            createEntry({
                rootType: "ConfigSample",
                declaredTypes: ["ConfigSample", "ConfigNested"],
                identity: "sample.config",
                outputDirectory: "generated/config",
                artifactPrefix: "config-sample",
                exportName: "configSampleBinding",
                schemaName: "configSampleSchema",
                metadataName: "configSampleMetadata",
                validatorName: "validateConfigSample",
                bindingModule,
                dataTypeModule,
            }),
        ],
    };
}

function createEntry({
    rootType,
    declaredTypes,
    identity,
    outputDirectory,
    artifactPrefix,
    exportName,
    schemaName,
    metadataName,
    validatorName,
    bindingModule,
    dataTypeModule,
}: EntryOptions) {
    return {
        key: `contract-binding/src/samples#${rootType}`,
        declaration: rootType,
        source: { path: "src/samples.ts", line: 1 },

        owner: "@lazygoal/contract-binding",
        module: "contract-binding",
        boundary: "test",
        section: "isolated sample",
        definition: "原生 TS",
        definitionKind: "native-ts",
        relations: [],
        consumers: [],
        protocol: {
            identity: { state: "declared", value: identity },
            version: { state: "declared", value: 1 },
        },
        generation: {
            state: "enabled",
            detail: "isolated binding sample",
            strategy: "typescript-binding",
            rootType,
            declaredTypes,
            outputDirectory,
            artifacts: {
                schemaModule: `${artifactPrefix}-schema.ts`,
                validator: `${artifactPrefix}-validator.mjs`,
                validatorTypes: `${artifactPrefix}-validator.d.mts`,
                manifest: `${artifactPrefix}-manifest.json`,
                binding: `${artifactPrefix}-binding.ts`,
            },
            binding: {
                module: bindingModule,
                dataType: rootType,
                dataTypeModule,
                exportName,
                names: {
                    schema: schemaName,
                    metadata: metadataName,
                    validator: validatorName,
                },
            },
        },
        validation: { state: "runtime-schema", detail: "generated binding" },
        role: "boundary-root",

    };
}

async function writeArtifacts(root: string, artifacts: ReadonlyMap<string, string>) {
    for (const [relativePath, content] of artifacts) {
        const absolutePath = path.join(root, relativePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, content);
    }
}

async function importBinding(root: string, relativePath: string): Promise<unknown> {
    return await import(pathToFileURL(path.join(root, relativePath)).href);
}

function artifact(artifacts: ReadonlyMap<string, string>, key: string): string {
    const value = artifacts.get(key);
    assert.ok(value, key);
    return value;
}

test("generated binding files do not embed a second field table", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const { artifacts } = await generateContractArtifacts(fixture.options);
    const binding = artifact(artifacts, "generated/tool/tool-sample-binding.ts");
    assert.equal(binding.includes("properties"), false);
    assert.equal(binding.includes("required"), false);
    assert.equal(binding.includes("count"), false);
    assert.match(binding, /createContractBinding<ToolSample>/);
});

test("generated binding artifacts are readable from disk", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const { artifacts } = await generateContractArtifacts(fixture.options);
    await writeArtifacts(fixture.root, artifacts);
    const binding = await importBinding(fixture.root, "generated/tool/tool-sample-binding.ts") as { toolSampleBinding: RuntimeBinding };
    const result = binding.toolSampleBinding.read({
        action: "read",
        count: 1,
        kind: "beta",
        nested: { label: "ok" },
    }, "strip");
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.deepEqual((result.data as { nested: unknown }).nested, { label: "ok" });
    }
    assert.ok(await readFile(path.join(fixture.root, "generated/tool/tool-sample-binding.ts"), "utf8"));
});
