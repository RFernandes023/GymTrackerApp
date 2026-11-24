# Licenças de terceiros

## Free Exercise DB — https://github.com/yuhonas/free-exercise-db
Dados de 617 exercícios de força (subconjunto de 876) em `mobile/assets/exercises.json`, gerados por `tools/build-exercises.py`.
- Licença: **Unlicense (domínio público)**, conforme o badge/declaração do README do repositório.
- **Verificação incompleta:** o ficheiro `LICENSE` não foi encontrado no caminho esperado e a API do GitHub estava limitada por rate-limit; confirmar manualmente em https://github.com/yuhonas/free-exercise-db antes de publicar.
- Os nomes em português (68 exercícios) foram escritos por nós; os restantes usam o nome inglês. As instruções estão em inglês.
- Imagens: **não incluídas** no APK. São carregadas do repositório (raw.githubusercontent.com) e ficam em cache de disco. Sem ligação/cache mostra-se um ícone. Para as alojar localmente, descarregar `exercises/<id>/0.jpg` (~100+ MB no total) e alterar `exerciseImageUrl` em `features/workouts/types.ts`.
- GIFs/vídeos: o dataset não tem; usam-se imagens estáticas (como pedido).

## Open Food Facts — https://world.openfoodfacts.org
Base de dados colaborativa de produtos alimentares, consultada em runtime. Dados sob **ODbL** (Open Database License); imagens/contribuições sob licenças próprias (CC BY-SA).
Ao reutilizar/partilhar dados obtidos, é necessária atribuição ("Open Food Facts") e partilha nos mesmos termos para bases derivadas. **Verificar as condições atuais em https://world.openfoodfacts.org/terms-of-use antes de publicar.** A app guarda apenas uma cópia local, por utilizador, dos produtos que o próprio utilizador consulta.

## Google ML Kit (Text Recognition) via @react-native-ml-kit/text-recognition
Reconhecimento de texto no dispositivo. Sujeito aos termos do ML Kit; modelo incluído na app (não envia imagens à Google).

## Google Gemini API (opcional, via backend)
Termos: https://ai.google.dev/gemini-api/terms. No escalão gratuito o conteúdo enviado pode ser usado pela Google para melhorar os seus produtos; no escalão pago, não. Limites, modelos e preços mudam — verificar antes de publicar. Dados pessoais (RGPD): a Google é subcontratante/destinatário; incluir na política de privacidade.

## Gym visual (GymVisual) — NÃO incluído
Biblioteca comercial de GIFs de exercícios (https://gymvisual.com). Propriedade da Gym visual; uso sujeito aos seus termos. Este projeto **não contém** nem descarrega esses ficheiros; só traz uma ferramenta para ligares ficheiros que tenhas licenciado (`docs/exercise-media.md`).
