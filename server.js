import http from 'node:http';
import { scrapeFreeGames } from './parser/free.js';
import { readFile } from 'node:fs/promises';
import { readGames, scrapeGames } from './parser/steam.js';

const port = Number(process.env.PORT || 3000);
const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/filters.js': ['filters.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
let status = { running: false, message: '', error: null };
let lastRun = 0;
const send = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method === 'GET' && url.pathname === '/api/games') {
      try { return send(res, 200, await readGames()); }
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
      return send(res, 200, status);
    }
    if (req.method === 'POST' && url.pathname === '/api/refresh') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'Osveževanje je dovoljeno samo iz lokalne aplikacije.' });
      if (status.running) return send(res, 202, status);
      if (Date.now() - lastRun < 60000) return send(res, 429, { error: 'Pred ponovnim zagonom počakajte eno minuto.' });
      lastRun = Date.now();
      status = { running: true, message: 'Povezujem se s Steamom …', error: null };
      scrapeFreeGames({ onProgress: message => { status.message = message; } }).then(() => scrapeGames({ onProgress: message => { status.message = message; } })).then(() => readGames()).then(result => {
        status = { running: false, message: `Zbranih ${result.count} iger.`, error: null };
      }).catch(error => { status = { running: false, message: 'Osveževanje ni uspelo. Zadnji shranjeni podatki so ohranjeni.', error: error.message }; });
      return send(res, 202, status);
    }
    if (req.method === 'GET' && files[url.pathname]) {
      const [file, type] = files[url.pathname];
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff' });
      return res.end(await readFile(new URL(`./public/${file}`, import.meta.url)));
    }
    send(res, 404, { error: 'Stran ne obstaja.' });
  } catch (error) { send(res, 500, { error: 'Napaka pri branju lokalnih podatkov.', detail: error.message }); }
}).listen(port, '127.0.0.1', () => console.log(`Lokalna aplikacija: http://127.0.0.1:${port}`));
