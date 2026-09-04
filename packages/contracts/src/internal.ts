/** Contract 构造器与消费端共享的非公开运行时品牌。 */
export const contractBrand = Symbol("lazygoal.contract");
export const optionalBrand = Symbol("lazygoal.optionalProperty");
export const recursiveOwner = Symbol("lazygoal.recursiveOwner");

function isObjectRecord(value: unknown): value is Record<PropertyKey, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 判断值是否为本包 builder 创建的普通 Contract 节点。 */
export function isContractNode(value: unknown): value is Record<PropertyKey, unknown> {
    return isObjectRecord(value) && value[contractBrand] === true;
}

/** 判断值是否为本包 builder 创建的 optional property 节点。 */
export function isOptionalPropertyNode(value: unknown): value is Record<PropertyKey, unknown> {
    return isObjectRecord(value)
        && value[optionalBrand] === true
        && value.kind === "optional";
}
