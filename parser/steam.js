import { load } from 'cheerio';
import { mkdir, writeFile, rename, readFile, open, unlink } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

export const dataFile = new URL('../data/games.json', import.meta.url);
export const sourceUrl = 'https://store.steampowered.com/search/?specials=1&category1=998&filter=topsellers&cc=si&l=english';
const clean = value => value.replace(/\s+/g, ' ').trim();

export function priceNumber(text) {
  if (!text || !/\d/.test(text)) return null;
  const value = Number(text.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

export function parseSearch(html) {
  const $ = load(html);
  const games = new Map();
  $('.search_result_row').each((_, element) => {
    const row = $(element);
    const appId = row.attr('href')?.match(/\/app\/(\d+)/)?.[1];
    const name = clean(row.find('.title').text());
    if (!appId || !name) return;
    const finalText = clean(row.find('.discount_final_price').text());
    const cents = row.find('[data-price-final]').first().attr('data-price-final');
    const free = /^(free(?: to play)?|play for free)$/i.test(finalText);
    const amount = free ? 0 : finalText && cents !== undefined && /^\d+$/.test(cents) ? Number(cents) / 100 : priceNumber(finalText);
    const review = row.find('.search_review_summary').attr('data-tooltip-html') || '';
    const reviewMatch = review.match(/(\d+)% of the ([\d,]+) user reviews/);
    const released = clean(row.find('.search_released').text());
    const date = /^\d{1,2} [A-Za-z]{3}, \d{4}$/.test(released) ? Date.parse(released + ' UTC') : NaN;
    games.set(appId, {
      appId, name, description: null, genres: [],
      platforms: [['win', 'Windows'], ['mac', 'macOS'], ['linux', 'Linux']].filter(([selector]) => row.find('.platform_img.' + selector).length).map(([, label]) => label),
      released, releaseDate: Number.isFinite(date) ? new Date(date).toISOString().slice(0, 10) : null,
      price: amount,
      originalPrice: priceNumber(row.find('.discount_original_price').text()) ?? amount,
      currency: finalText.includes('€') ? 'EUR' : null,
      discount: Math.abs(Number(row.find('.discount_pct').text().replace(/[^\d-]/g, ''))) || 0,
      rating: reviewMatch ? Number(reviewMatch[1]) : null,
      reviewCount: reviewMatch ? Number(reviewMatch[2].replaceAll(',', '')) : null,
      reviewSummary: clean(load(review).text()).split(/\d+%/)[0].trim() || null,
      image: row.find('.search_capsule img').attr('src') || null,
      url: `https://store.steampowered.com/app/${appId}/`, store: 'Steam',
      detailStatus: 'pending',
    });
  });
  return [...games.values()];
}

export function parseDetail(html) {
  const $ = load(html);
  const description = clean($('.game_description_snippet').text()) || null;
  const genres = [...new Set($('#genresAndManufacturer a[href*="/genre/"]').map((_, el) => clean($(el).text())).get())];
  const names = selector => [...new Set($(selector).map((_, el) => clean($(el).text())).get().filter(Boolean))];
  const aboutBlock = $('#game_area_description').clone();
  aboutBlock.find('br').replaceWith('\n');
  aboutBlock.find('p, li, h2, h3, div').append('\n');
  const about = clean(aboutBlock.text().replace(/^\s*About This Game\s*/i, '')) || null;
  const requirements = {};
  $('.game_area_sys_req').each((i, el) => { requirements[$(el).attr('data-os') || `section-${i + 1}`] = clean($(el).text()); });
  let carousel = {};
  try { carousel = JSON.parse($('[data-featuretarget="gamehighlight-desktopcarousel"]').attr('data-props') || '{}'); } catch { /* Older pages use screenshot links. */ }
  return {
    description, genres, about,
    developers: names('#developers_list a'),
    publishers: [...new Set($('#genresAndManufacturer .dev_row').filter((_, el) => /^Publisher:/i.test(clean($(el).text()))).find('a').map((_, el) => clean($(el).text())).get())],
    tags: names('.glance_tags a.app_tag'),
    features: names('.game_area_details_specs a, a.game_area_details_specs_ctn .label'),
    languages: $('.game_language_options tr').map((_, el) => {
      const cells = $(el).find('td');
      if (!cells.length) return null;
      return { name: clean(cells.eq(0).text()), interface: cells.eq(1).text().includes('✔'), fullAudio: cells.eq(2).text().includes('✔'), subtitles: cells.eq(3).text().includes('✔') };
    }).get(),
    screenshots: [...new Set([...$('.highlight_screenshot_link').map((_, el) => $(el).attr('href')).get(), ...(carousel.screenshots || []).map(s => s.full || s.standard).filter(Boolean)])],
    requirements,
    metacritic: priceNumber($('#game_area_metascore .score').text()),
    detailStatus: description ? 'ok' : 'unavailable',
  };
}

export async function fetchHtml(url) {
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(url, {
    signal: AbortSignal.timeout(25000),
    headers: { 'User-Agent': 'GameFinderStudentParser/1.0 (local educational project)', 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
    const retry = Number(response.headers?.get('retry-after'));
    await delay(Math.max(2000 * 2 ** attempt, Number.isFinite(retry) ? retry * 1000 : 0));
  }
  if (!response.ok) throw new Error(`Steam je vrnil HTTP ${response.status}.`);
  const html = await response.text();
  if (!html.includes('<html')) throw new Error('Vir ni vrnil pričakovanega HTML dokumenta.');
  return html;
}

let running = null;
export function scrapeGames(options = {}) {
  if (running) return running;
  running = collect(options).finally(() => { running = null; });
  return running;
}

export function parsePagination(html) {
  const $ = load(html);
  const text = clean($('.search_pagination_left').text());
  const match = text.match(/showing\s+([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)/i);
  if (!match) throw new Error('Steam ni vrnil prepoznavne paginacije; popolnosti seznama ni mogoče potrditi.');
  const [start, end, total] = match.slice(1).map(value => Number(value.replaceAll(',', '')));
  if (end < start || end > total) throw new Error('Neveljavna paginacija vira.');
  return { start, end, total, rows: $('.search_result_row').length };
}

export function buildReport(state, details, finished) {
  const fields = ['appId', 'name', 'description', 'about', 'genres', 'platforms', 'releaseDate', 'price', 'originalPrice', 'currency', 'discount', 'rating', 'reviewCount', 'image', 'developers', 'publishers', 'tags', 'features', 'languages', 'screenshots', 'requirements', 'metacritic'];
  const present = value => value !== null && value !== undefined && value !== '' && (typeof value !== 'object' || Object.keys(value).length > 0);
  const coverage = Object.fromEntries(fields.map(field => [field, { present: state.games.filter(game => present(game[field])).length, missing: state.games.filter(game => !present(game[field])).length }]));
  const detailCounts = Object.fromEntries(['pending', 'ok', 'unavailable', 'error'].map(status => [status, state.games.filter(g => g.detailStatus === status).length]));
  return { runId: state.runId, startedAt: state.startedAt, updatedAt: new Date().toISOString(), finished,
    scope: 'Vse igre iz izbranega javnega Steamovega seznama ponudb (regija SI).',
    expectedRowsAtStart: state.expectedRowsAtStart, expectedRowsAtEnd: state.expectedRowsAtEnd,
    visitedPages: state.sourcePages.length, rowsSeen: state.rowsSeen, uniqueGames: state.games.length,
    duplicates: state.duplicates, skippedRows: state.skippedRows,
    listingComplete: state.listingComplete, detailsRequested: details,
    allDetailsAccessible: details && detailCounts.pending === 0 && detailCounts.error === 0 && detailCounts.unavailable === 0,
    detailCounts, coverage,
    limitation: 'Javni seznam se med zajemom spreminja. Nedostopna polja ostanejo null oziroma prazni seznami; zajem ne potrjuje popolnosti celotnega Steamovega kataloga.' };
}

async function collect({ pages = null, details = true, fresh = false, onProgress = () => {}, directory = new URL('../data/', import.meta.url), pauseMs = 400 } = {}) {
  if (pages !== null && (!Number.isSafeInteger(pages) || pages < 1)) throw new Error('Število strani mora biti pozitivno celo število ali all.');
  await mkdir(new URL('raw/', directory), { recursive: true });
  const path = name => new URL(name, directory);
  const atomic = async (name, value) => { await writeFile(path(name + '.tmp'), JSON.stringify(value, null, 2) + '\n'); await rename(path(name + '.tmp'), path(name)); };
  let lock;
  try { lock = await open(path('parser.lock'), 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(await readFile(path('parser.lock'), 'utf8'));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Neveljavna zaklepna datoteka data/parser.lock.');
    try { process.kill(pid, 0); throw new Error('Parser že teče. Počakajte na trenutni zajem.'); }
    catch (check) { if (check.code !== 'ESRCH') throw check; }
    await unlink(path('parser.lock'));
    lock = await open(path('parser.lock'), 'wx');
  }
  await lock.writeFile(String(process.pid));
  try {
    let state;
    if (!fresh) {
      try { const saved = JSON.parse(await readFile(path('checkpoint.json'), 'utf8')); if (!saved.finished && saved.sourceUrl === sourceUrl && saved.pages === pages && saved.details === details) state = saved; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    state ??= { runId: crypto.randomUUID(), startedAt: new Date().toISOString(), sourceUrl, pages, details, nextPage: 1, sourcePages: [], games: [], rowsSeen: 0, duplicates: 0, skippedRows: 0, expectedRowsAtStart: null, expectedRowsAtEnd: null, listingComplete: false, listingStopped: false, finished: false };
    if (state.detailParserVersion !== 3) {
      for (const game of state.games.filter(g => g.detailStatus === 'ok' || g.detailStatus === 'unavailable')) {
        try { Object.assign(game, parseDetail(await readFile(path(`raw/app-${game.appId}.html`), 'utf8'))); }
        catch (error) { if (error.code !== 'ENOENT') throw error; game.detailStatus = 'pending'; }
      }
      state.detailParserVersion = 3;
    }
    const save = async (publish = false) => {
      const captured = structuredClone(state);
      await atomic('checkpoint.json', captured);
      const report = buildReport(captured, details, captured.finished);
      await atomic('parser-report.json', report);
      if (publish) {
        const result = { schemaVersion: 2, source: 'Steam Store HTML', sourceUrl, sourcePages: captured.sourcePages, country: 'SI', parsedAt: report.updatedAt, count: captured.games.length,
          warnings: captured.games.filter(g => ['error', 'unavailable'].includes(g.detailStatus)).map(g => `${g.appId}: ${g.detailError || 'Podrobnosti niso dostopne.'}`), report, games: captured.games };
        await atomic('games.json', result);
        return result;
      }
    };
    const all = new Map(state.games.map(g => [g.appId, g]));
    while (!state.listingStopped) {
      const page = state.nextPage;
      onProgress(`Berem seznam ${page}${pages ? '/' + pages : ' / vse strani'}; zbranih ${all.size} iger …`);
      const url = `${sourceUrl}&count=100&page=${page}`;
      const html = await fetchHtml(url);
      const pagination = parsePagination(html);
      const games = parseSearch(html);
      if (!games.length) throw new Error('Na strani ni prepoznanih iger; prejšnji JSON je ohranjen, napredek pa je v checkpoint.json.');
      if (pagination.start !== (page - 1) * 100 + 1) throw new Error('Steam je vrnil ponovljeno ali nepričakovano stran. Zajem je prekinjen.');
      await writeFile(path(`raw/search-${page}.html`), html);
      state.expectedRowsAtStart ??= pagination.total;
      state.expectedRowsAtEnd = pagination.total;
      state.rowsSeen += pagination.rows;
      state.skippedRows += pagination.rows - games.length;
      for (const game of games) { if (all.has(game.appId)) state.duplicates++; else all.set(game.appId, game); }
      state.games = [...all.values()];
      state.sourcePages.push(url);
      state.nextPage++;
      state.listingComplete = pagination.end >= pagination.total;
      state.listingStopped = state.listingComplete || pages !== null && page >= pages;
      await save();
      await delay(pauseMs);
    }
    await save(true);
    if (details) {
      // A modest worker pool; every page is saved locally as evidence of the input.
      const pending = state.games.filter(g => g.detailStatus === 'pending');
      let cursor = 0;
      let completed = state.games.length - pending.length;
      let saving = Promise.resolve();
      await Promise.all(Array.from({ length: 3 }, async () => {
        while (cursor < pending.length) {
          const game = pending[cursor++];
          try {
            const html = await fetchHtml(game.url + '?cc=si&l=english');
            await writeFile(path(`raw/app-${game.appId}.html`), html);
            Object.assign(game, parseDetail(html), { detailParsedAt: new Date().toISOString() });
          } catch (error) { game.detailStatus = 'error'; game.detailError = error.message; }
          completed++;
          onProgress(`Podrobnosti ${completed}/${state.games.length}: ${game.name}`);
          if (completed % 25 === 0) { saving = saving.then(() => save(true)); await saving; }
          await delay(pauseMs);
        }
      }));
      await saving;
    }
    state.finished = true;
    return await save(true);
  } finally { await lock.close(); await unlink(path('parser.lock')); }
}

export async function readGames({ directory = new URL('../data/', import.meta.url) } = {}) {
  const result = JSON.parse(await readFile(new URL('games.json', directory), 'utf8'));
  // Old snapshots used data-price-final=0 even when Steam displayed no price.
  for (const game of result.games) if (game.price === 0 && game.currency === null && game.originalPrice === null) game.price = null;
  let free;
  try { free = JSON.parse(await readFile(new URL('free-games.json', directory), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return result; }
  const games = new Map(result.games.map(game => [game.appId, game]));
  for (const game of free.games) games.set(game.appId, game);
  result.games = [...games.values()];
  result.count = result.games.length;
  result.sourcePages = [...result.sourcePages, free.sourceUrl];
  result.report = { ...result.report, freeGames: free.report };
  result.parsedAt = result.parsedAt > free.parsedAt ? result.parsedAt : free.parsedAt;
  result.warnings = [...result.warnings, ...free.warnings];
  return result;
}
