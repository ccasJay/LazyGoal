import { BlockList, isIP, isIPv4, isIPv6 } from "node:net";

import { WebFetchBlockedUrlError } from "./fetch-errors";

/**
 * 经过完整校验的解析地址。
 *
 * @remarks
 * `family` 只使用 4 或 6，供连接层按地址族选择已验证地址。
 *
 * @example
 * ```ts
 * const resolved: WebFetchResolvedAddress = { address: "8.8.8.8", family: 4 };
 * ```
 */
export interface WebFetchResolvedAddress {
    /** 规范化后的 IP 字面量。 */
    readonly address: string;
    /** IP 地址族。 */
    readonly family: 4 | 6;
}

/**
 * 阻止本机、内网、链路本地、组播、未指定和常见保留网段的地址列表。
 *
 * @remarks
 * IPv4-mapped IPv6 会先提取映射的 IPv4 再按 IPv4 规则复核。
 */
const BLOCKED_ADDRESSES = new BlockList();

for (const [network, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
] as const) {
    BLOCKED_ADDRESSES.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
    ["::", 128],
    ["::1", 128],
    ["100::", 64],
    ["2001:10::", 28],
    ["2001:db8::", 32],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
] as const) {
    BLOCKED_ADDRESSES.addSubnet(network, prefix, "ipv6");
}

function expandIpv6(address: string): readonly string[] | undefined {
    const sections = address.split("::");
    const left = sections[0] ?? "";
    const right = sections.length > 1 ? sections[1] : undefined;
    if (right === undefined && address.includes("::")) return undefined;
    const leftGroups = left === "" ? [] : left.split(":");
    const rightGroups = right === undefined || right === "" ? [] : right.split(":");
    if (right === undefined) {
        return leftGroups.length === 8 ? leftGroups : undefined;
    }
    const missing = 8 - leftGroups.length - rightGroups.length;
    if (missing < 1) return undefined;
    return [...leftGroups, ...Array<string>(missing).fill("0"), ...rightGroups];
}

function ipv4FromMappedIpv6(address: string): string | undefined {
    const groups = expandIpv6(address.toLowerCase());
    if (groups === undefined || groups.length !== 8) return undefined;
    if (!groups.slice(0, 5).every((group) => group === "0")) return undefined;
    if (groups[5] !== "ffff") return undefined;
    const first = Number.parseInt(groups[6] ?? "", 16);
    const second = Number.parseInt(groups[7] ?? "", 16);
    if (!Number.isInteger(first) || !Number.isInteger(second)) return undefined;
    return [first >> 8, first & 0xff, second >> 8, second & 0xff].join(".");
}

/**
 * 判断地址是否命中默认网页抓取的阻止列表。
 *
 * @param address - IPv4 或 IPv6 字面量；可带方括号。
 * @returns 地址被阻止时返回 `true`；不是 IP 字面量时返回 `true`。
 *
 * @example
 * ```ts
 * const blocked = isBlockedWebFetchAddress("127.0.0.1");
 * ```
 */
export function isBlockedWebFetchAddress(address: string): boolean {
    const normalizedAddress = address.startsWith("[") && address.endsWith("]")
        ? address.slice(1, -1)
        : address;
    if (normalizedAddress.includes("%")) return true;
    if (isIPv4(normalizedAddress)) return BLOCKED_ADDRESSES.check(normalizedAddress, "ipv4");
    if (!isIPv6(normalizedAddress)) return true;
    const mappedIpv4 = ipv4FromMappedIpv6(normalizedAddress);
    if (mappedIpv4 !== undefined) return BLOCKED_ADDRESSES.check(mappedIpv4, "ipv4");
    return BLOCKED_ADDRESSES.check(normalizedAddress, "ipv6");
}

