# API (v0)
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | /health | — | Estado |
| POST | /auth/google `{idToken}` | — | Login; devolve `{user, accessToken, refreshToken, accessTokenExpiresInSeconds}` (10/min) |
| POST | /auth/refresh `{refreshToken}` | — | Rotação do refresh token (10/min) |
| POST | /auth/logout `{refreshToken}` | — | Revoga o refresh token |
| GET | /me | Bearer | Perfil |
| DELETE | /me | Bearer | Elimina conta, tokens e dados do utilizador (RGPD) |
Erros: `{error: code}`. Limite global 120 req/min/IP. Segredos e tokens são redigidos nos logs.

## IA (Fase 5) — todas exigem Bearer
| Método | Rota | Descrição |
|---|---|---|
| GET | /ai/status | `{enabled, provider, model, chat:{used,limit}, meal:{used,limit}, costNote}` |
| POST | /ai/chat `{task, messages[≤12], context?{scopes,data ≤24 KB}}` | `{reply, proposal|null, proposalDropped?, usage}`; propostas validadas com zod no servidor (e de novo na app) |
| POST | /ai/meal-photo `{imageBase64 ≤2 MB, mimeType, note?}` | `{items[], estimate:true, usage}`; a imagem não é guardada nem registada |
Erros: 400 `invalid_body`, 413 `context_too_large`, 429 `daily_limit` (ou rate limit 15/min), 502 `provider_error`, 503 `ai_unavailable` | `provider_rate_limited`.
O prompt de sistema é fixo no servidor; o cliente só pode enviar mensagens `user`/`assistant` (qualquer outro campo/role → 400).
