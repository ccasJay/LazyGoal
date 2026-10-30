import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
    findStaleProviderModelsArtifacts,
    generateProviderModelsArtifacts,
} from "./generate-provider-models-contract.mjs";

const contractPath = "packages/web-contracts/src/provider-settings.ts";
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

test("provider model generation is reproducible and check mode leaves artifacts untouched", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const first = await generateProviderModelsArtifacts(fixture.options);
    await writeArtifacts(first);
    const originalFiles = await readArtifacts(first.outputDirectory, first.artifacts);

    assert.deepEqual(await findStaleProviderModelsArtifacts(fixture.options), []);
    assert.deepEqual(await findStaleProviderModelsArtifacts(fixture.options), []);

    const second = await generateProviderModelsArtifacts(fixture.options);
    assert.deepEqual([...second.artifacts], [...first.artifacts]);
    assert.deepEqual(await readArtifacts(first.outputDirectory, first.artifacts), originalFiles);
});

test("provider model generation detects JSDoc constraint drift", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const baseline = await generateProviderModelsArtifacts(fixture.options);
    await writeArtifacts(baseline);
    await writeFile(
        fixture.contractFile,
        source.replace("@pattern \\S", "@pattern ^[a-z]+$"),
    );

    const changed = await generateProviderModelsArtifacts(fixture.options);
    assert.notEqual(
        changed.artifacts.get("provider-models-schema.ts"),
        baseline.artifacts.get("provider-models-schema.ts"),
    );
    const stale = await findStaleProviderModelsArtifacts(fixture.options);
    assert.deepEqual(stale.sort(), [
        "provider-models-manifest.json",
        "provider-models-schema.ts",
        "provider-models-validator.mjs",
    ]);
});

test("provider model generation rejects misspelled or unsupported JSDoc constraints", async t => {
    const fixture = await createFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    await writeFile(fixture.contractFile, source.replace("@pattern \\S", "@patten \\S"));
    await assert.rejects(
        generateProviderModelsArtifacts(fixture.options),
        /Unsupported JSDoc tag @patten/,
    );

    await writeFile(fixture.contractFile, source.replace("@pattern \\S", "@minimum 1"));
    await assert.rejects(
        generateProviderModelsArtifacts(fixture.options),
        /Unsupported JSDoc tag @minimum/,
    );
});

async function createFixture() {
    const root = await mkdtemp(path.join(tmpdir(), "lazygoal-provider-models-generation-"));
    const contractFile = path.join(root, contractPath);
    const outputDirectory = path.join(root, "generated");
    await mkdir(path.dirname(contractFile), { recursive: true });
    await writeFile(contractFile, source);
    await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({
        compilerOptions: { strict: true },
        include: ["packages/**/*.ts"],
    }, null, 2));
    return {
        root,
        contractFile,
        options: { repositoryRoot: root, outputDirectory },
    };
}

async function writeArtifacts({ artifacts, outputDirectory }) {
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([...artifacts].map(([name, content]) =>
        writeFile(path.join(outputDirectory, name), content)));
}

async function readArtifacts(outputDirectory, artifacts) {
    return Promise.all([...artifacts.keys()].map(async name => [
        name,
        await readFile(path.join(outputDirectory, name), "utf8"),
    ]));
}
