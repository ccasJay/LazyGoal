import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import {
    assertSupportedSchema,
    findStaleContractArtifacts,
    generateContractArtifacts,
} from "../../../scripts/generate-contracts.mjs";

const contractSource = `export interface SampleNested {
    label: string;
}

export type SampleDiscriminated =
    | {
        readonly kind: "alpha";
        /**
         * @pattern ^[a-z]+$
         */
        readonly label: string;
        readonly nested: SampleNested;
    }
    | {
        readonly kind: "beta";
        readonly count: number;
    };

export interface SampleTree {
    readonly value: string;
    readonly children: readonly SampleTree[];
}

export type SampleJson =
    | string
    | number
    | boolean
    | null
    | readonly SampleJson[]
    | { readonly [key: string]: SampleJson };

export interface SampleEnvelope {
    /**
     * @pattern ^[a-z]+$
     * @minLength 2
     * @maxLength 8
     */
    readonly name: string;
    /**
     * @minimum 1
     * @maximum 10
     */
    readonly count: number;
    /**
     * @asType integer
     * @minimum 1
     * @maximum 10
     */
    readonly integerCount: number;
    /**
     * @asType integer
     * @minimum 0
     * @maximum 100
     */
    readonly optionalInteger?: number;
    readonly nullable: string | null;
    readonly union: SampleDiscriminated;
    readonly tree: SampleTree;
    readonly json: SampleJson;
    readonly metadata: Record<string, unknown>;
    readonly payload: unknown;
    readonly items: readonly SampleDiscriminated[];
}
`;

const declaredTypes = [
    "SampleEnvelope",
    "SampleDiscriminated",
    "SampleNested",
    "SampleTree",
    "SampleJson",
];

test("Catalog generation emits unions, recursion, open JSON, arrays and constraints", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const { artifacts } = await generateContractArtifacts(fixture.options);
    const schemaModule = artifact(artifacts, "generated/sample/sample-envelope-schema.ts");

    assert.match(schemaModule, /\\"anyOf\\"/);
    assert.match(schemaModule, /\\"const\\":\\"alpha\\"/);
    assert.match(schemaModule, /\\"type\\":\[\\"string\\",\\"null\\"\]/);
    assert.match(schemaModule, /\\"additionalProperties\\":\{\}/);
    assert.match(schemaModule, /\\"pattern\\":\\"\^\[a-z\]\+\$\\"/);
    assert.match(schemaModule, /\\"minimum\\":1/);
    assert.match(schemaModule, /\\"maximum\\":10/);
    assert.match(
        schemaModule,
        /\\"integerCount\\":\{\\"type\\":\\"integer\\",\\"minimum\\":1,\\"maximum\\":10\}/,
    );
    assert.match(
        schemaModule,
        /\\"optionalInteger\\":\{\\"type\\":\\"integer\\",\\"minimum\\":0,\\"maximum\\":100\}/,
    );
    assert.match(schemaModule, /\\"minLength\\":2/);
    assert.match(schemaModule, /\\"maxLength\\":8/);
    assert.match(schemaModule, /\\"items\\":\{\\"\$ref\\":\\"#\/definitions\/SampleTree\\"\}/);
    assert.match(schemaModule, /\\"items\\":\{\\"\$ref\\":\\"#\/definitions\/SampleDiscriminated\\"\}/);

    const manifest = JSON.parse(artifact(artifacts, "generated/sample/sample-envelope-manifest.json"));
    assert.equal(manifest.contractId, "sample.envelope");
    assert.equal(manifest.version, 1);
});

