# Setup

## Pré-requisitos
Node 22+, npm 10+, Android Studio (SDK + emulador) ou dispositivo Android com depuração USB, JDK 17.

## 1. Instalar
```bash
npm install
npm test            # shared + backend (+ mobile: npm run test -w mobile)
npm run typecheck
```

## 2. O que TENS de configurar (não é possível automatizar)
1. **MongoDB Atlas (free M0)**: criar cluster, utilizador de BD, permitir o IP do backend. Copiar a connection string.
2. **Google Cloud Console** → APIs & Services → Credentials:
   - criar **OAuth client ID tipo Web** (o seu ID vai para `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` e `GOOGLE_CLIENT_IDS`);
   - criar **OAuth client ID tipo Android** com package `pt.gymtracker.app` e o SHA-1 da keystore de debug/release
     (`cd mobile/android && ./gradlew signingReport` após o prebuild). Sem este cliente o login Android falha.
   - configurar o OAuth consent screen.
3. `backend/.env` a partir de `backend/.env.example` (gerar `JWT_SECRET` ≥ 32 chars).
4. `mobile/.env` a partir de `mobile/.env.example`.

## 3. Backend
```bash
cd backend && npm run dev     # http://localhost:3000/health
```
Em produção: alojar atrás de HTTPS (TLS no proxy/PaaS).

## 4. Mobile (Development Build — o Google Sign-In é nativo e NÃO funciona no Expo Go)
```bash
cd mobile
npx expo prebuild --platform android
npx expo run:android          # emulador: API em http://10.0.2.2:3000
```
Em dispositivo físico, `EXPO_PUBLIC_API_URL` deve apontar para um URL acessível (IP da LAN ou HTTPS público).

## Nutrição (Fase 3)
- **Open Food Facts**: não precisa de chave. Define `EXPO_PUBLIC_OFF_CONTACT` (email/URL do projeto) em `mobile/.env`: é enviado no `User-Agent`, como a API pede.
- **Câmara e OCR** (`expo-camera`, `@react-native-ml-kit/text-recognition`) são módulos nativos → exigem Development Build (`npx expo prebuild && npx expo run:android`), não funcionam no Expo Go.

## Treinador IA (Fase 5) — opcional
Por defeito `AI_PROVIDER=none`: o servidor responde 503 em `/ai/*` e a app usa só a análise local.
1. Cria uma chave no Google AI Studio (https://aistudio.google.com) e define em `backend/.env`: `AI_PROVIDER=gemini`, `GEMINI_API_KEY=…`.
2. `GEMINI_MODEL`: os nomes de modelos mudam e alguns foram descontinuados — **confirma o modelo e os limites gratuitos atuais** na documentação/AI Studio antes de ativar. O valor por defeito (`gemini-2.5-flash`) não foi verificado contra a API real.
3. Alternativa: `AI_PROVIDER=openai` com `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` (qualquer API compatível com `/chat/completions`).
4. Limites por utilizador/dia: `AI_DAILY_LIMIT`, `AI_MEAL_PHOTO_DAILY_LIMIT` (dia UTC). Pedidos falhados do fornecedor não contam.
**Privacidade:** no escalão gratuito do Gemini a Google pode usar o conteúdo enviado para melhorar os seus produtos. A app mostra isto no consentimento e permite ver os dados antes de enviar.

## Sincronização (Fase 7)
Automática com sessão iniciada: ao abrir, a cada minuto, ao voltar à app e ~3 s após cada alteração; falhas repetem com recuo exponencial (5 s … 5 min). O indicador no dashboard mostra o estado e abre **Sincronização** (conflitos, "Sincronizar agora").
O servidor guarda cada entidade na coleção do brief (`workoutPlans`, `workoutSessions`, `nutritionEntries`, `foods`, `recipes`, `bodyMeasurements`, `nutritionGoals`, `customExercises`, `userSettings`) num documento `{userId, entityId, data, version, seq, deleted…}`; `seq` por utilizador alimenta o *pull* incremental. Backup/exportação completa: `GET /me/export` (botão em Exportar).

## Notificações (secção 11)
`expo-notifications` (local, sem servidor). Permissão `POST_NOTIFICATIONS` pedida só quando ativas algo. Em Android 12+ a pontualidade exata em modo de poupança de bateria depende do fabricante.

## Gerar o APK de teste
Não foi possível gerar aqui (sem Android SDK/EAS). Com conta Expo: `npm i -g eas-cli && cd mobile && eas login && eas build --platform android --profile preview` (APK instalável; `eas.json` incluído). Definir antes `EXPO_PUBLIC_API_URL` (URL **HTTPS** do backend) e `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` em `eas secret`/`.env`. Registar o SHA-1 da keystore do build no cliente Android do Google Cloud.
`npx expo prebuild --platform android` foi executado aqui com sucesso (plugins e permissões validados).

## Servidor gratuito (Render)
`render.yaml` descreve o serviço. Na Render: New → Blueprint → escolher o repositório → preencher MONGODB_URI, JWT_SECRET, GOOGLE_CLIENT_IDS e GEMINI_API_KEY. No Atlas, permitir o acesso da Render em Network Access. Depois, `EXPO_PUBLIC_API_URL=https://<serviço>.onrender.com` em `mobile/.env` e gerar novo APK. Testar a chave antes: `npm run ai:check -w backend`.
