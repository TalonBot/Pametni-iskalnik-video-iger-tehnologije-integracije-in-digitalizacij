import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fetchHtml, parseSearch, parseDetail, parsePagination } from './steam.js';

export const freeSourceUrl = 'https://store.steampowered.com/search/?category1=998&maxprice=free&filter=topsellers&cc=si&l=english&count=100&page=1';
let running;
export function scrapeFreeGames(options = {}) {
  if (running) return running;
  running = collectFree(options).finally(() => { running = null; });
  return running;
}

export async function collectFree({ directory = new URL('../data/', import.meta.url), offline = false, details = true, onProgress = () => {}, pauseMs = 400 } = {}) {
  const raw = new URL('raw/', directory);
  await mkdir(raw, { recursive: true });
  const html = offline ? await readFile(new URL('free-search-1.html', raw), 'utf8') : await fetchHtml(freeSourceUrl);
  const pagination = parsePagination(html);
  const games = parseSearch(html).filter(game => game.price === 0);
  if (!games.length) throw new Error('Steam ni vrnil potrjenih brezplačnih iger; prejšnja zbirka je ohranjena.');
  if (!offline) await writeFile(new URL('free-search-1.html', raw), html);
  let cursor = 0;
  let done = 0;
  await Promise.all(Array.from({ length: details ? 3 : 0 }, async () => {
    while (cursor < games.length) {
      const game = games[cursor++];
      try {
        const file = new URL(`app-${game.appId}.html`, raw);
        const detailHtml = offline ? await readFile(file, 'utf8') : await fetchHtml(game.url + '?cc=si&l=english');
        if (!offline) await writeFile(file, detailHtml);
        Object.assign(game, parseDetail(detailHtml));
      } catch (error) { game.detailStatus = 'error'; game.detailError = error.message; }
      onProgress(`Brezplačne igre: ${++done}/${games.length}`);
      if (!offline) await delay(pauseMs);
    }
  }));
  const result = { source: 'Steam Store HTML', sourceUrl: freeSourceUrl, parsedAt: new Date().toISOString(), games,
    report: { count: games.length, availableAtSource: pagination.total, scope: 'Prva stran Steamovega seznama brezplačnih iger (do 100 rezultatov); celoten brezplačni katalog ni zajet.' },
    warnings: games.filter(g => g.detailStatus !== 'ok').map(g => `${g.appId}: ${g.detailError || 'Podrobnosti niso dostopne.'}`) };
  const temporary = new URL(`free-games-${process.pid}.tmp`, directory);
  await writeFile(temporary, JSON.stringify(result, null, 2) + '\n');
  await rename(temporary, new URL('free-games.json', directory));
  return result;
}
