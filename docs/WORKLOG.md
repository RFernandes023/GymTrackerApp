# WORKLOG — diário de trabalho (para retomar se a conversa se perder)

**Como retomar:** ler `PROJECT_STATUS.md` (estado) + este ficheiro (o que está a meio). Correr `npm install && npm test && npm run typecheck`.
O projeto está em monorepo: `shared/` (lógica pura testada), `backend/`, `mobile/`. Testes de SQL do mobile usam `mobile/tests/testDb.ts` (node:sqlite).

## Sessão 4 — feedback do utilizador após testar a Fase 3 no telemóvel + Fases 4 e 5
Pedidos do utilizador:
1. [ ] Linhas de chips (músculo/equipamento/tipo) sobrepostas na biblioteca de exercícios → corrigir `ChipRow` (ScrollView horizontal encolhia).
2. [ ] Tocar num treino iniciava-o logo → novo ecrã de pré-visualização do treino com botão "Iniciar treino".
3. [ ] Pesos pré-preenchidos: histórico já existe (confirmar), e na 1.ª vez sugerir carga inicial por peso/altura/idade/sexo + objetivo (hipertrofia/força/resistência).
4. [ ] Fase 4 — Evolução.
5. [ ] Fase 5 — Treinador IA (+ reconhecimento de refeições por foto, adiado da Fase 3).

Decisões/descobertas:
- Gemini: modelo configurável por env (`GEMINI_MODEL`); nomes mudam e alguns foram descontinuados (2.0 Flash retirado). Limites gratuitos não são fixos (ver AI Studio). **No free tier o conteúdo pode ser usado pela Google para melhorar produtos → o consentimento da app tem de dizer isto.**

## Progresso (atualizar a cada marco)
- [x] shared/workout/strength.ts: `suggestStartingWeight` (rácios iniciante÷peso, sexo, idade, IMC≤30, nível, objetivo) + testes (78 shared ok).
- [x] shared/progress/evolution.ts (Deurenberg, US Navy, massa magra/muscular ~50%, validação, deriveMetrics, chartLayout, monthlyComparison, trend) + testes (91 shared ok).
- [x] mobile: migração v4 (workout_plans.goal, body_measurements, ai_messages); profileRepo; measurementsRepo (+weeklySummary); historyRepo (lastPerformance/bestsByExercise movidos); suggest.ts;
      plansRepo.defaultConfigFor/addExerciseToDay (histórico → estimativa → 0; reps/descanso/séries por objetivo do plano); sessionsRepo.planSessionExercises (pré-visualização = mesma lógica do arranque) (40 mobile ok).
- [x] UI pedido 1: `ChipRow` com `flexGrow:0/flexShrink:0` (e a barra de chips em nutrition/add). **Não testado no telemóvel.**
- [x] UI pedido 2: `workout/preview.tsx` (lista exercícios/séries/cargas com origem: último treino | estimativa | plano; botão "Iniciar treino"; bloqueia se já houver treino ativo). O separador Treino agora só abre a pré-visualização.
- [x] `profile.tsx` (sexo, idade, altura, peso, nível) ligado às Definições e à pré-visualização.
- [x] Pedido 3 completo: chips de objetivo no editor de plano (`updatePlan({goal})`) e no modal do exercício (mudar objetivo → reps/descanso; carga só recalculada se for 0 ou a estimativa anterior; usa `suggestionFor`). Teste: objetivo do plano afeta novos exercícios e cópia.
- [x] Fase 4 UI: `components/LineChart.tsx` (react-native-svg, usa `chartLayout`), tab Evolução (`app/(tabs)/progress.tsx`: perfil em falta, tiles peso/IMC/gordura/músculo/cintura com rótulo estimativa|medido, gráfico por indicador + intervalo, comparação mensal, resumo semanal, histórico editável), `app/progress/new.tsx` (RHF+zod, pré-visualização de IMC/estimativas, medições de equipamento opcionais, 8 perímetros, 3 medidas personalizadas, editar/eliminar), cartões do dashboard (weight_current, bmi, body_fat, muscle_mass, waist_trend, weekly_summary; `PHASE_DONE=4`). Testes ok (mobile 45).
- [ ] Fase 5 (nada começado): backend `/ai/chat` e `/ai/meal-photo` (providers Gemini/OpenAI-compatível, limites por utilizador, erros, 503 sem chave), consentimento (free tier Gemini pode usar conteúdo para melhorar produtos da Google), contexto mínimo por pedido (treino/nutrição/corpo), propostas de plano em JSON com diff + aceitar/rejeitar, insights locais (estagnação/baixo volume), chat guardado em `ai_messages`, foto de refeição com estimativas editáveis.