/**
 * 规范化单个解析地址并返回地址族。
 *
 * @param address - DNS 或 URL 提供的地址字面量。
 * @returns 规范化地址与地址族。
 * @throws `WebFetchBlockedUrlError` - 地址不是 IP 字面量或命中阻止列表时抛出。
 *
 * @example
 * ```ts
 * const resolved = normalizeResolvedAddress("8.8.8.8");
 * ```
 */
export function normalizeResolvedAddress(address: string): WebFetchResolvedAddress {
    const normalizedAddress = address.startsWith("[") && address.endsWith("]")
        ? address.slice(1, -1)
        : address;
    if (normalizedAddress.includes("%")) throw new WebFetchBlockedUrlError("blocked_address");
    if (isBlockedWebFetchAddress(normalizedAddress)) {
        throw new WebFetchBlockedUrlError("blocked_address");
    }
    if (isIPv4(normalizedAddress)) return { address: normalizedAddress, family: 4 };
    if (isIPv6(normalizedAddress)) return { address: normalizedAddress, family: 6 };
    throw new WebFetchBlockedUrlError("blocked_address");
}

/**
 * 校验一组主机解析结果，要求每个地址都在允许范围内。
 *
 * @param addresses - 主机名解析得到的全部 A/AAAA 地址。
 * @returns 规范化后的已验证地址列表。
 * @throws `WebFetchBlockedUrlError` - 地址为空或任一地址命中阻止列表时抛出。
 *
 * @example
 * ```ts
 * const resolved = validateResolvedAddresses(["8.8.8.8"]);
 * ```
 */
export function validateResolvedAddresses(
    addresses: readonly string[],
): readonly WebFetchResolvedAddress[] {
    if (addresses.length === 0) throw new WebFetchBlockedUrlError("no_addresses");
    return addresses.map(normalizeResolvedAddress);
}

function normalizedHostname(url: URL): string {
    const hostname = url.hostname;
    const unbracketed = hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;
    return unbracketed.toLowerCase().replace(/\.$/, "");
}

/**
 * 提取 URL 中用于地址校验的主机名。
 *
 * @param url - 已解析的 URL。
 * @returns 去除 IPv6 方括号、末尾点和大小写差异的主机名。
 *
 * @example
 * ```ts
 * const hostname = webFetchHostname(new URL("https://example.com/"));
 * ```
 */
export function webFetchHostname(url: URL): string {
    return normalizedHostname(url);
}

/**
 * 校验 URL 协议、凭据与本机/私网字面地址。
 *
 * @remarks
 * 该检查不执行 DNS 解析；默认 handler 仍会对主机名解析后的全部地址再次校验。
 *
 * @param rawUrl - 待校验的 URL 字符串或 URL 对象。
 * @returns 规范化后的 URL。
 * @throws `WebFetchBlockedUrlError` - URL 无效、协议不允许、包含凭据或指向本机/私网字面地址时抛出。
 *
 * @example
 * ```ts
 * const url = assertSafeWebFetchUrl("https://example.com");
 * ```
 */
export function assertSafeWebFetchUrl(rawUrl: string | URL): URL {
    let url: URL;
    try {
        url = rawUrl instanceof URL ? new URL(rawUrl.toString()) : new URL(rawUrl);
    } catch {
        throw new WebFetchBlockedUrlError("invalid_url");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new WebFetchBlockedUrlError("unsupported_protocol");
    }
    if (url.username.length > 0 || url.password.length > 0) {
        throw new WebFetchBlockedUrlError("credentials_not_allowed");
    }
    const hostname = normalizedHostname(url);
    if (hostname.length === 0) throw new WebFetchBlockedUrlError("invalid_url");
    if (hostname.includes("%")) throw new WebFetchBlockedUrlError("blocked_address");
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
        throw new WebFetchBlockedUrlError("local_hostname");
    }
    const family = isIP(hostname);
    if (family !== 0) {
        if (isBlockedWebFetchAddress(hostname)) {
            throw new WebFetchBlockedUrlError("blocked_address");
        }
    }
    return url;
}
