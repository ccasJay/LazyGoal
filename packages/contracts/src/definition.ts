import type { Contract, ContractKind } from "./types";
import {
    ContractDefinitionError,
    type ContractDefinitionReasonCode,
} from "./errors";
import {
    isContractNode,
    isOptionalPropertyNode,
    recursiveOwner,
} from "./internal";

type Path = readonly (string | number)[];
type PlainRecord = Record<string, unknown>;
type RuntimeNode = Record<PropertyKey, unknown> & { readonly kind: ContractKind };

interface RecursiveDefinition {
    readonly node: RuntimeNode;
    readonly name: string;
    readonly owner: symbol;
    readonly path: Path;
}

interface RecursiveReference {
    readonly name: string;
    readonly owner: symbol;
    readonly path: Path;
}

const knownContractKinds: readonly ContractKind[] = [
    "string",
    "number",
    "integer",
    "boolean",
    "null",
    "literal",
    "enum",
    "object",
    "optional",
    "nullable",
    "array",
    "record",
    "union",
    "discriminatedUnion",
    "recursive",
    "recursiveRef",
];

function isPlainObject(value: unknown): value is PlainRecord {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function isContractKind(value: unknown): value is ContractKind {
    return typeof value === "string"
        && knownContractKinds.includes(value as ContractKind);
}

function isIdentifier(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function fail(
    reasonCode: ContractDefinitionReasonCode,
    message: string,
    path: Path,
): never {
    throw new ContractDefinitionError(reasonCode, message, path);
}

function readNode(value: unknown, path: Path): RuntimeNode {
    if (!isContractNode(value) || !isPlainObject(value)) {
        if (isOptionalPropertyNode(value)) {
            return fail(
                "INVALID_OPTIONAL_POSITION",
                "optional property can only be used in an object shape",
                path,
            );
        }
        return fail("INVALID_NODE", "Contract node is not a builder-created object", path);
    }
    if (!isContractKind(value.kind)) {
        return fail("INVALID_NODE", "Contract node has an unknown kind", path);
    }
    return value as RuntimeNode;
}

function readOwner(node: RuntimeNode, path: Path): symbol {
    const owner = node[recursiveOwner];
    if (typeof owner !== "symbol") {
        return fail("INVALID_NODE", "Recursive node is missing its definition identity", path);
    }
    return owner;
}

function readName(node: RuntimeNode, path: Path, field: string): string {
    const name = node[field];
    if (!isIdentifier(name)) {
        return fail("INVALID_RECURSIVE_NAME", "Recursive name must be a non-empty ASCII identifier", path);
    }
    return name;
}

function readNonEmptyArray(value: unknown, path: Path, label: string): readonly unknown[] {
    if (!Array.isArray(value) || value.length === 0) {
        return fail("INVALID_NODE", `${label} must be a non-empty array`, path);
    }
    return value;
}

function readShape(value: unknown, path: Path): PlainRecord {
    if (!isPlainObject(value)) {
        return fail("INVALID_NODE", "Object Contract shape must be an object", path);
    }
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string") {
            return fail("INVALID_NODE", "Object Contract shape keys must be strings", path);
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor?.enumerable !== true) {
            return fail("INVALID_NODE", `Object Contract field ${key} must be enumerable`, [...path, key]);
        }
    }
    return value;
}

class DefinitionChecker {
    private readonly visitedNodes = new WeakSet<object>();
    private readonly definitionsByName = new Map<string, RecursiveDefinition>();
    private readonly definitionsByOwner = new Map<symbol, RecursiveDefinition>();
    private readonly references: RecursiveReference[] = [];

    check(root: unknown): void {
        const rootNode = readNode(root, []);
        this.collectNode(rootNode, []);
        this.validateReferences();
        this.validateRecursion(rootNode);
    }

