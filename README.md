# Gym & Nutrition Tracker

App Android (React Native + Expo) offline-first de treino, nutrição e evolução, com backend Fastify + MongoDB Atlas.
**Lê `FALTA.md` primeiro (o que falta e o que nunca foi verificado).**

Estado atual: **Fases 1–7 + notificações implementadas e testadas por código; falta validar em dispositivo e gerar o APK** (ver `PROJECT_STATUS.md`, `docs/test-plan.md`).

```
mobile/   app Expo (Expo Router, SQLite, Zustand, TanStack Query)
backend/  API Fastify (Google OAuth, JWT + refresh rotativo, MongoDB)
shared/   tipos, schemas Zod e cálculos partilhados
docs/     arquitetura, base de dados, API, setup
```

Começar: `docs/setup.md`. Testes: `npm install && npm test`.
