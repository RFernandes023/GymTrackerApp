# Estado do projeto (versão final desta entrega)

> Resumo curto e lista completa do que falta: **`FALTA.md`**.


## Resumo honesto
**Todas as funcionalidades do brief estão implementadas em código e cobertas por testes automáticos, mas NADA foi executado num telemóvel, no Atlas, no Google, no Gemini nem no Open Food Facts.** O maior risco é a interface (nunca renderizada) e os serviços externos. O APK não foi gerado (sem Android SDK/EAS neste ambiente).

| Fase | Estado |
|---|---|
| 1 Fundação (login Google, SQLite, backend, dashboard) | Código + testes |
| 2 Treino (planos, treino ativo, progressão, cargas iniciais, pré-visualização) | Código + testes |
| 3 Nutrição (diário, scanner, OCR, receitas, objetivos) | Código + testes |
| 4 Evolução (medidas, IMC, estimativas, gráficos) | Código + testes |
| 5 Treinador IA (chat, propostas com aprovação, insights locais, foto de refeição) | Código + testes (API real nunca chamada) |
| 6 Importar/exportar JSON | Código + testes (ida e volta, atomicidade) |
| 7 Sincronização (offline-first, conflitos, backup) | Código + testes (2 dispositivos simulados) |
| Notificações locais (secção 11) | Código + testes da lógica; agendamento nativo nunca executado |
| 8 Testes finais / lançamento | **Parcial:** `docs/test-plan.md`, política de privacidade (rascunho), `eas.json`, prebuild Android validado. **Falta:** testes em dispositivo, bugs resultantes, APK, revisão jurídica |

## Verificado automaticamente — 319 testes
`npm test` (shared 135 + backend 41), `cd mobile && npx vitest run` (93, SQL real via `node:sqlite`) e `npx jest` (50 testes que **renderizam os ecrãs reais** com módulos nativos simulados; não validam layout/estilo/câmara/gestos). `tsc` limpo nos 3 pacotes. Bundle Android (Hermes) 5,7 MB. `expo prebuild --platform android` ok (permissões: câmara, internet, vibração, notificações; áudio/armazenamento removidos). `npm audit --omit=dev` no backend: 0 vulnerabilidades. Sem segredos no repositório.

## NUNCA verificado (precisa de dispositivo/contas reais)
1. **Todos os ecrãs** (aparência, teclado, gestos, chips, gráfico, câmara).
2. **Serviços:** login Google (client IDs + SHA-1), MongoDB Atlas (`MongoStore` só validado por tipos; os testes usam a versão em memória, incluindo o motor de sync), Gemini/OpenAI (formato dos pedidos escrito segundo a documentação; modelo `gemini-2.5-flash` e limites gratuitos por confirmar), Open Food Facts, scanner de códigos de barras, OCR ML Kit (`@react-native-ml-kit/text-recognition` é da comunidade; compatibilidade com RN 0.88 por confirmar).
3. **Notificações:** o aviso de descanso com o ecrã bloqueado depende do fabricante/poupança de bateria (alarmes exatos não pedidos de propósito).
4. `expo-sqlite` nativo (os testes usam `node:sqlite`, SQL equivalente mas motor diferente).

## Média dos exercícios (sessão 7)
- Por defeito: animação por 2 imagens (inicial↔final) do Free Exercise DB (domínio público). **GIFs do GymVisual não incluídos**: biblioteca comercial; usa a tua licença com `docs/exercise-media.md`. A ferramenta de casamento de nomes foi testada com ficheiros falsos, **não com o pacote real** (a convenção de nomes do pacote é desconhecida: rever o CSV).
- **As melhorias de UI não foram vistas num ecrã real** (nunca renderizado); podem precisar de ajustes de espaçamento/tamanho.

## Limitações conhecidas
- **Sync:** perfil/nível/refeições personalizadas sincronizam (LWW); conflitos só são detetados em **planos** (os restantes: última escrita ganha pelo relógio do dispositivo — relógios muito desfasados podem dar resultados inesperados). Alimentos com o mesmo código de barras criados em dois dispositivos não se fundem (fica o local). Sem *push* em tempo real: a sincronização é periódica/por evento.
- **Aplicar proposta da IA não é transacional** (pode ficar parcial se falhar a meio; a app avisa).
- **IA:** qualidade das propostas/estimativas depende do modelo; no free tier do Gemini a Google pode usar o conteúdo (consta do consentimento); quotas por dia UTC; conversas só locais.
- **Estimativas:** cargas iniciais (rácios de iniciante ÷ peso), gordura (Deurenberg/Navy), músculo (~50 % da massa magra), calorias (Mifflin-St Jeor) são aproximações, sempre identificadas como tal.
- **Dados:** Free Exercise DB — licença a confirmar manualmente (`THIRD_PARTY.md`); só 68/617 exercícios com nome PT; imagens carregadas online. Open Food Facts: ODbL (atribuição).
- **Privacidade:** política é um **rascunho** (identificação do responsável por preencher; rever por jurista).
- Reordenação por botões (sem arrastar); pesquisa local sem ignorar acentos; sem edição série-a-série num plano (editar via configuração do exercício ou importar JSON).
- Build: sem `android/`/`ios/` versionados (gerados por `prebuild`); iOS não testado.

## Bugs conhecidos
(nenhum registado em dispositivo — preencher ao seguir `docs/test-plan.md`)

## O que falta (por ordem)
1. Instalar um Development Build e **percorrer `docs/test-plan.md`**, corrigindo o que falhar (esperam-se problemas de UI/UX que os testes não apanham).
2. Configurar Atlas, Google OAuth e (opcional) Gemini; validar `docs/setup.md` de ponta a ponta; confirmar modelo/limites do Gemini e licença do Free Exercise DB.
3. `eas build --profile preview` → APK de teste; testar em 2–3 telemóveis diferentes.
4. Rever a política de privacidade com um jurista; publicar o backend em HTTPS (proxy/PaaS).
5. Melhorias: reordenar por arrastar, nomes PT para mais exercícios, imagens locais, sync em tempo real, alertas de recordes.
