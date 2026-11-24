# Plano de testes manuais (dispositivo Android)

Os 250+ testes automáticos cobrem a lógica, o SQL e a API, mas **a interface nunca foi executada**. Este plano é o que falta validar num telemóvel real
(Development Build). Marca cada linha; regista o que falhar em `PROJECT_STATUS.md → Bugs conhecidos`.

## 0. Preparação
- [ ] `docs/setup.md` seguido: Atlas, Google OAuth (Web + Android + SHA-1), `backend/.env`, `mobile/.env`, backend a correr em HTTPS ou na LAN.
- [ ] `npx expo prebuild --platform android && npx expo run:android` (ou `eas build --profile preview`) instala e abre sem *crash*.
- [ ] Tema escuro aplicado; sem texto cortado; botões fáceis de tocar; ecrãs pequenos e grandes.

## 1. Conta e privacidade
- [ ] Login Google só ativa após aceitar a política; "Ler a política" abre o texto.
- [ ] Fechar e reabrir a app (sem internet): entra com o utilizador em cache.
- [ ] Terminar sessão e voltar a entrar mantém os dados. Eliminar conta apaga cloud + dispositivo (confirmar no Atlas).

## 2. Treino
- [ ] Biblioteca: filtros (músculo/equipamento/tipo) **não se sobrepõem**; pesquisa; criar exercício personalizado.
- [ ] Plano novo: objetivo (hipertrofia/força/resistência) muda reps/descanso; dias da semana; superset; drop sets.
- [ ] Tocar num treino abre a **pré-visualização** (não inicia); "Iniciar treino" inicia. Cargas: histórico → estimativa (com perfil) → plano.
- [ ] Treino ativo: ± peso (incremento do exercício), reps, concluir série, descanso automático, saltar/±15 s, desfazer, série extra, RIR/RPE.
- [ ] **Descanso com o ecrã bloqueado**: chega a notificação "Descanso terminado" (testar com poupança de bateria ligada e desligada).
- [ ] Fechar a app a meio do treino e retomar: valores e cronómetro corretos. Terminar: sumário, recordes, comparação.
- [ ] Sugestão de progressão só muda valores ao tocar "Aplicar".

## 3. Nutrição
- [ ] Diário por dia/refeição, objetivos (perfil → estimativa → guardar), progresso do dia.
- [ ] Scanner de código de barras com produtos reais (portugueses e estrangeiros); produto inexistente → criar manualmente; sem internet → mensagem e produtos já guardados funcionam.
- [ ] OCR de rótulos reais (PT/EN, 100 g/dose, boa e má luz): os valores propostos são editáveis; nada é guardado sem confirmar; **a foto não fica no telemóvel**.
- [ ] Receitas: totais/por dose; meal prep: doses restantes diminuem ao registar.

## 4. Evolução
- [ ] Registo de peso e perímetros; IMC automático; gordura/músculo marcados "estimativa"/"medido"; gráfico, intervalos, comparação mensal, resumo semanal; editar/eliminar.

## 5. Treinador IA (requer `AI_PROVIDER` configurado)
- [ ] Sem consentimento não envia nada; "Ver o que será enviado" mostra JSON sem nome/email.
- [ ] Atalhos funcionam; respostas em português; limite diário avisa; sem internet mostra erro claro e a análise local continua.
- [ ] Proposta de plano: diff correto (+ − ~); **nada muda até "Aplicar"**; rejeitar não altera; exercícios novos criados como personalizados.
- [ ] Foto de refeição: pede autorização; itens editáveis; total coerente; adicionar ao diário.

## 6. Importar / exportar
- [ ] Colar o JSON do brief (`docs/json-import-format.md`): pré-visualização, editar nome/objetivo/dias, decisões por exercício, confirmar.
- [ ] JSON inválido mostra TODOS os erros com caminho e **não importa**.
- [ ] Exportar plano → colar em Importar → plano igual. Partilhar ficheiro funciona (WhatsApp/Drive/email).

## 7. Sincronização (2 dispositivos ou 1 + reinstalar)
- [ ] Criar dados no A com internet → aparecem no B (planos, sessões, diário, medidas, perfil).
- [ ] Modo avião no A: registar treino e refeições → indicador mostra pendentes → ligar a rede → sincroniza sozinho.
- [ ] Matar a app a meio do envio e reabrir: sem perdas nem duplicados.
- [ ] **Conflito de plano**: editar o mesmo plano em A e B offline → ecrã Sincronização oferece as 3 opções; cada uma faz o prometido.
- [ ] Apagar uma refeição no A desaparece no B.

## 8. Notificações
- [ ] Lembrete de treino nos dias do plano; pesagem semanal; registo alimentar (máx. 3); inatividade (um só aviso).
- [ ] Desativar um lembrete cancela-o. Reiniciar o telemóvel: os lembretes mantêm-se.

## 9. Robustez
- [ ] Rodar o ecrã, trocar de app e voltar durante o treino; bloquear 10 min com treino ativo.
- [ ] Muitos dados (6+ meses, ~100 sessões): listas e gráficos fluidos.
- [ ] TalkBack: botões com rótulos legíveis.
