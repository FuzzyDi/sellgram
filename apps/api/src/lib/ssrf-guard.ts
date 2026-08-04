import { isIPv4, isIPv6 } from 'net';

// Shared IP-range classification for anything that fetches a
// tenant-controlled URL (currently: outbound webhooks). A hostname passing
// validation once (webhook create/update) does not mean it stays safe
// forever — the tenant can repoint DNS after the fact — so callers that
// actually perform the network request must re-resolve and re-check with
// isUnsafeResolvedAddress at dispatch time, not just trust the stored URL.

const IPV4_PRIVATE_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata (169.254.169.254)
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return IPV4_PRIVATE_RANGES.some(([base, prefix]) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true; // loopback
  if (normalized === '::') return true; // unspecified
  // IPv4-mapped — check the embedded v4. Node's URL/net normalize this to
  // one of two forms depending on where the address came from ("::ffff:
  // 169.254.169.254" from most input, but "::ffff:a9fe:a9fe" — the last
  // two hextets as raw hex, not dotted-decimal — after round-tripping
  // through a bracketed URL host, per node -e verification), so both must
  // be recognized or the second form silently skips the v4 range check.
  const mappedDotted = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDotted) return isPrivateIPv4(mappedDotted[1]);
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const v4 = [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
    return isPrivateIPv4(v4);
  }
  const firstGroup = normalized.split(':')[0];
  const firstHextet = parseInt(firstGroup || '0', 16);
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true; // fe80::/10 link-local
  }
  if (!Number.isNaN(firstHextet) && firstHextet >= 0xfc00 && firstHextet <= 0xfdff) {
    return true; // fc00::/7 unique local
  }
  return false;
}

export function isUnsafeResolvedAddress(address: string): boolean {
  if (isIPv4(address)) return isPrivateIPv4(address);
  if (isIPv6(address)) return isPrivateIPv6(address);
  return true; // couldn't classify it — fail closed
}
