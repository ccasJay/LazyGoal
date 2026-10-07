import type { Contract, OptionalProperty } from "./types";
import { isContractNode, isOptionalPropertyNode } from "./internal";

/**
 * 契约 AST 节点检查结果。
 *
 * @remarks
 * 用于跨包安全识别核心 Contract DSL 创建的节点类型，而无需访问包内部品牌 Symbol。
 *
 * @example
 * ```ts
 * const inspection = inspectContractNode(contract.string());
 * if (inspection?.category === "contract") {
 *     console.log(inspection.node.kind);
 * }
 * ```
 */
export type ContractNodeInspection =
    | {
        readonly category: "contract";
        readonly node: Contract<unknown> & Readonly<Record<string, unknown>>;
      }
    | {
        readonly category: "optional-property";
        readonly node: OptionalProperty<unknown> & Readonly<Record<string, unknown>>;
      };

/**
 * 统一检查未知值是否为核心 Contract AST 节点。
 *
 * @param value - 待检查的任意值。
 * @returns 检查匹配时返回包含类别和只读节点引用的对象；未知或非 AST 值返回 `undefined`。
 *
 * @example
 * ```ts
 * const result = inspectContractNode(contract.string());
 * assert.equal(result?.category, "contract");
 * ```
 */
export function inspectContractNode(
    value: unknown,
): ContractNodeInspection | undefined {
    if (isOptionalPropertyNode(value)) {
        return {
            category: "optional-property",
            node: value as unknown as OptionalProperty<unknown> & Readonly<Record<string, unknown>>,
        };
    }

    if (isContractNode(value)) {
        return {
            category: "contract",
            node: value as unknown as Contract<unknown> & Readonly<Record<string, unknown>>,
        };
    }

    return undefined;
}
