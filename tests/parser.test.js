import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { parseSearch, parseDetail, priceNumber, scrapeGames, dataFile, parsePagination, buildReport } from '../parser/steam.js';

const row = `<a class="search_result_row" href="https://store.steampowered.com/app/42/Test/">
<span class="title">Test &amp; Game</span><div class="search_capsule"><img src="https://example.com/game.jpg"></div>
<span class="platform_img win"></span><span class="platform_img linux"></span>
<div class="search_released">19 May, 2015</div>
<span class="search_review_summary" data-tooltip-html="Very Positive&lt;br&gt;92% of the 12,345 user reviews for this game are positive."></span>
<div data-price-final="749"><div class="discount_pct">-75%</div><div class="discount_original_price">29,99€</div><div class="discount_final_price">7,49€</div></div></a>`;

test('HTML fields become typed game data, with decoded entities and EUR prices', () => {
  const [game] = parseSearch(row);
  assert.equal(game.appId, '42');
  assert.equal(game.name, 'Test & Game');
  assert.equal(game.price, 7.49);
  assert.equal(game.originalPrice, 29.99);
  assert.equal(game.currency, 'EUR');
  assert.equal(game.discount, 75);
  assert.equal(game.rating, 92);
  assert.equal(game.reviewCount, 12345);
  assert.equal(game.reviewSummary, 'Very Positive');
  assert.equal(game.releaseDate, '2015-05-19');
  assert.deepEqual(game.platforms, ['Windows', 'Linux']);
});

test('deduplicates apps and skips bundles and nameless rows', () => {
  assert.equal(parseSearch(row + row + row.replaceAll('/app/42/', '/bundle/42/') + row.replace('Test &amp; Game', '')).length, 1);
});

test('missing values stay null instead of becoming false zero prices or ratings', () => {
  const [game] = parseSearch('<a class="search_result_row" href="https://store.steampowered.com/app/1/"><span class="title">Unreleased</span><div class="search_released">Coming soon</div></a>');
  for (const key of ['price', 'originalPrice', 'rating', 'reviewCount', 'releaseDate', 'currency']) assert.equal(game[key], null);
  assert.equal(parseSearch('<html>Blocked</html>').length, 0);
});

test('detail page extracts description and named genres, tolerates age gates', () => {
  const detail = parseDetail('<div class="game_description_snippet"> A &amp; B\n game </div><div id="genresAndManufacturer"><a href="/genre/Action/">Action</a><a href="/developer/Test">Test</a></div>');
  assert.equal(detail.description, 'A & B game');
  assert.deepEqual(detail.genres, ['Action']);
  assert.equal(detail.detailStatus, 'ok');
  assert.equal(parseDetail('<html>Age check</html>').detailStatus, 'unavailable');
});

test('European prices are numeric, unknown prices stay null', () => {
  assert.equal(priceNumber('1.234,56€'), 1234.56);
  assert.equal(priceNumber('9,99€'), 9.99);
  assert.equal(priceNumber(''), null);
  assert.equal(priceNumber('Coming soon'), null);
});

test('rejects invalid page limits before any network request', async () => {
  await assert.rejects(scrapeGames({ pages: 0 }), /pozitivno/);
});

test('failed source request preserves the saved JSON', async t => {
  const directory = await testDirectory();
  const file = new URL('games.json', directory);
  const before = '{"games":[]}';
  await writeFile(file, before);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 403 }));
  await assert.rejects(scrapeGames({ pages: 1, directory }), /HTTP 403/);
  const after = await readFile(file, 'utf8');
  assert.equal(after, before);
});

const pageHtml = (start, end, total) => `<html><div class="search_pagination_left">showing ${start} - ${end} of ${total}</div>${Array.from({ length: end - start + 1 }, (_, i) => row.replaceAll('/app/42/', `/app/${start + i}/`)).join('')}</html>`;
const testDirectory = async () => pathToFileURL((await mkdtemp(join(tmpdir(), 'game-parser-test-'))) + '/');

