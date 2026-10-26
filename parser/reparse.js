// Reproduce the transformation using saved HTML; no network requests.
import { readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { parseSearch, parseDetail, buildReport, sourceUrl } from './steam.js';

const root = new URL('../data/', import.meta.url);
const path = name => new URL(name, root);
const atomic = async (name, value) => {
  await writeFile(path(name + '.tmp'), JSON.stringify(value, null, 2) + '\n');
  await rename(path(name + '.tmp'), path(name));
};
let lock;
try {
  try { lock = await open(path('parser.lock'), 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Najprej počakajte, da se spletni zajem zaključi.'); throw error; }
  await lock.writeFile(String(process.pid));
  const state = JSON.parse(await readFile(path('checkpoint.json'), 'utf8'));
  const previous = JSON.parse(await readFile(path('games.json'), 'utf8'));
  if (!state.finished) throw new Error('Spletni zajem še ni zaključen. Najprej ga nadaljujte z npm run parse.');
  const games = new Map();
  for (let page = 1; page <= state.sourcePages.length; page++) {
    for (const game of parseSearch(await readFile(path(`raw/search-${page}.html`), 'utf8'))) games.set(game.appId, game);
  }
  for (const game of games.values()) {
    try {
      Object.assign(game, parseDetail(await readFile(path(`raw/app-${game.appId}.html`), 'utf8')));
      game.detailParsedAt = state.games.find(old => old.appId === game.appId)?.detailParsedAt || null;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      game.detailStatus = 'error'; game.detailError = 'Ni shranjenega HTML dokumenta podrobnosti.';
    }
  }
  state.games = [...games.values()];
  state.detailParserVersion = 3;
  const report = { ...buildReport(state, state.details, true), reproducedFromSavedHtmlAt: new Date().toISOString() };
  const result = { schemaVersion: 2, source: 'Steam Store HTML', sourceUrl, sourcePages: state.sourcePages, country: 'SI', parsedAt: previous.parsedAt, count: state.games.length, report,
    warnings: state.games.filter(g => ['error', 'unavailable'].includes(g.detailStatus)).map(g => `${g.appId}: ${g.detailError || 'Podrobnosti niso dostopne.'}`), games: state.games };
  await atomic('games.json', result);
  await atomic('parser-report.json', report);
  await atomic('checkpoint.json', state);
  console.log(`Iz lokalnega HTML ponovno razčlenjenih ${result.count} iger. Omrežnih zahtev: 0.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { if (lock) { await lock.close(); await unlink(path('parser.lock')); } }