test("generated binding reads union, recursive and open JSON values end to end", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const { artifacts } = await generateContractArtifacts(fixture.options);
    await writeArtifacts(fixture.root, artifacts);
    const generated = await import(
        pathToFileURL(path.join(fixture.root, "generated/sample/sample-envelope-binding.ts")).href
    ) as {
        readonly sampleEnvelopeBinding: {
            read(value: unknown, policy: "strip" | "reject"): {
                readonly ok: boolean;
                readonly data?: unknown;
                readonly diagnostic?: { readonly paths: readonly string[] };
                readonly issues?: readonly { readonly path: string; readonly code: string }[];
            };
        };
    };
    const binding = generated.sampleEnvelopeBinding;
    const input = {
        name: "abc",
        count: 5,
        integerCount: 5,
        optionalInteger: 7,
        nullable: null,
        union: {
            kind: "alpha",
            label: "leaf",
            nested: { label: "ok", debug: "nested-secret" },
            debug: "union-secret",
        },
        tree: {
            value: "root",
            debug: "root-secret",
            children: [{ value: "child", children: [], debug: "child-secret" }],
        },
        json: { open: [1, { deep: "value" }] },
        metadata: { arbitrary: [true, null] },
        payload: { anything: "goes" },
        items: [{ kind: "beta", count: 2, debug: "item-secret" }],
    };
    const original = structuredClone(input);

    const stripped = binding.read(input, "strip");
    assert.equal(stripped.ok, true);
    if (!stripped.ok) return;
    assert.deepEqual(stripped.data, {
        name: "abc",
        count: 5,
        integerCount: 5,
        optionalInteger: 7,
        nullable: null,
        union: { kind: "alpha", label: "leaf", nested: { label: "ok" } },
        tree: {
            value: "root",
            children: [{ value: "child", children: [] }],
        },
        json: { open: [1, { deep: "value" }] },
        metadata: { arbitrary: [true, null] },
        payload: { anything: "goes" },
        items: [{ kind: "beta", count: 2 }],
    });
    assert.deepEqual(
        [...(stripped.diagnostic?.paths ?? [])].sort(),
        [
            "/items/0/debug",
            "/tree/children/0/debug",
            "/tree/debug",
            "/union/debug",
            "/union/nested/debug",
        ],
    );
    assert.deepEqual(input, original);
    assert.equal(JSON.stringify(stripped).includes("secret"), false);

    const rejected = binding.read(input, "reject");
    assert.equal(rejected.ok, false);
    if (rejected.ok) return;
    assert.ok(rejected.issues?.some(issue => issue.path === "/union/debug" && issue.code === "unknown"));

    const invalidName = binding.read({ ...input, name: "A" }, "strip");
    assert.equal(invalidName.ok, false);
    if (!invalidName.ok) {
        assert.ok(invalidName.issues?.some(issue => issue.path === "/name" && issue.code === "pattern"));
    }

    const invalidCount = binding.read({ ...input, count: 0 }, "strip");
    assert.equal(invalidCount.ok, false);
    if (!invalidCount.ok) {
        assert.ok(invalidCount.issues?.some(issue => issue.path === "/count" && issue.code === "range"));
    }

    const fractionalInteger = binding.read({ ...input, integerCount: 1.5 }, "strip");
    assert.equal(fractionalInteger.ok, false);
    if (!fractionalInteger.ok) {
        assert.ok(fractionalInteger.issues?.some(issue =>
            issue.path === "/integerCount" && issue.code === "type"));
    }

    const fractionalOptionalInteger = binding.read({ ...input, optionalInteger: 2.5 }, "strip");
    assert.equal(fractionalOptionalInteger.ok, false);
    if (!fractionalOptionalInteger.ok) {
        assert.ok(fractionalOptionalInteger.issues?.some(issue =>
            issue.path === "/optionalInteger" && issue.code === "type"));
    }

    const outOfRangeInteger = binding.read({ ...input, integerCount: 0 }, "strip");
    assert.equal(outOfRangeInteger.ok, false);
    if (!outOfRangeInteger.ok) {
        assert.ok(outOfRangeInteger.issues?.some(issue =>
            issue.path === "/integerCount" && issue.code === "range"));
    }
});

test("integer annotation drift is detected from the source fingerprint", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const baseline = await generateContractArtifacts(fixture.options);
    await writeArtifacts(fixture.root, baseline.artifacts);
    assert.deepEqual(await findStaleContractArtifacts(fixture.options), []);

    await writeFile(fixture.sampleFile, contractSource.replace(
        "     * @asType integer\n     * @minimum 1\n     * @maximum 10\n     */\n    readonly integerCount: number;",
        "     * @minimum 1\n     * @maximum 10\n     */\n    readonly integerCount: number;",
    ));
    const changed = await generateContractArtifacts(fixture.options);
    assert.notEqual(
        artifact(changed.artifacts, "generated/sample/sample-envelope-schema.ts"),
        artifact(baseline.artifacts, "generated/sample/sample-envelope-schema.ts"),
    );
    assert.deepEqual((await findStaleContractArtifacts(fixture.options)).sort(), [
        "generated/sample/sample-envelope-manifest.json",
        "generated/sample/sample-envelope-schema.ts",
        "generated/sample/sample-envelope-validator.mjs",
    ]);
});

