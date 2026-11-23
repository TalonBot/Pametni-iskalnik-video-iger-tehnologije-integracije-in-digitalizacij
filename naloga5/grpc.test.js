import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { startGrpcServer } from './service.js';
import { createClient, unary } from './client.js';
import { grpc } from './protocol.js';
import { createGrpcHandler } from './routes.js';

const catalog = { parsedAt: '2026-11-20T10:00:00Z', games: [
  { appId: 1, name: 'Alpha', price: 0, currency: '', genres: ['Action'], platforms: ['Windows'], reviewCount: 100, rating: 95 },
  { appId: 2, name: 'Beta', price: 10, currency: 'EUR', genres: ['Action'], platforms: ['Linux'], reviewCount: 50 },
  { appId: '3', name: 'Gamma', price: null, currency: '', genres: [], platforms: ['Windows'], reviewCount: 5 },
  { appId: 4, name: 'Delta', price: 20, currency: 'USD', genres: [], platforms: ['Windows'], reviewCount: 1 },
] };

async function setup(t, options = {}) {
  const { server, port } = await startGrpcServer({ address: '127.0.0.1:0', readCatalog: async () => structuredClone(catalog), streamDelayMs: 0, ...options });
  const client = createClient(`127.0.0.1:${port}`);
  t.after(() => { client.close(); server.forceShutdown(); });
  return { client, server };
}
const collect = stream => new Promise((resolve, reject) => {
  const events = [];
  stream.on('data', event => events.push(event)); stream.on('end', () => resolve(events)); stream.on('error', reject);
});

test('gRPC seznam: kombinirani filtri, cena 0, omejitev in odmik', async t => {
  const { client } = await setup(t);
  const result = await unary(client, 'poisciIgre', { filter: { platform: 'Windows', maxPrice: 0 } });
  assert.deepEqual(result.games.map(game => game.appId), [1]);
  assert.equal(result.games[0].price, 0);
  const page = await unary(client, 'poisciIgre', { filter: { sort: 'name' }, limit: 1, offset: 1 });
  assert.equal(page.total, 4); assert.equal(page.games[0].name, 'Beta');
  assert.equal((await unary(client, 'poisciIgre', { filter: { query: 'nikjer' } })).total, 0);
});
test('gRPC podrobnosti ohranijo neznano ceno in oceno; manjkajoči ID vrne NOT_FOUND', async t => {
  const { client } = await setup(t);
  const { game } = await unary(client, 'pridobiIgro', { appId: 3 });
  assert.equal(game.name, 'Gamma'); assert.equal(game.price, undefined); assert.equal(game.rating, undefined);
  await assert.rejects(unary(client, 'pridobiIgro', { appId: 999 }), error => error.code === grpc.status.NOT_FOUND);
});
test('gRPC statistika upošteva filtre in izloči neznane ter tuje cene iz povprečja', async t => {
  const { client } = await setup(t);
  const result = await unary(client, 'pridobiStatistiko', {});
  assert.equal(result.total, 4); assert.equal(result.freeCount, 1); assert.equal(result.pricedCount, 2); assert.equal(result.averagePrice, 5);
  const unknown = await unary(client, 'pridobiStatistiko', { query: 'Gamma' });
  assert.equal(unknown.averagePrice, undefined); assert.equal(unknown.pricedCount, 0);
});
test('gRPC tok vrača urejena sporočila, delne izračune in zaključek; podpira prazen tok', async t => {
  const { client } = await setup(t);
  const events = await collect(client.pretakajIgre({ limit: 2 }));
  assert.deepEqual(events.filter(e => e.game).map(e => e.game.appId), [1, 2]);
  assert.deepEqual(events.map(e => e.received), [1, 2, 2]);
  assert.equal(events[0].partialStats.averagePrice, 0);
  assert.equal(events[1].partialStats.averagePrice, 5);
  assert.equal(events.at(-1).done, true); assert.equal(events.at(-1).total, 4);
  const empty = await collect(client.pretakajIgre({ filter: { query: 'nikjer' } }));
  assert.equal(empty.length, 1); assert.equal(empty[0].done, true); assert.equal(empty[0].expected, 0);
  await assert.rejects(collect(client.pretakajIgre({ limit: 101 })), e => e.code === grpc.status.INVALID_ARGUMENT);
});
test('gRPC preklic toka ustavi prenos pred koncem', async t => {
  const { client } = await setup(t, { streamDelayMs: 100 });
  const call = client.pretakajIgre({});
  let received = 0;
  const error = new Promise(resolve => call.once('error', resolve));
  call.on('data', () => { received++; call.cancel(); });
  assert.equal((await error).code, grpc.status.CANCELLED);
  assert.equal(received, 1);
});
test('gRPC zavrne neveljavne zahteve in prijavi nedosegljiv katalog', async t => {
  const { client } = await setup(t);
  for (const request of [{ filter: { maxPrice: -1 } }, { filter: { maxPrice: NaN } }, { filter: { platform: 'DOS' } }, { limit: 101 }]) {
    await assert.rejects(unary(client, 'poisciIgre', request), e => e.code === grpc.status.INVALID_ARGUMENT);
  }
  const broken = await setup(t, { readCatalog: async () => { throw new Error('not readable'); } });
  await assert.rejects(unary(broken.client, 'pridobiStatistiko', {}), e => e.code === grpc.status.UNAVAILABLE);
});
test('HTTP prehod dejansko kliče gRPC, posreduje SSE in pravilno vrne napake', async t => {
  const { client, server } = await setup(t);
  const handler = createGrpcHandler(client);
  const web = http.createServer(async (req, res) => {
    if (!await handler(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); }
  });
  web.listen(0, '127.0.0.1'); await once(web, 'listening');
  t.after(() => { web.closeAllConnections(); web.close(); });
  const base = `http://127.0.0.1:${web.address().port}/naloga5`;
  assert.equal((await fetch(base + '/')).status, 200);
  const result = await (await fetch(base + '/api/games?maxPrice=0')).json();
  assert.equal(result.games[0].name, 'Alpha'); assert.equal(result.total, 1);
  assert.equal((await fetch(base + '/api/game?id=999')).status, 404);
  assert.equal((await fetch(base + '/api/game?id=4294967296')).status, 400);
  assert.equal((await fetch(base + '/api/games?maxPrice=abc')).status, 400);
  const stream = await (await fetch(base + '/api/stream?limit=2')).text();
  assert.equal((stream.match(/event: game/g) || []).length, 3);
  assert.match(stream, /"done":true/);
  const stats = await (await fetch(base + '/api/stats')).json(); assert.equal(stats.averagePrice, 5);
  assert.equal((await fetch(base + '/api/stats', { method: 'POST' })).status, 405);
  server.forceShutdown();
  assert.equal((await fetch(base + '/api/games')).status, 503);
});
