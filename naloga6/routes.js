import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/naloga6/', ['index.html', 'text/html']], ['/naloga6/app.js', ['app.js', 'text/javascript']], ['/naloga6/style.css', ['style.css', 'text/css']],
]);
export const sourceDefinitions = [
  { id: 'steam', name: 'Steam Store', technology: 'Web scraping / HTML', interval: '24 ur; celoten izbrani seznam ponudb in prvih 100 brezplačnih iger' },
  { id: 'surs', name: 'SURS', technology: 'PCAxis', interval: '24 ur; na statistični strani tudi ob obisku' },
  { id: 'cheapshark', name: 'CheapShark', technology: 'REST / JSON', interval: 'Ponudbe izbrane igre: 1 ura; trgovine: 24 ur' },
  { id: 'ecb', name: 'Evropska centralna banka', technology: 'XML', interval: '24 ur; referenčni tečaj USD/EUR' },
  { id: 'gemini', name: 'Google Gemini', technology: 'REST / strukturiran JSON', interval: 'Ob vsaki zahtevi za AI priporočila' },
];
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw fail('Pošlji application/json.', 415);
  let text = '';
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 8192) throw fail('Zahteva je prevelika.', 413); }
  try { return JSON.parse(text); } catch { throw fail('Neveljaven JSON.'); }
}
export function createProjectHandler({ store, sources, refresh }) {
  let lastRefresh = 0;
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/naloga6/') && url.pathname !== '/naloga6') return false;
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (!['GET','POST','PUT','DELETE'].includes(req.method)) throw fail('Metoda ni dovoljena.', 405);
      if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw fail('Dovoljene so samo zahteve iz lokalne aplikacije.', 403);
      if (req.method === 'GET' && url.pathname === '/naloga6') { res.writeHead(302, { Location: '/naloga6/' }); res.end(); }
      else if (req.method === 'GET' && files.has(url.pathname)) {
        const [name, type] = files.get(url.pathname); const bytes = await readFile(new URL(name, import.meta.url));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(bytes);
      } else if (req.method === 'GET' && url.pathname === '/naloga6/api/overview') {
        void refresh.steam();
        const catalog = store.catalog();
        json(200, { count: catalog?.count || 0, parsedAt: catalog?.parsedAt, refresh: refresh.status(),
          sources: sourceDefinitions.map(source => ({ ...source, ...store.source(source.id), configured: source.id !== 'gemini' || Boolean(process.env.GEMINI_API_KEY) })) });
      } else if (req.method === 'GET' && url.pathname === '/naloga6/api/library') json(200, store.saved());
      else if (['POST','PUT','DELETE'].includes(req.method) && url.pathname === '/naloga6/api/library') {
        const data = await body(req);
        if (!data || !/^\d{1,10}$/.test(String(data.appId)) || !store.game(data.appId)) throw fail('Igra ne obstaja.', 404);
        if (req.method === 'DELETE') { store.remove(data.appId); json(200, { ok: true }); }
        else {
          if (!['zelim','igram','koncano'].includes(data.state) || typeof data.note !== 'string' || data.note.length > 1000) throw fail('Izberi status in opombo z največ 1000 znaki.');
          store.save(data.appId, data.state, data.note.trim()); json(200, { ok: true });
        }
      } else if (req.method === 'GET' && url.pathname === '/naloga6/api/compare') {
        const id = url.searchParams.get('id');
        if (!/^\d{1,10}$/.test(id || '') || !store.game(id)) throw fail('Igra ne obstaja.', 404);
        const game = store.game(id);
        json(200, { game, steamFetchedAt: game.priceFetchedAt || store.catalog()?.parsedAt, ...await sources.comparison(id) });
      } else if (req.method === 'GET' && url.pathname === '/naloga6/api/surs') json(200, await sources.surs());
      else if (req.method === 'POST' && url.pathname === '/naloga6/api/refresh') {
        if (Date.now() - lastRefresh < 60000) throw fail('Pred ponovno osvežitvijo počakaj minuto.', 429);
        lastRefresh = Date.now(); void refresh.steam(true);
        void Promise.allSettled([sources.rates(), sources.stores(), sources.surs()]);
        json(202, refresh.status());
      } else throw fail('Pot ali metoda ne obstaja.', 404);
    } catch (error) { json(error.status || 503, { error: error.message }); }
    return true;
  };
}