    private collectNode(node: RuntimeNode, path: Path): void {
        if (this.visitedNodes.has(node)) return;
        this.visitedNodes.add(node);

        switch (node.kind) {
            case "string":
            case "number":
            case "integer":
            case "boolean":
            case "null":
            case "literal":
            case "enum":
                return;
            case "object":
                this.collectShape(node.shape, path);
                return;
            case "optional":
                fail(
                    "INVALID_OPTIONAL_POSITION",
                    "optional property can only be used in an object shape",
                    path,
                );
            case "nullable":
                this.collectChild(node.inner, [...path, "inner"]);
                return;
            case "array":
                this.collectChild(node.items, [...path, "items"]);
                return;
            case "record":
                this.collectChild(node.values, [...path, "values"]);
                return;
            case "union":
                this.collectBranches(node.branches, [...path, "branches"], "union");
                return;
            case "discriminatedUnion":
                this.collectDiscriminatedUnion(node, path);
                return;
            case "recursive":
                this.collectRecursive(node, path);
                return;
            case "recursiveRef":
                this.collectRecursiveReference(node, path);
                return;
        }
    }

    private collectChild(value: unknown, path: Path): void {
        this.collectNode(readNode(value, path), path);
    }

    private collectProperty(value: unknown, path: Path): void {
        if (isOptionalPropertyNode(value)) {
            this.collectChild(value.inner, [...path, "inner"]);
            return;
        }
        this.collectChild(value, path);
    }

    private collectShape(value: unknown, path: Path): void {
        const shape = readShape(value, [...path, "shape"]);
        for (const key of Object.keys(shape)) {
            this.collectProperty(shape[key], [...path, "shape", key]);
        }
    }

    private collectBranches(value: unknown, path: Path, label: string): void {
        const branches = readNonEmptyArray(value, path, `${label} branches`);
        for (const [index, branch] of branches.entries()) {
            this.collectChild(branch, [...path, index]);
        }
    }

    private collectDiscriminatedUnion(node: RuntimeNode, path: Path): void {
        const discriminator = node.discriminator;
        if (typeof discriminator !== "string" || discriminator.length === 0) {
            fail("INVALID_NODE", "Discriminated union must define a discriminator", [...path, "discriminator"]);
        }
        const branches = readNonEmptyArray(node.branches, [...path, "branches"], "discriminated union branches");
        for (const [index, branch] of branches.entries()) {
            const branchPath = [...path, "branches", index];
            const branchNode = readNode(branch, branchPath);
            if (branchNode.kind !== "object") {
                fail("INVALID_NODE", "Discriminated union branches must be object Contracts", branchPath);
            }
            const shape = readShape(branchNode.shape, [...branchPath, "shape"]);
            const discriminatorProperty = shape[discriminator];
            const literal = readNode(discriminatorProperty, [...branchPath, "shape", discriminator]);
            if (literal.kind !== "literal") {
                fail(
                    "INVALID_NODE",
                    "Discriminated union branches must define a literal discriminator",
                    [...branchPath, "shape", discriminator],
                );
            }
            this.collectNode(branchNode, branchPath);
        }
    }

    private collectRecursive(node: RuntimeNode, path: Path): void {
        const name = readName(node, [...path, "name"], "name");
        const owner = readOwner(node, path);
        const existingOwner = this.definitionsByOwner.get(owner);
        if (existingOwner !== undefined && existingOwner.node !== node) {
            fail("INVALID_NODE", "Recursive definition identity is reused by different nodes", path);
        }
        const existingName = this.definitionsByName.get(name);
        if (existingName !== undefined && existingName.node !== node) {
            fail("DUPLICATE_RECURSIVE_NAME", `Recursive name ${name} is defined more than once`, path);
        }
        const definition = existingOwner ?? { node, name, owner, path };
        this.definitionsByOwner.set(owner, definition);
        this.definitionsByName.set(name, definition);
        this.collectChild(node.body, [...path, "body"]);
    }

    private collectRecursiveReference(node: RuntimeNode, path: Path): void {
        const name = readName(node, [...path, "name"], "name");
        const owner = readOwner(node, path);
        this.references.push({ name, owner, path });
    }

    private validateReferences(): void {
        for (const reference of this.references) {
            const definition = this.definitionsByOwner.get(reference.owner);
            if (definition === undefined || definition.name !== reference.name) {
                fail(
                    "DANGLING_RECURSIVE_REFERENCE",
                    `Recursive reference ${reference.name} does not resolve to a definition in this Contract`,
                    reference.path,
                );
            }
        }
    }

    private validateRecursion(root: RuntimeNode): void {
        this.walkNode(root, new Map(), []);
    }

