# O QUE FALTA (lê isto primeiro)

**Resumo honesto:** as funcionalidades do brief estão escritas e testadas **em Node**, mas a app **nunca foi executada num telemóvel**, o **APK não foi gerado** e **nenhum serviço externo real foi contactado**. Não está "acabada": está pronta para a fase de testes em dispositivo.

## O que foi verificado (319 testes automáticos)
| Suite | Testes | O que cobre |
|---|---|---|
| `shared` (vitest) | 135 | cálculos, progressão, JSON de planos, diff/IA, sync schemas, notificações, média |
| `backend` (vitest) | 41 | login/JWT, IA (limites, validação), sincronização (conflitos, isolamento), RGPD |
| `mobile` (vitest) | 93 | SQL real (node:sqlite): treino, nutrição, evolução, IA, import/export, **sync com 2 dispositivos simulados** |
| `mobile` (jest-expo) | 50 | **ecrãs reais renderizados** e usados (login, dashboard, treino ativo, importar JSON, diário, evolução, IA, planos, biblioteca, scanner, OCR manual, receitas, exportar, notificações…) com módulos nativos simulados |

Comandos: `npm install && npm test` (shared+backend) · `cd mobile && npx vitest run && npx jest` · `npm run typecheck`.
Também: `tsc` limpo, bundle Android (Hermes) gera, `expo prebuild --platform android` ok, `npm audit` do backend sem vulnerabilidades, sem segredos no repositório.

## ❌ Não feito / não verificado (por ordem de importância)
1. **Executar num telemóvel real.** Os 50 testes de interface correm em Node com mocks: **não validam aspeto, espaçamentos, tamanho de toque, teclado, gestos, câmara, desempenho nem se os chips deixaram de se sobrepor** (o layout nunca é calculado). Segue `docs/test-plan.md` e anota bugs em `PROJECT_STATUS.md`.
2. **APK/AAB não gerado** (sem Android SDK/EAS aqui). `eas.json` está pronto: `cd mobile && eas build --platform android --profile preview` (ver `docs/setup.md`).
3. **Serviços reais nunca contactados:** login Google (client IDs + SHA-1), MongoDB Atlas (o `MongoStore` só foi validado por tipos; os testes usam memória), Gemini/OpenAI (formato escrito segundo a documentação; modelo `gemini-2.5-flash` e limites gratuitos por confirmar), Open Food Facts, scanner de código de barras, OCR ML Kit (módulo da comunidade; compatibilidade com RN 0.88 por confirmar), notificações nativas (atrasos com poupança de bateria), `expo-sqlite` nativo (testes usam outro motor SQLite).
4. **GIFs do GymVisual NÃO incluídos.** É uma biblioteca comercial; não os podia copiar nem consegui aceder ao site. A app anima as 2 imagens (início↔fim) do Free Exercise DB. Para usar os GIFs com a **tua** licença: `docs/exercise-media.md` + `tools/build-media-manifest.ts` (testada só com ficheiros falsos; revê o CSV de correspondências).
5. **Licenças/legal por confirmar:** Free Exercise DB (README diz Unlicense; o ficheiro LICENSE não foi lido), Open Food Facts (ODbL, atribuição), Gemini (free tier: a Google pode usar o conteúdo), `THIRD_PARTY.md`. A **política de privacidade é um rascunho** (falta identificar o responsável; rever por jurista).
6. **Servidor em produção:** falta alojar o backend em HTTPS, criar o Atlas, configurar `.env` (ver `docs/setup.md`).

## ⚠️ Partes do brief em falta ou parciais
- **Internacionalização:** texto em português fixo no código; **não há arquitetura i18n** (brief 3.2 pedia preparação).
- **Autenticação por email:** não implementada nem explicitamente preparada (só Google).
- **Notificações de recordes pessoais e alertas de objetivos:** não implementadas (existem treino, pesagem, alimentação, inatividade e fim do descanso).
- **Backups:** existe exportação completa (`/me/export` e JSON local), não backups automáticos agendados.
- **Biblioteca de exercícios:** só 68 de 617 têm nome em português; instruções em inglês; imagens carregadas online (sem pacote offline); pesquisa não ignora acentos.
- **Reordenar por arrastar:** feito com botões ↑/↓ (dashboard, exercícios).
- **Editar séries uma a uma num plano:** só por configuração do exercício ou importando JSON.
- **iOS:** não testado.

## ⚠️ Limitações conhecidas
- **Sincronização:** conflitos só detetados em planos; nos restantes ganha a última escrita pelo relógio do telemóvel; alimentos iguais criados em 2 dispositivos (mesmo código de barras) não se fundem; sem tempo real (periódico/por evento).
- **Propostas da IA:** aplicar não é transacional (pode ficar parcial; a app avisa); a qualidade depende do modelo.
- **Estimativas** (cargas iniciais, gordura, músculo, calorias) são aproximações, sempre marcadas como tal.
- **Acessibilidade:** a linha de cada série (botão) contém botões dentro (aninhado) — rever com TalkBack.

## Bugs reais que os testes apanharam e já estão corrigidos
Data inexistente aceite (30 fev); precisão perdida em valores por unidade (250 ml de leite dava 125 kcal); `rowid` em subconsulta; duas cópias do React no monorepo (agora fixadas em 19.3.0); `_180x180` e variantes "- Medium Grip" no casamento de ficheiros de GIFs; permissões Android desnecessárias (áudio/armazenamento); falta de `POST_NOTIFICATIONS`.

## Próximos passos
1. Instalar um Development Build e percorrer `docs/test-plan.md`; corrigir o que falhar.
2. Configurar Atlas + Google OAuth (+ Gemini opcional) e validar `docs/setup.md` de ponta a ponta.
3. `eas build --profile preview` → testar em 2–3 telemóveis.
4. Decidir sobre os GIFs (licença GymVisual) e rever licenças/política de privacidade.
5. Implementar i18n, notificações de recordes e o que mais quiseres das listas acima.

Mais detalhe: `PROJECT_STATUS.md`, `docs/WORKLOG.md` (diário de decisões), `CHANGELOG.md`.
