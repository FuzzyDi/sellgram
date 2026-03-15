import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateInitData } from './telegram-auth.js';

const BOT_TOKEN = 'test-bot-token-12345';

function buildInitData(overrides?: {
  user?: object;
  auth_date?: number;
  extraParams?: Record<string, string>;
  tamperHash?: boolean;
  wrongLength?: boolean;
}): string {
  const user = overrides?.user ?? { id: 42, first_name: 'Alice', username: 'alice' };
  const auth_date = overrides?.auth_date ?? Math.floor(Date.now() / 1000);

  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  params.set('auth_date', String(auth_date));
  if (overrides?.extraParams) {
    for (const [k, v] of Object.entries(overrides.extraParams)) {
      params.set(k, v);
    }
  }

  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  let hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (overrides?.tamperHash) {
    // flip last char
    hash = hash.slice(0, -1) + (hash.endsWith('a') ? 'b' : 'a');
  }
  if (overrides?.wrongLength) {
    hash = hash.slice(0, 32); // truncate to half length
  }

  params.set('hash', hash);
  return params.toString();
}

describe('validateInitData', () => {
  it('returns user data for valid initData', () => {
    const result = validateInitData(buildInitData(), BOT_TOKEN);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(42);
    expect(result?.first_name).toBe('Alice');
  });

  it('returns null when hash is missing', () => {
    const params = new URLSearchParams();
    params.set('user', JSON.stringify({ id: 1 }));
    params.set('auth_date', String(Math.floor(Date.now() / 1000)));
    expect(validateInitData(params.toString(), BOT_TOKEN)).toBeNull();
  });

  it('returns null for tampered hash (constant-time check)', () => {
    const result = validateInitData(buildInitData({ tamperHash: true }), BOT_TOKEN);
    expect(result).toBeNull();
  });

  it('returns null when hash has wrong length', () => {
    // Buffer.from(..., "hex") for wrong length → timingSafeEqual length mismatch
    const result = validateInitData(buildInitData({ wrongLength: true }), BOT_TOKEN);
    expect(result).toBeNull();
  });

  it('returns null when signed with different bot token', () => {
    const initData = buildInitData();
    expect(validateInitData(initData, 'different-token')).toBeNull();
  });

  it('returns null when auth_date is older than maxAgeSec', () => {
    const staleDate = Math.floor(Date.now() / 1000) - 700; // 700s > default 600s
    const result = validateInitData(buildInitData({ auth_date: staleDate }), BOT_TOKEN);
    expect(result).toBeNull();
  });

  it('accepts auth_date within custom maxAgeSec window', () => {
    const date = Math.floor(Date.now() / 1000) - 700;
    const result = validateInitData(buildInitData({ auth_date: date }), BOT_TOKEN, 3600);
    expect(result).not.toBeNull();
  });

  it('returns null when auth_date is missing', () => {
    // Build without auth_date by passing a non-numeric value
    const params = new URLSearchParams();
    params.set('user', JSON.stringify({ id: 1 }));
    params.set('auth_date', 'not-a-number');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const dcs = entries.map(([k, v]) => `${k}=${v}`).join('\n');
    const hash = crypto.createHmac('sha256', secretKey).update(dcs).digest('hex');
    params.set('hash', hash);
    expect(validateInitData(params.toString(), BOT_TOKEN)).toBeNull();
  });

  it('returns null when user field is missing', () => {
    const params = new URLSearchParams();
    params.set('auth_date', String(Math.floor(Date.now() / 1000)));
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const dcs = entries.map(([k, v]) => `${k}=${v}`).join('\n');
    const hash = crypto.createHmac('sha256', secretKey).update(dcs).digest('hex');
    params.set('hash', hash);
    expect(validateInitData(params.toString(), BOT_TOKEN)).toBeNull();
  });
});
