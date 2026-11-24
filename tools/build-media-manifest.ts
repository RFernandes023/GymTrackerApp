/**
 * Gera mobile/assets/exercise-media.json a partir de uma PASTA com as animações (GIF/WebP) que TU tens licença para usar
 * (por exemplo, o pacote que compraste ao GymVisual). Os ficheiros não são copiados para a app: alojas a pasta (CDN, S3, Firebase…)
 * e defines o URL base. O script só casa nomes de ficheiro com exercícios e escreve o manifesto + um relatório para revisão.
 *
 * Uso:  npx tsx tools/build-media-manifest.ts <pasta> --base https://o-teu-cdn/gifs [--credit "© Gym visual — https://gymvisual.com/"] [--min 0.6]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { matchMediaFiles } from '@gym/shared';

const args = process.argv.slice(2);
const dir = args[0];
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
if (!dir) { console.error('Uso: npx tsx tools/build-media-manifest.ts <pasta> --base <url> [--credit "..."] [--min 0.6]'); process.exit(1); }

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(dir).filter((f) => /\.(gif|webp)$/i.test(f)).map((f) => relative(dir, f).split('\\').join('/'));
const exercises = (JSON.parse(readFileSync('mobile/assets/exercises.json', 'utf8')) as { id: string; en: string; pt: string | null }[]).map((e) => ({ id: `ffd:${e.id}`, names: [e.en, e.en.split(' - ')[0]!, e.pt ?? ''] })); // "Barbell Bench Press - Medium Grip" também casa como "Barbell Bench Press"
const report = matchMediaFiles(files, exercises, Number(opt('--min') ?? 0.6));

const manifest = { baseUrl: opt('--base') ?? null, credit: opt('--credit') ?? null, files: Object.fromEntries(report.matches.map((m) => [m.exerciseId, m.file])) };
writeFileSync('mobile/assets/exercise-media.json', JSON.stringify(manifest, null, 2));
writeFileSync('mobile/assets/exercise-media.review.csv', ['exerciseId,file,score', ...report.matches.map((m) => `${m.exerciseId},"${m.file}",${m.score.toFixed(2)}`)].join('\n'));
console.log(`${files.length} ficheiros · ${report.matches.length} casados com ${exercises.length} exercícios · ${report.unmatched.length} sem correspondência · ${report.duplicates.length} exercícios com ficheiros repetidos`);
console.log('Rever mobile/assets/exercise-media.review.csv (as primeiras linhas são as correspondências mais duvidosas).');
if (!manifest.baseUrl) console.warn('Aviso: sem --base os ficheiros não serão carregados (defina também EXPO_PUBLIC_EXERCISE_MEDIA_URL).');
