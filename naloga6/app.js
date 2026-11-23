const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const money = (value, currency = 'EUR') => value == null ? 'Ni podatka' : new Intl.NumberFormat('sl-SI', { style:'currency',currency }).format(value);
const time = value => value ? new Date(value).toLocaleString('sl-SI') : 'Še ni uspešnega prenosa';
let saved = [], currentId = null, compareController, searchController, overviewTimer;
async function request(url, options) {
  const response = await fetch(url, options); const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Zahteva ni uspela.'); return data;
}
const mutate = (method, data) => request('/naloga6/api/library', { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
async function library() { saved = await request('/naloga6/api/library'); renderLibrary(); }
function renderLibrary() {
  const rows = saved.filter(row => !$('library-filter').value || row.state === $('library-filter').value);
  $('saved-games').innerHTML = rows.length ? rows.map(({game,state,note}) => `<form class="saved-card" data-id="${escape(game.appId)}"><h3>${escape(game.name)}</h3><label>Status<select name="state" aria-label="Status: ${escape(game.name)}">${[['zelim','Želim igrati'],['igram','Trenutno igram'],['koncano','Končano']].map(([value,label])=>`<option value="${value}" ${state === value?'selected':''}>${label}</option>`).join('')}</select></label><label>Moja opomba<textarea name="note" maxlength="1000" aria-label="Opomba: ${escape(game.name)}">${escape(note)}</textarea></label><div class="row-actions"><button type="submit" class="save">Shrani spremembe</button><button type="button" data-compare="${escape(game.appId)}">Primerjaj ponudbe</button><button type="button" data-remove="${escape(game.appId)}">Odstrani</button></div></form>`).join('') : '<p>Tu še ni iger za izbrani pogled. Poišči igro in jo dodaj na seznam.</p>';
}
async function add(id) {
  if (saved.some(row => String(row.game.appId) === String(id))) { $('library-status').textContent = 'Igra je že na seznamu. Spodaj lahko urediš status in opombo.'; return; }
  await mutate('POST', {appId:id,state:'zelim',note:''}); await library(); $('library-status').textContent = 'Igra je shranjena na seznam »Želim igrati«.';
}
async function search() {
  if (!$('search-form').reportValidity()) return;
  searchController?.abort(); searchController = new AbortController(); const signal = searchController.signal;
  $('search-status').textContent = 'Iščem po katalogu …';
  const params = new URLSearchParams({ query:$('search-query').value, platform:$('search-platform').value, maxPrice:$('search-price').value,limit:12 });
  try {
    const data = await request(`/naloga5/api/games?${params}`, {signal});
    $('search-status').textContent = `${data.total} zadetkov · prikazanih ${data.games.length} · zajem ${time(data.parsedAt)}`;
    $('search-results').innerHTML = data.games.map(game => `<article class="game-row"><div><h3>${escape(game.name)}</h3><p>${game.price === 0 ? 'Brezplačno' : game.price == null ? 'Cena ni znana' : escape(game.price.toFixed(2)+' '+game.currency)} · ${escape(game.platforms.join(' / '))}</p></div><div class="row-actions"><button data-compare="${game.appId}">Primerjaj ponudbe</button><button class="save" data-add="${game.appId}" aria-label="Shrani ${escape(game.name)}">Shrani</button></div></article>`).join('');
  } catch (error) { if (!signal.aborted) $('search-status').textContent = error.message; }
}
async function compare(id) {
  compareController?.abort(); compareController = new AbortController(); const signal = compareController.signal;
  currentId = id; $('compare-status').textContent = 'Pridobivam ponudbe in referenčni tečaj …'; $('compare-content').replaceChildren();
  const url = new URL(location.href); url.searchParams.set('id', id); history.replaceState(null,'',url);
  try {
    const data = await request(`/naloga6/api/compare?id=${id}`, {signal});
    const fx = data.exchange;
    $('compare-title').textContent = data.game.name;
    $('compare-status').textContent = `CheapShark · pridobljeno ${time(data.retrieval.fetchedAt)}`;
    $('compare-content').innerHTML = `<div class="compare-game"><h3>Steam ob zadnjem zajemu</h3><p>${data.game.price === 0 ? 'Brezplačno' : data.game.currency === 'EUR' ? money(data.game.price) : 'Cena v EUR ni znana'} · regija SI · ${time(data.steamFetchedAt)}</p><button class="button" data-add="${escape(id)}">Shrani na moj seznam</button></div>${data.retrieval.stale ? '<p class="notice">CheapShark trenutno ni dosegljiv. Prikazane so starejše shranjene ponudbe.</p>' : ''}${fx?.retrieval.stale ? '<p class="notice">ECB trenutno ni dosegljiv. Pretvorba uporablja zadnji shranjeni tečaj.</p>' : ''}${!fx ? '<p class="notice">Tečaj ECB ni na voljo. Ponudbe prikazujemo v izvornih USD.</p>' : ''}${data.deals.length ? `<table class="offers"><thead><tr><th>Trgovina</th><th>Cena USD</th><th>Približno EUR</th><th>Ponudba</th></tr></thead><tbody>${data.deals.map(deal=>`<tr><td>${escape(deal.store)}</td><td>${money(deal.priceUsd,'USD')}</td><td>${deal.priceEur == null?'—':money(deal.priceEur)}</td><td><a href="${escape(deal.url)}" target="_blank" rel="noopener noreferrer">Odpri</a></td></tr>`).join('')}</tbody></table>` : '<p>CheapShark za to igro trenutno nima ponudb. To ne pomeni, da je ni mogoče kupiti na Steamu.</p>'}<p class="hint">${fx ? `ECB, ${escape(fx.date)}: 1 EUR = ${escape(fx.usdPerEur)} USD. ` : ''}Preračun je informativen. Regija, davki in končna cena se lahko razlikujejo; ceno preveri v trgovini. Steamova cena in ponudbe so lahko pridobljene ob različnih časih.</p>${data.storesStale ? '<p class="hint">Imena trgovin so iz predpomnilnika ali začasno niso dostopna.</p>':''}`;
    void overview();
  } catch(error) { if (!signal.aborted) { $('compare-status').textContent = error.message; $('compare-content').innerHTML = '<button class="button quiet" id="retry-compare">Poskusi znova</button>'; } }
}
async function overview() {
  try {
    const data = await request('/naloga6/api/overview');
    $('refresh-status').textContent = data.refresh.error ? `${data.refresh.message} ${data.refresh.error}` : data.refresh.message || `${data.count} iger v bazi · zadnji zajem ${time(data.parsedAt)}`;
    $('refresh-sources').disabled = data.refresh.running;
    $('sources').innerHTML = data.sources.map(source => `<article class="source-card"><h3>${escape(source.name)}</h3><strong class="${source.error?'warning':''}">${!source.configured?'Ključ ni nastavljen':source.error?'Zadnji poskus ni uspel':source.last_success?'Uspešno povezano':'Pripravljeno za uporabo'}</strong><p>${escape(source.technology)}</p><p>${escape(source.interval)}</p><p>Zadnji uspeh: ${time(source.last_success || (source.id === 'steam' ? data.parsedAt : null))}</p>${source.error?`<p class="warning">${escape(source.error)}</p>`:''}</article>`).join('');
    clearTimeout(overviewTimer); if (data.refresh.running) overviewTimer = setTimeout(overview, 5000);
  } catch(error) { $('refresh-status').textContent = error.message; }
}
async function surs() {
  try {
    const data = await request('/naloga6/api/surs');
    const row = data.rows.filter(row=>row.sex==='1' && row.education==='1' && row.count!==null).sort((a,b)=>Number(b.year)-Number(a.year))[0];
    $('surs-summary').textContent = row ? `V letu ${row.year} je igre igralo ${new Intl.NumberFormat('sl-SI').format(row.count)} prebivalcev Slovenije, starih 16–74 let (${row.percent?.toFixed(1).replace('.',',')} % uporabnikov interneta v tej skupini).${data.retrieval.stale?' Prikazana je shranjena kopija.':''}` : 'Podatki za skupni pregled niso na voljo.';
    void overview();
  } catch(error) { $('surs-summary').textContent = `Statistika trenutno ni dosegljiva. ${error.message}`; }
}
$('search-form').addEventListener('submit', event=>{event.preventDefault(); void search();});
$('library-filter').addEventListener('change', renderLibrary);
$('saved-games').addEventListener('submit', async event=>{
  event.preventDefault(); const form = event.target;
  try { await mutate('PUT',{appId:form.dataset.id,state:form.elements.state.value,note:form.elements.note.value}); await library(); $('library-status').textContent='Spremembe so shranjene.'; }
  catch(error){$('library-status').textContent=error.message;}
});
document.addEventListener('click', async event=>{
  const button = event.target.closest('button'); if (!button) return;
  try {
    if(button.dataset.compare){void compare(button.dataset.compare); $('comparison').scrollIntoView({behavior:'smooth',block:'start'});}
    if(button.dataset.add){button.disabled=true; await add(button.dataset.add); button.disabled=false;}
    if(button.dataset.remove){button.disabled=true; await mutate('DELETE',{appId:button.dataset.remove}); await library(); $('library-status').textContent='Igra je odstranjena s seznama.';}
    if(button.id==='retry-compare' && currentId) void compare(currentId);
  }catch(error){button.disabled=false;$('library-status').textContent=error.message;}
});
$('refresh-sources').addEventListener('click',async()=>{
  try {await request('/naloga6/api/refresh',{method:'POST'}); await overview();}
  catch(error){$('refresh-status').textContent=error.message;}
});
await Promise.allSettled([overview(), library(), search(), surs()]);
const initialId = new URLSearchParams(location.search).get('id'); if(initialId && /^\d+$/.test(initialId)) void compare(initialId);
window.addEventListener('pagehide',()=>{clearTimeout(overviewTimer);compareController?.abort();searchController?.abort();});