test("Catalog generation rejects unsupported or misapplied @asType", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    await writeFile(fixture.sampleFile, contractSource.replace("@asType integer", "@asType string"));
    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /Unsupported JSDoc @asType value "string" in SampleEnvelope; only integer is supported/,
    );

    await writeFile(
        fixture.sampleFile,
        contractSource.replace(
            "    readonly nullable: string | null;",
            "    /** @asType integer */\n    readonly nullable: string | null;",
        ),
    );
    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /JSDoc @asType integer is supported only on number fields in SampleEnvelope/,
    );

    await writeFile(
        fixture.sampleFile,
        contractSource.replace("readonly integerCount: number;", "readonly integerCount: number | null;"),
    );
    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /JSDoc @asType integer is supported only on number fields in SampleEnvelope/,
    );

    await writeFile(
        fixture.sampleFile,
        contractSource.replace("     * @asType integer\n     * @minimum 1", "     * @asType integer\n     * @asType integer\n     * @minimum 1"),
    );
    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /Duplicate JSDoc @asType on SampleEnvelope/,
    );
});

test("Catalog generation rejects types omitted from declaredTypes", async t => {
    const fixture = await createFixture({ declaredTypes: declaredTypes.filter(name => name !== "SampleNested") });
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    await assert.rejects(
        generateContractArtifacts(fixture.options),
        /Generated schema includes a type absent from declaredTypes: SampleNested/,
    );
});

test("shared schema validation rejects tuples with an explicit error", () => {
    const tupleSchema = {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
            pair: {
                type: "array",
                items: [{ type: "string" }, { type: "number" }],
            },
        },
        required: ["pair"],
        additionalProperties: false,
    };

    assert.throws(
        () => assertSupportedSchema(tupleSchema, "Sample"),
        /Tuple JSON Schema items are not supported/,
    );
});

async function createFixture({ declaredTypes: declared = declaredTypes } = {}) {
    const root = await mkdtemp(path.join(tmpdir(), "lazygoal-contract-structures-"));
    const contractFile = path.join(root, "src/samples.ts");
    await mkdir(path.dirname(contractFile), { recursive: true });
    await writeFile(contractFile, contractSource);
    await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({
        compilerOptions: { strict: true },
        include: ["src/**/*.ts"],
    }, null, 2));
    await mkdir(path.join(root, "contracts"), { recursive: true });
    await writeFile(
        path.join(root, "contracts/catalog.json"),
        JSON.stringify(createCatalog(root, declared), null, 2),
    );
    return {
        root,
        sampleFile: contractFile,
        options: { repositoryRoot: root, catalogPath: "contracts/catalog.json" },
    };
}

function createCatalog(root: string, declared: readonly string[]) {
    const bindingModule = path.resolve(import.meta.dirname, "../src/index.ts").replaceAll("\\", "/");
    const dataTypeModule = path.join(root, "src/samples.ts").replaceAll("\\", "/");
    return {
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
        entries: [
            {
                key: "contract-binding/src/samples#SampleEnvelope",
                declaration: "SampleEnvelope",
                source: { path: "src/samples.ts", line: 1 },
                status: "present",
                disposition: null,
                owner: "@lazygoal/contract-binding",
                module: "contract-binding",
                boundary: "test",
                section: "isolated sample",
                definition: "原生 TS",
                definitionKind: "native-ts",
                relations: [],
                consumers: [],
                protocol: {
                    identity: { state: "declared", value: "sample.envelope" },
                    version: { state: "declared", value: 1 },
                },
                generation: {
                    state: "enabled",
                    detail: "isolated structure sample",
                    strategy: "typescript-binding",
                    rootType: "SampleEnvelope",
                    declaredTypes: declared,
                    outputDirectory: "generated/sample",
                    artifacts: {
                        schemaModule: "sample-envelope-schema.ts",
                        validator: "sample-envelope-validator.mjs",
                        validatorTypes: "sample-envelope-validator.d.mts",
                        manifest: "sample-envelope-manifest.json",
                        binding: "sample-envelope-binding.ts",
                    },
                    binding: {
                        module: bindingModule,
                        dataType: "SampleEnvelope",
                        dataTypeModule,
                        exportName: "sampleEnvelopeBinding",
                        names: {
                            schema: "sampleEnvelopeSchema",
                            metadata: "sampleEnvelopeMetadata",
                            validator: "validateSampleEnvelope",
                        },
                    },
                },
                validation: { state: "runtime-schema", detail: "generated binding" },
                role: "boundary-root",
                inventory: { file: "test", line: 1 },
            },
        ],
    };
}

function artifact(artifacts: ReadonlyMap<string, string>, key: string): string {
    const value = artifacts.get(key);
    assert.ok(value, key);
    return value;
}

async function writeArtifacts(root: string, artifacts: ReadonlyMap<string, string>) {
    for (const [relativePath, content] of artifacts) {
        const absolutePath = path.join(root, relativePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, content);
    }
}
