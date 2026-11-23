const $ = id => document.getElementById(id);
const euro = new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' });
let stream = null, generation = 0, requestController = null;
const status = text => { $('status').textContent = text; };
function params() {
  const p = new URLSearchParams(new FormData($('search-form')));
  p.set('freeOnly', $('free-only').checked ? 'true' : 'false');
  return p;
}
function stop() {
  generation++;
  if (stream) { stream.close(); stream = null; }
  requestController?.abort(); requestController = null;
  $('stop').disabled = true;
  $('progress').hidden = true;
}
function stats(data, scope) {
  $('count').textContent = data.total;
  $('free-count').textContent = data.freeCount;
  $('average').textContent = data.averagePrice == null ? '—' : euro.format(data.averagePrice);
  $('scope').textContent = scope;
  $('snapshot').textContent = `Zadnji zajem: ${data.parsedAt ? new Date(data.parsedAt).toLocaleString('sl-SI') : 'ni podatka'}. Povprečje: ${data.pricedCount} iger z znano ceno v EUR, vključno z brezplačnimi.`;
}
function price(game) {
  return game.price == null ? 'Cena ni znana' : game.price === 0 ? 'Brezplačno' : `${game.price.toFixed(2)} ${game.currency || ''}`;
}
function element(tag, text, className) {
  const node = document.createElement(tag); node.textContent = text;
  if (className) node.className = className;
  return node;
}
function card(game) {
  const article = element('article', '', 'result');
  article.append(element('h3', game.name), element('p', game.genres.join(' · ') || 'Zvrst ni znana'),
    element('p', game.platforms.join(' / ') || 'Platforma ni znana'), element('div', price(game), 'price-text'));
  const button = element('button', 'Podrobnosti ↗', 'button quiet');
  button.type = 'button'; button.addEventListener('click', () => details(game.appId));
  article.append(button); $('games').append(article);
}
async function json(path, signal) {
  const response = await fetch(path, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Pridobivanje podatkov ni uspelo.');
  return data;
}
async function details(id) {
  const dialog = $('detail');
  $('detail-title').textContent = 'Podrobnosti igre';
  $('detail-body').textContent = 'Pridobivam podrobnosti …';
  if (!dialog.open) dialog.showModal();
  const current = String(id); dialog.dataset.game = current;
  try {
    const { game } = await json(`/naloga5/api/game?id=${id}`);
    if (dialog.dataset.game !== current) return;
    $('detail-title').textContent = game.name;
    $('detail-body').replaceChildren(element('p', game.description || 'Opis ni na voljo.'), element('p', price(game)),
      element('p', `Ocena: ${game.rating == null ? 'ni podatka' : game.rating + ' %'}`));
    if (/^https:\/\/store\.steampowered\.com\//.test(game.url)) {
      const link = element('a', 'Odpri na Steamu ↗'); link.href = game.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; $('detail-body').append(link);
    }
  } catch (error) { if (dialog.dataset.game === current) $('detail-body').textContent = error.message; }
}
function begin() {
  if (!$('search-form').reportValidity()) return null;
  stop(); requestController = new AbortController();
  return { token: generation, p: params(), signal: requestController.signal };
}
$('search-form').addEventListener('submit', event => {
  event.preventDefault(); const run = begin(); if (!run) return;
  $('games').replaceChildren();
  stats({ total: 0, freeCount: 0, pricedCount: 0 }, 'Prejeti del toka');
  status('Povezujem se s tokom …');
  $('progress').value = 0; $('progress').max = 1; $('progress').hidden = false; $('stop').disabled = false;
  stream = new EventSource(`/naloga5/api/stream?${run.p}`);
  const fail = message => { if (run.token !== generation) return; stop(); status(message); };
  stream.addEventListener('game', event => {
    if (run.token !== generation) return;
    const data = JSON.parse(event.data);
    if (data.game) card(data.game);
    stats(data.partialStats, 'Prejeti del toka');
    $('progress').max = data.expected || 1; $('progress').value = data.received;
    if (data.done) {
      stop();
      status(data.total ? `Tok zaključen: ${data.received} prikazanih od ${data.total} zadetkov.` : 'Ni zadetkov. Poskusi druge filtre.');
    } else status(`Prejeto ${data.received}/${data.expected} iger · skupaj ${data.total} zadetkov.`);
  });
  stream.addEventListener('failure', event => fail(JSON.parse(event.data).error));
  stream.onerror = () => fail('Tok je prekinjen. Preveri povezavo in poskusi znova.');
});
$('list').addEventListener('click', async () => {
  const run = begin(); if (!run) return;
  $('games').replaceChildren(); status('Pridobivam seznam …');
  try {
    const data = await json(`/naloga5/api/games?${run.p}`, run.signal);
    if (run.token !== generation) return;
    data.games.forEach(card);
    stats({ total: '—', freeCount: '—', pricedCount: 0, parsedAt: data.parsedAt }, 'Izberi statistiko');
    $('snapshot').textContent = `Zadnji zajem: ${new Date(data.parsedAt).toLocaleString('sl-SI')}. Za izračun vseh zadetkov klikni »Statistika zadetkov«.`;
    status(data.total ? `Prikazanih ${data.games.length} od ${data.total} zadetkov.` : 'Ni zadetkov. Poskusi druge filtre.');
  } catch (error) { if (run.token === generation) status(error.message); }
});
$('statistics').addEventListener('click', async () => {
  const run = begin(); if (!run) return;
  $('games').replaceChildren(); status('Računam statistiko …');
  try {
    const data = await json(`/naloga5/api/stats?${run.p}`, run.signal);
    if (run.token !== generation) return;
    stats(data, 'Vsi zadetki filtrov'); status(`Statistika ${data.total} zadetkov je pripravljena.`);
  } catch (error) { if (run.token === generation) status(error.message); }
});
$('stop').addEventListener('click', () => { stop(); status('Tok ustavljen. Prejeti rezultati so ohranjeni.'); });
$('close-detail').addEventListener('click', () => $('detail').close());
window.addEventListener('pagehide', stop);
