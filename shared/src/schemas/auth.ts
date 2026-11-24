import { z } from 'zod';

export const googleLoginBody = z.object({ idToken: z.string().min(20).max(4096) });
export const refreshBody = z.object({ refreshToken: z.string().min(20).max(512) });

export const userDTO = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  picture: z.string().url().nullable(),
});
export type UserDTO = z.infer<typeof userDTO>;

export const authResponse = z.object({
  user: userDTO,
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresInSeconds: z.number().int().positive(),
});
export type AuthResponse = z.infer<typeof authResponse>;
