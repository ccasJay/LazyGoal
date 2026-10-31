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

import {
    collectEnabledContractEntries,
    loadContractCatalog,
} from "./contract-catalog.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "..");
const defaultCatalogPath = "contracts/catalog.json";
const supportedStrategies = new Set(["typescript-json-schema", "typescript-binding"]);
const expectedDialect = "http://json-schema.org/draft-07/schema#";
const supportedSchemaKeywords = new Set([
    "$schema",
    "$id",
    "$ref",
    "definitions",
    "type",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "anyOf",
    "pattern",
    "const",
    "enum",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "description",
    "title",
]);
const unionOnlySchemaKeywords = new Set(["anyOf"]);
const supportedSchemaTypes = new Set(["object", "array", "string", "boolean", "number", "integer", "null"]);
const documentationTags = new Set([
    "deprecated",
    "example",
    "param",
    "remarks",
    "returns",
    "see",
    "throws",
]);
const constraintTags = new Set(["pattern", "minimum", "maximum", "minLength", "maxLength"]);
const typeOverrideTags = new Set(["asType"]);
const supportedTypeOverrides = new Set(["integer"]);

const require = createRequire(import.meta.url);
const generatorRequire = createRequire(require.resolve("ts-json-schema-generator"));
const ts = generatorRequire("typescript");

/**
 * 生成 Catalog 中全部启用契约的构建期制品。
 *
 * @param options - 仓库根目录及 Catalog 相对路径。
 * @returns 以仓库相对路径为键的制品内容，以及已校验的 Catalog。
 * @throws Catalog 无效、来源缺失或契约结构不受支持时抛出异常；不写入文件。
 *
 * @example
 * ```ts
 * const { artifacts } = await generateContractArtifacts();
 * ```
 */
export async function generateContractArtifacts({
    repositoryRoot = defaultRepositoryRoot,
    catalogPath = defaultCatalogPath,
} = {}) {
    const absoluteRoot = path.resolve(repositoryRoot);
    const catalog = await loadContractCatalog({ repositoryRoot: absoluteRoot, catalogPath });
    const enabled = collectEnabledContractEntries(catalog);
    const artifacts = new Map();

    for (const entry of enabled) {
        if (!supportedStrategies.has(entry.generation.strategy)) {
            throw new Error(`Unsupported generation strategy: ${String(entry.generation.strategy)} (${entry.key})`);
        }
        const generated = entry.generation.strategy === "typescript-json-schema"
            ? await generateTypeScriptJsonSchemaContract(entry, { repositoryRoot: absoluteRoot })
            : await generateTypeScriptBindingContract(entry, { repositoryRoot: absoluteRoot });
        for (const [relativePath, content] of generated) {
            if (artifacts.has(relativePath)) {
                throw new Error(`Duplicate generated artifact path: ${relativePath}`);
            }
            artifacts.set(relativePath, content);
        }
    }

    return { artifacts, catalog };
}

/**
 * 检查已提交制品是否与当前 Catalog 和源码一致。
 *
 * @param options - 仓库根目录及 Catalog 相对路径。
 * @returns 缺失或漂移的仓库相对制品路径，按路径排序。
 * @throws Catalog 无效、来源缺失或契约结构不受支持时抛出异常。
 *
 * @example
 * ```ts
 * const stale = await findStaleContractArtifacts();
 * ```
 */
export async function findStaleContractArtifacts(options = {}) {
    const absoluteRoot = path.resolve(options.repositoryRoot ?? defaultRepositoryRoot);
    const { artifacts } = await generateContractArtifacts(options);
    const stale = [];
    for (const [relativePath, expected] of artifacts) {
        let actual;
        try {
            actual = await readFile(path.join(absoluteRoot, relativePath), "utf8");
        } catch {
            stale.push(relativePath);
            continue;
        }
        if (actual !== expected) stale.push(relativePath);
    }
    return stale.sort();
}

