import { filterGames, euroPrice, isFree } from './filters.js';
const $ = selector => document.querySelector(selector);
const money = new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' });
const integer = new Intl.NumberFormat('sl-SI');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' ? escape(u.href) : ''; } catch { return ''; } };
const price = game => isFree(game) ? 'Brezplačno' : euroPrice(game) === null ? '—' : money.format(euroPrice(game));
let snapshot = null;
let polling = false;
let visibleLimit = 60;
const filters = ['#search', '#sort', '#genre', '#platform', '#max-price', '#payment', '#high-rating'];
const status = message => { $('#status').textContent = message; };

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Zahteva ni uspela.');
  return body;
}

async function loadGames() {
  snapshot = await request('/api/games');
  $('#empty-reset').hidden = false;
  $('#empty-message').textContent = 'Poskusi drug iskalni niz ali sprosti filtre.';
  const games = snapshot.games;
  $('#total').textContent = integer.format(games.length);
  $('#max-discount').textContent = games.length ? Math.max(...games.map(g => g.discount)) + ' %' : '—';
  const prices = games.map(euroPrice).filter(value => value !== null);
  $('#min-price').textContent = prices.length ? money.format(Math.min(...prices)) : '—';
  $('#updated').textContent = new Date(snapshot.parsedAt).toLocaleString('sl-SI', { dateStyle: 'short', timeStyle: 'short' });
  const previousGenre = $('#genre').value;
  $('#genre').innerHTML = '<option value="">Vse zvrsti</option>' + [...new Set(games.flatMap(g => g.genres).concat(games.some(isFree) ? ['Free To Play'] : []))].sort().map(genre => `<option>${escape(genre)}</option>`).join('');
  if ([...$('#genre').options].some(o => o.value === previousGenre)) $('#genre').value = previousGenre;
  renderReport(snapshot.report);
  render();
}

function renderReport(report) {
  if (!report) return;
  $('#report-content').innerHTML = `<p>${escape(report.scope)}</p><p>Strani: <b>${report.visitedPages}</b> · Vrstic vira: <b>${report.rowsSeen}</b> · Enoličnih iger: <b>${report.uniqueGames}</b> · Podvojitev: <b>${report.duplicates}</b> · Preskočenih vrstic (npr. paketi): <b>${report.skippedRows}</b></p><p>Vse strani: <b>${report.listingComplete ? "DA" : "NE"}</b> · Zajem zaključen: <b>${report.finished ? "DA" : "NE"}</b><br>Podrobnosti: ${report.detailCounts.ok} dostopnih, ${report.detailCounts.unavailable} nedostopnih, ${report.detailCounts.error} napak, ${report.detailCounts.pending} čakajočih.</p><p>Število rezultatov vira: ${report.expectedRowsAtStart} ob začetku → ${report.expectedRowsAtEnd} ob zadnji strani.</p><table><thead><tr><th>Podatek</th><th>Zbran</th><th>Manjka</th></tr></thead><tbody>${Object.entries(report.coverage).map(([field, count]) => `<tr><td>${escape(field)}</td><td>${count.present}</td><td>${count.missing}</td></tr>`).join('')}</tbody></table><p>${escape(report.limitation)}</p>${report.freeGames ? `<p><b>Dodatna zbirka: ${report.freeGames.count} brezplačnih iger.</b> ${escape(report.freeGames.scope)}</p>` : ''}`;
}

function render() {
  if (!snapshot) return;
  const games = filterGames(snapshot.games, {
    query: $('#search').value, genre: $('#genre').value,
    platform: $('#platform').value, payment: $('#payment').value,
    maxPrice: $('#max-price').value, highRating: $('#high-rating').checked,
    sort: $('#sort').value,
  });
  $('#result-count').textContent = games.length;
  $('#showing').textContent = `Prikazanih ${Math.min(visibleLimit, games.length)} od ${games.length} zadetkov (zbirka: ${snapshot.games.length} iger)`;
  $('#empty').hidden = games.length > 0;
  $('#load-more').hidden = visibleLimit >= games.length;
  $('#games').innerHTML = games.slice(0, visibleLimit).map(game => `<article class="game-card"><div class="cover">${game.image ? `<img src="${safeUrl(game.image)}" alt="${escape(game.name)}" loading="lazy">` : ''}${game.discount ? `<span class="discount">−${game.discount} %</span>` : ''}<span class="store">STEAM</span></div><div class="card-body"><div class="card-tags">${escape(game.genres.slice(0, 2).join(' / ') || 'Zvrst ni na voljo')}</div><h3><button class="title-button" data-detail="${escape(game.appId)}">${escape(game.name)}</button></h3><div class="rating-row"><span class="rating">${game.rating === null ? '— brez ocene' : `↗ ${game.rating} % <span>(${integer.format(game.reviewCount)})</span>`}</span><span>${escape(game.platforms.join(' · '))}</span></div><div class="card-bottom"><div class="price">${game.currency === 'EUR' && game.originalPrice !== null && game.originalPrice > game.price ? `<del>${money.format(game.originalPrice)}</del>` : ''}${price(game)}</div><a class="open-game" href="${safeUrl(game.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(game.name)} na Steamu">Na Steam <span>↗</span></a></div></div></article>`).join('');
  for (const image of document.querySelectorAll('.cover img')) image.addEventListener('error', () => { image.hidden = true; });
}

