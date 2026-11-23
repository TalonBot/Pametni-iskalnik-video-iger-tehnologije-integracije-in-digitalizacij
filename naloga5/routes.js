import { readFile } from 'node:fs/promises';
import { grpc } from './protocol.js';
import { unary } from './client.js';

const files = new Map([
  ['/naloga5/', ['index.html', 'text/html']],
  ['/naloga5/app.js', ['app.js', 'text/javascript']],
  ['/naloga5/style.css', ['style.css', 'text/css']],
]);
const statusCode = error => ({ [grpc.status.INVALID_ARGUMENT]: 400, [grpc.status.NOT_FOUND]: 404,
  [grpc.status.UNAVAILABLE]: 503, [grpc.status.DEADLINE_EXCEEDED]: 504 }[error.code] || 500);
const errorMessage = error => [grpc.status.INVALID_ARGUMENT, grpc.status.NOT_FOUND].includes(error.code)
  ? error.details || error.message : 'gRPC storitev ni dosegljiva ali zahteve ni mogla dokončati. Poskusi znova.';

function requestFrom(url) {
  const p = url.searchParams;
  const number = (name, fallback) => {
    if (!p.has(name) || p.get(name) === '') return fallback;
    const n = Number(p.get(name));
    if (!Number.isFinite(n) || n < 0 || (name !== 'maxPrice' && !Number.isInteger(n))) {
      throw Object.assign(new Error(`Neveljavna vrednost ${name}.`), { code: grpc.status.INVALID_ARGUMENT });
    }
    return n;
  };
  return { filter: { query: p.get('query') || '', platform: p.get('platform') || '', genre: p.get('genre') || '',
    sort: p.get('sort') || 'popular', freeOnly: p.get('freeOnly') === 'true',
    ...(p.get('maxPrice') ? { maxPrice: number('maxPrice') } : {}) }, limit: number('limit', 24), offset: number('offset', 0) };
}

export function createGrpcHandler(client) {
  return async (req, res, url) => {
    if (url.pathname !== '/naloga5' && !url.pathname.startsWith('/naloga5/')) return false;
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); json(405, { error: 'Dovoljen je samo GET.' }); }
      else if (url.pathname === '/naloga5') { res.writeHead(302, { Location: '/naloga5/' }); res.end(); }
      else if (files.has(url.pathname)) {
        const [name, type] = files.get(url.pathname);
        const body = await readFile(new URL(name, import.meta.url));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(body);
      } else if (url.pathname === '/naloga5/api/games') json(200, await unary(client, 'poisciIgre', requestFrom(url)));
      else if (url.pathname === '/naloga5/api/game') {
        const id = Number(url.searchParams.get('id'));
        if (!Number.isInteger(id) || id < 1 || id > 4294967295) throw Object.assign(new Error('Neveljaven ID igre.'), { code: grpc.status.INVALID_ARGUMENT });
        json(200, await unary(client, 'pridobiIgro', { appId: id }));
      } else if (url.pathname === '/naloga5/api/stats') json(200, await unary(client, 'pridobiStatistiko', requestFrom(url).filter));
      else if (url.pathname === '/naloga5/api/stream') {
        const request = requestFrom(url);
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no' });
        res.flushHeaders();
        const call = client.pretakajIgre(request, { deadline: Date.now() + 30000 });
        const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        const cancel = () => call.cancel();
        res.once('close', cancel);
        const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 10000);
        res.once('close', () => clearInterval(heartbeat));
        call.on('data', data => { if (!res.destroyed && !send('game', data)) call.pause(); });
        res.on('drain', () => call.resume());
        call.on('error', error => {
          if (!res.destroyed) { send('failure', { error: errorMessage(error) }); res.end(); }
        });
        call.on('end', () => { if (!res.destroyed) res.end(); });
      } else json(404, { error: 'Stran ne obstaja.' });
    } catch (error) { json(statusCode(error), { error: errorMessage(error) }); }
    return true;
  };
}
