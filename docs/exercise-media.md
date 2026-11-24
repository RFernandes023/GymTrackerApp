# Imagens e GIFs dos exercícios

## O que a app faz hoje (sem configurar nada)
Cada exercício do Free Exercise DB (domínio público) tem **2 imagens: posição inicial e final**. Nos ecrãs de detalhe e de treino ativo a app **alterna entre as duas** (a cada 0,9 s, com transição suave), o que dá o efeito de uma animação. Nas listas mostra só a primeira imagem (poupa bateria e dados). Exercícios personalizados ou sem ligação mostram um ícone, nunca a imagem de outro exercício.

## Usar GIFs do GymVisual (ou de outro fornecedor) — com a TUA licença
O GymVisual é uma biblioteca **comercial**: os GIFs são propriedade da Gym visual e a utilização rege-se pelos termos deles (https://gymvisual.com/content/3-terms-and-conditions-of-use). Por isso **os GIFs não vêm com este projeto** e eu não os descarreguei nem copiei. Cópias em repositórios públicos não são uma licença.

1. Obtém a licença/pacote junto do fornecedor e **lê os termos** (uso em apps, redistribuição, atribuição, resolução, nº de utilizadores).
2. **Aloja os ficheiros tu mesmo** (CDN, S3, Firebase Storage…). Não os incluas no APK: os pacotes têm milhares de ficheiros e pesam centenas de MB.
3. Gera o manifesto (casa os nomes dos ficheiros com os 617 exercícios):
   ```bash
   npx tsx tools/build-media-manifest.ts ./pasta-com-os-gifs \
     --base https://o-teu-cdn.exemplo.pt/gifs \
     --credit "© Gym visual — https://gymvisual.com/"
   ```
   Cria `mobile/assets/exercise-media.json` e `exercise-media.review.csv`.
4. **Revê o CSV**: as primeiras linhas são as correspondências menos seguras (a pontuação é a semelhança de nomes, 0–1). Corrige à mão no JSON (`"ffd:<id>": "ficheiro.gif"`) o que estiver errado. Ficheiros sem correspondência são listados no fim da execução.
5. (Opcional) `EXPO_PUBLIC_EXERCISE_MEDIA_URL` e `EXPO_PUBLIC_EXERCISE_MEDIA_CREDIT` em `mobile/.env` substituem o URL base e o crédito sem regenerar o manifesto.
6. Volta a compilar a app. O GIF passa a ter prioridade sobre as imagens; o crédito aparece por baixo do GIF no ecrã de detalhe do exercício.

Notas: formato suportado = GIF/WebP animado (via `expo-image`); MP4 não está suportado. Ficheiros muito pesados atrasam o carregamento: prefere ~360×360 e < 500 KB. Exercícios sem entrada no manifesto continuam com as imagens padrão. Podes associar uma animação a um exercício personalizado acrescentando `"<id do exercício>": "ficheiro.gif"` ao manifesto.

## Outras fontes
Verifica sempre a licença antes de integrar (o brief pede-o): por exemplo ExerciseDB, wger ou ilustrações licenciadas por outras empresas têm termos próprios e alguns são pagos ou só para uso não comercial.
