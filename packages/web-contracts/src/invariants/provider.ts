/**
 * Provider 投影不得携带明文凭据键。
 *
 * @remarks
 * 开放对象语义会保留额外 JSON 字段，因此凭据禁用键必须在结构解析后由共享不变量
 * 显式拒绝。该谓词用于顶层档案投影及所有包含档案投影的 settings、写入、删除与
 * 激活结果。
 *
 * @param value - 已通过结构解析的 Provider 投影。
 * @returns 不含 `apiKey` 键时为 `true`。
 *
 * @example
 * ```ts
 * if (hasNoProviderCredentialKey(profile)) console.log(profile.apiKeyMask);
 * ```
 */
export function hasNoProviderCredentialKey(value: object): boolean {
    return !("apiKey" in value);
}