/**
 * 校验生成 Schema 是否只使用共享 Reader 支持的 JSON Schema 子集。
 *
 * @param schema - ts-json-schema-generator 生成的根 Schema。
 * @param rootType - 启用契约的根类型名。
 * @throws 出现元组、外部引用、非联合组合关键字或未支持约束时抛出异常。
 *
 * @example
 * ```ts
 * assertSupportedSchema(schema, "BrowserProviderModels");
 * ```
 */
export function assertSupportedSchema(schema, rootType) {
    const root = resolveRootSchema(schema);
    if (root.type !== "object" && root.anyOf === undefined) {
        throw new Error(`Root contract type must be an object or union: ${rootType}`);
    }
    visitSchema(schema, schema, "#", new Set());
}

function assertReaderSupportedSchema(schema) {
    visitReaderSchema(schema, schema, "#", new Set());
}

function visitReaderSchema(root, schema, schemaPath, visitedRefs) {
    if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
        throw new Error(`JSON Schema node must be an object at ${schemaPath}`);
    }
    if (schema.$ref !== undefined) {
        if (visitedRefs.has(schema.$ref)) return;
        visitedRefs.add(schema.$ref);
        visitReaderSchema(root, resolveSchemaPointer(root, schema.$ref), `${schemaPath} -> ${schema.$ref}`, visitedRefs);
    }
    if (schema.anyOf !== undefined) {
        throw new Error(`Union schemas are not supported by the shared reader strategy at ${schemaPath}`);
    }
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
        throw new Error(`Open object schemas are not supported by the shared reader strategy at ${schemaPath}`);
    }
    for (const definition of Object.values(schema.definitions ?? {})) {
        visitReaderSchema(root, definition, `${schemaPath}/definitions`, visitedRefs);
    }
    for (const [name, property] of Object.entries(schema.properties ?? {})) {
        visitReaderSchema(root, property, `${schemaPath}/properties/${name}`, visitedRefs);
    }
    if (schema.items !== undefined && !Array.isArray(schema.items)) {
        visitReaderSchema(root, schema.items, `${schemaPath}/items`, visitedRefs);
    }
}

