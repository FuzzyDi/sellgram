import { describe, expect, it } from 'vitest';
import { isUnsafeResolvedAddress } from './ssrf-guard.js';

describe('isUnsafeResolvedAddress', () => {
  it.each([
    ['10.0.0.1', 'RFC1918 10.0.0.0/8'],
    ['10.255.255.255', 'RFC1918 10.0.0.0/8 upper bound'],
    ['172.16.0.1', 'RFC1918 172.16.0.0/12 lower bound'],
    ['172.31.255.255', 'RFC1918 172.16.0.0/12 upper bound'],
    ['192.168.1.1', 'RFC1918 192.168.0.0/16'],
    ['127.0.0.1', 'IPv4 loopback'],
    ['127.53.0.1', 'IPv4 loopback, non-canonical host'],
    ['0.0.0.0', 'unspecified'],
    ['169.254.169.254', 'link-local cloud metadata endpoint'],
    ['169.254.1.1', 'link-local'],
    ['100.64.0.1', 'carrier-grade NAT'],
  ])('blocks IPv4 %s (%s)', (address) => {
    expect(isUnsafeResolvedAddress(address)).toBe(true);
  });

  it.each([
    ['8.8.8.8', 'public DNS'],
    ['1.1.1.1', 'public DNS'],
    ['172.15.255.255', 'just below RFC1918 172.16.0.0/12'],
    ['172.32.0.0', 'just above RFC1918 172.16.0.0/12'],
    ['100.63.255.255', 'just below carrier-grade NAT range'],
  ])('allows public IPv4 %s (%s)', (address) => {
    expect(isUnsafeResolvedAddress(address)).toBe(false);
  });

  it.each([
    ['::1', 'IPv6 loopback'],
    ['::', 'IPv6 unspecified'],
    ['fe80::1', 'link-local fe80::/10'],
    ['febf::1', 'link-local fe80::/10 upper edge'],
    ['fc00::1', 'unique local fc00::/7'],
    ['fdff:ffff::1', 'unique local fc00::/7 upper bound'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:169.254.169.254', 'IPv4-mapped cloud metadata'],
    ['::ffff:10.0.0.1', 'IPv4-mapped RFC1918'],
    // Node's URL parser normalizes a bracketed IPv4-mapped literal to this
    // all-hex form (verified: new URL('https://[::ffff:169.254.169.254]/').hostname
    // -> "[::ffff:a9fe:a9fe]"), not the dotted-decimal form above.
    ['::ffff:a9fe:a9fe', 'IPv4-mapped cloud metadata, hex-group form'],
  ])('blocks IPv6 %s (%s)', (address) => {
    expect(isUnsafeResolvedAddress(address)).toBe(true);
  });

  it.each([
    ['2001:4860:4860::8888', 'Google public DNS'],
    ['::ffff:8.8.8.8', 'IPv4-mapped public address'],
  ])('allows public IPv6 %s (%s)', (address) => {
    expect(isUnsafeResolvedAddress(address)).toBe(false);
  });

  it('fails closed on a value that is not a valid IP at all', () => {
    expect(isUnsafeResolvedAddress('not-an-ip')).toBe(true);
  });
});
