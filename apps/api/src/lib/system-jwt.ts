import * as jose from 'jose';
import { getConfig } from '../config/index.js';

export interface SystemJwtPayload {
  type: 'system_admin';
  adminId: string;
  email: string;
}

function getSystemSecret(): Uint8Array {
  const cfg = getConfig();
  return new TextEncoder().encode(cfg.SYSTEM_JWT_SECRET || cfg.JWT_SECRET);
}

export async function signSystemToken(payload: SystemJwtPayload): Promise<string> {
  return new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(getSystemSecret());
}

export async function verifySystemToken(token: string): Promise<SystemJwtPayload> {
  const { payload } = await jose.jwtVerify(token, getSystemSecret());
  return payload as unknown as SystemJwtPayload;
}