## Sessão 5 — Fase 5 (Treinador IA) — DESENHO (seguir esta ordem)
Princípios: a IA **nunca altera nada sozinha** (só propostas → diff → aceitar/rejeitar); **cálculos feitos localmente** e enviados como factos; contexto **mínimo e por âmbito** (treino/nutrição/corpo), sem email/id/nome; chave **só no backend**; app funciona sem IA (insights locais).
Backend: `modules/ai/{prompts,providers,service,routes}`; providers Gemini (`x-goog-api-key`, `responseMimeType: application/json`) e OpenAI-compatível; `AI_PROVIDER=none|gemini|openai` (por defeito `none` → 503); limites diários por utilizador (`Store.incrementAiUsage/decrementAiUsage`, reembolso se o fornecedor falhar) + rate limit/min; saída do modelo validada com zod (proposta inválida é descartada); logs sem imagens/tokens.
Endpoints: `GET /ai/status`, `POST /ai/chat`, `POST /ai/meal-photo`.
Shared: `ai/schemas.ts` (pedido, resposta, proposta de plano, foto de refeição), `ai/diff.ts` (normalizar/casar nomes, diffPlan), `ai/insights.ts`, `ai/meal.ts`.
Mobile: `services/aiApi.ts`, `features/ai/{consent,context,insights,proposals,aiRepo}.ts`, `components/ProposalCard.tsx`, `app/(tabs)/coach.tsx`, `app/nutrition/meal-photo.tsx`, cartão dashboard `ai_suggestions` (insights locais), `PHASE_DONE=5`.
Aplicar proposta: exercícios casados com a biblioteca por nome (PT/EN); sem correspondência + com músculo → cria exercício personalizado; sem músculo → ignorado e reportado. Nunca remove dias; reconstrói só os dias mencionados.
Aviso de privacidade obrigatório no consentimento: free tier Gemini pode usar o conteúdo para melhorar produtos da Google; foto de refeição pede autorização a cada uso.

### Progresso Fase 5
- [x] shared/ai (schemas, diff, meal, insights) + testes (shared 110 ok)
- [x] backend /ai (providers Gemini/OpenAI, service, routes, limites+reembolso, env, store, .env.example) + testes (backend 30 ok)
- [x] mobile: services/aiApi, features/ai/{aiRepo,consent,insights,context,proposals} (compilam; testes a escrever)
- [x] mobile tests IA (resolver/diff/aplicar/contexto/insights/conversas/consentimento) — mobile 59 ok; bug rowid corrigido
- [x] UI: ProposalCard, coach tab, meal-photo, dashboard (insights locais), rota meal-photo; docs/setup/api/architecture/THIRD_PARTY/CHANGELOG atualizados.
- **FASE 5 CONCLUÍDA (por validar em dispositivo/API real).** Totais: shared 110, backend 30, mobile 59 = 199 testes; tsc limpo; bundle Android ok.
- Próximo: Fase 6 (importar/exportar JSON — formato em `PROMPT` secção 10), 7 (sincronização), 8 (APK), notificações locais.

