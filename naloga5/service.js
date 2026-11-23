import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { readGames } from '../parser/steam.js';
import { filterGames, euroPrice } from '../public/filters.js';
import { grpc, IgreService } from './protocol.js';

const invalid = message => Object.assign(new Error(message), { code: grpc.status.INVALID_ARGUMENT });
const sorts = ['popular', 'price-asc', 'price-desc', 'discount', 'rating', 'newest', 'name'];

function options(filter = {}) {
  filter ??= {};
  if ((filter.query || '').length > 200 || (filter.genre || '').length > 100) throw invalid('Iskalni niz je predolg.');
  if (filter.platform && !['Windows', 'macOS', 'Linux'].includes(filter.platform)) throw invalid('Neveljavna platforma.');
  if (filter.sort && !sorts.includes(filter.sort)) throw invalid('Neveljaven vrstni red.');
  if (filter.maxPrice != null && (!Number.isFinite(filter.maxPrice) || filter.maxPrice < 0)) throw invalid('Cena mora biti nenegativno število.');
  return { query: filter.query, genre: filter.genre, platform: filter.platform,
    maxPrice: filter.maxPrice ?? '', payment: filter.freeOnly ? 'free' : '', sort: filter.sort || 'popular' };
}

function page(request) {
  const limit = request.limit || 24;
  const offset = request.offset || 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) throw invalid('Omejitev mora biti med 1 in 100, odmik pa nenegativen.');
  return { limit, offset };
}

function message(game) {
  return { appId: game.appId, name: game.name, description: game.description || '',
    ...(game.price != null ? { price: game.price } : {}), currency: game.currency || '',
    genres: game.genres || [], platforms: game.platforms || [],
    ...(game.rating != null ? { rating: game.rating } : {}), url: game.url || '', image: game.image || '' };
}

function statistics(games, parsedAt) {
  const prices = games.map(euroPrice).filter(price => price !== null);
  return { total: games.length, freeCount: games.filter(game => game.price === 0).length,
    pricedCount: prices.length, ...(prices.length ? { averagePrice: prices.reduce((a, b) => a + b, 0) / prices.length } : {}), parsedAt };
}

function rpcError(error) {
  if (Number.isInteger(error.code)) return error;
  return Object.assign(new Error('Kataloga iger ni mogoče prebrati.'), { code: grpc.status.UNAVAILABLE });
}

export function createGrpcServer({ readCatalog = readGames, streamDelayMs = 80 } = {}) {
  const server = new grpc.Server();
  const unary = action => async (call, callback) => {
    try { callback(null, await action(call.request)); } catch (error) { callback(rpcError(error)); }
  };
  server.addService(IgreService.service, {
    poisciIgre: unary(async request => {
      const filter = options(request.filter), { limit, offset } = page(request);
      const catalog = await readCatalog();
      const games = filterGames(catalog.games, filter);
      return { games: games.slice(offset, offset + limit).map(message), total: games.length, parsedAt: catalog.parsedAt };
    }),
    pridobiIgro: unary(async request => {
      if (!request.appId) throw invalid('ID igre je obvezen.');
      const catalog = await readCatalog();
      const game = catalog.games.find(game => Number(game.appId) === request.appId);
      if (!game) throw Object.assign(new Error('Igra ne obstaja.'), { code: grpc.status.NOT_FOUND });
      return { game: message(game), parsedAt: catalog.parsedAt };
    }),
    pridobiStatistiko: unary(async request => {
      const filter = options(request);
      const catalog = await readCatalog();
      return statistics(filterGames(catalog.games, filter), catalog.parsedAt);
    }),
    pretakajIgre: async call => {
      const controller = new AbortController();
      call.once('cancelled', () => controller.abort());
      try {
        const filter = options(call.request.filter), { limit, offset } = page(call.request);
        const catalog = await readCatalog();
        const games = filterGames(catalog.games, filter);
        const selected = games.slice(offset, offset + limit);
        const processed = [];
        for (const game of selected) {
          if (call.cancelled) return;
          processed.push(game);
          if (!call.write({ game: message(game), received: processed.length, total: games.length, expected: selected.length,
            partialStats: statistics(processed, catalog.parsedAt) })) {
            await once(call, 'drain', { signal: controller.signal });
          }
          // Kratek razmik za pregledno demonstracijo toka; vir je shranjen katalog.
          if (streamDelayMs) await delay(streamDelayMs, undefined, { signal: controller.signal });
        }
        if (!call.cancelled) {
          call.write({ received: processed.length, total: games.length, expected: selected.length, done: true,
            partialStats: statistics(processed, catalog.parsedAt) });
          call.end();
        }
      } catch (error) { if (!call.cancelled) call.emit('error', rpcError(error)); }
    },
  });
  return server;
}

export async function startGrpcServer({ address = '127.0.0.1:50051', ...options } = {}) {
  const server = createGrpcServer(options);
  const port = await new Promise((resolve, reject) => server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (error, port) => error ? reject(error) : resolve(port)));
  return { server, port };
}
