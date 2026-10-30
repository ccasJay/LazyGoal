#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import Ajv from "ajv";
import standaloneCode from "ajv/dist/standalone/index.js";
import { build } from "esbuild";
import { createGenerator } from "ts-json-schema-generator";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "..");
const contractRelativePath = "packages/web-contracts/src/provider-settings.ts";
const contractTypes = new Set(["BrowserProviderModel", "BrowserProviderModels"]);
const contractId = "web.providers.models.success";
const contractVersion = 1;
const schemaId = "urn:lazygoal:contracts:web.providers.models.success:v1";
const expectedDialect = "http://json-schema.org/draft-07/schema#";
const documentationTags = new Set([
    "deprecated",
    "example",
    "param",
    "remarks",
    "returns",
    "see",
    "throws",
]);

const require = createRequire(import.meta.url);
const generatorRequire = createRequire(require.resolve("ts-json-schema-generator"));
const ts = generatorRequire("typescript");

export async function generateProviderModelsArtifacts({
    repositoryRoot = defaultRepositoryRoot,
    outputDirectory = path.join(repositoryRoot, "packages/web-contracts/src/generated"),
} = {}) {
    const absoluteRoot = path.resolve(repositoryRoot);
    const contractFile = path.join(absoluteRoot, contractRelativePath);
    const source = await readFile(contractFile, "utf8");
    const { sourceFingerprint, modelIdPattern } = inspectContractSource(contractFile, source);
    const generator = createGenerator({
        path: contractFile,
        tsconfig: path.join(absoluteRoot, "tsconfig.json"),
        type: "BrowserProviderModels",
        jsDoc: "extended",
        additionalProperties: false,
    });
    const schema = generator.createSchema("BrowserProviderModels");
    if (schema.$schema !== expectedDialect) {
        throw new Error(`Expected JSON Schema ${expectedDialect}; generator produced ${String(schema.$schema)}`);
    }
    schema.$id = schemaId;
    assertGeneratedPattern(schema, modelIdPattern);

    const ajv = new Ajv({
        strict: true,
        allErrors: true,
        removeAdditional: "all",
        coerceTypes: false,
        useDefaults: false,
        code: { source: true },
    });
    const validate = ajv.compile(schema);
    const validatorCode = standaloneCode(ajv, validate);
    const bundled = await build({
        stdin: {
            contents: validatorCode,
            resolveDir: absoluteRoot,
            sourcefile: "provider-models-validator.cjs",
            loader: "js",
        },
        bundle: true,
        platform: "browser",
        format: "esm",
        target: "es2022",
        write: false,
        logLevel: "silent",
    });
    const validator = bundled.outputFiles[0]?.text;
    if (validator === undefined || !validator.includes("export")) {
        throw new Error("Ajv standalone validator did not produce an ESM module");
    }

    const metadata = {
        contractId,
        version: contractVersion,
        schemaDialect: schema.$schema,
        source: {
            path: `${contractRelativePath}#${[...contractTypes].join(",")}`,
            sha256: sourceFingerprint,
        },
        generator: {
            name: "ts-json-schema-generator",
            version: packageVersion("ts-json-schema-generator"),
            typescriptVersion: ts.version,
        },
        validator: {
            name: "Ajv standalone",
            version: packageVersion("ajv"),
        },
        bundler: {
            name: "esbuild",
            version: packageVersion("esbuild"),
            format: "esm",
        },
    };

    const artifacts = new Map([
        ["provider-models-schema.ts", renderSchemaModule(schema, metadata)],
        ["provider-models-manifest.json", `${JSON.stringify(metadata, null, 2)}\n`],
        ["provider-models-validator.mjs", validator],
        ["provider-models-validator.d.mts", "declare const validateBrowserProviderModels: (value: unknown) => boolean;\nexport default validateBrowserProviderModels;\n"],
    ]);
    return { artifacts, outputDirectory: path.resolve(outputDirectory) };
}

export async function findStaleProviderModelsArtifacts(options = {}) {
    const { artifacts, outputDirectory } = await generateProviderModelsArtifacts(options);
    const stale = [];
    for (const [name, expected] of artifacts) {
        let actual;
        try {
            actual = await readFile(path.join(outputDirectory, name), "utf8");
        } catch {
            stale.push(name);
            continue;
        }
        if (actual !== expected) stale.push(name);
    }
    return stale;
}