## Sessão 6 — "continua até à fase que conseguires": Fases 6, 7, notificações, 8 (parcial)
Ordem: (A) Fase 6 JSON → (B) Fase 7 sync → (C) notificações locais → (D) Fase 8 (docs RGPD/privacidade, plano de testes, eas.json; APK NÃO é possível aqui).
### A. Fase 6 — desenho
- shared/exchange/planJson.ts: `parsePlanJson(text)` (erros PT com caminho `days[0].exercises[1].sets[2].reps`, avisos, aliases de músculos/tipos de série, reps número ou {min,max}), `buildPlanJson()`; formato `schemaVersion 1.0`, `type workout_plan` (exemplo do brief).
- mobile/features/exchange: `planImport.ts` (resolver exercícios: biblioteca | sugestões | criar personalizado | ignorar; `insertFullPlan` atómico em plansRepo — séries heterogéneas), `exporters.ts` (plano, todos os planos, exercícios personalizados, histórico, nutrição).
- UI: `app/import-plan.tsx` (colar JSON → validar → pré-visualizar/editar → confirmar; nunca importa JSON inválido), `app/export.tsx` (copiar/partilhar). Dependências: expo-clipboard, expo-sharing.
### Progresso Sessão 6
- [x] A. FASE 6 CONCLUÍDA: shared/exchange/planJson.ts (+splitBundle) · mobile: plansRepo.insertFullPlan (atómico), features/exchange/{planImport,exporters}.ts, app/import-plan.tsx, app/export.tsx, Definições com links, docs/json-import-format.md. Testes: shared 120, mobile 70 (ida e volta, atomicidade, isolamento).
### B. Fase 7 — desenho (sync)
Backend: Store.syncPush/syncPull/exportUserData; coleções por entidade (nomes do brief: workoutPlans, workoutSessions, nutritionEntries, foods, recipes, bodyMeasurements, nutritionGoals, customExercises, userSettings) com documento genérico {userId, entityId, data, version, seq, deleted, clientUpdatedAt, lastOpId}; seq por utilizador (syncMeta). Políticas: workout_plan = versioned (baseVersion; conflito devolve serverDoc), workout_session = immutable (1.ª escrita ganha), restantes = LWW por clientUpdatedAt; idempotência por opId; tombstones.
Endpoints: POST /sync/push, GET /sync/pull?cursor, GET /me/export.
Mobile: sync_state/sync_conflicts (migração v5), appliers por entidade (DTO→SQLite), engine push→pull com retry/backoff, store zustand com estado (idle/syncing/offline/error), indicador no dashboard, ecrã de conflitos (manter o meu / usar servidor / guardar cópia).
- [x] B1. Backend sync CONCLUÍDO: shared/sync/schemas.ts (SYNC_ENTITIES+zod), backend modules/sync/{engine,routes}.ts, stores (memória/Mongo), GET /me/export, entidade user_profile; testes backend 41 (políticas, idempotência, conflitos, isolamento, paginação, RGPD).
- [ ] B2. Mobile sync (migração v5: sync_state, sync_conflicts, sync_queue.blocked; appliers por entidade; engine push→pull; store+scheduler; ecrã app/sync.tsx; DTOs Entry/Ingredient com perUnit/amount; enqueue do perfil).
- [x] B2 (motor): migração v5, appliers (10 entidades), engine push→pull, conflicts (manter meu / usar servidor / cópia); tests/sync.test.ts (2 dispositivos, 14 testes ok). Falta: store+scheduler+UI (app/sync.tsx, indicador, backup cloud).
- [x] B. FASE 7 CONCLUÍDA (em código/testes): store+scheduler+UI sync, backup cloud (/me/export), indicador no dashboard. Totais: shared 120, backend 41, mobile 84.
- [x] C. Notificações CONCLUÍDO: shared/notifications/schedule.ts (+testes), mobile features/notifications/reminders.ts, services/notifications.ts (expo-notifications; aviso de fim do descanso com ecrã bloqueado, lembretes treino/pesagem/alimentação/inatividade), app/notifications.tsx; testes shared 129, mobile 88.
- [x] D. Fase 8 (parcial): política de privacidade (rascunho) + consentimento no login (app/privacy.tsx, constants/privacy.ts, docs/privacy-policy.md), docs/test-plan.md, eas.json, permissões Android limpas (prebuild validado), expo-system-ui, `npm audit` backend 0 vulnerabilidades, sem segredos no repo.
- **ESTADO FINAL DA SESSÃO 6:** shared 129 · backend 41 · mobile 88 = 258 testes; tsc limpo; bundle Android 5,7 MB; prebuild Android ok.
- **NÃO FEITO (impossível aqui):** APK/AAB (sem Android SDK/EAS), qualquer execução em dispositivo/emulador, ligação a Atlas/Google/Gemini/Open Food Facts reais.
- Próximo passo humano: seguir docs/test-plan.md num telemóvel e anotar bugs em PROJECT_STATUS.md.

## Sessão 7 — pedido: "acaba, melhora o UI e mete GIFs do GymVisual"
- GymVisual = biblioteca COMERCIAL (media propriedade da Gym visual; terms em gymvisual.com/content/3-terms-and-conditions-of-use). NÃO se pode copiar/redistribuir; sem acesso de rede daqui. → pipeline para o utilizador usar a SUA licença: `shared/media/manifest.ts` (casar ficheiros↔exercícios), `tools/build-media-manifest.ts`, `mobile/assets/exercise-media.json` + `EXPO_PUBLIC_EXERCISE_MEDIA_URL`, componente `ExerciseMedia` (GIF animado do manifest; senão animação 2 frames do Free Exercise DB), crédito configurável.
- UI: ScreenHeader/BackLink/EmptyState/RestRing, cartões do dashboard com cor/ícone por grupo, barra de progresso do treino, anel do descanso, haptics, tab bar com ícones ativos.
### Progresso Sessão 7
- [x] Média: shared/media/manifest.ts (+testes, 2 bugs apanhados: `_180x180` e variantes "- Medium Grip"), tools/build-media-manifest.ts (testada com ficheiros falsos), features/workouts/media.ts, constants/media.ts, ExerciseImage animado.
- [x] UI: ScreenHeader/BackLink/EmptyState/SectionTitle/RestRing, haptics, dashboard, tabs, ecrã de treino; rest_total_ms. Testes: shared 135, backend 41, mobile 93 = 269; bundle ok.
- UI continua NÃO VISTA num ecrã real; validar com docs/test-plan.md.
- [x] Testes de interface: jest-expo + RNTL 14 (async); 50 testes renderizam ecrãs reais com SQLite de teste (mobile/__rn__). Descobertas: duas cópias do React (corrigido com versões exatas na raiz), RNTL v14 é assíncrono, `Field` ganhou accessibilityLabel. Nenhum bug de runtime na app encontrado por estes testes; as falhas iniciais eram dos próprios testes.
- **ENTREGA FINAL:** 319 testes (135+41+93+50); FALTA.md criado na raiz com o que falta.
