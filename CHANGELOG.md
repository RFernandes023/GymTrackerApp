# Changelog
## 0.7.1 — Testes de interface
- 50 testes jest-expo que renderizam os ecrãs reais (login, dashboard, treino, importar JSON, diário, evolução, IA, planos, biblioteca, scanner, OCR manual, receitas, exportar, notificações, perfil, privacidade). React fixado numa única versão no monorepo. `FALTA.md`.

## 0.7.0 — UI e animações dos exercícios
- Exercícios animados: imagens inicial↔final do Free Exercise DB alternam com transição; suporte a GIFs licenciados via manifesto (`tools/build-media-manifest.ts`, `docs/exercise-media.md`); crédito configurável. Os GIFs do GymVisual NÃO estão incluídos (licença comercial).
- UI: cabeçalhos uniformes com seta de voltar (21 ecrãs), estados vazios com ícone, cartões do dashboard com cor e ícone por grupo, barra de separadores com ícones ativos, anel do descanso, barra de progresso do treino, háptica em ±/concluir série/fim do descanso.
## 0.6.0 — Fases 6, 7, notificações e preparação da 8
- Importar/exportar JSON versionado: validação com todos os erros e caminhos, pré-visualização editável, decisões por exercício (biblioteca/sugestão/criar/ignorar), criação atómica; exportar plano(s), exercícios personalizados, histórico e nutrição; ida e volta testada.
- Sincronização offline-first: fila persistente, envio/receção incremental, idempotência, conflitos de planos com 3 resoluções, histórico imutável, última escrita nos restantes, tombstones, retry com backoff, indicador e ecrã de estado; `GET /me/export` (backup/RGPD).
- Notificações locais: fim do descanso (ecrã bloqueado), treino, pesagem, registo alimentar, inatividade; limites anti-spam; permissões só quando necessárias.
- Consentimento e política de privacidade (rascunho) na app; `eas.json`; permissões Android limpas (sem áudio/armazenamento); `expo-system-ui`.
## 0.5.0 — Fase 5 (Treinador IA)
- Backend `/ai/status`, `/ai/chat`, `/ai/meal-photo`: fornecedores Gemini e OpenAI-compatível, prompt fixo no servidor, validação da saída (propostas inválidas descartadas), quotas diárias por utilizador com reembolso, rate limit, erros tratados, 503 quando desligado.
- App: separador Treinador IA com consentimento (inclui aviso do free tier), âmbitos por pedido (treino/nutrição/corpo), pré-visualização dos dados a enviar, atalhos (progressão, volume, criar plano, alternativas, nutrição), conversas locais apagáveis, uso diário e nota de custo.
- Propostas de plano com diff (+ − ~) e aprovação explícita; exercícios casados com a biblioteca (PT/EN) ou criados como personalizados; nunca altera sem aprovação.
- Análise local sem IA (estagnação, progressão, pouco volume, consistência/proteína/calorias) + cartão do dashboard.
- Foto de refeição por IA (adiada da Fase 3): autorização a cada uso, estimativas editáveis, foto apagada de imediato.
- Correções: ordenação de mensagens (`rowid` em subconsulta).
## 0.4.0 — Fase 4 (Evolução) + melhorias de treino
- Evolução: registos de peso e perímetros (cintura, peito, braços, antebraços, coxas, gémeos, pescoço, anca, 3 medidas personalizadas), IMC automático, gordura (US Navy ou IMC) e músculo estimados e marcados como estimativa; medições de equipamento prevalecem.
- Gráficos por indicador (30 dias/90 dias/1 ano/tudo), comparação mensal, resumo semanal, histórico editável; cartões de evolução no dashboard; o peso atual alimenta perfil e cálculos.
- Treino: pré-visualização com botão "Iniciar treino"; carga pré-preenchida pelo histórico (qualquer plano) ou, à 1.ª vez, estimada por peso/idade/sexo/nível/objetivo; objetivo do plano (hipertrofia/força/resistência); perfil corporal.
- Correção: chips de filtro sobrepostos (ScrollView horizontal sem flexShrink).
## 0.3.0 — Fase 3 (Nutrição)
- Diário alimentar por dia e refeição (5 predefinidas + personalizadas), totais, objetivos, progresso e navegação por datas.
- Alimentos: criação manual com validação, favoritos, recentes, pesquisa; cada alimento com valores por 100 g/ml, dose e peso por unidade.
- Scanner de códigos de barras (EAN/UPC) + Open Food Facts, com cache local, fallback offline e criação manual.
- OCR de rótulos (ML Kit, no dispositivo): extração, deteção da base (100 g/ml/dose/unidade), conversão para 100 g, confirmação obrigatória; foto apagada de imediato + limpeza de 7 dias.
- Objetivos: perfil → estimativa Mifflin-St Jeor/TDEE/macros (identificada como estimativa) → edição manual → guardar só com confirmação.
- Receitas: ingredientes, doses, macros totais e por dose, duplicar, favoritas, registar doses no diário; meal prep com doses restantes.
- Dashboard: cartões de nutrição com dados reais.
- Correções apanhadas por testes: validação de datas inexistentes; perda de precisão em valores por unidade (250 ml de leite = 115 kcal).
## 0.2.0 — Fase 2 (Sistema de treino)
- Biblioteca de 617 exercícios (Free Exercise DB, Unlicense) com pesquisa e filtros por músculo/equipamento/tipo; exercícios personalizados.
- Planos: criar/editar/duplicar/eliminar/ativar, vários dias com dia da semana ou flexível, exercícios reordenáveis, superséries, configuração (séries, reps min/máx, peso, incremento 1,25/2,5/5/livre, descanso, RIR, aquecimento, drop sets, rest-pause, falha).
- Treino ativo: preenchimento automático do histórico, controlos ±/manual, conclusão de série com descanso automático (saltar/±15 s), cronómetros por timestamp, RIR/RPE opcionais, séries extra, desfazer, retomar após fecho da app.
- Sumário: duração, séries, reps, volume, recordes (carga/1RM estimado), comparação com a sessão anterior. Histórico paginado.
- Double progression (sugestão), deteção de estagnação, volume e frequência por músculo (semana atual vs anterior).
- Dashboard com dados reais nos cartões de treino.
- +34 testes (shared: 18 novos; mobile: 12 novos incl. SQL real).
## 0.1.0 — Fase 1 (Fundação)
- Monorepo (mobile/backend/shared), TypeScript estrito.
- Backend Fastify: Google OAuth, JWT + refresh rotativo, `/me`, eliminação de conta, helmet, CORS, rate limit, env validado.
- Mobile Expo: rotas protegidas, login Google, sessão offline, design system dark, 5 tabs, definições, dashboard personalizável persistido em SQLite.
- SQLite com migrações e fila de sincronização.
- Cálculos partilhados: IMC, Mifflin-St Jeor, TDEE, metas; tempos por timestamp.
