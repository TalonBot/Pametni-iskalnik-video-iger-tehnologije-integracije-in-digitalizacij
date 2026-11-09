import { readFile } from 'node:fs/promises';
import { readGames } from '../parser/steam.js';
import { LlmError, recommend } from './llm.js';

const files = new Map([
  ['/naloga4/', ['index.html', 'text/html']],
  ['/naloga4/app.js', ['app.js', 'text/javascript']],
  ['/naloga4/model.js', ['model.js', 'text/javascript']],
  ['/naloga4/style.css', ['style.css', 'text/css']],
]);
let busy = false;
let lastRun = 0;

export async function handleLlm(req, res, url) {
  if (url.pathname !== '/naloga4' && !url.pathname.startsWith('/naloga4/')) return false;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  try {
    if (url.pathname === '/naloga4/api/recommend') {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); json(405, { error: 'Dovoljen je samo POST.' }); return true; }
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new LlmError('Zahteva je dovoljena samo iz lokalne aplikacije.', 403);
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new LlmError('Pošlji podatke kot application/json.', 415);
      if (busy || Date.now() - lastRun < 10000) throw new LlmError('Pred novim priporočilom počakaj nekaj sekund.', 429);
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 8192) throw new LlmError('Zahteva je prevelika.', 413);
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new LlmError('Telo zahteve ni veljaven JSON.', 400); }
      busy = true;
      try { const result = await recommend(await readGames(), input); lastRun = Date.now(); json(200, result); }
      finally { busy = false; }
    } else if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET'); json(405, { error: 'Dovoljen je samo GET.' });
    } else if (url.pathname === '/naloga4') { res.writeHead(302, { Location: '/naloga4/' }); res.end(); }
    else if (url.pathname === '/naloga4/api/status') json(200, { configured: Boolean(process.env.GEMINI_API_KEY), provider: 'Google Gemini', model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite' });
    else if (files.has(url.pathname)) {
      const [file, type] = files.get(url.pathname);
      const bytes = await readFile(new URL(file, import.meta.url));
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(bytes);
    } else json(404, { error: 'Stran ne obstaja.' });
  } catch (error) { json(error.status || 500, { error: error instanceof LlmError ? error.message : 'Napaka pri pripravi priporočil. Preveri lokalno zbirko iger.' }); }
  return true;
}
