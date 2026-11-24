import { OAuth2Client } from 'google-auth-library';
import type { GoogleProfile } from '../database/store';

export interface GoogleVerifier { verify(idToken: string): Promise<GoogleProfile> }

export function createGoogleVerifier(clientIds: string[]): GoogleVerifier {
  const client = new OAuth2Client();
  return {
    async verify(idToken) {
      const ticket = await client.verifyIdToken({ idToken, audience: clientIds });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email) throw new Error('Token Google sem sub/email');
      if (p.email_verified === false) throw new Error('Email Google não verificado');
      return { googleId: p.sub, email: p.email, name: p.name ?? p.email, picture: p.picture ?? null };
    },
  };
}
