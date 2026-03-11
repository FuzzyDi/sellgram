import * as jose from 'jose';
import { getConfig } from '../config/index.js';
import type { JwtPayload } from '@shopbot/shared';

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(getConfig().JWT_SECRET);
}

function getRefreshKey(): Uint8Array {
  return new TextEncoder().encode(getConfig().JWT_REFRESH_SECRET);
}

export async function signAccessToken(payload: JwtPayload): Promise<string> {
  return new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getSecretKey());
}

export async function signRefreshToken(payload: JwtPayload): Promise<string> {
  return new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getRefreshKey());
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jose.jwtVerify(token, getSecretKey());
  return payload as unknown as JwtPayload;
}

export async function verifyRefreshToken(token: string): Promise<JwtPayload> {
  const { payload } = await jose.jwtVerify(token, getRefreshKey());
  return payload as unknown as JwtPayload;
}
