import { createHash, randomBytes } from 'node:crypto';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const newRefreshToken = () => randomBytes(48).toString('base64url');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
