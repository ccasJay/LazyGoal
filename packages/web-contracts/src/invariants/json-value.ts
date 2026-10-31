/**
 * wire 上允许传输的 JSON 值谓词。
 *
 * @remarks
 * 共享实现归属 `@lazygoal/contracts` 的 JSON 原语；此处仅保留公开名称转发，不维护
 * 第二份实现。判定拒绝非有限数、类实例、符号键对象与循环引用，并使用显式栈，
 * 不执行 Schema 校验或结构深度预算。
 */
export { isJsonValue } from "../../../contracts/src/index";
