# Arquitetura (Fase 1)

- **Monorepo npm workspaces**: `shared` é consumido como código-fonte TS (sem build) por backend (tsx/vitest) e mobile (Metro).
- **Offline-first**: toda a escrita vai primeiro para SQLite; alterações sincronizáveis entram em `sync_queue`
  (implementada; o envio incremental e a resolução de conflitos são a Fase 7). O indicador do dashboard mostra o nº de alterações pendentes.
- **Sessão offline**: o utilizador e os tokens ficam em cache (SecureStore + kv). A app abre sem rede; valida em segundo plano e
  só termina sessão se o servidor responder 401 (refresh inválido).
- **Auth**: Google Sign-In nativo → `idToken` → `POST /auth/google` (verificado no backend contra `GOOGLE_CLIENT_IDS`)
  → access JWT (15 min) + refresh opaco (30 dias, guardado só como hash SHA-256, rotativo, TTL no MongoDB).
  Cliente com refresh single-flight para evitar corridas na rotação.
- **Isolamento**: `userId` vem sempre do JWT, nunca do body. Dados locais têm `user_id`.
- **Persistência backend**: interface `Store` (Mongo em produção, memória nos testes) — permite testar sem Atlas.
- **Mobile nunca fala com o MongoDB** nem contém segredos; só `EXPO_PUBLIC_*` públicos (API URL, Web client ID).

## Decisões
| Decisão | Razão |
|---|---|
| Design system próprio (StyleSheet + tokens) em vez de Paper/NativeWind | Preferência, não obrigação do brief; evita configuração de compilador Tailwind e mantém controlo total do dark mode e alvos táteis grandes. Pode adotar-se Paper mais tarde sem refactor de dados. |
| `@react-native-google-signin` em vez de `expo-auth-session` | Fluxo nativo de Android mais fiável, devolve `idToken` diretamente; requer Development Build (permitido no brief). |
| Fastify 5 | Validação/hooks nativos, rate-limit e helmet oficiais. |
| Mongoose 8 | Schemas/índices TTL; mantém-se por compatibilidade estável. |
| Reordenar cartões com botões ↑/↓ | Acessível e sem dependências nativas extra; drag-and-drop pode ser acrescentado depois. |

## Treino (Fase 2)
- **Lógica pura em `shared/`** (testada sem dispositivo): progressão (double progression), PRs, estagnação, sequência semanal, fluxo de superséries/descanso, agenda, geração de séries a partir da configuração.
- **Repositórios SQL em `mobile/features/workouts/`**, testados em Node com um adaptador `node:sqlite` com a API do expo-sqlite (`mobile/tests/testDb.ts`) — valida SQL, migrações e seed reais.
- **Tempo por timestamps**: cronómetro = `now − startedAt`; descanso = `restEndsAt − now`, persistido na sessão. Sobrevive a fecho da app e bloqueio do ecrã.
- **Sessão ativa persistida**: cada alteração de peso/reps é gravada de imediato; ao reabrir, "Retomar treino".
- **Sugestões nunca automáticas**: a progressão só altera valores quando o utilizador toca em "Aplicar".
- **Séries por tipo**: aquecimento (fora do volume), efetiva, drop (carga desce sozinha, sem descanso), rest-pause (descanso 20 s), falha; superset alterna exercícios sem descanso até fechar a ronda.

## Nutrição (Fase 3)
- **Lógica pura em `shared/`**: conversões g/ml/dose/unidade, escala de macros (precisão total nos valores intermédios; arredondamento só no resultado), validação de valores por 100 g, mapeamento Open Food Facts, parser de rótulos OCR (agrupa linhas por coordenadas; PT/EN; kJ→kcal; colunas múltiplas), receitas, chaves de dia locais.
- **Offline-first**: produtos lidos uma vez ficam guardados (leitura de código de barras funciona offline para produtos conhecidos). Open Food Facts só é consultado por ação do utilizador (ler código / "Pesquisar online"); só o código ou o termo de pesquisa saem do dispositivo.
- **OCR 100 % no dispositivo** (Google ML Kit). A foto é apagada logo após o processamento; ao arrancar corre uma limpeza de imagens com mais de 7 dias (`services/tempFiles.ts`).
- **Nada é guardado sem confirmação**: o OCR mostra os valores editáveis, a base (100 g/ml/dose/unidade) e a conversão final; valores impossíveis são bloqueados e incoerentes geram aviso.
- **Objetivos**: Mifflin-St Jeor devolve uma *estimativa* marcada como tal; só é guardada com "Guardar objetivos". Histórico por data.

## Treinador IA (Fase 5)
- **A IA propõe, tu decides:** propostas de plano são JSON validado (servidor + app) → resolvidas contra a biblioteca → diff (+ − ~) → só `applyProposal` altera dados, após "Aplicar". Só reconstrói os dias mencionados, nunca apaga dias nem toca em planos de outros utilizadores (`targetPlanId` é verificado).
- **Sem contas na IA:** `features/ai/insights.ts` e `shared/ai/insights.ts` calculam estagnação, progressão, volume e consistência localmente; o contexto enviado leva esses números já calculados.
- **Contexto mínimo e transparente:** `features/ai/context.ts` envia só os âmbitos escolhidos (treino/nutrição/corpo), sem nome/email/ids; o utilizador pode ver o JSON antes de enviar.
- **Backend:** `modules/ai` com fornecedores intercambiáveis (Gemini, OpenAI-compatível), prompt de sistema fixo, dados do utilizador em bloco "DADOS" (nunca no system prompt), quotas diárias atómicas com reembolso em falha, logs sem imagens/tokens.
- **Conversas** só no dispositivo (`ai_messages`), apagáveis; a coleção `aiConversations` do MongoDB não é usada de propósito (minimização de dados).
