import { LlmOdgovor } from './model.js';

const $ = selector => document.querySelector(selector);
const money = new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' });
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const imageUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? escape(url.href) : ''; } catch { return ''; } };
let result = null;

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Zahteva ni uspela.');
  return data;
}

$('#preferences').addEventListener('submit', async event => {
  event.preventDefault();
  $('#generate').disabled = true;
  $('#generate').textContent = 'AI izbira igre …';
  $('#ai-status').textContent = 'Primerjam tvoje želje z igrami iz zbirke. Odgovor lahko traja do 45 sekund.';
  $('#output').hidden = true;
  $('#placeholder').hidden = true;
  result = null;
  try {
    const input = Object.fromEntries(new FormData(event.currentTarget));
    input.proracun = Number(input.proracun);
    const data = await request('/naloga4/api/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    // Deserializacija in preverjanje tudi na odjemalcu pred programskim prikazom.
    const answer = new LlmOdgovor(data.odgovor);
    const cards = answer.priporocila.map((item, index) => {
      const game = data.igre.find(game => game.appId === item.appId);
      if (!game) throw new Error('Odgovor ne vsebuje podatkov priporočene igre.');
      const image = imageUrl(game.image);
      const price = game.price === 0 ? 'Brezplačno' : game.currency === 'EUR' && Number.isFinite(game.price) ? money.format(game.price) : 'Cena ni znana';
      return `<article class="ai-card">${image ? `<img src="${image}" alt="${escape(game.name)}" loading="lazy">` : ''}<div class="ai-card-body"><div class="eyebrow">IZBIRA 0${index + 1} · ${escape(game.platforms.join(' / '))}</div><h3>${escape(game.name)}</h3><p>${escape(item.razlog)}</p><p class="caveat">${escape(item.opozorilo)}</p><div class="card-bottom"><strong>${price}</strong><a class="open-game" href="https://store.steampowered.com/app/${encodeURIComponent(item.appId)}/" target="_blank" rel="noopener noreferrer">Na Steam ↗</a></div></div></article>`;
    }).join('');
    $('#recommendations').innerHTML = cards;
    $('#summary').textContent = answer.povzetek;
    $('#provenance').textContent = `${data.provider} · ${data.model} · ${data.candidateCount} kandidatov · ustvarjeno ${new Date(data.generatedAt).toLocaleString('sl-SI')} · katalog: ${data.catalogParsedAt ? new Date(data.catalogParsedAt).toLocaleString('sl-SI') : 'čas ni znan'}`;
    $('#prompt').textContent = data.prompt;
    $('#json').textContent = JSON.stringify(answer, null, 2);
    result = data;
    $('#output').hidden = false;
    $('#ai-status').textContent = 'Priporočila so pripravljena.';
  } catch (error) {
    $('#ai-status').textContent = error instanceof TypeError ? 'Povezava ni uspela ali odgovor ni veljaven. Poskusi znova.' : error.message;
    $('#placeholder').hidden = false;
  } finally {
    $('#generate').disabled = false;
    $('#generate').textContent = 'Poišči moje igre ↗';
  }
});

$('#export').addEventListener('click', () => {
  if (!result) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'llm-priporocila.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

try {
  const status = await request('/naloga4/api/status');
  $('#connection').textContent = status.configured ? `${status.provider} · ${status.model}` : 'AI priporočila trenutno niso na voljo.';
} catch { $('#connection').textContent = 'Stanja ponudnika ni mogoče prebrati. Preveri, ali strežnik deluje.'; }
try {
  const catalog = await request('/api/games');
  const genres = [...new Set(catalog.games.flatMap(game => game.genres || []))].sort((a, b) => a.localeCompare(b, 'sl'));
  for (const genre of genres) $('#ai-genre').add(new Option(genre, genre));
} catch { $('#ai-status').textContent = 'Zbirke iger ni mogoče prebrati. Na začetni strani preveri zajem podatkov.'; }
