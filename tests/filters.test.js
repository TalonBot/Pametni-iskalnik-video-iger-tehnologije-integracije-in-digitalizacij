import test from 'node:test';
import assert from 'node:assert/strict';
import { filterGames } from '../public/filters.js';
import { parseSearch, readGames } from '../parser/steam.js';
import { collectFree } from '../parser/free.js';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const game = (name, fields = {}) => ({ appId: name, name, description: '', genres: ['Action'], tags: [], platforms: ['Windows'], price: 10, currency: 'EUR', rating: 95, reviewCount: 100, ...fields });
const games = [game('Dota', { price: 0, currency: null, platforms: ['Windows', 'Linux'], tags: ['MOBA', 'Co-op'] }), game('Paid', { genres: ['Free To Play'], tags: ['Co-op'] }), game('Unknown', { price: null, genres: [] }), game('Budget', { price: 2.49, rating: 70 })];
const names = (options, source = games) => filterGames(source, options).map(g => g.name);

test('free aliases, price filter and Free To Play genre agree; paid genre labels and unknown prices are excluded', () => {
  for (const query of ['free to play', 'FREE-TO-PLAY', 'f2p', 'zastonj', 'brezplačno', 'brezplačne igre']) {
    assert.deepEqual(names({ query }), ['Dota']);
    assert.deepEqual(names({ query }), ['Dota']); // repeated searches must not retain regex state
  }
  assert.deepEqual(names({ genre: 'Free To Play' }), ['Dota']);
  assert.deepEqual(names({ payment: 'free' }), ['Dota']);
  assert.deepEqual(names({ maxPrice: '0' }), ['Dota']);
  assert.deepEqual(names({ payment: 'paid', sort: 'price-asc' }), ['Budget', 'Paid']);
});

test('search includes tags, genres and features and ignores accents, case, hyphens and word order', () => {
  assert.deepEqual(names({ query: 'co op dota' }), ['Dota']);
  assert.deepEqual(names({ query: 'f2p moba' }), ['Dota']);
  assert.deepEqual(names({ query: 'ACTION', payment: 'free' }), ['Dota']);
  assert.deepEqual(names({ query: 'vecigralsko', platform: 'Linux' }, [game('Čudež', { features: ['Večigralsko'], platforms: ['Linux'] })]), ['Čudež']);
});

test('combined filters, decimal ceilings and ratings constrain the whole collection', () => {
  assert.deepEqual(names({ query: 'co-op', platform: 'Linux', payment: 'free', maxPrice: '0', highRating: true }), ['Dota']);
  assert.deepEqual(names({ payment: 'free', platform: 'macOS' }), []);
  assert.deepEqual(names({ maxPrice: '2.49', sort: 'price-asc' }), ['Dota', 'Budget']);
  assert.deepEqual(names({ maxPrice: '2.48' }), ['Dota']);
  assert.deepEqual(names({ maxPrice: '-1' }), []);
  assert.deepEqual(names({ maxPrice: 'invalid' }), []);
  assert.equal(names({}).length, 4);
});

test('price and date sorts keep unknowns last in either direction and do not mutate source', () => {
  assert.deepEqual(names({ sort: 'price-asc' }), ['Dota', 'Budget', 'Paid', 'Unknown']);
  assert.deepEqual(names({ sort: 'price-desc' }), ['Paid', 'Budget', 'Dota', 'Unknown']);
  assert.deepEqual(games.map(g => g.name), ['Dota', 'Paid', 'Unknown', 'Budget']);
  assert.deepEqual(names({ sort: 'newest' }, [game('Unknown', { releaseDate: 'invalid' }), game('Old', { releaseDate: '2020-01-01' }), game('New', { releaseDate: '2026-01-01' })]), ['New', 'Old', 'Unknown']);
});

const row = (id, text, cents) => `<a class="search_result_row" href="https://store.steampowered.com/app/${id}/"><span class="title">Game ${id}</span><div data-price-final="${cents}"><div class="discount_final_price">${text}</div></div></a>`;
test('displayed Free overrides the paid upgrade attribute; hidden zero is unknown', () => {
  assert.equal(parseSearch(row(1, 'Free', 1329))[0].price, 0);
  assert.equal(parseSearch(row(1, 'Free To Play', 0))[0].price, 0);
  assert.equal(parseSearch(row(1, '', 0))[0].price, null);
  assert.equal(parseSearch(row(1, '19,99€', 1999))[0].price, 19.99);
});

test('free supplement persists real free games, merges IDs, and survives a failed refresh', async t => {
  const directory = pathToFileURL((await mkdtemp(join(tmpdir(), 'free-games-test-'))) + '/');
  await writeFile(new URL('games.json', directory), JSON.stringify({ parsedAt: '2020-01-01', sourcePages: [], warnings: [], report: {}, games: [game('Old', { appId: '1' }), game('Unknown', { price: 0, currency: null, originalPrice: null })] }));
  t.mock.method(globalThis, 'fetch', async url => ({ ok: true, text: async () => url.includes('/search/') ? `<html><div class="search_pagination_left">showing 1 - 3 of 1000</div>${row(1, 'Free', 1329)}${row(2, '', 0)}${row(3, '9,99€', 999)}</html>` : '<html><div class="game_description_snippet">A free game</div></html>' }));
  await collectFree({ directory, pauseMs: 0 });
  const merged = await readGames({ directory });
  assert.equal(merged.count, 2);
  assert.equal(merged.games.find(g => g.appId === '1').price, 0);
  assert.equal(merged.games.find(g => g.appId === 'Unknown').price, null);
  assert.equal(merged.report.freeGames.count, 1);
  const before = await readFile(new URL('free-games.json', directory), 'utf8');
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 403 }));
  await assert.rejects(collectFree({ directory }), /403/);
  assert.equal(await readFile(new URL('free-games.json', directory), 'utf8'), before);
  await collectFree({ directory, offline: true });
  assert.equal((await readGames({ directory })).report.freeGames.count, 1);
});