async function generateSchemaArtifacts(entry, { repositoryRoot, removeAdditional }) {
    const contractFile = path.resolve(repositoryRoot, entry.source.path);
    if (!isInside(repositoryRoot, contractFile)) {
        throw new Error(`Contract source escapes the repository: ${entry.key}`);
    }
    const source = await readFile(contractFile, "utf8");
    const { sourceFingerprint, constraints, integerTypes } = inspectContractSource(
        contractFile,
        source,
        entry.generation.declaredTypes,
    );
    const generator = createGenerator({
        path: contractFile,
        tsconfig: path.join(repositoryRoot, "tsconfig.json"),
        type: entry.generation.rootType,
        jsDoc: "extended",
        additionalProperties: false,
    });
    const schema = generator.createSchema(entry.generation.rootType);
    if (schema.$schema !== expectedDialect) {
        throw new Error(`Unsupported JSON Schema dialect: ${String(schema.$schema)}`);
    }
    schema.$id = `urn:lazygoal:contracts:${entry.protocol.identity.value}:v${String(entry.protocol.version.value)}`;
    assertSupportedSchema(schema, entry.generation.rootType);
    if (entry.generation.strategy === "typescript-json-schema") {
        assertReaderSupportedSchema(schema);
    }
    assertDeclaredSchemaTypes(schema, entry);
    assertGeneratedConstraints(schema, constraints);
    assertGeneratedIntegerTypes(schema, integerTypes);

    const ajv = new Ajv({
        strict: true,
        allowUnionTypes: true,
        allErrors: true,
        removeAdditional,
        coerceTypes: false,
        useDefaults: false,
        code: { source: true },
    });
    const validate = ajv.compile(schema);
    const validatorCode = standaloneCode(ajv, validate);
    const bundled = await build({
        stdin: {
            contents: validatorCode,
            resolveDir: defaultRepositoryRoot,
            sourcefile: `${entry.generation.rootType}-validator.cjs`,
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
        throw new Error(`Ajv standalone validator did not produce an ESM module: ${entry.key}`);
    }

    const metadata = {
        contractId: entry.protocol.identity.value,
        version: entry.protocol.version.value,
        schemaDialect: schema.$schema,
        source: {
            path: `${entry.source.path}#${entry.generation.declaredTypes.join(",")}`,
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

    return { schema, metadata, validator };
}

async function generateTypeScriptJsonSchemaContract(entry, { repositoryRoot }) {
    const { schema, metadata, validator } = await generateSchemaArtifacts(entry, {
        repositoryRoot,
        removeAdditional: "all",
    });
    const { names } = entry.generation.reader;
    const outputDirectory = entry.generation.outputDirectory;
    const artifactPath = name => path.posix.join(outputDirectory, name);
    return new Map([
        [artifactPath(entry.generation.artifacts.schemaModule), renderSchemaModule(schema, metadata, names)],
        [artifactPath(entry.generation.artifacts.manifest), `${JSON.stringify(metadata, null, 2)}\n`],
        [artifactPath(entry.generation.artifacts.validator), validator],
        [artifactPath(entry.generation.artifacts.validatorTypes), renderValidatorTypes(names.validator)],
        [artifactPath(entry.generation.artifacts.reader), renderReaderModule(entry)],
    ]);
}

async function generateTypeScriptBindingContract(entry, { repositoryRoot }) {
    const { schema, metadata, validator } = await generateSchemaArtifacts(entry, {
        repositoryRoot,
        removeAdditional: false,
    });
    const { names } = entry.generation.binding;
    const outputDirectory = entry.generation.outputDirectory;
    const artifactPath = name => path.posix.join(outputDirectory, name);
    return new Map([
        [artifactPath(entry.generation.artifacts.schemaModule), renderSchemaModule(schema, metadata, names)],
        [artifactPath(entry.generation.artifacts.manifest), `${JSON.stringify(metadata, null, 2)}\n`],
        [artifactPath(entry.generation.artifacts.validator), validator],
        [artifactPath(entry.generation.artifacts.validatorTypes), renderValidatorTypes(names.validator)],
        [artifactPath(entry.generation.artifacts.binding), renderBindingModule(entry)],
    ]);
}

function inspectContractSource(contractFile, source, declaredTypes) {
    const sourceFile = ts.createSourceFile(contractFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const declarations = [];
    for (const typeName of declaredTypes) {
        const matches = sourceFile.statements.filter(statement =>
            (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement))
            && statement.name.text === typeName);
        if (matches.length === 0) throw new Error(`Missing native TypeScript declaration ${typeName}`);
        if (matches.length > 1) throw new Error(`Duplicate native TypeScript declaration ${typeName}`);
        declarations.push(matches[0]);
    }

    const supportedTags = new Set([...documentationTags, ...constraintTags, ...typeOverrideTags]);
    const constraints = [];
    const integerTypes = [];
    for (const declaration of declarations) {
        const owner = declaration.name.text;
        for (const node of declarationNodes(declaration)) {
            if (ts.getJSDocTags(node).length === 0) continue;
            inspectTags(sourceFile, node, owner, supportedTags);
            if (!ts.isPropertySignature(node)) continue;
            const fieldName = node.name.getText(sourceFile);
            for (const tag of ts.getJSDocTags(node)) {
                const keyword = tag.tagName.text;
                if (typeOverrideTags.has(keyword)) {
                    integerTypes.push({ typeName: owner, fieldName });
                    continue;
                }
                if (!constraintTags.has(keyword)) continue;
                constraints.push({
                    typeName: owner,
                    fieldName,
                    keyword,
                    value: keyword === "pattern" ? readTagComment(tag) : Number(readTagComment(tag)),
                });
            }
        }
    }

    const declarationText = declarations
        .map(declaration => declaration.getFullText(sourceFile).trim())
        .join("\n\n");
    return {
        sourceFingerprint: createHash("sha256").update(declarationText, "utf8").digest("hex"),
        constraints,
        integerTypes,
    };
}

function declarationNodes(declaration) {
    const nodes = [];
    const visit = node => {
        nodes.push(node);
        ts.forEachChild(node, visit);
    };
    visit(declaration);
    return nodes;
}

function inspectTags(sourceFile, node, owner, supportedTags) {
    const seen = new Map();
    for (const tag of ts.getJSDocTags(node)) {
        const name = tag.tagName.text;
        if (!supportedTags.has(name)) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(tag.getStart(sourceFile));
            throw new Error(`Unsupported JSDoc tag @${name} on ${owner} at line ${line + 1}`);
        }
        if (typeOverrideTags.has(name)) {
            seen.set(name, (seen.get(name) ?? 0) + 1);
            if (seen.get(name) > 1) {
                throw new Error(`Duplicate JSDoc @${name} on ${owner}`);
            }
            validateTypeOverrideTag(node, name, owner);
            continue;
        }
        if (!constraintTags.has(name)) continue;
        seen.set(name, (seen.get(name) ?? 0) + 1);
        if (seen.get(name) > 1) {
            throw new Error(`Duplicate JSDoc @${name} on ${owner}`);
        }
        validateConstraintTag(node, name, owner);
    }
    validateConstraintOrder(node, owner);
}

function validateTypeOverrideTag(node, name, owner) {
    if (!ts.isPropertySignature(node)) {
        throw new Error(`JSDoc @${name} is supported only on fields in ${owner}`);
    }
    const value = readTagComment(ts.getJSDocTags(node).find(tag => tag.tagName.text === name));
    if (!supportedTypeOverrides.has(value)) {
        throw new Error(
            `Unsupported JSDoc @${name} value "${value}" in ${owner}; only integer is supported`,
        );
    }
    if (!isPlainNumberType(node.type)) {
        throw new Error(`JSDoc @${name} integer is supported only on number fields in ${owner}`);
    }
}

function isPlainNumberType(typeNode) {
    if (typeNode === undefined) return false;
    if (ts.isParenthesizedTypeNode(typeNode)) return isPlainNumberType(typeNode.type);
    return typeNode.kind === ts.SyntaxKind.NumberKeyword;
}

function validateConstraintTag(node, name, owner) {
    if (!ts.isPropertySignature(node)) {
        throw new Error(`JSDoc @${name} is supported only on fields in ${owner}`);
    }
    const target = constraintTargetKind(node.type);
    if (name === "pattern") {
        if (target !== "string") {
            throw new Error(`JSDoc @pattern is supported only on string fields in ${owner}`);
        }
        const pattern = readTagComment(ts.getJSDocTags(node).find(tag => tag.tagName.text === "pattern"));
        if (pattern.length === 0) throw new Error(`JSDoc @pattern requires a regular expression in ${owner}`);
        try {
            new RegExp(pattern);
        } catch {
            throw new Error(`Invalid JSDoc @pattern in ${owner}`);
        }
        return;
    }
    if (name === "minimum" || name === "maximum") {
        if (target !== "number") {
            throw new Error(`JSDoc @${name} is supported only on number fields in ${owner}`);
        }
        const value = Number(readTagComment(ts.getJSDocTags(node).find(tag => tag.tagName.text === name)));
        if (!Number.isFinite(value)) throw new Error(`JSDoc @${name} requires a finite number in ${owner}`);
        return;
    }
    if (target !== "string") {
        throw new Error(`JSDoc @${name} is supported only on string fields in ${owner}`);
    }
    const value = Number(readTagComment(ts.getJSDocTags(node).find(tag => tag.tagName.text === name)));
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`JSDoc @${name} requires a non-negative integer in ${owner}`);
    }
}

function constraintTargetKind(typeNode) {
    if (typeNode === undefined) return undefined;
    const kinds = constraintTypeKinds(typeNode).filter(kind =>
        kind !== ts.SyntaxKind.NullKeyword && kind !== ts.SyntaxKind.UndefinedKeyword);
    if (kinds.length !== 1) return undefined;
    if (kinds[0] === ts.SyntaxKind.StringKeyword) return "string";
    if (kinds[0] === ts.SyntaxKind.NumberKeyword) return "number";
    return undefined;
}

function constraintTypeKinds(typeNode) {
    if (ts.isParenthesizedTypeNode(typeNode)) return constraintTypeKinds(typeNode.type);
    if (ts.isUnionTypeNode(typeNode)) return typeNode.types.flatMap(constraintTypeKinds);
    if (ts.isLiteralTypeNode(typeNode)) {
        const literal = typeNode.literal;
        if (literal.kind === ts.SyntaxKind.NullKeyword || literal.kind === ts.SyntaxKind.UndefinedKeyword) {
            return [literal.kind];
        }
    }
    return [typeNode.kind];
}

function validateConstraintOrder(node, owner) {
    const tags = new Map(ts.getJSDocTags(node).map(tag => [tag.tagName.text, readTagComment(tag)]));
    const minimum = tags.get("minimum");
    const maximum = tags.get("maximum");
    if (minimum !== undefined && maximum !== undefined && Number(minimum) > Number(maximum)) {
        throw new Error(`JSDoc @minimum must not exceed @maximum in ${owner}`);
    }
    const minLength = tags.get("minLength");
    const maxLength = tags.get("maxLength");
    if (minLength !== undefined && maxLength !== undefined && Number(minLength) > Number(maxLength)) {
        throw new Error(`JSDoc @minLength must not exceed @maxLength in ${owner}`);
    }
}

function readTagComment(tag) {
    if (typeof tag.comment === "string") return tag.comment.trim();
    if (Array.isArray(tag.comment)) return tag.comment.map(part => part.text ?? "").join("").trim();
    return "";
}

function assertDeclaredSchemaTypes(schema, entry) {
    const declared = new Set(entry.generation.declaredTypes);
    for (const definitionName of Object.keys(schema.definitions ?? {})) {
        if (!declared.has(definitionName)) {
            throw new Error(
                `Generated schema includes a type absent from declaredTypes: ${definitionName} (${entry.key})`,
            );
        }
    }
}

function assertGeneratedConstraints(schema, constraints) {
    const properties = collectSchemaProperties(schema);
    for (const { typeName, fieldName, keyword, value } of constraints) {
        const candidates = properties.get(fieldName) ?? [];
        const found = candidates.some(property => {
            const resolved = property.$ref === undefined ? property : resolveSchemaPointer(schema, property.$ref);
            return resolved[keyword] === value;
        });
        if (!found) {
            throw new Error(
                `Generated schema must apply the JSDoc @${keyword} constraint to ${typeName}.${fieldName}`,
            );
        }
    }
}

function assertGeneratedIntegerTypes(schema, integerTypes) {
    const properties = collectSchemaProperties(schema);
    for (const { typeName, fieldName } of integerTypes) {
        const candidates = properties.get(fieldName) ?? [];
        const found = candidates.some(property => {
            const resolved = property.$ref === undefined ? property : resolveSchemaPointer(schema, property.$ref);
            return resolved.type === "integer";
        });
        if (!found) {
            throw new Error(
                `Generated schema must apply JSDoc @asType integer to ${typeName}.${fieldName}`,
            );
        }
    }
}

function collectSchemaProperties(schema) {
    const properties = new Map();
    const pending = [schema];
    while (pending.length > 0) {
        const node = pending.pop();
        if (node === null || typeof node !== "object" || Array.isArray(node)) continue;
        for (const [name, property] of Object.entries(node.properties ?? {})) {
            const current = properties.get(name);
            if (current === undefined) properties.set(name, [property]);
            else current.push(property);
            pending.push(property);
        }
        if (node.items !== undefined && !Array.isArray(node.items)) pending.push(node.items);
        if (node.additionalProperties !== undefined
            && node.additionalProperties !== false
            && node.additionalProperties !== true) {
            pending.push(node.additionalProperties);
        }
        for (const branch of node.anyOf ?? []) pending.push(branch);
        for (const definition of Object.values(node.definitions ?? {})) pending.push(definition);
    }
    return properties;
}

function resolveRootSchema(schema) {
    if (schema.$ref === undefined) return schema;
    return resolveSchemaPointer(schema, schema.$ref);
}

function resolveSchemaPointer(root, pointer) {
    if (typeof pointer !== "string" || !pointer.startsWith("#/")) {
        throw new Error(`Only local JSON Schema references are supported: ${String(pointer)}`);
    }
    let current = root;
    for (const segment of pointer.slice(2).split("/")) {
        if (current === null || typeof current !== "object") {
            throw new Error(`JSON Schema reference does not resolve: ${pointer}`);
        }
        current = current[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
    }
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
        throw new Error(`JSON Schema reference does not resolve to a schema object: ${pointer}`);
    }
    return current;
}

function visitSchema(root, schema, schemaPath, visitedRefs) {
    if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
        throw new Error(`JSON Schema node must be an object at ${schemaPath}`);
    }
    for (const key of Object.keys(schema)) {
        if (!supportedSchemaKeywords.has(key)) {
            throw new Error(`Unsupported JSON Schema keyword "${key}" at ${schemaPath}`);
        }
    }
    if (schema.$ref !== undefined) {
        if (typeof schema.$ref !== "string") throw new Error(`JSON Schema $ref must be a string at ${schemaPath}`);
        if (visitedRefs.has(schema.$ref)) return;
        visitedRefs.add(schema.$ref);
        visitSchema(root, resolveSchemaPointer(root, schema.$ref), `${schemaPath} -> ${schema.$ref}`, visitedRefs);
    }
    if (schema.definitions !== undefined) {
        if (schema.definitions === null || typeof schema.definitions !== "object" || Array.isArray(schema.definitions)) {
            throw new Error(`JSON Schema definitions must be an object at ${schemaPath}`);
        }
        for (const [name, definition] of Object.entries(schema.definitions)) {
            visitSchema(root, definition, `${schemaPath}/definitions/${name}`, visitedRefs);
        }
    }
    if (schema.anyOf !== undefined) {
        if (!Array.isArray(schema.anyOf) || schema.anyOf.length === 0) {
            throw new Error(`JSON Schema anyOf must be a non-empty array at ${schemaPath}`);
        }
        for (const key of Object.keys(schema)) {
            if (!unionOnlySchemaKeywords.has(key)
                && key !== "$schema"
                && key !== "$id"
                && key !== "$ref"
                && key !== "definitions"
                && key !== "description"
                && key !== "title") {
                throw new Error(`JSON Schema anyOf must not combine with "${key}" at ${schemaPath}`);
            }
        }
        for (let index = 0; index < schema.anyOf.length; index += 1) {
            visitSchema(root, schema.anyOf[index], `${schemaPath}/anyOf/${index}`, visitedRefs);
        }
    }
    if (schema.type !== undefined) {
        const types = Array.isArray(schema.type) ? schema.type : [schema.type];
        if (types.length === 0 || new Set(types).size !== types.length) {
            throw new Error(`JSON Schema type must list unique types at ${schemaPath}`);
        }
        for (const type of types) {
            if (!supportedSchemaTypes.has(type)) {
                throw new Error(`Unsupported JSON Schema type at ${schemaPath}: ${String(type)}`);
            }
        }
    }
    if (schema.properties !== undefined) {
        if (!hasSchemaType(schema, "object")) {
            throw new Error(`JSON Schema properties require an object type at ${schemaPath}`);
        }
        if (schema.properties === null || typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
            throw new Error(`JSON Schema properties must be an object at ${schemaPath}`);
        }
        for (const [name, property] of Object.entries(schema.properties)) {
            visitSchema(root, property, `${schemaPath}/properties/${name}`, visitedRefs);
        }
    }
    if (schema.required !== undefined) {
        if (!hasSchemaType(schema, "object") || !Array.isArray(schema.required) || schema.required.some(item => typeof item !== "string")) {
            throw new Error(`JSON Schema required must be a string array on an object at ${schemaPath}`);
        }
    }
    if (schema.additionalProperties !== undefined) {
        if (schema.additionalProperties !== false && schema.additionalProperties !== true) {
            if (schema.additionalProperties === null || typeof schema.additionalProperties !== "object" || Array.isArray(schema.additionalProperties)) {
                throw new Error(`JSON Schema additionalProperties must be a boolean or schema at ${schemaPath}`);
            }
            visitSchema(root, schema.additionalProperties, `${schemaPath}/additionalProperties`, visitedRefs);
        }
    }
    if (hasSchemaType(schema, "object") && schema.additionalProperties === undefined) {
        throw new Error(`Object schemas must declare additional properties at ${schemaPath}`);
    }
    if (schema.items !== undefined) {
        if (!hasSchemaType(schema, "array")) throw new Error(`JSON Schema items require an array type at ${schemaPath}`);
        if (Array.isArray(schema.items)) throw new Error(`Tuple JSON Schema items are not supported at ${schemaPath}`);
        visitSchema(root, schema.items, `${schemaPath}/items`, visitedRefs);
    }
    if (schema.pattern !== undefined) {
        if (!hasSchemaType(schema, "string") || typeof schema.pattern !== "string") {
            throw new Error(`JSON Schema pattern requires a string type at ${schemaPath}`);
        }
        try {
            new RegExp(schema.pattern);
        } catch {
            throw new Error(`JSON Schema pattern is not a valid regular expression at ${schemaPath}`);
        }
    }
    if (schema.const !== undefined && !isJsonScalar(schema.const)) {
        throw new Error(`JSON Schema const must be a JSON scalar at ${schemaPath}`);
    }
    if (schema.enum !== undefined) {
        if (!Array.isArray(schema.enum) || schema.enum.length === 0 || !schema.enum.every(isJsonScalar)) {
            throw new Error(`JSON Schema enum must contain JSON scalars at ${schemaPath}`);
        }
    }
    for (const key of ["minimum", "maximum"]) {
        if (schema[key] === undefined) continue;
        if ((!hasSchemaType(schema, "number") && !hasSchemaType(schema, "integer"))
            || typeof schema[key] !== "number"
            || !Number.isFinite(schema[key])) {
            throw new Error(`JSON Schema ${key} requires a finite numeric bound at ${schemaPath}`);
        }
    }
    if (schema.minimum !== undefined && schema.maximum !== undefined && schema.minimum > schema.maximum) {
        throw new Error(`JSON Schema minimum must not exceed maximum at ${schemaPath}`);
    }
    for (const key of ["minLength", "maxLength"]) {
        if (schema[key] === undefined) continue;
        if (!hasSchemaType(schema, "string") || !Number.isInteger(schema[key]) || schema[key] < 0) {
            throw new Error(`JSON Schema ${key} requires a non-negative integer on a string at ${schemaPath}`);
        }
    }
    if (schema.minLength !== undefined && schema.maxLength !== undefined && schema.minLength > schema.maxLength) {
        throw new Error(`JSON Schema minLength must not exceed maxLength at ${schemaPath}`);
    }
    for (const key of ["description", "title"]) {
        if (schema[key] !== undefined && typeof schema[key] !== "string") {
            throw new Error(`JSON Schema ${key} must be a string at ${schemaPath}`);
        }
    }
}

