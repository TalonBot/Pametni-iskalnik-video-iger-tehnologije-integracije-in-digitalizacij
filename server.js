import http from 'node:http';
import { loadEnvFile } from 'node:process';
import { handleLlm } from './naloga4/routes.js';
import { handleOpenData } from './naloga3/routes.js';
import { readFile } from 'node:fs/promises';
import { readGames } from './naloga6/catalog.js';
import { getStore } from './naloga6/store.js';
import { createSources } from './naloga6/sources.js';
import { createRefresh } from './naloga6/refresh.js';
import { createProjectHandler } from './naloga6/routes.js';
import { startGrpcServer } from './naloga5/service.js';
import { createClient } from './naloga5/client.js';
import { createGrpcHandler } from './naloga5/routes.js';

try { loadEnvFile(new URL('./.env', import.meta.url)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const port = Number(process.env.PORT || 3000);
const store = getStore();
await readGames();
const sources = createSources({ store });
const refresh = createRefresh({ store, sources });
const handleProject = createProjectHandler({ store, sources, refresh });
const grpcAddress = process.env.GRPC_TARGET || '127.0.0.1:50051';
const grpcServer = process.env.GRPC_TARGET ? null : (await startGrpcServer({ address: grpcAddress })).server;
const grpcClient = createClient(grpcAddress);
const handleGrpc = createGrpcHandler(grpcClient);
const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/filters.js': ['filters.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };

let lastRun = 0;
const send = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };

const httpServer = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (await handleProject(req, res, url)) return;
    if (await handleGrpc(req, res, url)) return;
    if (await handleLlm(req, res, url)) return;
    if (await handleOpenData(req, res, url)) return;
    if (req.method === 'GET' && url.pathname === '/api/games') {
      try { void refresh.steam(); return send(res, 200, await readGames()); }
      catch (error) { if (error.code === 'ENOENT') return send(res, 404, { error: 'Podatki še niso zbrani. Zaženite parser z gumbom Osveži podatke.' }); throw error; }
    }
    if (req.method === 'GET' && url.pathname === '/api/report') {
      try { return send(res, 200, (await readGames()).report); }
      catch (error) { if (error.code === 'ENOENT') return send(res, 404, { error: 'Poročilo bo na voljo po prvem zajemu.' }); throw error; }
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      try {
        const pid = Number(await readFile(new URL('./data/parser.lock', import.meta.url), 'utf8'));
        if (Number.isSafeInteger(pid) && pid > 0) {
          process.kill(pid, 0);
          const report = JSON.parse(await readFile(new URL('./data/parser-report.json', import.meta.url), 'utf8'));
          return send(res, 200, { running: true, message: report.listingComplete ? `Podrobnosti: ${report.uniqueGames - report.detailCounts.pending}/${report.uniqueGames} iger. Napredek se shranjuje.` : `Berem seznam: ${report.visitedPages} strani, ${report.uniqueGames} iger.`, error: null, report });
        }
      } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
      return send(res, 200, refresh.status());
    }
    if (req.method === 'POST' && url.pathname === '/api/refresh') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'Osveževanje je dovoljeno samo iz lokalne aplikacije.' });
      if (refresh.status().running) return send(res, 202, refresh.status());
      if (Date.now() - lastRun < 60000) return send(res, 429, { error: 'Pred ponovnim zagonom počakajte eno minuto.' });
      lastRun = Date.now();
      void refresh.steam(true);
      return send(res, 202, refresh.status());
    }
    if (req.method === 'GET' && files[url.pathname]) {
      const [file, type] = files[url.pathname];
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff' });
      return res.end(await readFile(new URL(`./public/${file}`, import.meta.url)));
    }
    send(res, 404, { error: 'Stran ne obstaja.' });
  } catch (error) { send(res, 500, { error: 'Napaka pri branju lokalnih podatkov.', detail: error.message }); }
}).listen(port, '127.0.0.1', () => { console.log(`Lokalna aplikacija: http://127.0.0.1:${port}`); refresh.warm(); });

httpServer.once('error', error => {
  console.error(`Spletnega strežnika ni mogoče zagnati: ${error.message}`);
  refresh.close(); grpcClient.close(); grpcServer?.forceShutdown(); process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  refresh.close(); grpcClient.close(); grpcServer?.forceShutdown();
  httpServer.close(() => process.exit(0));
  httpServer.closeAllConnections();
});