$('#load-more').addEventListener('click', () => { visibleLimit += 60; render(); });

function reset() {
  visibleLimit = 60;
  for (const selector of ['#search', '#genre', '#platform', '#max-price', '#payment']) $(selector).value = '';
  $('#high-rating').checked = false;
  $('#sort').value = 'popular';
  render();
}
filters.forEach(selector => $(selector).addEventListener(selector === '#search' || selector === '#max-price' ? 'input' : 'change', () => { visibleLimit = 60; render(); }));
$('#reset').addEventListener('click', reset);
$('#empty-reset').addEventListener('click', reset);
document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) && !$('#detail').open) { event.preventDefault(); $('#search').focus(); } });
$('#games').addEventListener('click', event => {
  const button = event.target.closest('[data-detail]');
  if (!button) return;
  const game = snapshot.games.find(g => g.appId === button.dataset.detail);
  $('#detail-content').innerHTML = `${game.image ? `<img src="${safeUrl(game.image)}" alt="${escape(game.name)}">` : ''}<div class="eyebrow">STEAM / ${escape(game.appId)}</div><h2>${escape(game.name)}</h2><p>${escape(game.description || 'Opis ni dostopen. Podrobnosti si lahko ogledaš na Steamu.')}</p><p>Zvrsti: ${escape(game.genres.join(', ') || '—')}<br>Platforme: ${escape(game.platforms.join(', ') || '—')}<br>Izdaja: ${escape(game.released || '—')}<br>Ocena: ${game.rating === null ? '—' : game.rating + ' % pozitivnih ocen'}<br>Cena ob zajemu: ${price(game)}<br>Razvijalci: ${escape(game.developers?.join(', ') || '—')}<br>Založniki: ${escape(game.publishers?.join(', ') || '—')}<br>Metacritic: ${game.metacritic ?? '—'}</p><p>${escape(game.about || '')}</p><p>Oznake: ${escape(game.tags?.join(', ') || '—')}<br>Funkcije: ${escape(game.features?.join(', ') || '—')}<br>Jeziki: ${escape(game.languages?.map(l => l.name).join(', ') || '—')}</p><p>${escape(Object.entries(game.requirements || {}).map(([os, text]) => os + ': ' + text).join(' | '))}</p><details><summary>Podpora jezikom (${game.languages?.length || 0})</summary><table><thead><tr><th>Jezik</th><th>Vmesnik</th><th>Zvok</th><th>Podnapisi</th></tr></thead><tbody>${(game.languages || []).map(l => `<tr><td>${escape(l.name)}</td><td>${l.interface ? "✓" : "—"}</td><td>${l.fullAudio ? "✓" : "—"}</td><td>${l.subtitles ? "✓" : "—"}</td></tr>`).join('')}</tbody></table></details><details><summary>Slike zaslona (${game.screenshots?.length || 0})</summary>${(game.screenshots || []).map((url, i) => `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer"><img src="${safeUrl(url)}" alt="${escape(game.name)} – slika ${i + 1}" loading="lazy"></a>`).join('')}</details><a class="button" href="${safeUrl(game.url)}" target="_blank" rel="noopener noreferrer">Odpri na Steamu ↗</a>`;
  $('#detail').showModal();
});
$('.close-dialog').addEventListener('click', () => $('#detail').close());
$('#detail').addEventListener('click', event => { if (event.target === $('#detail')) { const r = $('#detail').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('#detail').close(); } });

async function pollStatus() {
  if (polling) return;
  polling = true;
  $('#refresh').disabled = true;
  try {
    let current;
    do {
      current = await request('/api/status');
      if (current.report) renderReport(current.report);
      status(current.error ? `${current.message} ${current.error}` : current.message);
      if (current.running) await new Promise(resolve => setTimeout(resolve, 1500));
    } while (current.running);
    if (!current.error) {
      await loadGames();
      status(`${current.message} ${snapshot.warnings.length ? `${snapshot.warnings.length} iger ima nedostopne podrobnosti; osnovni podatki so prikazani.` : ''}`);
    }
  } catch (error) { status(error.message); }
  finally { polling = false; $('#refresh').disabled = false; }
}
$('#refresh').addEventListener('click', async () => {
  $('#refresh').disabled = true;
  try { await request('/api/refresh', { method: 'POST' }); await pollStatus(); }
  catch (error) { status(error.message); $('#refresh').disabled = false; }
});
try {
  await loadGames();
  if (snapshot.warnings.length) status(`${snapshot.warnings.length} iger ima nedostopne podrobnosti; osnovni podatki so prikazani.`);
} catch (error) {
  status(error.message); $('#showing').textContent = 'Zbirka še ni na voljo'; $('#empty').hidden = false;
  $('#empty-message').textContent = 'Za prvi zajem uporabi gumb Osveži podatke.'; $('#empty-reset').hidden = true;
}
try { if ((await request('/api/status')).running) await pollStatus(); } catch { /* The next refresh will show a connection error. */ }