    private walkNode(
        node: RuntimeNode,
        guards: ReadonlyMap<symbol, boolean>,
        path: Path,
    ): void {
        switch (node.kind) {
            case "string":
            case "number":
            case "integer":
            case "boolean":
            case "null":
            case "literal":
            case "enum":
                return;
            case "object":
                this.walkShape(node.shape, guards, path);
                return;
            case "optional":
                fail(
                    "INVALID_OPTIONAL_POSITION",
                    "optional property can only be used in an object shape",
                    path,
                );
            case "nullable":
                this.walkNode(readNode(node.inner, [...path, "inner"]), guards, [...path, "inner"]);
                return;
            case "array":
                this.walkNode(readNode(node.items, [...path, "items"]), this.markGuarded(guards), [...path, "items"]);
                return;
            case "record":
                this.walkNode(readNode(node.values, [...path, "values"]), this.markGuarded(guards), [...path, "values"]);
                return;
            case "union": {
                const branches = readNonEmptyArray(node.branches, [...path, "branches"], "union branches");
                for (const [index, branch] of branches.entries()) {
                    this.walkNode(readNode(branch, [...path, "branches", index]), guards, [...path, "branches", index]);
                }
                return;
            }
            case "discriminatedUnion": {
                const branches = readNonEmptyArray(
                    node.branches,
                    [...path, "branches"],
                    "discriminated union branches",
                );
                for (const [index, branch] of branches.entries()) {
                    this.walkNode(readNode(branch, [...path, "branches", index]), guards, [...path, "branches", index]);
                }
                return;
            }
            case "recursive": {
                const owner = readOwner(node, path);
                if (guards.has(owner)) {
                    fail("INVALID_NODE", "Recursive definition is nested inside itself", path);
                }
                const nextGuards = new Map(guards);
                nextGuards.set(owner, false);
                this.walkNode(readNode(node.body, [...path, "body"]), nextGuards, [...path, "body"]);
                return;
            }
            case "recursiveRef": {
                const owner = readOwner(node, path);
                const definition = this.definitionsByOwner.get(owner);
                if (definition === undefined || definition.name !== node.name) {
                    fail(
                        "DANGLING_RECURSIVE_REFERENCE",
                        `Recursive reference ${String(node.name)} does not resolve to a definition in this Contract`,
                        path,
                    );
                }
                const guarded = guards.get(owner);
                if (guarded === undefined) {
                    fail(
                        "DANGLING_RECURSIVE_REFERENCE",
                        `Recursive reference ${definition.name} is outside its active definition`,
                        path,
                    );
                }
                if (!guarded) {
                    fail(
                        "UNGUARDED_RECURSION",
                        `Recursive reference ${definition.name} is not protected by an object field, array item, or record value`,
                        path,
                    );
                }
                return;
            }
        }
    }

    private walkShape(
        value: unknown,
        guards: ReadonlyMap<symbol, boolean>,
        path: Path,
    ): void {
        const shape = readShape(value, [...path, "shape"]);
        for (const key of Object.keys(shape)) {
            const property = shape[key];
            const propertyPath = [...path, "shape", key];
            const nextGuards = this.markGuarded(guards);
            if (isOptionalPropertyNode(property)) {
                this.walkNode(readNode(property.inner, [...propertyPath, "inner"]), nextGuards, [...propertyPath, "inner"]);
            } else {
                this.walkNode(readNode(property, propertyPath), nextGuards, propertyPath);
            }
        }
    }

    private markGuarded(guards: ReadonlyMap<symbol, boolean>): Map<symbol, boolean> {
        const nextGuards = new Map(guards);
        for (const owner of nextGuards.keys()) {
            nextGuards.set(owner, true);
        }
        return nextGuards;
    }
}

/**
 * 在 Parser 或其它 Contract consumer 使用前检查完整 Contract AST 图。
 *
 * @remarks
 * 该检查只接受本包 builder 创建的节点，验证递归名称、引用作用域、optional 位置和递归保护边界。
 * 发现定义错误时抛出 `ContractDefinitionError`；不会将配置错误伪装成输入校验 issue。
 *
 * @param value - 待检查的 Contract AST。
 * @throws ContractDefinitionError 表示节点、递归引用或递归结构不满足定义契约。
 *
 * @example
 * ```ts
 * assertValidContract(contract.object({ name: contract.string() }));
 * ```
 */
export function assertValidContract(value: unknown): asserts value is Contract<unknown> {
    new DefinitionChecker().check(value);
}