function hasSchemaType(schema, type) {
    if (schema.type === undefined) return false;
    return Array.isArray(schema.type) ? schema.type.includes(type) : schema.type === type;
}

function isJsonScalar(value) {
    return value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number";
}

function renderSchemaModule(schema, metadata, names) {
    const serialized = JSON.stringify(schema);
    return [
        "/** Generated by scripts/generate-contracts.mjs from contracts/catalog.json. Do not edit. */",
        `export const ${names.schema}: unknown = JSON.parse(${JSON.stringify(serialized)});`,
        `export const ${names.metadata} = ${JSON.stringify(metadata, null, 2)} as const;`,
        "",
    ].join("\n");
}

function renderValidatorTypes(validatorName) {
    return [
        `declare const ${validatorName}: (value: unknown) => boolean;`,
        `export default ${validatorName};`,
        "",
    ].join("\n");
}

function renderBindingModule(entry) {
    const { binding } = entry.generation;
    const schemaModule = basenameWithoutTypeScriptExtension(entry.generation.artifacts.schemaModule);
    return [
        "/** Generated by scripts/generate-contracts.mjs from contracts/catalog.json. Do not edit. */",
        `import { createContractBinding, type ContractSchemaNode } from "${binding.module}";`,
        `import { ${binding.names.metadata}, ${binding.names.schema} } from "./${schemaModule}";`,
        `import ${binding.names.validator} from "./${entry.generation.artifacts.validator}";`,
        `import type { ${binding.dataType} } from "${binding.dataTypeModule}";`,
        "",
        `export const ${binding.exportName} = createContractBinding<${binding.dataType}>({`,
        `    contractId: ${binding.names.metadata}.contractId,`,
        `    version: ${binding.names.metadata}.version,`,
        `    schema: ${binding.names.schema} as ContractSchemaNode,`,
        `    validate: ${binding.names.validator},`,
        "});",
        "",
    ].join("\n");
}

