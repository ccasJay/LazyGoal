/**
 * 非数组对象的通用类型守卫。
 *
 * @remarks
 * 该谓词只判断对象身份，不排除类实例或原型污染；wire JSON 的结构校验由合同与
 * `isJsonValue` 承担。实现归属 `@lazygoal/contracts` 的 JSON 原语，此处只转发公开名称，
 * 不维护第二份通用实现。
 *
 * @param value - 待检测值。
 * @returns 非 null 且不是数组的对象时为 `true`。
 *
 * @example
 * ```ts
 * if (isRecord(value)) console.log(Object.keys(value));
 * ```
 */
export { isRecord } from "../../../contracts/src/index";