function inspectContractSource(contractFile, source) {
    const sourceFile = ts.createSourceFile(contractFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const declarations = sourceFile.statements.filter(statement =>
        ts.isInterfaceDeclaration(statement) && contractTypes.has(statement.name.text));
    const foundTypes = new Set(declarations.map(declaration => declaration.name.text));
    for (const typeName of contractTypes) {
        if (!foundTypes.has(typeName)) throw new Error(`Missing native TypeScript interface ${typeName}`);
    }
    if (declarations.length !== contractTypes.size) throw new Error("Duplicate provider models contract interface");

    const supportedTags = new Set([...documentationTags, "pattern"]);
    for (const declaration of declarations) {
        inspectTags(sourceFile, declaration, declaration.name.text, supportedTags);
        for (const member of declaration.members) {
            inspectTags(sourceFile, member, declaration.name.text, supportedTags);
        }
    }

    const model = declarations.find(declaration => declaration.name.text === "BrowserProviderModel");
    const idProperty = model?.members.find(member =>
        ts.isPropertySignature(member) && member.name.getText(sourceFile) === "id");
    const modelIdPattern = idProperty === undefined
        ? undefined
        : ts.getJSDocTags(idProperty).find(tag => tag.tagName.text === "pattern");
    const idPattern = modelIdPattern === undefined ? undefined : readTagComment(modelIdPattern);
    if (idPattern === undefined || idPattern.length === 0) {
        throw new Error("BrowserProviderModel.id must declare a non-empty JSDoc @pattern");
    }

    const declarationText = declarations
        .map(declaration => declaration.getFullText(sourceFile).trim())
        .join("\n\n");
    return {
        sourceFingerprint: createHash("sha256").update(declarationText, "utf8").digest("hex"),
        modelIdPattern: idPattern,
    };
}

function inspectTags(sourceFile, node, owner, supportedTags) {
    for (const tag of ts.getJSDocTags(node)) {
        const name = tag.tagName.text;
        if (!supportedTags.has(name)) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(tag.getStart(sourceFile));
            throw new Error(`Unsupported JSDoc tag @${name} on ${owner} at line ${line + 1}`);
        }
        if (name === "pattern") {
            if (!ts.isPropertySignature(node) || node.type?.kind !== ts.SyntaxKind.StringKeyword) {
                throw new Error(`JSDoc @pattern is supported only on string fields in ${owner}`);
            }
            if (readTagComment(tag).length === 0) {
                throw new Error(`JSDoc @pattern requires a regular expression in ${owner}`);
            }
        }
    }
}

function readTagComment(tag) {
    if (typeof tag.comment === "string") return tag.comment.trim();
    if (Array.isArray(tag.comment)) return tag.comment.map(part => part.text ?? "").join("").trim();
    return "";
}

function assertGeneratedPattern(schema, expectedPattern) {
    const definitions = schema.definitions;
    const root = definitions?.BrowserProviderModels;
    const modelRef = root?.properties?.models?.items?.$ref;
    if (typeof modelRef !== "string" || !modelRef.startsWith("#/definitions/")) {
        throw new Error("Generated schema has no model item definition");
    }
    const modelName = modelRef.slice("#/definitions/".length).replaceAll("~1", "/").replaceAll("~0", "~");
    const idPattern = definitions?.[modelName]?.properties?.id?.pattern;
    if (idPattern !== expectedPattern) {
        throw new Error("Generated schema must apply the JSDoc @pattern constraint to model id");
    }
}

function renderSchemaModule(schema, metadata) {
    const serialized = JSON.stringify(schema);
    return [
        "/** Generated by scripts/generate-provider-models-contract.mjs. Do not edit. */",
        `export const browserProviderModelsSchema: unknown = JSON.parse(${JSON.stringify(serialized)});`,
        `export const browserProviderModelsMetadata = ${JSON.stringify(metadata, null, 2)} as const;`,
        "",
    ].join("\n");
}

function packageVersion(name) {
    const packageJson = require.resolve(`${name}/package.json`);
    return JSON.parse(require("node:fs").readFileSync(packageJson, "utf8")).version;
}

async function run() {
    const args = process.argv.slice(2);
    const mode = args[0];
    if (args.length !== 1 || (mode !== "--write" && mode !== "--check")) {
        console.error("用法：node scripts/generate-provider-models-contract.mjs --write|--check");
        process.exitCode = 2;
        return;
    }

    if (mode === "--check") {
        const stale = await findStaleProviderModelsArtifacts();
        if (stale.length > 0) {
            console.error(`Provider models contract artifacts are stale: ${stale.join(", ")}`);
            console.error("Run npm run contracts:generate -- --write to update them.");
            process.exitCode = 1;
            return;
        }
        console.log("Provider models contract artifacts are current.");
        return;
    }

    const { artifacts, outputDirectory } = await generateProviderModelsArtifacts();
    await mkdir(outputDirectory, { recursive: true });
    for (const [name, content] of artifacts) {
        await writeFile(path.join(outputDirectory, name), content);
    }
    console.log(`Generated ${artifacts.size} Provider models contract artifacts.`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await run();
}