function renderReaderModule(entry) {
    const { reader } = entry.generation;
    const schemaModule = basenameWithoutTypeScriptExtension(entry.generation.artifacts.schemaModule);
    return [
        "/** Generated by scripts/generate-contracts.mjs from contracts/catalog.json. Do not edit. */",
        "import {",
        "    readContractValue,",
        "    type ContractReadResult,",
        "    type ContractSchemaNode,",
        "    type ContractUnknownFieldDiagnostic,",
        `} from "${reader.module}";`,
        `import { ${reader.names.metadata}, ${reader.names.schema} } from "./${schemaModule}";`,
        `import ${reader.names.validator} from "./${entry.generation.artifacts.validator}";`,
        `import type { ${reader.dataType} } from "${reader.dataTypeModule}";`,
        "",
        `export type ${reader.diagnosticType} = ContractUnknownFieldDiagnostic;`,
        `export type ${reader.resultType} = ContractReadResult<${reader.dataType}>;`,
        "",
        `export function ${reader.functionName}(value: unknown): ${reader.resultType} {`,
        "    return readContractValue(value, {",
        `        contractId: ${reader.names.metadata}.contractId,`,
        `        version: ${reader.names.metadata}.version,`,
        `        schema: ${reader.names.schema} as ContractSchemaNode,`,
        `        validate: ${reader.names.validator},`,
        "    });",
        "}",
        "",
    ].join("\n");
}

