import { readFile } from 'node:fs/promises';
import { createDataSource } from './data.js';

const source = createDataSource();
const files = new Map([
  ['/naloga3/', ['index.html', 'text/html']],
  ['/naloga3/app.js', ['app.js', 'text/javascript']],
  ['/naloga3/model.js', ['model.js', 'text/javascript']],
  ['/naloga3/style.css', ['style.css', 'text/css']],
  ['/naloga3/chart.js', ['../node_modules/chart.js/dist/chart.umd.js', 'text/javascript']],
]);

export async function handleOpenData(req, res, url) {
  if (url.pathname !== '/naloga3' && !url.pathname.startsWith('/naloga3/')) return false;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const json = (code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); json(405, { error: 'Dovoljen je samo GET.' }); return true; }
  if (url.pathname === '/naloga3') { res.writeHead(302, { Location: '/naloga3/' }); res.end(); return true; }
  try {
    if (url.pathname === '/naloga3/api/data') json(200, await source.load());
    else if (url.pathname === '/naloga3/source.px') {
      const bytes = await readFile(new URL('./data/2974206S.px', import.meta.url));
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="2974206S.px"' });
      res.end(bytes);
    } else if (files.has(url.pathname)) {
      const [file, type] = files.get(url.pathname);
      const bytes = await readFile(new URL(file, import.meta.url));
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      res.end(bytes);
    } else json(404, { error: 'Stran ne obstaja.' });
  } catch (error) { json(503, { error: error.message }); }
  return true;
}