test('parses thousands separators in pagination and rejects unrecognised pages', () => {
  assert.equal(parsePagination('<div class="search_pagination_left">showing 1 - 100 of 2,110</div>').total, 2110);
  assert.throws(() => parsePagination('<html>blocked</html>'), /paginacije/);
});

test('extracts screenshot URLs embedded in Steam HTML and feature labels', () => {
  const detail = parseDetail(`<html><a class="game_area_details_specs_ctn"><div class="label">Online Co-op</div></a><div data-featuretarget="gamehighlight-desktopcarousel" data-props='{&quot;screenshots&quot;:[{&quot;full&quot;:&quot;https://example.com/full.jpg&quot;}]}'></div></html>`);
  assert.deepEqual(detail.features, ['Online Co-op']);
  assert.deepEqual(detail.screenshots, ['https://example.com/full.jpg']);
});

test('publisher is identified by its role even when Steam links to a curator', () => {
  const detail = parseDetail('<div id="genresAndManufacturer"><div class="dev_row"><b>Developer:</b><a>Developer</a></div><div class="dev_row"><b>Publisher:</b><a href="/curator/1">Publisher</a></div></div>');
  assert.deepEqual(detail.publishers, ['Publisher']);
});

test('all mode visits every page beyond the former four-page limit', async t => {
  const directory = await testDirectory();
  const visited = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const page = Number(new URL(url).searchParams.get('page'));
    visited.push(page);
    return { ok: true, text: async () => pageHtml((page - 1) * 100 + 1, Math.min(page * 100, 403), 403) };
  });
  const result = await scrapeGames({ directory, details: false, pauseMs: 0 });
  assert.deepEqual(visited, [1, 2, 3, 4, 5]);
  assert.equal(result.count, 403);
  assert.equal(result.report.listingComplete, true);
  assert.equal(result.report.detailCounts.pending, 403);
  assert.equal(result.report.allDetailsAccessible, false);
  assert.equal(result.report.coverage.description.missing, 403);
});

test('interrupted pagination resumes from checkpoint without downloading earlier pages', async t => {
  const directory = await testDirectory();
  const visited = [];
  let fail = true;
  t.mock.method(globalThis, 'fetch', async url => {
    const page = Number(new URL(url).searchParams.get('page'));
    visited.push(page);
    if (page === 2 && fail) return { ok: false, status: 403 };
    return { ok: true, text: async () => pageHtml((page - 1) * 100 + 1, Math.min(page * 100, 101), 101) };
  });
  await assert.rejects(scrapeGames({ directory, details: false, pauseMs: 0 }), /403/);
  fail = false;
  const result = await scrapeGames({ directory, details: false, pauseMs: 0 });
  assert.deepEqual(visited, [1, 2, 2]);
  assert.equal(result.count, 101);
  assert.equal(result.report.rowsSeen, 101);
});

test('repeated page is rejected rather than declaring a complete collection', async t => {
  const directory = await testDirectory();
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, text: async () => pageHtml(1, 100, 101) }));
  await assert.rejects(scrapeGames({ directory, details: false, pauseMs: 0 }), /ponovljeno/);
});

test('bounded run is explicitly reported as incomplete and detail evidence is saved', async t => {
  const directory = await testDirectory();
  t.mock.method(globalThis, 'fetch', async url => ({ ok: true, text: async () => url.includes('/search/') ? pageHtml(1, 100, 101) : '<html><div class="game_description_snippet">Description</div></html>' }));
  const result = await scrapeGames({ directory, pages: 1, pauseMs: 0 });
  assert.equal(result.report.listingComplete, false);
  assert.equal(result.report.detailCounts.ok, 100);
  assert.match(await readFile(new URL('raw/app-1.html', directory), 'utf8'), /Description/);
  assert.equal(JSON.parse(await readFile(new URL('parser-report.json', directory), 'utf8')).finished, true);
});