function basenameWithoutTypeScriptExtension(fileName) {
    return fileName.replace(/\.(?:ts|tsx|mts)$/, "");
}

function packageVersion(name) {
    const packageJson = require.resolve(`${name}/package.json`);
    return JSON.parse(require("node:fs").readFileSync(packageJson, "utf8")).version;
}

function isInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function run() {
    const args = process.argv.slice(2);
    if (args.length !== 1 || (args[0] !== "--write" && args[0] !== "--check")) {
        console.error("Usage: node scripts/generate-contracts.mjs --write|--check");
        process.exitCode = 2;
        return;
    }
    try {
        if (args[0] === "--check") {
            const stale = await findStaleContractArtifacts();
            if (stale.length > 0) {
                console.error(`Contract artifacts are stale: ${stale.join(", ")}`);
                console.error("Run npm run contracts:generate -- --write to update them.");
                process.exitCode = 1;
                return;
            }
            console.log("Contract artifacts are current.");
            return;
        }

        const { artifacts } = await generateContractArtifacts();
        for (const [relativePath, content] of artifacts) {
            const absolutePath = path.join(defaultRepositoryRoot, relativePath);
            await mkdir(path.dirname(absolutePath), { recursive: true });
            await writeFile(absolutePath, content);
        }
        console.log(`Generated ${artifacts.size} contract artifacts.`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await run();
}
